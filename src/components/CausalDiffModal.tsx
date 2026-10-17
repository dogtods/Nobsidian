/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import { Note } from "../types";
import {
  CausalLink,
  WeeklyCausalGroup,
  DUMMY_CAUSAL_LINKS,
  getWeekKeyFromTimestamp,
  computeWeeklyCausalDiffs
} from "../utils/causalDiffUtils";
import { ArrowRight, Sparkles, Download, FileText, Search, Plus, Trash2, Calendar, RefreshCw, X, ShieldCheck } from "lucide-react";

interface CausalDiffModalProps {
  isOpen: boolean;
  onClose: () => void;
  notes: Note[];
}

export default function CausalDiffModal({ isOpen, onClose, notes }: CausalDiffModalProps) {
  const [links, setLinks] = useState<CausalLink[]>(() => {
    try {
      const saved = localStorage.getItem("cn_causal_links_cache");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return DUMMY_CAUSAL_LINKS;
  });

  const [activeTab, setActiveTab] = useState<"new-only" | "all-weeks" | "report">("new-only");
  const [searchQuery, setSearchQuery] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractStatus, setExtractStatus] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newSource, setNewSource] = useState("");
  const [newTarget, setNewTarget] = useState("");
  const [newReason, setNewReason] = useState("");

  // Persist links
  useEffect(() => {
    try {
      localStorage.setItem("cn_causal_links_cache", JSON.stringify(links));
    } catch {}
  }, [links]);

  const weeklyGroups = useMemo(() => {
    return computeWeeklyCausalDiffs(links);
  }, [links]);

  // Filter links based on search query
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return weeklyGroups;
    const q = searchQuery.toLowerCase();
    return weeklyGroups.map(g => ({
      ...g,
      newLinks: g.newLinks.filter(l => l.source.toLowerCase().includes(q) || l.target.toLowerCase().includes(q) || l.reason.toLowerCase().includes(q)),
      continuingLinks: g.continuingLinks.filter(l => l.source.toLowerCase().includes(q) || l.target.toLowerCase().includes(q) || l.reason.toLowerCase().includes(q)),
      links: g.links.filter(l => l.source.toLowerCase().includes(q) || l.target.toLowerCase().includes(q) || l.reason.toLowerCase().includes(q))
    })).filter(g => g.newLinks.length > 0 || g.continuingLinks.length > 0);
  }, [weeklyGroups, searchQuery]);

  // AI Extraction using Gemini API
  const handleRunAiExtraction = async () => {
    const apiKey = localStorage.getItem("cn_gemini_key");
    if (!apiKey) {
      alert("AI設定 ⚙ から Gemini APIキーを設定してください");
      return;
    }

    setIsExtracting(true);
    setExtractStatus("ノートから因果関係を抽出中...");

    try {
      // Pick up to 15 recent notes
      const targetNotes = notes.slice(0, 15);
      if (targetNotes.length === 0) {
        alert("分析対象のノートがありません");
        setIsExtracting(false);
        return;
      }

      const notesText = targetNotes.map(n => `タイトル: ${n.title}\n本文: ${n.summary || n.content || ""}`).join("\n---\n");

      let model = localStorage.getItem("cn_gemini_model") || "gemini-flash-latest";
      const prompt = `以下のノート群から、ビジネスや技術トレンドにおける「原因 (Source) が 結果 (Target) を引き起こす・招く」という方向性のある因果関係（AがBを招く）を抽出してください。
出力は必ず以下のJSON配列形式のみで返してください（Markdownや他のテキストは不要です）。
[
  {
    "source": "原因となるキーワードやトピック (例: 電力逼迫)",
    "target": "結果となるキーワードやトピック (例: 地熱・自営電源)",
    "reason": "因果関係の簡潔な説明",
    "articleTitle": "参考となったノートのタイトル"
  }
]

ノートデータ:
${notesText}`;

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });

      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
      // Clean markdown code blocks if any
      const jsonStr = text.replace(/```json/gi, "").replace(/```/g, "").trim();
      const extracted = JSON.parse(jsonStr);

      if (Array.isArray(extracted) && extracted.length > 0) {
        const now = Date.now();
        const { periodKey, weekLabel } = getWeekKeyFromTimestamp(now);

        const newLinksToAdd: CausalLink[] = extracted.map((item: any, idx: number) => ({
          id: `ai-extracted-${Date.now()}-${idx}`,
          source: String(item.source || "要因").trim(),
          target: String(item.target || "影響").trim(),
          periodKey,
          weekLabel,
          reason: String(item.reason || "").trim(),
          articleTitle: String(item.articleTitle || targetNotes[0]?.title || "").trim(),
          articleId: targetNotes[0]?.id || "row_1"
        }));

        setLinks(prev => [...newLinksToAdd, ...prev]);
        setExtractStatus(`成功: ${newLinksToAdd.length}件の因果リンクを抽出しました！`);
      } else {
        setExtractStatus("有効な因果リンクが検出されませんでした。");
      }
    } catch (e: any) {
      console.error(e);
      setExtractStatus(`抽出エラー: ${e.message}`);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleAddManualLink = () => {
    if (!newSource.trim() || !newTarget.trim()) return;
    const now = Date.now();
    const { periodKey, weekLabel } = getWeekKeyFromTimestamp(now);
    const item: CausalLink = {
      id: `manual-${Date.now()}`,
      source: newSource.trim(),
      target: newTarget.trim(),
      periodKey,
      weekLabel,
      reason: newReason.trim() || "手動登録された因果関係",
      articleTitle: notes[0]?.title || "手動追加ノート",
      articleId: notes[0]?.id || "row_1"
    };
    setLinks(prev => [item, ...prev]);
    setNewSource("");
    setNewTarget("");
    setNewReason("");
    setIsAddModalOpen(false);
  };

  const handleDeleteLink = (id: string) => {
    setLinks(prev => prev.filter(l => l.id !== id));
  };

  // Markdown Report Generator
  const generateMarkdownReport = () => {
    let md = `# 📊 因果リンク週次差分レポート\n\n`;
    weeklyGroups.forEach(g => {
      md += `## 📅 期間: ${g.weekLabel} (${g.periodKey})\n\n`;
      md += `### ✨ 新規エッジ (${g.newLinks.length}件)\n`;
      if (g.newLinks.length === 0) {
        md += `*今期の新規因果リンクはありません*\n\n`;
      } else {
        g.newLinks.forEach(l => {
          md += `- **${l.source}** ➔ **${l.target}**\n  - 理由: ${l.reason}\n  - 参照記事: *${l.articleTitle}*\n\n`;
        });
      }

      if (g.continuingLinks.length > 0) {
        md += `### 🔄 継続・既存エッジ (${g.continuingLinks.length}件)\n`;
        g.continuingLinks.forEach(l => {
          md += `- ${l.source} ➔ ${l.target} (${l.reason.substring(0, 40)}...)\n`;
        });
        md += `\n`;
      }
      md += `---\n\n`;
    });
    return md;
  };

  const handleDownloadMarkdown = () => {
    const md = generateMarkdownReport();
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `causal-links-weekly-diff-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-[#0d1117]/90 z-[1100] flex flex-col animate-[fadeIn_0.2s_ease-out] text-[var(--text)]">
      
      {/* Top Header */}
      <div className="p-4 px-6 border-b border-[var(--border)] bg-[var(--surface)] flex justify-between items-center shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 font-bold flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            <span className="text-base font-bold text-[var(--bright)]">因果リンク週次差分 (A ➔ B)</span>
          </div>
          <span className="text-xs text-[var(--muted)] hidden md:inline">
            LLMによる方向性のある因果関係抽出・毎週の新規エッジ追跡
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRunAiExtraction}
            disabled={isExtracting}
            className="px-3.5 py-1.5 bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 text-white font-semibold text-xs rounded-md transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isExtracting ? "animate-spin" : ""}`} />
            {isExtracting ? "AI抽出中..." : "✨ AI因果抽出を実行"}
          </button>
          <button
            onClick={handleDownloadMarkdown}
            className="px-3 py-1.5 bg-[#21262d] hover:bg-[#30363d] text-[var(--bright)] font-semibold text-xs rounded-md border border-[var(--border2)] transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-blue-400" /> レポート (.md)
          </button>
          <div
            onClick={onClose}
            className="p-1.5 text-[var(--muted)] hover:text-[var(--red)] cursor-pointer text-lg font-bold transition-colors select-none"
            title="閉じる"
          >
            ✕
          </div>
        </div>
      </div>

      {/* Status banner if extracting */}
      {extractStatus && (
        <div className="px-6 py-2 bg-blue-950/40 border-b border-blue-500/30 text-blue-300 text-xs flex items-center justify-between shrink-0">
          <span>{extractStatus}</span>
          <button onClick={() => setExtractStatus("")} className="text-blue-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Tabs & Search Header */}
      <div className="p-4 px-6 bg-[#161b22] border-b border-[var(--border)] shrink-0 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("new-only")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === "new-only" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/50" : "bg-[#21262d] text-[var(--subtle)] hover:bg-[#30363d]"
            }`}
          >
            ✨ 今週の新着エッジ
          </button>
          <button
            onClick={() => setActiveTab("all-weeks")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "all-weeks" ? "bg-[#388bfd33] text-[#58a6ff] border border-[#388bfd55]" : "bg-[#21262d] text-[var(--subtle)] hover:bg-[#30363d]"
            }`}
          >
            📅 週次推移一覧 ({links.length})
          </button>
          <button
            onClick={() => setActiveTab("report")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "report" ? "bg-[#388bfd33] text-[#58a6ff] border border-[#388bfd55]" : "bg-[#21262d] text-[var(--subtle)] hover:bg-[#30363d]"
            }`}
          >
            📄 レポートプレビュー
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[var(--muted)] absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="因果リンクを検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-[#0d1117] border border-[var(--border2)] rounded-md pl-8 pr-3 py-1.5 text-xs text-[var(--bright)] placeholder-[var(--muted)] focus:outline-none focus:border-blue-500 w-48"
            />
          </div>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-3 py-1.5 bg-[#238636] hover:bg-[#2ea043] text-white font-semibold text-xs rounded-md transition-colors flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> 手動追加
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* Tab 1: New Edges Only */}
        {activeTab === "new-only" && (
          <div className="space-y-6">
            <div className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
              <h3 className="text-sm font-bold text-[var(--bright)] mb-1 flex items-center gap-2">
                <span>✨</span> 毎週の新着因果エッジ（過去に存在しなかった新興トレンド）
              </h3>
              <p className="text-xs text-[var(--muted)]">
                例：「電力逼迫 ➔ 地熱・自営電源」のような、今期初めて表出した因果の矢印をピックアップしています。
              </p>
            </div>

            {filteredGroups.map(group => {
              if (group.newLinks.length === 0) return null;
              return (
                <div key={group.periodKey} className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2">
                    <Calendar className="w-4 h-4 text-emerald-400" />
                    <span className="font-bold text-sm text-[var(--bright)]">{group.weekLabel}</span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-[10px]">
                      新規 {group.newLinks.length}件
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {group.newLinks.map(link => (
                      <div key={link.id} className="p-4 bg-[var(--surface)] border border-emerald-500/30 rounded-xl shadow-md space-y-3 relative group">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2.5 py-1 rounded bg-blue-600/20 text-blue-300 font-bold text-xs">
                              {link.source}
                            </span>
                            <ArrowRight className="w-4 h-4 text-emerald-400 shrink-0" />
                            <span className="px-2.5 py-1 rounded bg-emerald-600/20 text-emerald-300 font-bold text-xs">
                              {link.target}
                            </span>
                          </div>
                          <button
                            onClick={() => handleDeleteLink(link.id)}
                            className="text-[var(--muted)] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1 cursor-pointer"
                            title="削除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <p className="text-xs text-[var(--text)] leading-relaxed bg-[#161b22] p-2.5 rounded border border-[var(--border2)]">
                          {link.reason}
                        </p>

                        <div className="flex justify-between items-center text-[10px] text-[var(--muted)] pt-1 border-t border-[var(--border2)]/50">
                          <span>参照: {link.articleTitle}</span>
                          <span className="text-emerald-400 font-bold">NEW ✨</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Tab 2: All Weeks Timeline */}
        {activeTab === "all-weeks" && (
          <div className="space-y-6">
            {filteredGroups.map(group => (
              <div key={group.periodKey} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-blue-400" />
                    <span className="font-bold text-sm text-[var(--bright)]">{group.weekLabel}</span>
                    <span className="text-xs text-[var(--muted)] font-mono">({group.periodKey})</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold text-[10px]">
                      新規 {group.newLinks.length}件
                    </span>
                    <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold text-[10px]">
                      継続 {group.continuingLinks.length}件
                    </span>
                  </div>
                </div>

                <div className="space-y-2.5">
                  {group.links.map(link => (
                    <div key={link.id} className="p-3 bg-[#161b22] rounded-lg border border-[var(--border2)] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        {link.isNew && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/25 text-emerald-300 font-bold text-[9px]">
                            NEW
                          </span>
                        )}
                        <span className="font-bold text-xs text-[var(--bright)]">{link.source}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-[var(--muted)] shrink-0" />
                        <span className="font-bold text-xs text-[var(--bright)]">{link.target}</span>
                        <span className="text-xs text-[var(--muted)] truncate max-w-xs">({link.reason})</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-[var(--subtle)]">{link.articleTitle}</span>
                        <button
                          onClick={() => handleDeleteLink(link.id)}
                          className="text-[var(--muted)] hover:text-red-400 p-1 cursor-pointer"
                          title="削除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab 3: Report Preview */}
        {activeTab === "report" && (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-[var(--border)] pb-3">
              <h3 className="text-sm font-bold text-[var(--bright)]">📄 レポート用マークダウンプレビュー</h3>
              <button
                onClick={handleDownloadMarkdown}
                className="px-3 py-1.5 bg-[#238636] hover:bg-[#2ea043] text-white font-bold text-xs rounded transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" /> .mdファイルをダウンロード
              </button>
            </div>
            <pre className="p-4 bg-[#0d1117] rounded-lg border border-[var(--border2)] text-xs font-mono text-[var(--bright)] overflow-x-auto whitespace-pre-wrap leading-relaxed">
              {generateMarkdownReport()}
            </pre>
          </div>
        )}

      </div>

      {/* Manual Add Link Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-[#00000080] z-[1200] flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-[var(--border)] pb-3">
              <h3 className="text-base font-bold text-[var(--bright)]">因果リンクを手動追加</h3>
              <div onClick={() => setIsAddModalOpen(false)} className="cursor-pointer text-[var(--muted)] hover:text-white">✕</div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-[var(--bright)] mb-1">原因 (Source)</label>
                <input
                  type="text"
                  placeholder="例: 電力逼迫"
                  value={newSource}
                  onChange={(e) => setNewSource(e.target.value)}
                  className="w-full bg-[#161b22] border border-[var(--border2)] rounded px-3 py-1.5 text-[var(--bright)]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[var(--bright)] mb-1">結果 (Target)</label>
                <input
                  type="text"
                  placeholder="例: 地熱・自営電源"
                  value={newTarget}
                  onChange={(e) => setNewTarget(e.target.value)}
                  className="w-full bg-[#161b22] border border-[var(--border2)] rounded px-3 py-1.5 text-[var(--bright)]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[var(--bright)] mb-1">因果の理由・説明</label>
                <textarea
                  placeholder="なぜこの因果関係が成り立つのか..."
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                  className="w-full bg-[#161b22] border border-[var(--border2)] rounded px-3 py-1.5 text-[var(--bright)] h-20 resize-none"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-[var(--border)] flex justify-end gap-2">
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="px-3 py-1.5 bg-[#21262d] text-[var(--subtle)] rounded text-xs cursor-pointer"
              >
                キャンセル
              </button>
              <button
                onClick={handleAddManualLink}
                className="px-4 py-1.5 bg-[#238636] hover:bg-[#2ea043] text-white font-bold rounded text-xs cursor-pointer"
              >
                追加する
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
