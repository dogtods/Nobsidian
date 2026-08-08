import React, { useState } from "react";
import { Download } from "lucide-react";

interface ExternalAiExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (options: { includeAll: boolean; taskBacklink: boolean; taskAnalysis: boolean; taskStructure: boolean }) => void;
  isBulk?: boolean;
  targetName?: string;
}

export default function ExternalAiExportModal({ isOpen, onClose, onExport, isBulk, targetName }: ExternalAiExportModalProps) {
  const [includeAll, setIncludeAll] = useState(true);
  const [taskBacklink, setTaskBacklink] = useState(true);
  const [taskAnalysis, setTaskAnalysis] = useState(true);
  const [taskStructure, setTaskStructure] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-xs" onClick={onClose} />
      <div className="bg-[var(--surface)] border border-[var(--border2)] rounded-xl p-6 w-[420px] max-w-full shadow-2xl relative z-[301] flex flex-col gap-4">
        <div className="text-base font-bold text-[var(--bright)] flex items-center gap-2">
          <Download className="w-5 h-5 text-[#7ee787]" /> {isBulk ? "外部AI用プロンプトの一括出力" : "外部AI用プロンプトの出力"}
        </div>
        <p className="text-xs text-[var(--subtle)] leading-relaxed">
          外部AI（ChatGPTなど）に貼り付けて分析させるためのプロンプトテキストをダウンロードします。
          {isBulk && targetName && (
            <span className="block mt-2 text-[var(--orange)]">
              ※フォルダ「{targetName}」内のすべてのノートの内容をまとめ、1つのプロンプトテキストとして一括でコピー・ダウンロードします。
            </span>
          )}
        </p>
        
        <div className="bg-[rgba(163,113,247,0.04)] border border-[rgba(163,113,247,0.15)] rounded-lg p-3 mt-1 flex flex-col gap-3">
          <div className="text-xs font-bold text-[var(--bright)] mb-1">出力するAIタスク</div>
          
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5 cursor-pointer accent-[var(--purple)]"
              checked={taskAnalysis}
              onChange={(e) => setTaskAnalysis(e.target.checked)}
            />
            <div className="flex-1">
              <span className="text-xs font-bold text-white block">キーワード・要約の生成</span>
              <span className="text-[10px] text-[var(--subtle)] mt-0.5 block">
                ノートの内容を要約し、重要なキーワードを抽出する指示を含めます。
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
                既存のノート一覧から関連する記事を探し出し、リンクする指示を含めます。
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

        <div className="bg-[rgba(163,113,247,0.04)] border border-[rgba(163,113,247,0.15)] rounded-lg p-3">
          <label className="flex items-start gap-2 cursor-pointer opacity-100 transition-opacity" style={{ opacity: taskBacklink ? 1 : 0.5 }}>
            <input
              type="checkbox"
              className="mt-0.5 cursor-pointer accent-[var(--purple)]"
              checked={includeAll}
              disabled={!taskBacklink}
              onChange={(e) => setIncludeAll(e.target.checked)}
            />
            <div className="flex-1">
              <span className="text-xs font-bold text-white block">アプリ全体の記事をバックリンク候補に含める</span>
              <span className="text-[10px] text-[var(--subtle)] mt-1 block">
                チェックを入れると、全ノートのタイトルを候補として出力します（推奨）。外すと、関連性の高い記事のみに絞り込まれます（トークン節約）。
              </span>
            </div>
          </label>
        </div>

        <div className="flex gap-2 justify-end border-t border-[var(--border2)] pt-4 mt-2">
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
            disabled={!taskAnalysis && !taskBacklink && !taskStructure}
            onClick={() => onExport({ includeAll, taskBacklink, taskAnalysis, taskStructure })}
          >
            <Download className="w-3.5 h-3.5" /> ダウンロード
          </button>
        </div>
      </div>
    </div>
  );
}
