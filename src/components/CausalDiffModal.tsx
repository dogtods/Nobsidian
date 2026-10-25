/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
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
  selectRecentNotes,
  buildCausalInferencePrompt
} from "../utils/causalDiffUtils";
import CausalLagPanel from "./CausalLagPanel";
import { getFolderFromKeywords, getFolderFromColumnN } from "../utils/graphDataParser";
import {
  ArrowRight,
  Sparkles,
  Download,
  Search,
  Plus,
  Trash2,
  Calendar,
  RefreshCw,
  Copy,
  ClipboardPaste,
  Check,
  Folder,
  FolderTree,
  ChevronDown,
  ChevronRight,
  Layers,
  Filter
} from "lucide-react";

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
  apiPost?: (body: any) => Promise<any>;
  onToast?: (msg: string) => void;
}

export default function CausalDiffModal({ isOpen, onClose, notes, apiPost, onToast }: CausalDiffModalProps) {
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

  const [activeTab, setActiveTab] = useState<"all-weeks" | "external" | "lag">("all-weeks");
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
  // 📁 フォルダ基準 (2パターン: D列カテゴリ基準 vs N列14列目基準)
  const [folderColumnSource, setFolderColumnSource] = useState<"D" | "N">(() => {
    try {
      return localStorage.getItem("cn_folder_column_source") === "N" ? "N" : "D";
    } catch {
      return "D";
    }
  });

  const handleFolderColumnChange = (col: "D" | "N") => {
    setFolderColumnSource(col);
    try {
      localStorage.setItem("cn_folder_column_source", col);
    } catch {}
  };

  // 📅 週次推移一覧（フォルダ別、デフォルトで畳み込み）
  const [collapsedFolderMap, setCollapsedFolderMap] = useState<Record<string, boolean>>({});

  const toggleFolderCollapse = (key: string) => {
    setCollapsedFolderMap(prev => {
      const cur = prev[key] ?? true;
      return { ...prev, [key]: !cur };
    });
  };

  const handleCollapseAllFolders = () => {
    const map: Record<string, boolean> = {};
    folderTimelineGroups.forEach(fg => {
      map[`folder-${fg.folder}`] = true;
    });
    setCollapsedFolderMap(map);
  };

  const handleExpandAllFolders = () => {
    const map: Record<string, boolean> = {};
    folderTimelineGroups.forEach(fg => {
      map[`folder-${fg.folder}`] = false;
    });
    setCollapsedFolderMap(map);
  };

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

  // 因果推論（論理解明・図解プロンプト・回答取り込み・スプレッドシート保管）用 State
  const [activeInferenceLinkId, setActiveInferenceLinkId] = useState<string | null>(null);
  const [pastedInferenceMap, setPastedInferenceMap] = useState<Record<string, string>>({});
  const [isSavingInferenceMap, setIsSavingInferenceMap] = useState<Record<string, boolean>>({});
  const [copiedPromptLinkId, setCopiedPromptLinkId] = useState<string | null>(null);
  const [isSyncingWithSs, setIsSyncingWithSs] = useState(false);

  // Google Apps Script (CausalLinks シート) から既存の因果リンク・推論解説を同期
  useEffect(() => {
    let isMounted = true;
    const fetchCausalFromSs = async () => {
      if (!apiPost) return;
      try {
        setIsSyncingWithSs(true);
        const res = await apiPost({ action: "getCausalLinks" });
        if (isMounted && res && res.success && Array.isArray(res.links) && res.links.length > 0) {
          setLinks(prev => {
            const map = new Map<string, CausalLink>();
            prev.forEach(l => map.set(l.id || `${l.source}__${l.target}__${l.periodKey}`, l));
            res.links.forEach((remoteLink: CausalLink) => {
              const key = remoteLink.id || `${remoteLink.source}__${remoteLink.target}__${remoteLink.periodKey}`;
              const existing = map.get(key);
              if (existing) {
                map.set(key, {
                  ...existing,
                  ...remoteLink,
                  detailedInference: remoteLink.detailedInference || existing.detailedInference,
                  reason: remoteLink.reason || existing.reason
                });
              } else {
                map.set(key, remoteLink);
              }
            });
            return Array.from(map.values());
          });
        }
      } catch (err) {
        console.warn("Failed to fetch causal links from spreadsheet:", err);
      } finally {
        if (isMounted) setIsSyncingWithSs(false);
      }
    };

    fetchCausalFromSs();
    return () => { isMounted = false; };
  }, [apiPost]);

  const handleCopyInferencePrompt = async (link: CausalLink) => {
    const relatedNote = link.articleId
      ? notes.find(n => String(n.id) === String(link.articleId))
      : notes.find(n => link.articleTitle && n.title && n.title.includes(link.articleTitle));
    const prompt = buildCausalInferencePrompt(link, relatedNote);
    const ok = await copyText(prompt);
    if (ok) {
      setCopiedPromptLinkId(link.id);
      setTimeout(() => setCopiedPromptLinkId(null), 3000);
      onToast?.("因果推論プロンプトをコピーしました！外部AIに貼り付けてください。");
    } else {
      onToast?.("クリップボードへのコピーに失敗しました。");
    }
  };

  const handleSaveInferenceToSpreadsheet = async (link: CausalLink) => {
    const textToSave = (
      pastedInferenceMap[link.id] !== undefined
        ? pastedInferenceMap[link.id]
        : link.detailedInference || ""
    ).trim();

    if (!textToSave) {
      onToast?.("保存する因果推論の解説テキストを入力または貼り付けてください。");
      return;
    }

    const updatedLink: CausalLink = {
      ...link,
      detailedInference: textToSave,
      updatedAt: Date.now()
    };

    // 1. ローカルState即時更新
    setLinks(prev => prev.map(l => l.id === link.id ? updatedLink : l));

    // 2. スプレッドシートへ送信
    setIsSavingInferenceMap(prev => ({ ...prev, [link.id]: true }));
    try {
      if (apiPost) {
        const res = await apiPost({
          action: "saveCausalLinks",
          links: [updatedLink]
        });
        if (res && res.success) {
          onToast?.("因果推論の論理ステップ・図解をスプレッドシート（CausalLinksシート）に保存しました！");
        } else {
          onToast?.("スプレッドシートへの保存に失敗しましたが、ローカルには保存されました。");
        }
      } else {
        onToast?.("ローカルに因果推論の論理ステップを保存しました（スプレッドシート未接続）。");
      }
    } catch (e: any) {
      console.error("Save causal inference error:", e);
      onToast?.("スプレッドシート保存中にエラーが発生しました（ローカルには保持されています）");
    } finally {
      setIsSavingInferenceMap(prev => ({ ...prev, [link.id]: false }));
    }
  };

  // 各因果リンクの所属フォルダを判定（D列基準 or N列基準）
  const getLinkFolder = useCallback((link: CausalLink): string => {
    // 1. articleId によるノート特定
    let note: Note | undefined;
    if (link.articleId) {
      note = notes.find(n => String(n.id) === String(link.articleId));
    }
    // 2. articleTitle によるノート特定
    if (!note && link.articleTitle) {
      const normTitle = link.articleTitle.trim().toLowerCase();
      note = notes.find(n => n.title && n.title.trim().toLowerCase() === normTitle);
      if (!note) {
        note = notes.find(n => n.title && (n.title.toLowerCase().includes(normTitle) || normTitle.includes(n.title.toLowerCase())));
      }
    }

    if (note) {
      const f = folderColumnSource === "N" ? getFolderFromColumnN(note) : getFolderFromKeywords(note.keywords);
      return f || "未分類";
    }

    // 3. サンプル初期データ等のフォールバック
    if (link.origin === "sample") {
      if (link.source.includes("半導体") || link.target.includes("半導体") || link.source.includes("AI") || link.target.includes("AI") || link.articleTitle.includes("半導体")) {
        return "AI・半導体";
      }
      if (link.source.includes("電力") || link.target.includes("電力") || link.source.includes("地熱") || link.source.includes("炭素") || link.target.includes("蓄電池")) {
        return "エネルギー・電力";
      }
      if (link.source.includes("EV") || link.target.includes("充電")) {
        return "モビリティ・EV";
      }
      return "サンプル";
    }

    return "未分類";
  }, [notes, folderColumnSource]);

  const availableFolders = useMemo(() => {
    const set = new Set<string>();
    notes.forEach(n => {
      const f = folderColumnSource === "N" ? getFolderFromColumnN(n) : getFolderFromKeywords(n.keywords);
      if (f) set.add(f);
    });
    return Array.from(set).sort();
  }, [notes, folderColumnSource]);

  // 存在するフォルダと件数の集計（週次推移タブのフィルターピル用）
  const activeFoldersWithCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    links.forEach(l => {
      const f = getLinkFolder(l);
      counts[f] = (counts[f] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([folder, count]) => ({ folder, count }))
      .sort((a, b) => b.count - a.count || a.folder.localeCompare(b.folder));
  }, [links, getLinkFolder]);

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


  // フォルダ ➔ 週次推移データ（フォルダ別、週次推移を一覧）
  const folderTimelineGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filteredLinks = links.filter(l => {
      const folder = getLinkFolder(l);
      if (!q) return true;
      return (
        l.source.toLowerCase().includes(q) ||
        l.target.toLowerCase().includes(q) ||
        l.reason.toLowerCase().includes(q) ||
        l.articleTitle.toLowerCase().includes(q) ||
        folder.toLowerCase().includes(q)
      );
    });

    const folderMap: Record<string, CausalLink[]> = {};
    filteredLinks.forEach(l => {
      const folder = getLinkFolder(l);
      if (!folderMap[folder]) folderMap[folder] = [];
      folderMap[folder].push(l);
    });

    return Object.entries(folderMap).map(([folder, fLinks]) => {
      const wGroups = computeWeeklyCausalDiffs(fLinks);
      const totalNew = fLinks.filter(l => l.isNew).length;
      return {
        folder,
        totalLinks: fLinks.length,
        totalNew,
        weeks: wGroups.filter(w => w.links.length > 0)
      };
    }).sort((a, b) => b.totalLinks - a.totalLinks || a.folder.localeCompare(b.folder));
  }, [links, searchQuery, getLinkFolder]);

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
    setActiveTab("all-weeks");
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

    const sig = edgeSignature(item.source, item.target);
    const exists = links.some(l => l.periodKey === periodKey && edgeSignature(l.source, l.target) === sig);
    if (exists) {
      alert("すでに今週に同じ原因➔結果の因果リンクが存在します。");
      return;
    }

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
          md += `- **${l.source}** ➔ **${l.target}** [📁 ${getLinkFolder(l)}]\n  - 理由: ${l.reason}\n  - 参照記事: *${l.articleTitle}*\n\n`;
        });
      }

      if (g.continuingLinks.length > 0) {
        md += `### 🔄 継続・既存エッジ (${g.continuingLinks.length}件)\n`;
        g.continuingLinks.forEach(l => {
          md += `- ${l.source} ➔ ${l.target} [📁 ${getLinkFolder(l)}] (${l.reason.substring(0, 40)}...)\n`;
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
            ["all-weeks", `📅 週次推移一覧 (${links.length})`, "bg-[#388bfd33] text-[#58a6ff] border border-[#388bfd55]"],
            ["external", "🔌 外部AI連携", "bg-amber-500/20 text-amber-300 border border-amber-500/50"],
            ["lag", "📈 ラグ相関", "bg-purple-500/20 text-purple-300 border border-purple-500/50"]
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
        <div className={`relative ${activeTab === "all-weeks" ? "" : "hidden"}`}>
          <Search className="w-3.5 h-3.5 text-[var(--muted)] absolute left-2.5 top-2.5" />
          <input
            type="text"
            placeholder="因果リンク（原因・結果・理由・フォルダ・記事）を検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-[#0d1117] border border-[var(--border2)] rounded-md pl-8 pr-3 py-1.5 text-xs text-[var(--bright)] placeholder-[var(--muted)] focus:outline-none focus:border-blue-500 w-full"
          />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-6">



        {/* Tab 2: All Weeks Timeline (週次推移一覧 - フォルダ別、デフォルトで畳み込み) */}
        {activeTab === "all-weeks" && (
          <div className="space-y-4">
            {/* フォルダ基準切り替え & 一括展開/畳み込みバー */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3.5 sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* 2パターンのフォルダ基準切り替え */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-[var(--bright)] flex items-center gap-1.5">
                    <Folder className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>📁 フォルダ基準 (2パターン):</span>
                  </span>
                  <div className="flex bg-[#0d1117] p-0.5 rounded-lg border border-[var(--border2)] text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => handleFolderColumnChange("D")}
                      className={`px-3 py-1 rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                        folderColumnSource === "D"
                          ? "bg-blue-600 text-white shadow-sm font-bold"
                          : "text-gray-400 hover:text-gray-200 hover:bg-[#161b22]"
                      }`}
                      title="スプレッドシートのD列（カテゴリ・タグ）を元にフォルダ分類します"
                    >
                      {folderColumnSource === "D" && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>}
                      <span>D列 (カテゴリ・タグ)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleFolderColumnChange("N")}
                      className={`px-3 py-1 rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                        folderColumnSource === "N"
                          ? "bg-blue-600 text-white shadow-sm font-bold"
                          : "text-gray-400 hover:text-gray-200 hover:bg-[#161b22]"
                      }`}
                      title="スプレッドシートのN列（14列目: 更新日・ロット・情報）を元にフォルダ分類します"
                    >
                      {folderColumnSource === "N" && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>}
                      <span>N列 (14列目)</span>
                    </button>
                  </div>
                </div>

                {/* 一括折りたたみ / 展開 ボタン */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[var(--muted)]">
                    {folderTimelineGroups.length} フォルダ / {links.length} 件
                  </span>
                  <button
                    type="button"
                    onClick={handleCollapseAllFolders}
                    className="px-2.5 py-1 bg-[#21262d] hover:bg-[#30363d] text-[var(--muted)] hover:text-white rounded text-xs transition cursor-pointer"
                  >
                    すべて畳む
                  </button>
                  <button
                    type="button"
                    onClick={handleExpandAllFolders}
                    className="px-2.5 py-1 bg-[#21262d] hover:bg-[#30363d] text-[var(--muted)] hover:text-white rounded text-xs transition cursor-pointer"
                  >
                    すべて展開
                  </button>
                </div>
              </div>
            </div>

            {/* Empty state */}
            {folderTimelineGroups.length === 0 && (
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-8 text-center space-y-3">
                <p className="text-gray-400 text-xs">
                  {searchQuery
                    ? `検索ワード「${searchQuery}」に一致する因果リンクがありません。`
                    : "表示できる因果リンクがありません。"}
                </p>
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold cursor-pointer transition"
                  >
                    検索をリセット
                  </button>
                )}
              </div>
            )}

            {/* フォルダ別リスト（フォルダは畳み込みがデフォルト） */}
            {folderTimelineGroups.length > 0 && (
              <div className="space-y-4">
                {folderTimelineGroups.map(fg => {
                  const isCollapsed = collapsedFolderMap[`folder-${fg.folder}`] ?? true;

                  return (
                    <div
                      key={fg.folder}
                      className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 sm:p-5 space-y-3 transition-colors"
                    >
                      {/* フォルダヘッダー（クリックで畳み込み/展開） */}
                      <div
                        onClick={() => toggleFolderCollapse(`folder-${fg.folder}`)}
                        className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3 cursor-pointer select-none group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {isCollapsed ? (
                            <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-amber-400 transition-colors shrink-0" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-amber-400 shrink-0" />
                          )}
                          <span className="font-bold text-sm text-amber-300 flex items-center gap-2 truncate">
                            <Folder className="w-4 h-4 text-amber-400 shrink-0" />
                            <span>{fg.folder}</span>
                          </span>
                          <span className="text-[10px] text-gray-500 font-mono shrink-0">
                            ({folderColumnSource === "N" ? "N列基準" : "D列基準"})
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {fg.totalNew > 0 && (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold text-[10px]">
                              新規 {fg.totalNew}件
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded bg-[#30363d] text-gray-200 font-bold text-[10px]">
                            全 {fg.totalLinks}件
                          </span>
                          <span className="text-[11px] text-[var(--muted)] group-hover:text-white transition-colors">
                            {isCollapsed ? "開く ▼" : "畳む ▲"}
                          </span>
                        </div>
                      </div>

                      {/* 週ごとの推移 (展開時のみ表示) */}
                      {!isCollapsed && (
                        <div className="space-y-3 pt-1">
                          {fg.weeks.map(w => (
                            <div
                              key={w.periodKey}
                              className="bg-[#12161c] border border-[var(--border2)] rounded-lg p-3 sm:p-3.5 space-y-2.5"
                            >
                              <div className="flex items-center justify-between gap-2 border-b border-[var(--border2)]/60 pb-2">
                                <div className="flex items-center gap-2">
                                  <Calendar className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                  <span className="font-bold text-xs text-white">{w.weekLabel}</span>
                                  <span className="text-[11px] text-gray-400 font-mono">({w.periodKey})</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  {w.newLinks.length > 0 && (
                                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-500/30 font-semibold">
                                      新規 {w.newLinks.length}件
                                    </span>
                                  )}
                                  <span className="text-[10px] text-gray-400">
                                    計 {w.links.length}件
                                  </span>
                                </div>
                              </div>

                              <div className="space-y-2">
                                {w.links.map(link => {
                                  const isInferenceOpen = activeInferenceLinkId === link.id;
                                  const hasInference = Boolean(link.detailedInference && link.detailedInference.trim());
                                  const isSaving = Boolean(isSavingInferenceMap[link.id]);
                                  const isCopied = copiedPromptLinkId === link.id;

                                  return (
                                    <div
                                      key={link.id}
                                      className="bg-[#0d1117] rounded-lg border border-[var(--border2)] hover:border-gray-600 transition-colors overflow-hidden"
                                    >
                                      {/* リンク基本情報バー */}
                                      <div className="p-2.5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                                          {link.isNew && (
                                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/25 text-emerald-300 font-bold text-[9px] shrink-0">
                                              NEW
                                            </span>
                                          )}
                                          <span className="font-bold text-xs text-blue-300 bg-blue-950/40 px-2 py-0.5 rounded border border-blue-500/30">
                                            {link.source}
                                          </span>
                                          <ArrowRight className="w-3.5 h-3.5 text-[var(--muted)] shrink-0" />
                                          <span className="font-bold text-xs text-emerald-300 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/30">
                                            {link.target}
                                          </span>
                                          <span className="text-xs text-[var(--muted)] truncate max-w-sm">
                                            ({link.reason})
                                          </span>
                                          {hasInference && (
                                            <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold text-[9px] shrink-0 flex items-center gap-1">
                                              <span>💡</span>
                                              <span>推論解説あり</span>
                                            </span>
                                          )}
                                        </div>

                                        <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                                          <span className="text-[10px] text-[var(--subtle)] truncate max-w-[120px]" title={link.articleTitle}>
                                            {link.articleTitle}
                                          </span>

                                          {/* 因果推論の論理解明トグルボタン */}
                                          <button
                                            type="button"
                                            onClick={() => setActiveInferenceLinkId(prev => prev === link.id ? null : link.id)}
                                            className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors ${
                                              isInferenceOpen
                                                ? "bg-purple-600 text-white shadow-sm"
                                                : hasInference
                                                ? "bg-purple-950/40 text-purple-300 border border-purple-500/40 hover:bg-purple-900/50"
                                                : "bg-[#21262d] text-gray-300 hover:text-white border border-[var(--border2)]"
                                            }`}
                                            title="なぜこの因果リンクに至るのか、推論の論理ステップ・図解プロンプトを出力し、回答をスプレッドシートに保存します"
                                          >
                                            <Sparkles className="w-3 h-3 text-purple-400" />
                                            <span>{isInferenceOpen ? "閉じる" : hasInference ? "💡 推論を確認・更新" : "💡 推論を解明"}</span>
                                          </button>

                                          <button
                                            type="button"
                                            onClick={() => handleDeleteLink(link.id)}
                                            className="text-[var(--muted)] hover:text-red-400 p-1 cursor-pointer transition-colors"
                                            title="削除"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      </div>

                                      {/* 因果推論ドロワー（プロンプト出力・回答取り込み・スプレッドシート保管） */}
                                      {isInferenceOpen && (
                                        <div className="p-3.5 bg-[#12161f] border-t border-purple-500/30 space-y-3">
                                          <div className="flex items-center justify-between border-b border-[var(--border2)] pb-2">
                                            <div className="flex items-center gap-2">
                                              <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 text-[10px] font-bold rounded border border-purple-500/30">
                                                💡 なぜこの因果関係が想定されるのか？
                                              </span>
                                              <span className="text-xs font-bold text-[var(--bright)]">
                                                {link.source} ➔ {link.target} の推論プロセスの解明
                                              </span>
                                            </div>
                                            {link.updatedAt && (
                                              <span className="text-[10px] text-[var(--muted)]">
                                                更新: {new Date(link.updatedAt).toLocaleDateString()}
                                              </span>
                                            )}
                                          </div>

                                          {/* 保存済みの因果推論・図解解説がある場合 */}
                                          {hasInference && (
                                            <div className="space-y-1.5">
                                              <div className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                                                <Check className="w-3.5 h-3.5" />
                                                <span>保存済みの因果推論解説・図解:</span>
                                              </div>
                                              <div className="p-3 bg-[#0d1117] border border-[var(--border2)] rounded text-xs text-[var(--text)] whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto font-sans">
                                                {link.detailedInference}
                                              </div>
                                            </div>
                                          )}

                                          {/* 3ステップ解明フロー */}
                                          <div className="space-y-3 pt-1">
                                            {/* STEP 1: プロンプト出力 */}
                                            <div className="p-2.5 bg-[#161b22] border border-[var(--border2)] rounded-lg space-y-1.5">
                                              <div className="flex flex-wrap items-center justify-between gap-2">
                                                <div className="text-xs text-[var(--bright)] font-semibold flex items-center gap-1.5">
                                                  <span className="w-4 h-4 rounded-full bg-purple-600 text-white text-[10px] flex items-center justify-center font-bold">1</span>
                                                  <span>外部AI向け推論解説プロンプトを出力</span>
                                                </div>
                                                <button
                                                  type="button"
                                                  onClick={() => handleCopyInferencePrompt(link)}
                                                  className="px-3 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs rounded-md shadow flex items-center gap-1.5 cursor-pointer transition-all"
                                                >
                                                  {isCopied ? (
                                                    <>
                                                      <Check className="w-3.5 h-3.5 text-emerald-300" />
                                                      <span>コピー完了！</span>
                                                    </>
                                                  ) : (
                                                    <>
                                                      <Copy className="w-3.5 h-3.5" />
                                                      <span>📋 プロンプトをコピー</span>
                                                    </>
                                                  )}
                                                </button>
                                              </div>
                                              <p className="text-[11px] text-[var(--muted)] leading-relaxed">
                                                外部AI（Gemini/ChatGPT/Claude等）に「1. 核心ロジック」「2. ステップ別因果チェーン図解」「3. 前提条件・媒介変数」を視覚的に分かりやすく出力させるプロンプトです。長文にならず直感的に理解できる形式を指定しています。
                                              </p>
                                            </div>

                                            {/* STEP 2: 回答取り込みフィールド */}
                                            <div className="p-2.5 bg-[#161b22] border border-[var(--border2)] rounded-lg space-y-1.5">
                                              <div className="text-xs text-[var(--bright)] font-semibold flex items-center gap-1.5">
                                                <span className="w-4 h-4 rounded-full bg-blue-600 text-white text-[10px] flex items-center justify-center font-bold">2</span>
                                                <span>AIの回答を取り込む</span>
                                              </div>
                                              <textarea
                                                rows={5}
                                                value={pastedInferenceMap[link.id] !== undefined ? pastedInferenceMap[link.id] : (link.detailedInference || "")}
                                                onChange={e => setPastedInferenceMap(prev => ({ ...prev, [link.id]: e.target.value }))}
                                                placeholder="外部AIが生成した因果推論の論理ステップ・図解（テキスト）をここに貼り付けてください..."
                                                className="w-full bg-[#0d1117] border border-[var(--border2)] rounded-lg p-2.5 text-xs text-[var(--bright)] placeholder:text-gray-500 focus:outline-none focus:border-purple-500 leading-relaxed font-sans"
                                              />
                                            </div>

                                            {/* STEP 3: スプレッドシートへ保管 */}
                                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[var(--border2)]">
                                              <span className="text-[11px] text-[var(--muted)] flex items-center gap-1">
                                                <span>📊</span>
                                                <span>Googleスプレッドシートの <b>CausalLinks</b> シートに保管されます</span>
                                              </span>
                                              <button
                                                type="button"
                                                onClick={() => handleSaveInferenceToSpreadsheet(link)}
                                                disabled={isSaving}
                                                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-md shadow flex items-center gap-1.5 cursor-pointer transition-all"
                                              >
                                                {isSaving ? (
                                                  <>
                                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                                    <span>スプレッドシートに保存中...</span>
                                                  </>
                                                ) : (
                                                  <>
                                                    <Download className="w-3.5 h-3.5" />
                                                    <span>💾 スプレッドシートに保存・更新</span>
                                                  </>
                                                )}
                                              </button>
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 5: Lag correlation */}
        {activeTab === "lag" && (
          <CausalLagPanel
            links={links}
            notes={notes}
            apiPost={apiPost}
            onToast={onToast}
            onUpdateLink={(updatedLink) => {
              setLinks(prev => prev.map(l => l.id === updatedLink.id ? updatedLink : l));
            }}
          />
        )}

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
