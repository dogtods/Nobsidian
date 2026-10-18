/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import { Note } from "../types";
import {
  CausalLink,
  DUMMY_CAUSAL_LINKS,
  ParseResult,
  WeekMode,
  buildExternalPrompt,
  collectExistingTerms,
  computeWeeklyCausalDiffs,
  edgeSignature,
  edgesToLinks,
  getWeekKeyFromTimestamp,
  linkKey,
  migrateLinks,
  parseExternalCausalResult,
  placeEdge,
  selectRecentNotes
} from "../utils/causalDiffUtils";
import CausalLagPanel from "./CausalLagPanel";
import { getFolderFromKeywords, getFolderFromColumnN } from "../utils/graphDataParser";
import { ArrowRight, Sparkles, Download, Search, Plus, Trash2, Calendar, RefreshCw, Copy, ClipboardPaste, Check } from "lucide-react";

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

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
        if (Array.isArray(parsed) && parsed.length > 0) return migrateLinks(parsed);
      }
    } catch {}
    return DUMMY_CAUSAL_LINKS;
  });

  const [activeTab, setActiveTab] = useState<"new-only" | "all-weeks" | "report" | "external" | "lag">("new-only");
  const [searchQuery, setSearchQuery] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractStatus, setExtractStatus] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newSource, setNewSource] = useState("");
  const [newTarget, setNewTarget] = useState("");
  const [newReason, setNewReason] = useState("");

  // 外部AI連携
  const [promptCount, setPromptCount] = useState(20);
  const [selectedFolder, setSelectedFolder] = useState<string>("all");
  const [folderColumnSource, setFolderColumnSource] = useState<"D" | "N">(() => {
    try {
      return localStorage.getItem("cn_folder_column_source") === "N" ? "N" : "D";
    } catch {
      return "D";
    }
  });
  const [promptMaxChars, setPromptMaxChars] = useState(500);
  const [includeTerms, setIncludeTerms] = useState(true);
  const [pasteText, setPasteText] = useState("");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [weekMode, setWeekMode] = useState<WeekMode>("article");
  const [copyMsg, setCopyMsg] = useState("");
  const step1Ref = useRef<HTMLDivElement>(null);
  const step2Ref = useRef<HTMLDivElement>(null);
  const pasteRef = useRef<HTMLTextAreaElement>(null);

  // Persist links
  useEffect(() => {
    try {
      localStorage.setItem("cn_causal_links_cache", JSON.stringify(links));
    } catch {}
  }, [links]);

  const availableFolders = useMemo(() => {
    const set = new Set<string>();
    notes.forEach(n => {
      const f = folderColumnSource === "N" ? getFolderFromColumnN(n) : getFolderFromKeywords(n.keywords);
      if (f) set.add(f);
    });
    return Array.from(set).sort();
  }, [notes, folderColumnSource]);

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

  const existingTerms = useMemo(() => collectExistingTerms(links), [links]);

  const selectedNotes = useMemo(() => selectRecentNotes(notes, promptCount, selectedFolder, folderColumnSource), [notes, promptCount, selectedFolder, folderColumnSource]);

  const externalPrompt = useMemo(
    () =>
      buildExternalPrompt(selectedNotes, {
        maxChars: promptMaxChars,
        existingTerms: includeTerms ? existingTerms : [],
        maxEdgesPerNote: 3,
        maxEdgesTotal: Math.max(10, Math.min(60, selectedNotes.length * 2))
      }),
    [selectedNotes, promptMaxChars, includeTerms, existingTerms]
  );

  // 解析結果のプレビュー情報（週・ノート特定・新規/既存/重複）
  const previewRows = useMemo(() => {
    if (!parsed) return [];
    const knownSigs = new Set(links.map(l => edgeSignature(l.source, l.target)));
    const existingKeys = new Set(links.map(linkKey));
    return parsed.edges.map((edge, i) => {
      const p = placeEdge(edge, notes, weekMode);
      const articleId = p.note ? String(p.note.id) : "";
      const key = linkKey({ source: edge.source, target: edge.target, periodKey: p.periodKey, articleId });
      const status: "dup" | "known" | "new" = existingKeys.has(key)
        ? "dup"
        : knownSigs.has(edgeSignature(edge.source, edge.target))
        ? "known"
        : "new";
      return { i, edge, p, status };
    });
  }, [parsed, links, notes, weekMode]);

  const handleCopyPrompt = async () => {
    const ok = await copyText(externalPrompt);
    setCopyMsg(ok ? "コピーしました" : "コピーに失敗しました。下の枠を長押しして全選択してください");
    setTimeout(() => setCopyMsg(""), 3000);
  };

  const handleDownloadPrompt = () => {
    const blob = new Blob([externalPrompt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `causal-prompt-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handlePasteFromClipboard = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t) {
        setPasteText(t);
        handleParsePaste(t);
      }
    } catch {
      setExtractStatus("クリップボードの読み取りが許可されていません。枠に直接貼り付けてください。");
    }
  };

  const handleParsePaste = (textOverride?: string) => {
    const r = parseExternalCausalResult(textOverride ?? pasteText);
    setParsed(r);
    setExcluded(new Set());
  };

  const handleImportParsed = () => {
    if (!parsed) return;
    const targets = parsed.edges.filter((_, i) => !excluded.has(i));
    const { links: added, skippedDuplicates } = edgesToLinks(targets, notes, weekMode, "external", links);
    if (added.length === 0) {
      setExtractStatus(`取り込める新しいリンクがありませんでした（重複スキップ ${skippedDuplicates}件）`);
      return;
    }
    setLinks(prev => [...added, ...prev]);
    setExtractStatus(
      `外部AIの結果を取り込みました: 追加 ${added.length}件 / 重複スキップ ${skippedDuplicates}件 / 除外・不正 ${
        excluded.size + parsed.issues.length
      }件`
    );
    setPasteText("");
    setParsed(null);
    setExcluded(new Set());
    setActiveTab("new-only");
  };

  const hasSample = links.some(l => l.origin === "sample" || l.id.startsWith("cl-"));
  const handleRemoveSamples = () => {
    setLinks(prev => prev.filter(l => !(l.origin === "sample" || l.id.startsWith("cl-"))));
  };

  // ヘッダーからのワンタップ操作
  const handleQuickPromptOut = async () => {
    setActiveTab("external");
    if (selectedNotes.length === 0) {
      setExtractStatus("本文のあるノートがないため、プロンプトを作れません");
      return;
    }
    const ok = await copyText(externalPrompt);
    setExtractStatus(
      ok
        ? `プロンプトをコピーしました（${selectedNotes.length}件・${externalPrompt.length.toLocaleString()}文字）。外部AIに貼り付けて実行し、結果は「結果を入力」へ`
        : "自動コピーに失敗しました。表示された枠を長押しして全選択→コピーしてください"
    );
    setTimeout(() => step1Ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  };

  const handleQuickInput = () => {
    setActiveTab("external");
    setTimeout(() => {
      step2Ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      pasteRef.current?.focus();
    }, 80);
  };

  const handleRemoveSamplesConfirm = () => {
    const n = links.filter(l => l.origin === "sample" || l.id.startsWith("cl-")).length;
    if (window.confirm(`サンプルデータ ${n}件を削除します。よろしいですか？`)) handleRemoveSamples();
  };

  // AI Extraction using Gemini API (アプリ内蔵)
  const handleRunAiExtraction = async () => {
    const apiKey = localStorage.getItem("cn_gemini_key");
    if (!apiKey) {
      alert("AI設定 ⚙ から Gemini APIキーを設定してください");
      return;
    }

    const targetNotes = selectRecentNotes(notes, promptCount, selectedFolder, folderColumnSource);
    if (targetNotes.length === 0) {
      alert("分析対象のノートがありません");
      return;
    }

    setIsExtracting(true);
    setExtractStatus("ノートから因果関係を抽出中...");

    try {
      const prompt = buildExternalPrompt(targetNotes, {
        maxChars: 600,
        existingTerms: existingTerms,
        maxEdgesPerNote: 3,
        maxEdgesTotal: 40
      });
      const model = localStorage.getItem("cn_gemini_model") || "gemini-flash-latest";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
        })
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || data?.error) {
        throw new Error(data?.error?.message || `HTTP ${res.status}`);
      }
      const text = (data?.candidates?.[0]?.content?.parts || []).map((p: any) => p?.text || "").join("");
      if (!text) {
        throw new Error(`AIの応答が空でした (${data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason || "理由不明"})`);
      }

      const result = parseExternalCausalResult(text);
      if (result.fatal) {
        setExtractStatus(result.fatal);
        return;
      }
      const { links: added, skippedDuplicates } = edgesToLinks(result.edges, targetNotes, "article", "gemini", links);
      if (added.length === 0) {
        setExtractStatus(`新しい因果リンクはありませんでした（重複スキップ ${skippedDuplicates}件）`);
        return;
      }
      setLinks(prev => [...added, ...prev]);
      setExtractStatus(
        `成功: ${added.length}件の因果リンクを追加しました（重複スキップ ${skippedDuplicates}件 / 不正 ${result.issues.length}件）`
      );
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
      articleTitle: "手動追加",
      articleId: "",
      origin: "manual"
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
      
      {/* Top Header (title + close: 常に表示) */}
      <div className="px-3 sm:px-6 py-3 border-b border-[var(--border)] bg-[var(--surface)] flex justify-between items-center gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 font-bold flex items-center gap-2 min-w-0">
            <Sparkles className="w-5 h-5 shrink-0" />
            <span className="text-sm sm:text-base font-bold text-[var(--bright)] truncate">因果リンク週次差分 (A ➔ B)</span>
          </div>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold shrink-0">v3</span>
          <span className="text-xs text-[var(--muted)] hidden lg:inline">
            LLMによる方向性のある因果関係抽出・毎週の新規エッジ追跡
          </span>
        </div>
        <div
          onClick={onClose}
          className="px-2 py-1 text-[var(--muted)] hover:text-[var(--red)] cursor-pointer text-xl font-bold transition-colors select-none shrink-0"
          title="閉じる"
        >
          ✕
        </div>
      </div>

      {/* Action bar (横スクロール可) */}
      <div
        className="px-3 sm:px-6 py-2 bg-[var(--surface)] border-b border-[var(--border)] shrink-0 flex flex-nowrap items-center gap-2 overflow-x-auto"
        style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-x" } as React.CSSProperties}
      >
        <button
          onClick={handleRunAiExtraction}
          disabled={isExtracting}
          className="shrink-0 whitespace-nowrap px-3.5 py-2 bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 text-white font-semibold text-xs rounded-md transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isExtracting ? "animate-spin" : ""}`} />
          {isExtracting ? "AI抽出中..." : "✨ AI因果抽出"}
        </button>
        <button
          onClick={handleQuickPromptOut}
          className="shrink-0 whitespace-nowrap px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs rounded-md transition-colors flex items-center gap-1.5 cursor-pointer"
          title="外部AIに渡すプロンプトを作ってコピー"
        >
          <Copy className="w-3.5 h-3.5" /> プロンプト出力
        </button>
        <button
          onClick={handleQuickInput}
          className="shrink-0 whitespace-nowrap px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs rounded-md transition-colors flex items-center gap-1.5 cursor-pointer"
          title="外部AIの結果を貼り付けて取り込む"
        >
          <ClipboardPaste className="w-3.5 h-3.5" /> 結果を入力
        </button>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="shrink-0 whitespace-nowrap px-3 py-2 bg-[#238636] hover:bg-[#2ea043] text-white font-semibold text-xs rounded-md transition-colors flex items-center gap-1 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" /> 手動追加
        </button>
        {hasSample && (
          <button
            onClick={handleRemoveSamplesConfirm}
            className="shrink-0 whitespace-nowrap px-3 py-2 bg-red-950/50 hover:bg-red-900/60 text-red-300 font-semibold text-xs rounded-md border border-red-500/40 transition-colors flex items-center gap-1 cursor-pointer"
            title="初期表示のサンプルデータを削除"
          >
            <Trash2 className="w-3.5 h-3.5" /> サンプル削除
          </button>
        )}
        <button
          onClick={handleDownloadMarkdown}
          className="shrink-0 whitespace-nowrap px-3 py-2 bg-[#21262d] hover:bg-[#30363d] text-[var(--bright)] font-semibold text-xs rounded-md border border-[var(--border2)] transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 text-blue-400" /> レポート(.md)
        </button>
      </div>

      {/* Status banner */}
      {extractStatus && (
        <div className="px-3 sm:px-6 py-2 bg-blue-950/40 border-b border-blue-500/30 text-blue-300 text-xs flex items-start justify-between gap-3 shrink-0">
          <span className="min-w-0 break-words">{extractStatus}</span>
          <button onClick={() => setExtractStatus("")} className="text-blue-400 hover:text-white shrink-0 px-1">✕</button>
        </div>
      )}

      {/* Tabs (横スクロール可) + Search */}
      <div className="px-3 sm:px-6 py-3 bg-[#161b22] border-b border-[var(--border)] shrink-0 space-y-2">
        <div
          className="flex flex-nowrap items-center gap-2 overflow-x-auto"
          style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-x" } as React.CSSProperties}
        >
          {([
            ["new-only", "✨ 新着エッジ", "bg-emerald-500/20 text-emerald-300 border border-emerald-500/50"],
            ["all-weeks", `📅 週次推移一覧 (${links.length})`, "bg-[#388bfd33] text-[#58a6ff] border border-[#388bfd55]"],
            ["external", "🔌 外部AI連携", "bg-amber-500/20 text-amber-300 border border-amber-500/50"],
            ["lag", "📈 ラグ相関", "bg-purple-500/20 text-purple-300 border border-purple-500/50"],
            ["report", "📄 レポートプレビュー", "bg-[#388bfd33] text-[#58a6ff] border border-[#388bfd55]"]
          ] as const).map(([key, label, activeCls]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`shrink-0 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === key ? activeCls : "bg-[#21262d] text-[var(--subtle)] hover:bg-[#30363d]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className={`relative ${activeTab === "new-only" || activeTab === "all-weeks" ? "" : "hidden"}`}>
          <Search className="w-3.5 h-3.5 text-[var(--muted)] absolute left-2.5 top-2.5" />
          <input
            type="text"
            placeholder="因果リンクを検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-[#0d1117] border border-[var(--border2)] rounded-md pl-8 pr-3 py-1.5 text-xs text-[var(--bright)] placeholder-[var(--muted)] focus:outline-none focus:border-blue-500 w-full"
          />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-6">

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

        {/* Tab 5: Lag correlation */}
        {activeTab === "lag" && <CausalLagPanel links={links} notes={notes} />}

        {/* Tab 4: External AI */}
        {activeTab === "external" && (
          <div className="space-y-6 max-w-4xl mx-auto">

            {/* Step 1 */}
            <div ref={step1Ref} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-[var(--border)] pb-3">
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold text-[10px]">STEP 1</span>
                <h3 className="text-sm font-bold text-[var(--bright)]">外部AI向けプロンプトを作る</h3>
              </div>

              <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-[var(--border2)]">
                <span className="text-xs font-semibold text-[var(--bright)]">📁 フォルダ基準:</span>
                <button
                  type="button"
                  onClick={() => { setFolderColumnSource("D"); setSelectedFolder("all"); try { localStorage.setItem("cn_folder_column_source", "D"); } catch {} }}
                  className={`px-2.5 py-1 rounded text-xs font-bold transition-colors cursor-pointer ${folderColumnSource === "D" ? "bg-blue-600 text-white" : "bg-[#161b22] text-[var(--muted)] border border-[var(--border2)]"}`}
                >
                  D列（カテゴリ・タグ）
                </button>
                <button
                  type="button"
                  onClick={() => { setFolderColumnSource("N"); setSelectedFolder("all"); try { localStorage.setItem("cn_folder_column_source", "N"); } catch {} }}
                  className={`px-2.5 py-1 rounded text-xs font-bold transition-colors cursor-pointer ${folderColumnSource === "N" ? "bg-blue-600 text-white" : "bg-[#161b22] text-[var(--muted)] border border-[var(--border2)]"}`}
                >
                  N列（14列目）
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <label className="space-y-1">
                  <span className="block font-semibold text-[var(--bright)]">フォルダ選択 ({folderColumnSource === "N" ? "N列基準" : "D列基準"})</span>
                  <select
                    value={selectedFolder}
                    onChange={e => setSelectedFolder(e.target.value)}
                    className="w-full bg-[#161b22] border border-[var(--border2)] rounded px-2 py-1.5 text-[var(--bright)]"
                  >
                    <option value="all">すべて（全フォルダ）</option>
                    {availableFolders.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="block font-semibold text-[var(--bright)]">対象ノート数（新しい順）</span>
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={promptCount}
                    onChange={e => {
                      const v = parseInt(e.target.value, 10);
                      setPromptCount(isNaN(v) ? 1 : Math.max(1, Math.min(500, v)));
                    }}
                    className="w-full bg-[#161b22] border border-[var(--border2)] rounded px-2 py-1.5 text-[var(--bright)]"
                  />
                </label>
                <label className="space-y-1">
                  <span className="block font-semibold text-[var(--bright)]">1件あたり本文の最大文字数</span>
                  <select
                    value={promptMaxChars}
                    onChange={e => setPromptMaxChars(Number(e.target.value))}
                    className="w-full bg-[#161b22] border border-[var(--border2)] rounded px-2 py-1.5 text-[var(--bright)]"
                  >
                    {[300, 500, 800, 1200, 2000].map(n => <option key={n} value={n}>{n}字</option>)}
                  </select>
                </label>
                <label className="flex items-end gap-2 pb-1.5 cursor-pointer">
                  <input type="checkbox" checked={includeTerms} onChange={e => setIncludeTerms(e.target.checked)} />
                  <span className="text-[var(--bright)] font-semibold">既存用語を渡して表記を統一</span>
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--muted)]">
                <span>対象 {selectedNotes.length} 件</span>
                <span>・</span>
                <span>{externalPrompt.length.toLocaleString()} 文字</span>
                {externalPrompt.length > 30000 && (
                  <span className="text-amber-400 font-bold">長すぎる場合は件数か文字数を減らしてください</span>
                )}
                {selectedNotes.length === 0 && <span className="text-red-400 font-bold">本文のあるノートがありません</span>}
              </div>

              <textarea
                readOnly
                value={externalPrompt}
                onFocus={e => e.currentTarget.select()}
                className="w-full h-48 bg-[#0d1117] border border-[var(--border2)] rounded-lg p-3 text-[11px] font-mono text-[var(--bright)] leading-relaxed resize-y"
              />

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleCopyPrompt}
                  disabled={selectedNotes.length === 0}
                  className="px-3.5 py-1.5 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 text-white font-bold text-xs rounded-md transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" /> プロンプトをコピー
                </button>
                <button
                  onClick={handleDownloadPrompt}
                  disabled={selectedNotes.length === 0}
                  className="px-3 py-1.5 bg-[#21262d] hover:bg-[#30363d] disabled:opacity-50 text-[var(--bright)] font-semibold text-xs rounded-md border border-[var(--border2)] transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-blue-400" /> .txt で保存
                </button>
                {copyMsg && <span className="text-xs text-emerald-400 font-bold flex items-center gap-1"><Check className="w-3.5 h-3.5" />{copyMsg}</span>}
              </div>
              <p className="text-[11px] text-[var(--muted)]">
                コピーしたら ChatGPT / Gemini / Claude など外部AIに貼り付けて実行し、返ってきたJSONをSTEP 2に貼り付けてください。
              </p>
            </div>

            {/* Step 2 */}
            <div ref={step2Ref} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-[var(--border)] pb-3">
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold text-[10px]">STEP 2</span>
                <h3 className="text-sm font-bold text-[var(--bright)]">外部AIの結果を貼り付けて取り込む</h3>
              </div>

              <textarea
                ref={pasteRef}
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                placeholder={'外部AIの出力をそのまま貼り付け（```json で囲まれていても、前後に説明文があっても可）\n[ { "source": "...", "target": "...", "reason": "...", "noteId": "..." } ]'}
                className="w-full h-40 bg-[#0d1117] border border-[var(--border2)] rounded-lg p-3 text-[11px] font-mono text-[var(--bright)] leading-relaxed resize-y placeholder-[var(--muted)]"
              />

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handlePasteFromClipboard}
                  className="px-3 py-1.5 bg-[#21262d] hover:bg-[#30363d] text-[var(--bright)] font-semibold text-xs rounded-md border border-[var(--border2)] transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <ClipboardPaste className="w-3.5 h-3.5 text-blue-400" /> クリップボードから貼り付け
                </button>
                <button
                  onClick={() => handleParsePaste()}
                  disabled={!pasteText.trim()}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs rounded-md transition-colors cursor-pointer"
                >
                  解析してプレビュー
                </button>
                {(pasteText || parsed) && (
                  <button
                    onClick={() => { setPasteText(""); setParsed(null); setExcluded(new Set()); }}
                    className="px-3 py-1.5 text-[var(--muted)] hover:text-white text-xs cursor-pointer"
                  >
                    クリア
                  </button>
                )}
              </div>

              {parsed?.fatal && (
                <div className="p-3 rounded-lg bg-red-950/40 border border-red-500/40 text-red-300 text-xs">{parsed.fatal}</div>
              )}

              {parsed && !parsed.fatal && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                    <span className="text-[var(--bright)] font-bold">
                      有効 {parsed.edges.length}件
                      {parsed.issues.length > 0 && <span className="text-amber-400"> / 不正 {parsed.issues.length}件</span>}
                      {parsed.duplicatesInPaste > 0 && <span className="text-[var(--muted)]"> / 貼付内重複 {parsed.duplicatesInPaste}件</span>}
                    </span>
                    <label className="flex items-center gap-2 text-[var(--bright)]">
                      <span className="font-semibold">取り込む週:</span>
                      <select
                        value={weekMode}
                        onChange={e => setWeekMode(e.target.value as WeekMode)}
                        className="bg-[#161b22] border border-[var(--border2)] rounded px-2 py-1 text-[var(--bright)]"
                      >
                        <option value="article">記事の日付の週</option>
                        <option value="now">今週</option>
                      </select>
                    </label>
                  </div>

                  {parsed.issues.length > 0 && (
                    <ul className="p-3 rounded-lg bg-amber-950/30 border border-amber-500/30 text-[11px] text-amber-300 space-y-0.5">
                      {parsed.issues.slice(0, 8).map((iss, k) => (
                        <li key={k}>#{iss.index + 1}: {iss.message}（スキップ）</li>
                      ))}
                      {parsed.issues.length > 8 && <li>…ほか {parsed.issues.length - 8}件</li>}
                    </ul>
                  )}

                  <div className="space-y-2">
                    {previewRows.map(row => {
                      const off = excluded.has(row.i) || row.status === "dup";
                      return (
                        <div
                          key={row.i}
                          className={`p-3 bg-[#161b22] rounded-lg border border-[var(--border2)] space-y-1.5 ${off ? "opacity-40" : ""}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                              {row.status === "new" && <span className="px-1.5 py-0.5 rounded bg-emerald-500/25 text-emerald-300 font-bold text-[9px]">新規エッジ</span>}
                              {row.status === "known" && <span className="px-1.5 py-0.5 rounded bg-blue-500/25 text-blue-300 font-bold text-[9px]">既存エッジ</span>}
                              {row.status === "dup" && <span className="px-1.5 py-0.5 rounded bg-[#30363d] text-[var(--muted)] font-bold text-[9px]">取込済み</span>}
                              <span className="font-bold text-xs text-[var(--bright)]">{row.edge.source}</span>
                              <ArrowRight className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              <span className="font-bold text-xs text-[var(--bright)]">{row.edge.target}</span>
                            </div>
                            {row.status !== "dup" && (
                              <label className="flex items-center gap-1 text-[10px] text-[var(--muted)] shrink-0 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={!excluded.has(row.i)}
                                  onChange={() =>
                                    setExcluded(prev => {
                                      const next = new Set(prev);
                                      if (next.has(row.i)) next.delete(row.i);
                                      else next.add(row.i);
                                      return next;
                                    })
                                  }
                                />
                                取込
                              </label>
                            )}
                          </div>
                          {row.edge.reason && <p className="text-[11px] text-[var(--text)] leading-relaxed">{row.edge.reason}</p>}
                          <div className="text-[10px] text-[var(--muted)] flex flex-wrap gap-x-3">
                            <span>週: {row.p.weekLabel} ({row.p.periodKey})</span>
                            <span className={row.p.note ? "" : "text-amber-400"}>
                              参照: {row.p.note ? String((row.p.note as any).title || row.p.note.id) : `ノート未特定${row.edge.articleTitle ? `（${row.edge.articleTitle}）` : ""}`}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <button
                    onClick={handleImportParsed}
                    disabled={previewRows.every(r => excluded.has(r.i) || r.status === "dup")}
                    className="w-full sm:w-auto px-5 py-2 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 text-white font-bold text-xs rounded-md transition-colors cursor-pointer"
                  >
                    チェックした {previewRows.filter(r => !excluded.has(r.i) && r.status !== "dup").length} 件を取り込む
                  </button>
                </div>
              )}
            </div>
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
