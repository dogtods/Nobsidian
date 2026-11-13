import React, { useState } from "react";
import { Download, FileText, Newspaper, Sparkles } from "lucide-react";

interface ExternalAiExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (options: {
    includeAll: boolean;
    taskBacklink: boolean;
    taskAnalysis: boolean;
    taskStructure: boolean;
    taskNewsDraft?: boolean;
  }) => void;
  onDownloadTextOnly?: () => void;
  isBulk?: boolean;
  targetName?: string;
  notesCount?: number;
}

export default function ExternalAiExportModal({
  isOpen,
  onClose,
  onExport,
  onDownloadTextOnly,
  isBulk,
  targetName,
  notesCount,
}: ExternalAiExportModalProps) {
  // フォルダ一括時は「ニュース原稿」をデフォルトONにして即座に利用可能にする
  const [taskNewsDraft, setTaskNewsDraft] = useState(isBulk !== false);
  const [includeAll, setIncludeAll] = useState(false);
  const [taskBacklink, setTaskBacklink] = useState(false);
  const [taskAnalysis, setTaskAnalysis] = useState(!isBulk);
  const [taskStructure, setTaskStructure] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/75 backdrop-blur-xs" onClick={onClose} />
      <div className="bg-[var(--surface)] border border-[var(--border2)] rounded-xl p-5 md:p-6 w-[480px] max-w-full shadow-2xl relative z-[301] flex flex-col gap-4">
        {/* Header */}
        <div>
          <div className="text-base font-bold text-[var(--bright)] flex items-center gap-2">
            <Download className="w-5 h-5 text-[#7ee787]" />
            {isBulk ? "外部AI用プロンプト出力（フォルダ一括）" : "外部AI用プロンプト出力"}
          </div>
          <p className="text-xs text-[var(--subtle)] mt-1 leading-relaxed">
            外部AI（ChatGPT、Claude、Geminiなど）に貼り付けて処理させるためのプロンプトを作成・ダウンロードします。
          </p>
          {targetName && (
            <div className="mt-2 text-xs text-emerald-300 font-semibold bg-emerald-950/40 border border-emerald-500/25 px-2.5 py-1.5 rounded-lg flex items-center justify-between">
              <span className="truncate">📁 対象: {targetName}</span>
              {notesCount !== undefined && (
                <span className="text-[11px] text-gray-300 shrink-0 ml-2">
                  合計 {notesCount} 件の記事
                </span>
              )}
            </div>
          )}
        </div>

        {/* Task Selection Section */}
        <div className="flex flex-col gap-2.5">
          <div className="text-xs font-bold text-[var(--bright)] flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>出力するAIタスクの選択</span>
          </div>

          {/* 1. ニュース原稿チェックボックス（ユーザー要望のメイン機能） */}
          <label className={`flex items-start gap-2.5 p-3 rounded-lg cursor-pointer transition-all border ${
            taskNewsDraft
              ? "bg-emerald-950/35 border-emerald-500/50 shadow-xs"
              : "bg-[#161b22] border-[var(--border2)] hover:border-emerald-500/30"
          }`}>
            <input
              type="checkbox"
              className="mt-0.5 cursor-pointer accent-[#2ea043] w-4 h-4"
              checked={taskNewsDraft}
              onChange={(e) => setTaskNewsDraft(e.target.checked)}
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Newspaper className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-xs font-bold text-white block">
                  {isBulk
                    ? "当該フォルダ記事をまとめたニュース原稿を作成"
                    : "ニュース原稿・解説記事を作成"}
                </span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  オススメ
                </span>
              </div>
              <span className="text-[11px] text-gray-300 mt-1 block leading-relaxed">
                {isBulk
                  ? "フォルダ内の記事群を横断的に要約・統合し、リード・全体トレンド・各記事の要点解説・記事間の考察・今後の見通しを網羅した1本のニュース原稿を作成するプロンプトを出力します。"
                  : "記事の内容を整理し、リード・キーファクト・詳細解説・今後の見通しをまとめたニュース原稿を作成するプロンプトを出力します。"}
              </span>
            </div>
          </label>

          {/* Other options */}
          <div className="bg-[rgba(163,113,247,0.04)] border border-[rgba(163,113,247,0.15)] rounded-lg p-3 flex flex-col gap-2.5">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 cursor-pointer accent-[var(--purple)]"
                checked={taskAnalysis}
                onChange={(e) => setTaskAnalysis(e.target.checked)}
              />
              <div className="flex-1">
                <span className="text-xs font-bold text-white block">各記事のキーワード・個別要約</span>
                <span className="text-[10px] text-[var(--subtle)] mt-0.5 block">
                  各記事の重要キーワード（名詞3〜5個）や個別要約の抽出指示を含めます。
                </span>
              </div>
            </label>

            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 cursor-pointer accent-[var(--purple)]"
                checked={taskBacklink}
                onChange={(e) => setTaskBacklink(e.target.checked)}
              />
              <div className="flex-1">
                <span className="text-xs font-bold text-white block">バックリンク（関連ノート）の提案</span>
                <span className="text-[10px] text-[var(--subtle)] mt-0.5 block">
                  既存のノート一覧から関連する記事を探し出し、[[記事タイトル]] リンクする指示を含めます。
                </span>
              </div>
            </label>

            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 cursor-pointer accent-[var(--purple)]"
                checked={taskStructure}
                onChange={(e) => setTaskStructure(e.target.checked)}
              />
              <div className="flex-1">
                <span className="text-xs font-bold text-white block">図解（Mermaid）の抽出</span>
                <span className="text-[10px] text-[var(--subtle)] mt-0.5 block">
                  比較・時系列・因果関係をMermaid記法の図として抽出する指示を含めます。
                </span>
              </div>
            </label>
          </div>

          {/* Backlink target scope (Only visible & applicable if taskBacklink is checked) */}
          {taskBacklink && (
            <div className="bg-[rgba(163,113,247,0.05)] border border-[rgba(163,113,247,0.2)] rounded-lg p-2.5">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 cursor-pointer accent-[var(--purple)]"
                  checked={includeAll}
                  onChange={(e) => setIncludeAll(e.target.checked)}
                />
                <div className="flex-1">
                  <span className="text-xs font-bold text-white block">アプリ全体の既存ノートタイトルを候補に含める</span>
                  <span className="text-[10px] text-[var(--subtle)] mt-0.5 block">
                    チェックを入れると全ノートのタイトルを候補として出力します。外すと関連ノート候補リストを出力せずプロンプトを短縮します。
                  </span>
                </div>
              </label>
            </div>
          )}

          {/* Text-only direct download option */}
          {onDownloadTextOnly && (
            <div className="pt-0.5">
              <button
                type="button"
                onClick={() => {
                  onDownloadTextOnly();
                  onClose();
                }}
                className="w-full py-2 px-3 text-[11px] font-medium text-gray-300 hover:text-white bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                title="外部AIプロンプトではなく、フォルダ内の記事・要約・本文テキストをそのままテキストファイルとしてダウンロードします"
              >
                <FileText className="w-3.5 h-3.5 text-blue-400" />
                <span>プロンプト不要（要約・本文テキストのみ）でダウンロード</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 justify-end border-t border-[var(--border2)] pt-3 mt-1">
          <button
            type="button"
            className="text-xs text-[var(--subtle)] border border-[var(--border2)] hover:bg-[var(--border)] p-2 px-4 rounded-md cursor-pointer font-medium transition-colors"
            onClick={onClose}
          >
            キャンセル
          </button>
          <button
            type="button"
            className="text-xs p-2 px-5 rounded-md font-bold bg-[#2ea043] hover:bg-[#34b64c] text-white cursor-pointer transition-all shadow-md active:scale-95 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!taskNewsDraft && !taskAnalysis && !taskBacklink && !taskStructure}
            onClick={() => onExport({ includeAll, taskBacklink, taskAnalysis, taskStructure, taskNewsDraft })}
          >
            <Download className="w-3.5 h-3.5" />
            <span>{taskNewsDraft ? "ニュース原稿プロンプトを出力" : "プロンプトを出力"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
