/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";

export const PROMPT_KEYS = {
  TITLE: "cn_prompt_title",
  ANALYZE: "cn_prompt_analyze",
  IMPORT_SUMMARIZE: "cn_prompt_import_summarize",
  IMPORT_KEYPOINTS: "cn_prompt_import_keypoints",
  REPORT: "cn_prompt_report",
};

export const DEFAULT_PROMPTS = {
  TITLE: `以下のテキストの内容を最もよく表す、短くて魅力的な日本語のタイトル（20文字以内）を1つだけ提案してください。出力はタイトルのみとし、装飾や説明は不要です。\n\n内容:\n{content}`,
  ANALYZE: `あなたはナレッジベース管理AIです。以下のメモを分析してください。\n\n## メモ内容\nタイトル: {title}\n本文:\n{content}\n\n## 既存ノートのタイトル一覧（関連チェック用）\n{existingTitles}\n\n## 出力形式（必ずこのJSON形式のみで返してください）\n{\n  "keywords": ["キーワード1", "キーワード2", "キーワード3", "キーワード4", "キーワード5"],\n  "summary": "このメモの要点を2〜3文で日本語でまとめてください",\n  "related_notes": ["既存ノートタイトル1", "既存ノートタイトル2"],\n  "new_keywords": ["新規に作成すべきキーワード1", "新規に作成すべきキーワード2"]\n}\n\n## 指示\n- keywordsは固有名詞・概念・テーマを5〜8個抽出（名詞のみ）\n- related_notesは既存ノートの中から関連するものだけ（なければ空配列）\n- new_keywordsはkeywordsの中でまだ既存ノートにないもの\n- JSONのみ返す。マークダウンのコードブロック不要`,
  IMPORT_SUMMARIZE: `以下の文章を分かりやすく要約してください。\n\n{content}`,
  IMPORT_KEYPOINTS: `以下の文章から重要なキーポイントを箇条書きで抽出してください。\n\n{content}`,
  REPORT: `以下のノート群を総合的に読み、日本語でレポートを作成してください。\n\n## 対象ノート\n{notes_content}\n\n## レポートの構成\n1. **概要**: 選択されたノート群の共通テーマや関係性を2〜3文でまとめる\n2. **主要な洞察**: 各ノートから得られる重要な知見を箇条書きで列挙\n3. **ノート間の関連性**: つながりや共通点・相違点を分析\n4. **まとめと次のアクション**: 全体から導かれる結論と今後の行動提案\n\n読みやすく実用的なレポートにしてください。`,
};

export function getStoredPrompt(key: keyof typeof DEFAULT_PROMPTS): string {
  return localStorage.getItem(PROMPT_KEYS[key]) || DEFAULT_PROMPTS[key];
}

interface PromptSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsClick: () => void;
  onSaveToast: (msg: string) => void;
}

export default function PromptSettingsModal({ isOpen, onClose, onSettingsClick, onSaveToast }: PromptSettingsModalProps) {
  const [titlePrompt, setTitlePrompt] = useState("");
  const [analyzePrompt, setAnalyzePrompt] = useState("");
  const [importSummarizePrompt, setImportSummarizePrompt] = useState("");
  const [importKeypointsPrompt, setImportKeypointsPrompt] = useState("");
  const [reportPrompt, setReportPrompt] = useState("");

  const [aiOptSummary, setAiOptSummary] = useState(false);
  const [aiOptSkipKeywords, setAiOptSkipKeywords] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setTitlePrompt(getStoredPrompt("TITLE"));
      setAnalyzePrompt(getStoredPrompt("ANALYZE"));
      setImportSummarizePrompt(getStoredPrompt("IMPORT_SUMMARIZE"));
      setImportKeypointsPrompt(getStoredPrompt("IMPORT_KEYPOINTS"));
      setReportPrompt(getStoredPrompt("REPORT"));

      setAiOptSummary(localStorage.getItem("cn_ai_opt_summary") === "true");
      const skipKw = localStorage.getItem("cn_ai_opt_skip_keywords");
      setAiOptSkipKeywords(skipKw === null ? true : skipKw === "true");
    }
  }, [isOpen]);

  const handleSave = () => {
    localStorage.setItem(PROMPT_KEYS.TITLE, titlePrompt);
    localStorage.setItem(PROMPT_KEYS.ANALYZE, analyzePrompt);
    localStorage.setItem(PROMPT_KEYS.IMPORT_SUMMARIZE, importSummarizePrompt);
    localStorage.setItem(PROMPT_KEYS.IMPORT_KEYPOINTS, importKeypointsPrompt);
    localStorage.setItem(PROMPT_KEYS.REPORT, reportPrompt);

    localStorage.setItem("cn_ai_opt_summary", String(aiOptSummary));
    localStorage.setItem("cn_ai_opt_skip_keywords", String(aiOptSkipKeywords));

    onSaveToast("プロンプト設定を保存しました ✦");
    onClose();
  };

  const handleReset = () => {
    if (!window.confirm("全てのプロンプトをデフォルトに戻しますか？")) return;

    Object.keys(PROMPT_KEYS).forEach(k => {
      localStorage.removeItem(PROMPT_KEYS[k as keyof typeof PROMPT_KEYS]);
    });
    localStorage.removeItem("cn_ai_opt_summary");
    localStorage.removeItem("cn_ai_opt_skip_keywords");

    setTitlePrompt(DEFAULT_PROMPTS.TITLE);
    setAnalyzePrompt(DEFAULT_PROMPTS.ANALYZE);
    setImportSummarizePrompt(DEFAULT_PROMPTS.IMPORT_SUMMARIZE);
    setImportKeypointsPrompt(DEFAULT_PROMPTS.IMPORT_KEYPOINTS);
    setReportPrompt(DEFAULT_PROMPTS.REPORT);

    setAiOptSummary(false);
    setAiOptSkipKeywords(true);

    onSaveToast("プロンプトをリセットしました");
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-[#00000090] z-[210] flex items-start justify-center overflow-y-auto p-4 md:p-6"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[var(--surface)] border border-[var(--border2)] rounded-xl p-6 w-[600px] max-w-full my-auto shadow-2xl flex flex-col gap-4">
        <div>
          <div className="text-base font-bold text-[var(--bright)] flex items-center gap-2">
            <span>📝</span> プロンプト設定
          </div>
          <p className="text-xs text-[var(--subtle)] mt-1">
            各AI機能で使用するプロンプトを編集できます。<code className="font-mono bg-[#1c2128] text-[var(--orange)] px-1 rounded text-[10px]">{"{content}"}</code> はメモの本文に、<code className="font-mono bg-[#1c2128] text-[var(--orange)] px-1 rounded text-[10px]">{"{title}"}</code> はタイトルに置き換えられます。
          </p>
        </div>

        <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto pr-1">
          <div>
            <label className="text-[11px] text-[var(--subtle)] font-bold block mb-1">タイトル最適化プロンプト</label>
            <textarea
              className="w-full font-mono text-xs p-2 bg-[var(--bg)] border border-[var(--border2)] rounded-md text-[var(--text)] outline-none focus:border-[var(--purple)] transition-all resize-y"
              rows={3}
              value={titlePrompt}
              onChange={(e) => setTitlePrompt(e.target.value)}
            />
          </div>

          <div>
            <label className="text-[11px] text-[var(--subtle)] font-bold block mb-1">AI解析プロンプト（キーワード・要約・関連ノート）</label>
            <textarea
              className="w-full font-mono text-xs p-2 bg-[var(--bg)] border border-[var(--border2)] rounded-md text-[var(--text)] outline-none focus:border-[var(--purple)] transition-all resize-y"
              rows={8}
              value={analyzePrompt}
              onChange={(e) => setAnalyzePrompt(e.target.value)}
            />
            <div className="flex flex-col gap-1.5 mt-2 ml-1">
              <label className="flex items-center gap-2 text-xs text-[var(--text)] cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 cursor-pointer accent-[var(--purple)]"
                  checked={aiOptSummary}
                  onChange={(e) => setAiOptSummary(e.target.checked)}
                />
                要約を生成する
              </label>
              <label className="flex items-center gap-2 text-xs text-[var(--text)] cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 cursor-pointer accent-[var(--purple)]"
                  checked={aiOptSkipKeywords}
                  onChange={(e) => setAiOptSkipKeywords(e.target.checked)}
                />
                すでに記載がある場合はキーワードを生成しない
              </label>
            </div>
          </div>

          <div>
            <label className="text-[11px] text-[var(--subtle)] font-bold block mb-1">取り込み：要約プロンプト</label>
            <textarea
              className="w-full font-mono text-xs p-2 bg-[var(--bg)] border border-[var(--border2)] rounded-md text-[var(--text)] outline-none focus:border-[var(--purple)] transition-all resize-y"
              rows={3}
              value={importSummarizePrompt}
              onChange={(e) => setImportSummarizePrompt(e.target.value)}
            />
          </div>

          <div>
            <label className="text-[11px] text-[var(--subtle)] font-bold block mb-1">取り込み：キーポイント抽出プロンプト</label>
            <textarea
              className="w-full font-mono text-xs p-2 bg-[var(--bg)] border border-[var(--border2)] rounded-md text-[var(--text)] outline-none focus:border-[var(--purple)] transition-all resize-y"
              rows={3}
              value={importKeypointsPrompt}
              onChange={(e) => setImportKeypointsPrompt(e.target.value)}
            />
          </div>

          <div>
            <label className="text-[11px] text-[var(--subtle)] font-bold block mb-1">グラフ レポート生成プロンプト</label>
            <textarea
              className="w-full font-mono text-xs p-2 bg-[var(--bg)] border border-[var(--border2)] rounded-md text-[var(--text)] outline-none focus:border-[var(--purple)] transition-all resize-y"
              rows={5}
              value={reportPrompt}
              onChange={(e) => setReportPrompt(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-2 justify-between border-t border-[var(--border2)] pt-4 mt-1">
          <button className="text-xs text-[var(--orange)] border border-[var(--border2)] hover:bg-[#ff000011] p-2 px-4 rounded-md cursor-pointer font-medium transition-colors" onClick={handleReset}>
            🔄 デフォルトに戻す
          </button>
          <div className="flex gap-2">
            <button className="text-xs text-[var(--subtle)] border border-[var(--border2)] hover:bg-[var(--border)] p-2 px-4 rounded-md cursor-pointer font-medium transition-colors" onClick={onClose}>
              キャンセル
            </button>
            <button className="text-xs text-[var(--purple)] bg-[#a371f715] border border-[#a371f744] hover:bg-[#a371f725] p-2 px-5 rounded-md cursor-pointer font-bold transition-all" onClick={handleSave}>
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
