/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from "react";
import { Note, LearningQuestion } from "../types";
import { CausalLink } from "../utils/causalDiffUtils";
import { Download, FileText, X, Check, Copy, Printer } from "lucide-react";
import { getFolderFromKeywords } from "../utils/graphDataParser";
import { getStoredDecisions, getStoredAnalyses, getStoredReviews } from "../utils/deepDiveUtils";

interface ArticleExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  note: Note;
  notes?: Note[];
  allCausalLinks?: CausalLink[];
  allQuestions?: LearningQuestion[];
  allDeepDiveDecisions?: any[];
  onToast?: (msg: string) => void;
}

export default function ArticleExportModal({
  isOpen,
  onClose,
  note,
  notes = [],
  allCausalLinks = [],
  allQuestions = [],
  onToast
}: ArticleExportModalProps) {
  const [includeSummary, setIncludeSummary] = useState(true);
  const [includeContent, setIncludeContent] = useState(true);
  const [includeCausal, setIncludeCausal] = useState(true);
  const [includeQuestions, setIncludeQuestions] = useState(true);
  const [includeDeepDive, setIncludeDeepDive] = useState(true);
  const [isCopied, setIsCopied] = useState(false);

  // 関連する因果リンク
  const relatedLinks = useMemo(() => {
    return allCausalLinks.filter(l =>
      (l.articleId && String(l.articleId) === String(note.id)) ||
      (l.articleTitle && note.title && l.articleTitle.trim().toLowerCase() === note.title.trim().toLowerCase())
    );
  }, [allCausalLinks, note]);

  // 関連するクイズ・学習問題
  const relatedQuestions = useMemo(() => {
    return allQuestions.filter(q =>
      (q.noteId && String(q.noteId) === String(note.id)) ||
      (q.noteTitle && note.title && q.noteTitle.trim().toLowerCase() === note.title.trim().toLowerCase())
    );
  }, [allQuestions, note]);

  // Deep Dive (深掘り判断・論点・分析結果・振り返り) データ
  const deepDiveDecision = useMemo(() => {
    const list = getStoredDecisions(note.id);
    return list.length > 0 ? list[0] : null;
  }, [note.id]);

  const deepDiveIssues = useMemo(() => {
    if (!deepDiveDecision) return [];
    return getStoredReviews(deepDiveDecision.analysisId);
  }, [deepDiveDecision]);

  const deepDiveAnalyses = useMemo(() => {
    if (!deepDiveDecision) return [];
    return getStoredAnalyses(deepDiveDecision.analysisId);
  }, [deepDiveDecision]);

  const deepDiveReviews = useMemo(() => {
    return getStoredReviews(note.id);
  }, [note.id]);

  if (!isOpen) return null;

  const folderName = note.columnN || getFolderFromKeywords(note.keywords || "") || "未分類";

  const generateHtmlContent = () => {
    const causalHtml = includeCausal && relatedLinks.length > 0 ? `
      <section class="section">
        <h2>🔗 抽出された因果リンク (${relatedLinks.length}件)</h2>
        <div class="cards-grid">
          ${relatedLinks.map(l => `
            <div class="card">
              <div class="causal-pair">
                <span class="badge cause">原因: ${l.source}</span>
                <span class="arrow">➔</span>
                <span class="badge effect">結果: ${l.target}</span>
              </div>
              ${l.reason ? `<p class="reason"><strong>因果理由:</strong> ${l.reason}</p>` : ""}
              ${l.detailedInference ? `<div class="inference"><strong>💡 推論解説・図解:</strong><pre>${l.detailedInference}</pre></div>` : ""}
              <div class="meta-sub">週: ${l.weekLabel || l.periodKey || ""}</div>
            </div>
          `).join("")}
        </div>
      </section>
    ` : "";

    const questionsHtml = includeQuestions && relatedQuestions.length > 0 ? `
      <section class="section">
        <h2>❓ 関連する確認クイズ (${relatedQuestions.length}問)</h2>
        <div class="cards-grid">
          ${relatedQuestions.map((q, i) => `
            <div class="card">
              <h3>Q${i + 1}. [${q.type === "single_choice" ? "単一選択" : q.type === "multiple_choice" ? "複数選択" : q.type === "true_false" ? "正誤" : "記述式"}] ${q.question}</h3>
              ${q.choices && q.choices.length > 0 ? `
                <ul class="choices">
                  ${q.choices.map((c, ci) => `
                    <li class="${c.isCorrect ? 'correct' : ''}">
                      ${String.fromCharCode(65 + ci)}. ${c.text} ${c.isCorrect ? '✓ (正解)' : ''}
                    </li>
                  `).join("")}
                </ul>
              ` : ""}
              ${q.explanation ? `<p class="explanation"><strong>解説:</strong> ${q.explanation}</p>` : ""}
            </div>
          `).join("")}
        </div>
      </section>
    ` : "";

    const summaryHtml = includeSummary && note.summary ? `
      <section class="section">
        <h2>🤖 AI要約・ポイント</h2>
        <div class="content-box summary-box">
          ${note.summary.replace(/\n/g, '<br>')}
        </div>
      </section>
    ` : "";

    const contentHtml = includeContent && (note.content || note.rawContent) ? `
      <section class="section">
        <h2>📚 記事本文 / 原文テキスト</h2>
        <div class="content-box text-box">
          ${(note.content || note.rawContent || "").replace(/\n/g, '<br>')}
        </div>
      </section>
    ` : "";

    const deepDiveHtml = includeDeepDive && deepDiveDecision ? `
      <section class="section">
        <h2>🔍 深掘り分析・判定レポート (Deep Dive)</h2>
        <div class="card" style="margin-bottom: 15px;">
          <h3 style="color: #58a6ff; margin-bottom: 8px;">1. 記事のトリアージ・判断</h3>
          <p><strong>主要論点 (Core Claim):</strong> ${deepDiveDecision.coreClaim || "未設定"}</p>
          <p><strong>記事種別:</strong> ${deepDiveDecision.articleType} | <strong>現在のステージ:</strong> ${deepDiveDecision.currentStage} | <strong>優先度:</strong> ${deepDiveDecision.priority.toUpperCase()}</p>
          <p><strong>重要度評価:</strong> ${deepDiveDecision.importanceEval || ""}</p>
          <p><strong>実現可能性・評価:</strong> ${deepDiveDecision.currentFeasibility || ""}</p>
          <p><strong>深掘り選別理由:</strong> ${deepDiveDecision.reasonForDeepDive || deepDiveDecision.reasonForSkipping || ""}</p>
          <p><strong>AI判定 verdict:</strong> ${deepDiveDecision.aiVerdict || deepDiveDecision.userFinalDecision || ""}</p>
        </div>

        ${deepDiveAnalyses.length > 0 ? `
          <div class="card" style="margin-bottom: 15px;">
            <h3 style="color: #58a6ff; margin-bottom: 8px;">2. 論点ごとの分析・検証結果 (${deepDiveAnalyses.length}件)</h3>
            ${deepDiveAnalyses.map(ana => `
              <div style="background: #161b22; padding: 10px; border-radius: 6px; margin-bottom: 10px; font-size: 12px;">
                <strong>論点: ${ana.issueTitle}</strong>
                <p style="margin: 4px 0;"><strong>検証された事実:</strong> ${ana.verifiedFacts}</p>
                <p style="margin: 4px 0;"><strong>分析結論:</strong> ${ana.analysisConclusion}</p>
                <p style="margin: 4px 0; color: #bc8cff;"><strong>信頼度:</strong> ${ana.confidenceScoreAndReason}</p>
              </div>
            `).join("")}
          </div>
        ` : ""}

        ${deepDiveReviews.length > 0 ? `
          <div class="card">
            <h3 style="color: #58a6ff; margin-bottom: 8px;">3. 予測と実績の振り返り (${deepDiveReviews.length}件)</h3>
            ${deepDiveReviews.map(rev => `
              <div style="background: #161b22; padding: 10px; border-radius: 6px; margin-bottom: 8px; font-size: 12px;">
                <p style="margin: 2px 0;"><strong>実績・経過:</strong> ${rev.actualOutcome}</p>
                <p style="margin: 2px 0; color: #3fb950;"><strong>学び・示唆:</strong> ${rev.learnings}</p>
              </div>
            `).join("")}
          </div>
        ` : ""}
      </section>
    ` : "";

    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>${note.title || "記事レポート"} - 統合ナレッジレポート</title>
  <style>
    :root {
      --bg: #0d1117;
      --surface: #161b22;
      --border: #30363d;
      --text: #c9d1d9;
      --bright: #f0f6fc;
      --accent: #58a6ff;
      --green: #3fb950;
      --purple: #bc8cff;
      --amber: #d29922;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      margin: 0;
      padding: 30px;
      line-height: 1.6;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 40px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    }
    header {
      border-bottom: 1px solid var(--border);
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .meta-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 12px;
      font-size: 12px;
    }
    .tag {
      background: rgba(88, 166, 255, 0.15);
      color: var(--accent);
      padding: 3px 10px;
      border-radius: 20px;
      border: 1px solid rgba(88, 166, 255, 0.3);
      font-weight: 600;
    }
    .tag.folder {
      background: rgba(210, 153, 34, 0.15);
      color: var(--amber);
      border-color: rgba(210, 153, 34, 0.3);
    }
    h1 {
      color: var(--bright);
      font-size: 24px;
      margin: 0 0 10px 0;
    }
    .url-link {
      font-size: 12px;
      color: var(--accent);
      word-break: break-all;
      text-decoration: none;
    }
    .url-link:hover {
      text-decoration: underline;
    }
    .section {
      margin-bottom: 35px;
    }
    h2 {
      font-size: 16px;
      color: var(--bright);
      border-left: 4px solid var(--accent);
      padding-left: 10px;
      margin-bottom: 15px;
    }
    .content-box {
      background: #090d13;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 20px;
      font-size: 13px;
      color: var(--bright);
      white-space: pre-wrap;
      word-break: break-word;
    }
    .summary-box {
      border-left: 4px solid var(--green);
    }
    .cards-grid {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .card {
      background: #090d13;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 15px;
    }
    .card h3 {
      font-size: 14px;
      color: var(--bright);
      margin: 0 0 10px 0;
    }
    .causal-pair {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      margin-bottom: 8px;
    }
    .badge {
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: bold;
    }
    .badge.cause {
      background: rgba(88, 166, 255, 0.2);
      color: #79c0ff;
      border: 1px solid rgba(88, 166, 255, 0.4);
    }
    .badge.effect {
      background: rgba(63, 185, 80, 0.2);
      color: #56d364;
      border: 1px solid rgba(63, 185, 80, 0.4);
    }
    .arrow {
      color: var(--text);
      font-weight: bold;
    }
    .reason {
      font-size: 12px;
      color: var(--text);
      margin: 5px 0 0 0;
    }
    .inference {
      margin-top: 8px;
      background: #161b22;
      padding: 10px;
      border-radius: 6px;
      font-size: 11px;
      color: var(--purple);
    }
    .inference pre {
      margin: 5px 0 0 0;
      white-space: pre-wrap;
      font-family: inherit;
    }
    .choices {
      margin: 8px 0 0 0;
      padding-left: 20px;
      font-size: 12px;
    }
    .choices li {
      margin-bottom: 4px;
    }
    .choices li.correct {
      color: var(--green);
      font-weight: bold;
    }
    .explanation {
      margin-top: 8px;
      font-size: 12px;
      color: #8b949e;
      border-top: 1px solid var(--border);
      padding-top: 6px;
    }
    .meta-sub {
      font-size: 10px;
      color: #8b949e;
      margin-top: 6px;
    }
    footer {
      text-align: center;
      font-size: 11px;
      color: #8b949e;
      border-top: 1px solid var(--border);
      padding-top: 20px;
      margin-top: 40px;
    }
    @media print {
      body { background: #fff; color: #000; padding: 0; }
      .container { border: none; box-shadow: none; padding: 0; max-width: 100%; }
      .content-box, .card { background: #f6f8fa; border-color: #d0d7de; color: #24292f; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="meta-tags">
        <span class="tag folder">📁 ${folderName}</span>
        ${note.dateStr ? `<span class="tag">📅 ${note.dateStr}</span>` : ""}
        ${note.rowIndex ? `<span class="tag">行 #${note.rowIndex}</span>` : ""}
      </div>
      <h1>${note.title || "無題の記事"}</h1>
      ${note.sourceUrl ? `<a href="${note.sourceUrl}" target="_blank" class="url-link">🔗 ${note.sourceUrl}</a>` : ""}
    </header>

    ${summaryHtml}
    ${contentHtml}
    ${causalHtml}
    ${questionsHtml}
    ${deepDiveHtml}

    <footer>
      Generated by Knowledge Navigator - ${new Date().toLocaleDateString()}
    </footer>
  </div>
</body>
</html>`;
  };

  const handleDownloadHtml = () => {
    const html = generateHtmlContent();
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeTitle = (note.title || "article").replace(/[\/\\?%*:|"<>]/g, "_").slice(0, 40);
    a.href = url;
    a.download = `report_${safeTitle}_${new Date().toISOString().slice(0, 10)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    onToast?.("記事レポートをHTML形式でダウンロードしました！ (ブラウザの印刷からPDF化も可能です)");
  };

  const handlePrintPdf = () => {
    const html = generateHtmlContent();
    const win = window.open("", "_blank");
    if (win) {
      win.document.write(html);
      win.document.close();
      setTimeout(() => {
        win.focus();
        win.print();
      }, 500);
    } else {
      onToast?.("ポップアップがブロックされました。ダウンロードをご利用ください。");
    }
  };

  const handleCopyHtml = async () => {
    const html = generateHtmlContent();
    try {
      await navigator.clipboard.writeText(html);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 3000);
      onToast?.("HTMLソースをクリップボードにコピーしました！");
    } catch {
      onToast?.("クリップボードへのコピーに失敗しました。");
    }
  };

  return (
    <div className="fixed inset-0 z-[1400] bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
      <div className="bg-[#161b22] border border-[var(--border)] rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[var(--border)] flex items-start justify-between gap-3 bg-[#0d1117]">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded bg-blue-500/25 text-blue-300 border border-blue-500/40 text-[10px] font-bold flex items-center gap-1">
                <FileText className="w-3 h-3" />
                <span>統合エクスポート</span>
              </span>
              <span className="text-xs text-[var(--muted)] truncate max-w-sm">
                {folderName}
              </span>
            </div>
            <h2 className="text-sm sm:text-base font-bold text-[var(--bright)] leading-snug truncate">
              {note.title || "無題の記事"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-[#21262d] transition-colors shrink-0 cursor-pointer"
            title="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 text-xs overflow-y-auto">
          <p className="text-[var(--subtle)] leading-relaxed">
            この記事に紐付いているすべての成果物（本文、AI要約、因果リンク、確認クイズ等）をまとめて、美しく整形された<strong>HTMLレポート</strong>として出力またはPDF印刷できます。
          </p>

          <div className="bg-[#0d1117] border border-[var(--border2)] rounded-xl p-4 space-y-3">
            <div className="font-bold text-[var(--bright)] text-xs mb-1">含める内容の選択:</div>
            
            <label className="flex items-center justify-between gap-2 cursor-pointer p-1.5 rounded hover:bg-[#161b22]">
              <span className="text-gray-200">🤖 AI要約・ポイント</span>
              <input type="checkbox" checked={includeSummary} onChange={e => setIncludeSummary(e.target.checked)} className="accent-blue-600" />
            </label>

            <label className="flex items-center justify-between gap-2 cursor-pointer p-1.5 rounded hover:bg-[#161b22]">
              <span className="text-gray-200">📚 記事本文 / 原文テキスト</span>
              <input type="checkbox" checked={includeContent} onChange={e => setIncludeContent(e.target.checked)} className="accent-blue-600" />
            </label>

            <label className="flex items-center justify-between gap-2 cursor-pointer p-1.5 rounded hover:bg-[#161b22]">
              <div className="flex items-center gap-2">
                <span className="text-gray-200">🔗 抽出された因果リンク</span>
                <span className="px-1.5 py-0.2 rounded bg-blue-950 text-blue-300 text-[10px] font-mono">{relatedLinks.length}件</span>
              </div>
              <input type="checkbox" checked={includeCausal} onChange={e => setIncludeCausal(e.target.checked)} className="accent-blue-600" />
            </label>

            <label className="flex items-center justify-between gap-2 cursor-pointer p-1.5 rounded hover:bg-[#161b22]">
              <div className="flex items-center gap-2">
                <span className="text-gray-200">❓ 関連する確認クイズ</span>
                <span className="px-1.5 py-0.2 rounded bg-purple-950 text-purple-300 text-[10px] font-mono">{relatedQuestions.length}問</span>
              </div>
              <input type="checkbox" checked={includeQuestions} onChange={e => setIncludeQuestions(e.target.checked)} className="accent-blue-600" />
            </label>

            <label className="flex items-center justify-between gap-2 cursor-pointer p-1.5 rounded hover:bg-[#161b22]">
              <div className="flex items-center gap-2">
                <span className="text-gray-200">🔍 深掘り分析・判断 (Deep Dive)</span>
                <span className="px-1.5 py-0.2 rounded bg-sky-950 text-sky-300 text-[10px] font-mono">{deepDiveDecision ? "あり" : "なし"}</span>
              </div>
              <input type="checkbox" checked={includeDeepDive} onChange={e => setIncludeDeepDive(e.target.checked)} className="accent-blue-600" />
            </label>
          </div>

          <div className="p-3 bg-blue-950/20 border border-blue-500/30 rounded-xl text-blue-300 text-[11px] leading-relaxed">
            💡 <strong>ヒント:</strong> 出力したHTMLファイルをブラウザで開き、<code>Ctrl + P</code> (Macは <code>Cmd + P</code>) から<strong>「PDFとして保存」</strong>を選択すると、そのまま綺麗なPDF資料になります。
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#0d1117] border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadHtml}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-xs transition flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              <span>HTMLダウンロード</span>
            </button>
            <button
              type="button"
              onClick={handlePrintPdf}
              className="px-3.5 py-2 bg-[#21262d] hover:bg-[#30363d] text-[var(--bright)] font-semibold rounded-lg text-xs border border-[var(--border2)] transition flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-amber-400" />
              <span>PDF印刷 / プレビュー</span>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyHtml}
              className="px-3 py-2 bg-[#21262d] hover:bg-[#30363d] text-[var(--bright)] font-semibold rounded-lg text-xs border border-[var(--border2)] transition flex items-center gap-1.5 cursor-pointer"
            >
              {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-blue-400" />}
              <span>{isCopied ? "コピー完了" : "HTMLコピー"}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 bg-[#21262d] hover:bg-[#30363d] text-gray-300 rounded-lg text-xs border border-[var(--border2)] cursor-pointer"
            >
              閉じる
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
