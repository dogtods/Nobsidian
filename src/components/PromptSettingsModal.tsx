/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";

export const PROMPT_KEYS = {
  TITLE: "cn_prompt_title",
  ANALYZE: "cn_prompt_analyze",
  ANALYZE_BULK: "cn_prompt_analyze_bulk",
  IMPORT_SUMMARIZE: "cn_prompt_import_summarize",
  IMPORT_KEYPOINTS: "cn_prompt_import_keypoints",
  REPORT: "cn_prompt_report",
  EXTRACT_STRUCTURE: "cn_prompt_extract_structure",
  ORGANIZE_FOLDER: "cn_prompt_organize_folder",
  FIND_RELATED: "cn_prompt_find_related",
  STREAM_ANALYSIS: "cn_prompt_stream_analysis",
};

export const DEFAULT_PROMPTS = {
  TITLE: `以下のテキストの内容を最もよく表す、短くて魅力的な日本語のタイトル（20文字以内）を1つだけ提案してください。出力はタイトルのみとし、装飾や説明は不要です。\n\n内容:\n{content}`,
  ANALYZE: `あなたはナレッジベース管理AIです。以下の【対象のメモ】を読み込み、指定された【指示】に従ってJSON形式で分析結果を出力してください。

【対象のメモ】
タイトル: {title}
本文:
"""
{content}
"""

【指示】
{instructions}
- JSONのみを返す。マークダウンのコードブロックやテキストによる説明は不要。

【出力形式】
必ず以下のJSON形式のみで返してください。
{
{jsonFields}
}

【既存ノートのタイトル一覧（関連チェック用）】
"""
{existingTitles}
"""`,
  ANALYZE_BULK: `あなたはナレッジベース管理AIです。以下の【対象のメモ一覧】を読み込み、指定された【指示】と【出力形式】に従って、各ノートごとに分析結果を含むJSON配列を出力してください。

【対象のメモ一覧】
{notesText}

【指示】
{instructions}
- JSONのみを返す。マークダウンのコードブロックやテキストによる説明は不要。

【出力形式】
必ず以下のJSON配列形式のみで返してください。マークダウンのコードブロック（\`\`\`json など）や余分な解説文字は一切出力しないでください。
[
  {
{jsonFields}
  }
]

【既存ノートのタイトル一覧（関連チェック用）】
"""
{existingTitles}
"""`,
  IMPORT_SUMMARIZE: `以下の文章を分かりやすく要約してください。\n\n{content}`,
  IMPORT_KEYPOINTS: `以下の文章から重要なキーポイントを箇条書きで抽出してください。\n\n{content}`,
  REPORT: `以下のノート群を総合的に読み、日本語でレポートを作成してください。\n\n## 対象ノート\n{notes_content}\n\n## レポートの構成\n1. **概要**: 選択されたノート群の共通テーマや関係性を2〜3文でまとめる\n2. **主要な洞察**: 各ノートから得られる重要な知見を箇条書きで列挙\n3. **ノート間の関連性**: つながりや共通点・相違点を分析\n4. **まとめと次のアクション**: 全体から導かれる結論と今後の行動提案\n\n読みやすく実用的なレポートにしてください。`,
  EXTRACT_STRUCTURE: `あなたは記事の内容を視覚的に理解しやすくするための構造抽出アシスタントです。
以下の記事から、「比較できるもの」「時系列で変化したもの」「因果関係があるもの」「情報の階層構造」を抽出し、それぞれをMermaid記法の図として出力してください。
目的は「要約の網羅性」ではなく「理解コストの削減」です。数値や時期の変化など、比較・構造・因果関係を持つ情報は、文章ではなく図として表現してください。

記事本文:
{content}

【出力形式の厳格な遵守】
1. Mermaidの図解は、必ず \`\`\`mermaid [コード] \`\`\` の形式で出力してください。コードの一部を省略したり「...」でまとめたりせず、必ず実行可能な完全なコードを出力してください。
2. Mermaidコードの直後に、その図に関する簡単な説明文（100文字程度）を添えてください。
3. Mermaid以外の解説テキスト部分（見出し、まとめなど）も、必ず見出し(#)、箇条書き(-)、太字(**)などの標準的なMarkdown記法を適切に使用して構造化してください。
4. Mermaidのコードブロック前後には必ず空行を入れてください。

【描画環境の制約とMermaid構文ルール】
出力されたMermaidコードは背景が黒色のビューアで表示されます。またテキストがはみ出さないよう、以下のルールを必ず守ってください。

1. すべてのコードブロックの先頭(グラフ種別の行より前)に、次のinit行を必ず挿入すること。
%%{init: {'theme': 'dark', 'themeVariables': { 'primaryColor': '#1f6feb', 'primaryTextColor': '#ffffff', 'primaryBorderColor': '#ffffff', 'lineColor': '#58a6ff', 'textColor': '#ffffff', 'background': '#0d1117', 'mainBkg': '#0d1117', 'nodeBorder': '#ffffff', 'clusterBkg': '#0d1117', 'edgeLabelBackground':'#0d1117', 'fontSize': '16px' }}}%%

2. テキストが枠からはみ出さないための厳守事項:
- 詳しい説明はノード内に書かず、図の下の説明文に記載して補足してください。
- flowchartのノード内テキストは、枠からはみ出さないよう極力短く（1行あたり10文字以内目安）し、必要に応じて<br>で改行してください。
- timelineの各項目テキストも同様に短く区切り、必要に応じて<br>で改行してください。

3. グラフ種別の最適な選択と構文ルール:
- 量の比較（売上、人数など）には xychart-beta または pie を使用してください。
  ※ xychart-beta は構文が非常に厳格です。以下の【成功例】の形式を完全に守ってください。
  【xychart-beta 成功例】
  xychart-beta
    title "生産能力の比較"
    x-axis ["買収前", "買収後"]
    y-axis "生産能力(万トン)" 0 --> 120
    bar [53, 100]
  ※ title, x-axis内の各項目, y-axisタイトルは必ず二重引用符(")で囲んでください。
  ※ y-axis の数値範囲は \`min --> max\` の形式（矢印前後がスペース）にしてください。
- スケジュール、期間の比較、遅延の予測などには gantt を使用してください。
- 単純な時系列の出来事の変化には timeline を使用してください。
- 因果関係、プロセスの流れには flowchart TD を使用してください。
- 階層構造、関連用語のマッピングには mindmap を使用してください。

- ノードIDは半角英数字のみとする`,
  ORGANIZE_FOLDER: `あなたはノート整理の専門家です。
以下のノートのリストを読み、タイトルに基づいて適切なフォルダ（カテゴリ名）に分類してください。

分類のルール：
1. 4〜8個程度の適切なカテゴリ名を考えてください。
2. カテゴリ名は短く分かりやすい日本語にしてください。
3. すでに似たカテゴリがある場合は統合してください。
4. 出力は必ず以下のJSON形式のみとし、余計な解説は含めないでください。
{"ID": "カテゴリ名", "ID": "カテゴリ名", ...}

ノートリスト：
{listStr}`,
  FIND_RELATED: `あなたはナレッジデータベースの関連性探索に特化した優秀な専門AIです。
以下のノートの本文を深く理解し、提供する「接続可能な既存ノート候補一覧」の中から、このノートとテーマ、コンテキスト、暗黙的なテーマの関連、ナレッジの補完的関係が深く、相互リンク（[[タイトル]]）で繋ぐ価値がある関連ノートを的な・漏れなく抽出してください。

【対象ノートの本文】
タイトル: {title}
内容:
{content}

【接続可能な既存ノート候補一覧】
{candidateNotesInfo}

【指示ルール】
1. 暗黙的なテーマ、単語の重なり、論理的つながりをしっかりと読み、テーマが真に合致するノートを最大5件まで不足なく抽出してください。
2. 出力するタイトル文字列は、必ず上記の候補一覧に表記されている物と一字一句狂わずに完全に一致させてください（記号なども完全一致）。候補に存在しないタイトルを絶対に捏造してはいけません。
3. 出力形式は、必ず関連ノートのタイトルのみを格納したプレーンなJSONオブジェクト配列のみとし、マークダウンコードブロック（\`\`\`json等）や解説文などの不要な文字は絶対に出力しないでください。

出力例：
["タイトルA", "タイトルB"]`,
  STREAM_ANALYSIS: `あなたはデータ分析・考察アシスタントです。
以下のキーワードに関する情報を読み込み、なぜこの期間において当該キーワードが多く取り上げられたのか、背景を含めた深い考察を行ってください。関連するトピックの変遷や外的要因の推測なども含めてください。

【対象キーワード】
{keywords}

【関連ノート抜粋】
{notesSummary}

上記の情報を踏まえ、指定キーワードが各タイミングで多く言及された背景と文脈について、見出しや箇条書きを用いて分かりやすく論理的に解説してください。`,
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
  const [analyzeBulkPrompt, setAnalyzeBulkPrompt] = useState("");
  const [importSummarizePrompt, setImportSummarizePrompt] = useState("");
  const [importKeypointsPrompt, setImportKeypointsPrompt] = useState("");
  const [reportPrompt, setReportPrompt] = useState("");
  const [extractStructurePrompt, setExtractStructurePrompt] = useState("");
  const [organizeFolderPrompt, setOrganizeFolderPrompt] = useState("");
  const [findRelatedPrompt, setFindRelatedPrompt] = useState("");
  const [streamAnalysisPrompt, setStreamAnalysisPrompt] = useState("");

  const [aiOptSummary, setAiOptSummary] = useState(false);
  const [aiOptSkipKeywords, setAiOptSkipKeywords] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setTitlePrompt(getStoredPrompt("TITLE"));
      setAnalyzePrompt(getStoredPrompt("ANALYZE"));
      setAnalyzeBulkPrompt(getStoredPrompt("ANALYZE_BULK"));
      setImportSummarizePrompt(getStoredPrompt("IMPORT_SUMMARIZE"));
      setImportKeypointsPrompt(getStoredPrompt("IMPORT_KEYPOINTS"));
      setReportPrompt(getStoredPrompt("REPORT"));
      setExtractStructurePrompt(getStoredPrompt("EXTRACT_STRUCTURE"));
      setOrganizeFolderPrompt(getStoredPrompt("ORGANIZE_FOLDER"));
      setFindRelatedPrompt(getStoredPrompt("FIND_RELATED"));
      setStreamAnalysisPrompt(getStoredPrompt("STREAM_ANALYSIS"));

      setAiOptSummary(localStorage.getItem("cn_ai_opt_summary") === "true");
      const skipKw = localStorage.getItem("cn_ai_opt_skip_keywords");
      setAiOptSkipKeywords(skipKw === null ? true : skipKw === "true");
    }
  }, [isOpen]);

  const handleSave = () => {
    localStorage.setItem(PROMPT_KEYS.TITLE, titlePrompt);
    localStorage.setItem(PROMPT_KEYS.ANALYZE, analyzePrompt);
    localStorage.setItem(PROMPT_KEYS.ANALYZE_BULK, analyzeBulkPrompt);
    localStorage.setItem(PROMPT_KEYS.IMPORT_SUMMARIZE, importSummarizePrompt);
    localStorage.setItem(PROMPT_KEYS.IMPORT_KEYPOINTS, importKeypointsPrompt);
    localStorage.setItem(PROMPT_KEYS.REPORT, reportPrompt);
    localStorage.setItem(PROMPT_KEYS.EXTRACT_STRUCTURE, extractStructurePrompt);
    localStorage.setItem(PROMPT_KEYS.ORGANIZE_FOLDER, organizeFolderPrompt);
    localStorage.setItem(PROMPT_KEYS.FIND_RELATED, findRelatedPrompt);
    localStorage.setItem(PROMPT_KEYS.STREAM_ANALYSIS, streamAnalysisPrompt);

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
    setAnalyzeBulkPrompt(DEFAULT_PROMPTS.ANALYZE_BULK);
    setImportSummarizePrompt(DEFAULT_PROMPTS.IMPORT_SUMMARIZE);
    setImportKeypointsPrompt(DEFAULT_PROMPTS.IMPORT_KEYPOINTS);
    setReportPrompt(DEFAULT_PROMPTS.REPORT);
    setExtractStructurePrompt(DEFAULT_PROMPTS.EXTRACT_STRUCTURE);
    setOrganizeFolderPrompt(DEFAULT_PROMPTS.ORGANIZE_FOLDER);
    setFindRelatedPrompt(DEFAULT_PROMPTS.FIND_RELATED);
    setStreamAnalysisPrompt(DEFAULT_PROMPTS.STREAM_ANALYSIS);

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
            <label className="text-[11px] text-[var(--subtle)] font-bold block mb-1">AI解析プロンプト（個別ノート）</label>
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
            <label className="text-[11px] text-[var(--subtle)] font-bold block mb-1">AI解析プロンプト（一括バッチ）</label>
            <textarea
              className="w-full font-mono text-xs p-2 bg-[var(--bg)] border border-[var(--border2)] rounded-md text-[var(--text)] outline-none focus:border-[var(--purple)] transition-all resize-y"
              rows={8}
              value={analyzeBulkPrompt}
              onChange={(e) => setAnalyzeBulkPrompt(e.target.value)}
            />
          </div>

          <div>
            <label className="text-[11px] text-[var(--subtle)] font-bold block mb-1">構造抽出プロンプト (Mermaid変換)</label>
            <textarea
              className="w-full font-mono text-xs p-2 bg-[var(--bg)] border border-[var(--border2)] rounded-md text-[var(--text)] outline-none focus:border-[var(--purple)] transition-all resize-y"
              rows={8}
              value={extractStructurePrompt}
              onChange={(e) => setExtractStructurePrompt(e.target.value)}
            />
          </div>

          <div>
            <label className="text-[11px] text-[var(--subtle)] font-bold block mb-1">フォルダ自動分類プロンプト</label>
            <textarea
              className="w-full font-mono text-xs p-2 bg-[var(--bg)] border border-[var(--border2)] rounded-md text-[var(--text)] outline-none focus:border-[var(--purple)] transition-all resize-y"
              rows={6}
              value={organizeFolderPrompt}
              onChange={(e) => setOrganizeFolderPrompt(e.target.value)}
            />
          </div>

          <div>
            <label className="text-[11px] text-[var(--subtle)] font-bold block mb-1">AI関連リンク探索プロンプト</label>
            <textarea
              className="w-full font-mono text-xs p-2 bg-[var(--bg)] border border-[var(--border2)] rounded-md text-[var(--text)] outline-none focus:border-[var(--purple)] transition-all resize-y"
              rows={8}
              value={findRelatedPrompt}
              onChange={(e) => setFindRelatedPrompt(e.target.value)}
            />
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

          <div>
            <label className="text-[11px] text-[var(--subtle)] font-bold block mb-1">時系列ストリーム 考察プロンプト</label>
            <textarea
              className="w-full font-mono text-xs p-2 bg-[var(--bg)] border border-[var(--border2)] rounded-md text-[var(--text)] outline-none focus:border-[var(--purple)] transition-all resize-y"
              rows={6}
              value={streamAnalysisPrompt}
              onChange={(e) => setStreamAnalysisPrompt(e.target.value)}
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
