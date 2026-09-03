/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import {
  FileText,
  BookOpen,
  Settings,
  Sparkles,
  Menu,
  Download,
  RefreshCw,
  Folder,
  Plus,
  Trash2,
  FolderOpen,
  CloudLightning,
  ChevronDown,
  ArrowRight,
  ExternalLink,
  ChevronRight,
  Globe,
  Waves,
  AreaChart,
  Grid,
  Copy,
  Link2,
  FileJson,
  Maximize2,
  Minimize2,
  X,
  Clipboard,
  Volume2,
  Square
} from "lucide-react";

import { Note, FolderRelation } from "./types";
import { getStoredPrompt, DEFAULT_PROMPTS } from "./components/PromptSettingsModal";
import {
  getFolderFromKeywords,
  formatDateStr,
  extractWikiLinks,
  parseHeatmapData,
  parseCoOccurData,
  parseStreamData,
  parseBubbleData,
  getFilteredNotes
} from "./utils/graphDataParser";
import { fetchGasGet, fetchGasPost, sanitizeGasUrl } from "./utils/gasClient";

// Import charts and config modals
import HeatmapModal from "./components/HeatmapModal";
import CoOccurModal from "./components/CoOccurModal";
import StreamModal from "./components/StreamModal";
import BubbleModal from "./components/BubbleModal";
import KnowledgeGraphModal from "./components/KnowledgeGraphModal";
import SettingsModal from "./components/SettingsModal";
import PromptSettingsModal from "./components/PromptSettingsModal";
import ImportModal from "./components/ImportModal";
import TimelineModal from "./components/TimelineModal";
import ConfirmModal from "./components/ConfirmModal";
import ExternalAiExportModal from "./components/ExternalAiExportModal";
import SyncManagerModal from "./components/SyncManagerModal";
import { MermaidViewer } from "./components/MermaidViewer";

const DEFAULT_API_URL = "";

const compressContent = (content: string, maxLength: number): string => {
  if (!content) return "";
  
  // 1. Strip markdown code blocks (which often consume massive tokens)
  let clean = content.replace(/```[\s\S]*?```/g, "[コードブロック省略/Token Saving]");
  
  // 2. Strip markdown tables (highly verbose)
  clean = clean.split("\n")
    .filter(line => !line.trim().startsWith("|"))
    .join("\n");
  
  // 3. Remove excessive empty lines and spaces
  clean = clean.replace(/\n\s*\n/g, "\n").trim();
  
  // 4. Truncate to maxLength
  if (clean.length > maxLength) {
    clean = clean.substring(0, maxLength) + "\n...[長文のため後半をカット/Token Saving]";
  }
  
  return clean;
};

const parseAIJSON = (rawText: string) => {
  let cleanText = rawText.trim();
  const match = cleanText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (match) {
    cleanText = match[1].trim();
  } else if (cleanText.startsWith("```")) {
    cleanText = cleanText.replace(/^```[a-z]*\n?/, "").replace(/\n?```$/, "").trim();
  }
  
  try {
    return JSON.parse(cleanText);
  } catch (e: any) {
    try {
      const fixedStr = cleanText.replace(/"([^"\\]|\\.)*"/g, (m: string) => {
        return m.replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
      });
      return JSON.parse(fixedStr);
    } catch (fallbackErr) {
      const extractMatch = cleanText.match(/(\{|\[)[\s\S]*(\}|\])/);
      if (extractMatch) {
        const fixedStr = extractMatch[0].replace(/"([^"\\]|\\.)*"/g, (m: string) => {
          return m.replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
        });
        return JSON.parse(fixedStr);
      }
      throw e;
    }
  }
};

const getApiUrl = () => {
  try {
    return localStorage.getItem("cn_gas_api_url") || DEFAULT_API_URL;
  } catch {
    return DEFAULT_API_URL;
  }
};
const LS_KEY = "cn_notes_cache";

// E列（要約・ハイライト）をメモ書き画面（プレビュー・編集）に忠実に配置するヘルパー
// 勝手な見出し(#)や日付(---\n**日付:**)の付加は行わず、E列テキストそのものを保持する
const normalizeNoteItem = (n: Note): Note => {
  const rawText = (n.rawContent || n.columnJ || "").trim();
  // E列の内容を最優先とし、未設定の場合はcontent（メモ書き内容）を参照
  const memoText = (n.summary !== undefined && n.summary !== "") 
    ? n.summary 
    : (n.content || "");

  return {
    ...n,
    content: memoText,  // メモ書き画面（エディタ・プレビュー）にE列をそのまま配置
    summary: memoText,  // E列の内容を保持
    columnJ: rawText,
    rawContent: rawText,
  };
};

export default function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const notesRef = useRef<Note[]>([]);

  // Keep notesRef in sync with real state for async operations to bypass stale closure bugs
  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  // Batch folder linking state & progress tracker
  const [bulkProgress, setBulkProgress] = useState<{
    isOpen: boolean;
    folderName: string;
    total: number;
    current: number;
    activeTitle: string;
    mode: "ai" | "local" | "choosing";
    logs: string[];
  } | null>(null);
  const bulkCancelRef = useRef(false);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [mode, setMode] = useState<"edit" | "preview">("preview");

  // Reset source memo display when active note changes
  useEffect(() => {
    setShowSourceMemo(false);
  }, [activeId]);
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedFolders, setCollapsedFolders] = useState<{ [f: string]: boolean }>({});
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");
  const [toastMessage, setToastMessage] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Date filters
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");

  // Sync statuses
  const [syncStatus, setSyncStatus] = useState<"synced" | "syncing" | "offline" | "error">("offline");
  const [syncLabel, setSyncLabel] = useState("オフライン");

  // Auto sync state (Defaults to false so it won't automatically sync without explicit user preference)
  const [autoSync, setAutoSync] = useState<boolean>(() => {
    const saved = localStorage.getItem("cn_auto_sync_enabled_v2");
    return saved !== null ? JSON.parse(saved) : false;
  });
  const autoSyncRef = useRef(autoSync);

  useEffect(() => {
    autoSyncRef.current = autoSync;
    localStorage.setItem("cn_auto_sync_enabled_v2", JSON.stringify(autoSync));
  }, [autoSync]);

  // AI results box state within the editor helper panel
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiIsLoading, setAiIsLoading] = useState(false);
  const [aiResults, setAiResults] = useState<any | null>(null);

  // TTS State
  const [ttsQueue, setTtsQueue] = useState<Note[]>([]);
  const [isTtsPlaying, setIsTtsPlaying] = useState(false);
  const [isTtsLoading, setIsTtsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Auto-complete Wiki suggestions state
  const [suggest, setSuggest] = useState<{
    show: boolean;
    query: string;
    items: string[];
    index: number;
    startPos: number;
    top: number;
    left: number;
  }>({ show: false, query: "", items: [], index: -1, startPos: -1, top: 0, left: 0 });

  // Modals state flags
  const [isHeatmapOpen, setIsHeatmapOpen] = useState(false);
  const [isCoOccurOpen, setIsCoOccurOpen] = useState(false);
  const [isStreamOpen, setIsStreamOpen] = useState(false);
  const [isBubbleOpen, setIsBubbleOpen] = useState(false);
  const [isGraphOpen, setIsGraphOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [isExternalPasteOpen, setIsExternalPasteOpen] = useState(false);
  const [externalPasteText, setExternalPasteText] = useState("");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isSyncManagerOpen, setIsSyncManagerOpen] = useState(false);
  const [isTimelineOpen, setIsTimelineOpen] = useState(false);
  const [externalExportTarget, setExternalExportTarget] = useState<{ type: 'single' } | { type: 'folder'; folderName: string } | null>(null);
  const [showSourceMemo, setShowSourceMemo] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isExtractingStructure, setIsExtractingStructure] = useState(false);
  const [sourceMemoFontSize, setSourceMemoFontSize] = useState<"text-base" | "text-lg" | "text-xl">("text-base");
  const [sourceMemoLineHeight, setSourceMemoLineHeight] = useState<"1.2" | "1.5" | "2.0">("1.5");

  // Touch event coordinates for mobile article/note navigation
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // ConfirmModal State
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: "primary" | "danger" | "success";
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  const showConfirm = (params: {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: "primary" | "danger" | "success";
    onConfirm: () => void;
  }) => {
    setConfirmState({
      isOpen: true,
      title: params.title,
      message: params.message,
      confirmText: params.confirmText,
      cancelText: params.cancelText,
      variant: params.variant,
      onConfirm: () => {
        params.onConfirm();
        setConfirmState(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  // 除外キーワード
  const [excludedKeywords, setExcludedKeywords] = useState<string[]>([]);

  const handleExcludeKeyword = (kw: string) => {
    const updated = Array.from(new Set([...excludedKeywords, kw]));
    setExcludedKeywords(updated);
    localStorage.setItem("cn_excluded_keywords", JSON.stringify(updated));
    toast(`キーワード 「${kw}」 を除外しました`);
  };

  const handleIncludeKeyword = (kw: string) => {
    const updated = excludedKeywords.filter(k => k.toLowerCase() !== kw.toLowerCase());
    setExcludedKeywords(updated);
    localStorage.setItem("cn_excluded_keywords", JSON.stringify(updated));
    toast(`キーワード 「${kw}」 の除外を解除しました`);
  };

  // 除外カテゴリ (バブル Y軸用)
  const [excludedCategories, setExcludedCategories] = useState<string[]>([]);

  const handleExcludeCategory = (cat: string) => {
    const updated = Array.from(new Set([...excludedCategories, cat]));
    setExcludedCategories(updated);
    localStorage.setItem("cn_excluded_categories", JSON.stringify(updated));
    toast(`カテゴリ 「${cat}」 を除外しました`);
  };

  const handleIncludeCategory = (cat: string) => {
    const updated = excludedCategories.filter(c => c.toLowerCase() !== cat.toLowerCase());
    setExcludedCategories(updated);
    localStorage.setItem("cn_excluded_categories", JSON.stringify(updated));
    toast(`カテゴリ 「${cat}」 の除外を解除しました`);
  };

  const [isExportCollapsed, setIsExportCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem("cn_export_collapsed");
      return stored ? JSON.parse(stored) : false;
    } catch {
      return false;
    }
  });

  const toggleExportCollapsed = () => {
    const newVal = !isExportCollapsed;
    setIsExportCollapsed(newVal);
    localStorage.setItem("cn_export_collapsed", JSON.stringify(newVal));
  };

  // Refs for element sizing
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const getFolder = (note: Note) => getFolderFromKeywords(note.keywords);

  // Local Saving
  const triggerLocalSave = (updatedNotes: Note[], activeNoteId: string | null) => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ notes: updatedNotes, activeId: activeNoteId }));
    } catch (e) {}
  };

  // Toast Helper
  const toast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 2500);
  };

  const copyToClipboard = async (text: string, successMsg: string = "コピーしました ✦") => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        toast(successMsg);
        return true;
      }
      throw new Error("Clipboard API unavailable");
    } catch (e) {
      console.warn("Clipboard writeText failed, falling back to execCommand", e);
      try {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand("copy");
        document.body.removeChild(textArea);
        if (successful) {
          toast(successMsg);
          return true;
        }
      } catch (err) {
        console.error("execCommand copy failed", err);
      }
      toast("コピーに失敗しました。お手数ですが手動でコピーしてください。");
      return false;
    }
  };
   const apiPost = async (body: any) => {
    const rawUrl = getApiUrl();
    const url = sanitizeGasUrl(rawUrl);
    if (!url || url.includes("YOUR_")) throw new Error("API URL is unconfigured.");
    
    // GAS URLの形式チェック
    if (!url.startsWith("https://script.google.com/macros/s/") || !url.endsWith("/exec")) {
      console.warn("GAS URL format may be invalid:", url);
    }

    const targetSheetName = localStorage.getItem("cn_gas_sheet_name");
    if (targetSheetName && targetSheetName.trim() !== "") {
      if (!body.sheetName) {
        body.sheetName = targetSheetName.trim();
      }
    }
    const targetSsUrl = localStorage.getItem("cn_gas_target_ss_url");
    if (targetSsUrl && targetSsUrl.trim() !== "") {
      if (!body.targetSsUrl) {
        body.targetSsUrl = targetSsUrl.trim();
      }
    }
    
    return await fetchGasPost(url, body);
  };

  const apiGet = async (action: string) => {
    const rawUrl = getApiUrl();
    const url = sanitizeGasUrl(rawUrl);
    if (!url || url.includes("YOUR_")) throw new Error("API URL is unconfigured.");
    
    const params: Record<string, string> = { action };
    const sheetName = localStorage.getItem("cn_gas_sheet_name");
    if (sheetName && sheetName.trim() !== "") {
      params.sheetName = sheetName.trim();
    }
    const targetSsUrl = localStorage.getItem("cn_gas_target_ss_url");
    if (targetSsUrl && targetSsUrl.trim() !== "") {
      params.targetSsUrl = targetSsUrl.trim();
    }
    
    return await fetchGasGet(url, params);
  };

  // Set visual status
  const updateSyncStatus = (status: "synced" | "syncing" | "offline" | "error", label: string) => {
    setSyncStatus(status);
    setSyncLabel(label);
  };

  // Sync pull & push logic
  const syncFromServer = async () => {
    const url = getApiUrl();
    if (!url || url.includes("YOUR_") || url.includes("YOUR_GAS_URL")) {
      updateSyncStatus("offline", "GAS未設定");
      return; // Added missing return to prevent immediately starting API requests
    }
    updateSyncStatus("syncing", "同期中...");
    
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    try {
      const targetSheet = localStorage.getItem("cn_gas_sheet_name") || "Notes";
      const data = await apiGet("getNotes");
      if (data.error) throw new Error(data.error);

      if (data.notes) {
        if (data.sheetName === undefined) {
           throw new Error("⚠️ GASのコードが古いため、別シートの指定が無視されました。「設定⚙」の「📋 最新GASコードをコピー」から新しいコードをGASに貼り付けて【新しいデプロイ】を行ってください。");
        } else if (data.sheetName !== targetSheet) {
           throw new Error(`⚠️ GAS側で読み込まれたシート（${data.sheetName}）が指定したシート（${targetSheet}）と異なります。GASの【新しいデプロイ】が正しく行われているか確認してください。`);
        }

        const serverNotes: Note[] = data.notes.map(normalizeNoteItem);
        const mergedMap: { [id: string]: Note } = {};

        // Merge maps
        serverNotes.forEach(n => {
          mergedMap[n.id] = n;
        });

        let localHasNewerUpdates = false;
        // Use dynamically updated notesRef instead of stale capture to preserve newly imported notes
        const currentLocalNotes = notesRef.current;
        currentLocalNotes.forEach(localNote => {
          const serverNote = mergedMap[localNote.id];
          if (!serverNote) {
            mergedMap[localNote.id] = localNote;
            localHasNewerUpdates = true;
          } else if (localNote.updatedAt > serverNote.updatedAt) {
            mergedMap[localNote.id] = localNote;
            localHasNewerUpdates = true;
          }
        });

        const mergedList = Object.values(mergedMap).map(normalizeNoteItem).sort((a, b) => b.updatedAt - a.updatedAt);
        
        setNotes(mergedList);
        triggerLocalSave(mergedList, activeId);
        
        if (localHasNewerUpdates) {
          updateSyncStatus("syncing", "サーバーとアップロード同期中...");
          await apiPost({ action: "saveAll", notes: mergedList });
        }

        updateSyncStatus("synced", "同期済");
        toast("サーバーと同期が完了しました ✦");
      }
    } catch (e: any) {
      updateSyncStatus("error", "エラー");
      toast("同期エラー: " + e.message);
      throw e;
    }
  };

  const forceUploadToServer = async () => {
    const url = getApiUrl();
    if (!url || url.includes("YOUR_") || url.includes("YOUR_GAS_URL")) {
      throw new Error("GASのウェブアプリURLが未設定です。設定画面から設定してください。");
    }
    updateSyncStatus("syncing", "強制保存中...");
    try {
      const currentLocalNotes = notesRef.current;
      const res = await apiPost({ action: "saveAll", notes: currentLocalNotes });
      if (res && res.error) throw new Error(res.error);
      
      updateSyncStatus("synced", "同期済");
      toast("ローカルを「最新」として、スプレッドシートへ全件強制上書き保存しました ✦");
    } catch (e: any) {
      updateSyncStatus("error", "エラー");
      toast("アップロード失敗: " + e.message);
      throw e;
    }
  };

  const forceDownloadFromServer = async () => {
    const url = getApiUrl();
    if (!url || url.includes("YOUR_") || url.includes("YOUR_GAS_URL")) {
      throw new Error("GASのウェブアプリURLが未設定です。設定画面から設定してください。");
    }
    updateSyncStatus("syncing", "ダウンロード中...");
    try {
      const targetSheet = localStorage.getItem("cn_gas_sheet_name") || "Notes";
      const data = await apiGet("getNotes");
      if (data && data.error) throw new Error(data.error);
      
      // 古いGASスクリプトかどうかのチェック
      if (data && data.notes) {
        if (data.sheetName === undefined) {
           throw new Error("⚠️ GASのコードが古いため、別シートの指定が無視されました。「設定⚙」の「📋 最新GASコードをコピー」から新しいコードをGASに貼り付けて【新しいデプロイ】を行ってください。");
        } else if (data.sheetName !== targetSheet) {
           throw new Error(`⚠️ GAS側で読み込まれたシート（${data.sheetName}）が指定したシート（${targetSheet}）と異なります。GASの【新しいデプロイ】が正しく行われているか確認してください。`);
        }

        const serverNotes: Note[] = data.notes.map(normalizeNoteItem);
        setNotes(serverNotes);
        if (serverNotes.length > 0) {
          setActiveId(serverNotes[0].id);
        } else {
          setActiveId(null);
        }
        triggerLocalSave(serverNotes, serverNotes[0]?.id || null);
        updateSyncStatus("synced", "同期済");
        toast(`シート「${data.sheetName}」から全${serverNotes.length}件をダウンロードし、ローカルを完全上書きしました ✦`);
      } else {
        throw new Error("スプレッドシートにデータが見つかりませんでした。");
      }
    } catch (e: any) {
      updateSyncStatus("error", "エラー");
      toast("ダウンロード失敗: " + e.message);
      throw e;
    }
  };

  const handleSyncExternalSources = async (options: { 
    raindrop: boolean; 
    drive: boolean; 
    persona?: string; 
    syncPrompt?: string; 
    weeklyReportPrompt?: string; 
    targetSheetName?: string;
    targetSsUrl?: string;
  }) => {
    const url = getApiUrl();
    if (!url || url.includes("YOUR_") || url.includes("YOUR_GAS_URL")) {
      throw new Error("GASのウェブアプリURLが未設定です。「設定⚙」からWebアプリURLを設定してください。");
    }
    updateSyncStatus("syncing", "外部データ取り込み中...");
    try {
      const targetSheet = (options.targetSheetName && options.targetSheetName.trim()) 
        ? options.targetSheetName.trim() 
        : (localStorage.getItem("cn_external_sync_sheet_name") || localStorage.getItem("cn_gas_sheet_name") || "Notes");

      const res = await apiPost({ 
        action: "syncExternalSources", 
        options, 
        sheetName: targetSheet,
        targetSsUrl: options.targetSsUrl
      });
      if (!res || !res.success) {
        throw new Error(res?.error || "外部データの取得に失敗しました");
      }

      updateSyncStatus("synced", "同期済");
      return res;
    } catch (e: any) {
      updateSyncStatus("error", "エラー");
      toast("外部取り込みエラー: " + e.message);
      throw e;
    }
  };

  const pushNoteToServer = async (note: Note) => {
    if (!autoSyncRef.current) return;
    const url = getApiUrl();
    if (!url || url.includes("YOUR_") || url.includes("YOUR_GAS_URL")) return;
    updateSyncStatus("syncing", "保存中...");
    try {
      await apiPost({ action: "saveNote", note });
      updateSyncStatus("synced", "同期済");
    } catch {
      updateSyncStatus("error", "保存エラー");
    }
  };

  const pushDeleteToServer = async (id: string) => {
    if (!autoSyncRef.current) return;
    const url = getApiUrl();
    if (!url || url.includes("YOUR_") || url.includes("YOUR_GAS_URL")) return;
    try {
      await apiPost({ action: "deleteNote", id });
    } catch {}
  };

  // Initialize and Boot
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        if (data.notes && data.notes.length > 0) {
          const normalized = data.notes.map(normalizeNoteItem);
          setNotes(normalized);
          // 起動時は常にダッシュボードを表示
          setActiveId(null);
        } else {
          loadDefaultNotes();
        }
      } else {
        loadDefaultNotes();
      }

      setFilterStartDate(localStorage.getItem("cn_filter_start_date") || "");
      setFilterEndDate(localStorage.getItem("cn_filter_end_date") || "");
      
      try {
        const storedEx = localStorage.getItem("cn_excluded_keywords");
        if (storedEx) {
          setExcludedKeywords(JSON.parse(storedEx));
        }
      } catch (ex) {}

      try {
        const storedCat = localStorage.getItem("cn_excluded_categories");
        if (storedCat) {
          setExcludedCategories(JSON.parse(storedCat));
        }
      } catch (ex) {}
    } catch (e) {
      loadDefaultNotes();
    }

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // Reset AI analysis panel when active note changes to avoid showing stale results on other notes
  useEffect(() => {
    setAiResults(null);
    setAiPanelOpen(false);
  }, [activeId]);

  const loadDefaultNotes = () => {
    const fresh: Note[] = [];
    setNotes(fresh);
    setActiveId(null);
    triggerLocalSave(fresh, null);
  };

  const getActiveNote = (): Note | undefined => {
    return notes.find(n => n.id === activeId);
  };

  // CRUD Core functions
  const handleCreateNote = (titleInput: string = "", bodyContent: string = "", keywordMetadata: string = "") => {
    const formattedTitle = (titleInput.trim() || `新規ノート`).replace(/^#\s*/, "");
    
    // Check duplicates to prevent conflicts
    const duplicate = notes.find(n => n.title.toLowerCase() === formattedTitle.toLowerCase());
    if (duplicate) {
      setActiveId(duplicate.id);
      setMode("preview");
      return;
    }

    const contentVal = bodyContent || `# ${formattedTitle}\n\n`;

    const newN: Note = {
      id: Math.random().toString(36).substring(2, 9) + Date.now().toString(36),
      title: formattedTitle,
      content: contentVal,
      summary: contentVal, // E列用に同期
      keywords: keywordMetadata,
      sourceUrl: "",
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const nextList = [newN, ...notes];
    setNotes(nextList);
    setActiveId(newN.id);
    setMode("preview");
    triggerLocalSave(nextList, newN.id);
    pushNoteToServer(newN);
    setAiPanelOpen(false);
  };

  const handleCreateNoteFromExternal = (title: string, content: string, folder: string, sourceUrl: string, timestamp?: number): Note => {
    const newN: Note = {
      id: Math.random().toString(36).substring(2, 9) + Date.now().toString(36),
      title: title,
      content: content,
      summary: content, // E列用に同期
      keywords: folder ? `[folder:${folder}]` : "",
      sourceUrl: sourceUrl || "",
      createdAt: timestamp || Date.now(),
      updatedAt: Date.now()
    };

    const nextList = [newN, ...notes];
    setNotes(nextList);
    setActiveId(newN.id);
    setMode("preview");
    triggerLocalSave(nextList, newN.id);
    pushNoteToServer(newN);
    setAiPanelOpen(false);
    return newN;
  };

  const handleBatchUpgradeNotes = (batchList: Note[], overwrite = false) => {
    const applyUpgrade = (finalUpdatedRange: Note[]) => {
      setNotes(finalUpdatedRange);
      if (finalUpdatedRange.length > 0) {
        setActiveId(finalUpdatedRange[0].id);
      }
      triggerLocalSave(finalUpdatedRange, finalUpdatedRange[0]?.id || null);

      // Auto-save/sync to Google Sheet if API is set up and autoSync is enabled
      if (autoSyncRef.current) {
        const url = getApiUrl();
        if (url && !url.includes("YOUR_") && !url.includes("YOUR_GAS_URL")) {
          apiPost({ action: "saveAll", notes: finalUpdatedRange })
            .then(() => toast("Googleスプレッドシートに同期・保存しました"))
            .catch((e) => console.error("Auto GAS sync error", e));
        }
      }
    };

    if (overwrite) {
      showConfirm({
        title: "すべてのノートを上書きしてインポートしますか？",
        message: `【警告】現在アプリ内に保存されているすべてのノート（${notes.length}件）が【完全に削除】され、インポートした新しい${batchList.length}件のノートのみに置き換わります（現在のノートは消去されます）。この操作は取り消せません。本当に実行しますか？`,
        confirmText: "丸ごと上書きする",
        cancelText: "キャンセル",
        variant: "danger",
        onConfirm: () => {
          const finalUpdatedRange = [...batchList].sort((a, b) => b.updatedAt - a.updatedAt);
          applyUpgrade(finalUpdatedRange);
        }
      });
    } else {
      const nextList = [...batchList, ...notes];
      
      // Filter duplicates
      const uniqueListMap: { [id: string]: Note } = {};
      nextList.forEach(item => {
        uniqueListMap[item.id] = item;
      });

      const finalUpdatedRange = Object.values(uniqueListMap).sort((a, b) => b.updatedAt - a.updatedAt);
      applyUpgrade(finalUpdatedRange);
    }
  };

  const handleDeleteNote = (id: string, event: React.MouseEvent) => {
    event.stopPropagation();
    
    const targetNote = notes.find(n => n.id === id);
    const title = targetNote ? `「${targetNote.title}」` : "このノート";

    showConfirm({
      title: "ノートの削除",
      message: `${title} を削除しますか？この操作は取り消せません。`,
      confirmText: "削除する",
      cancelText: "キャンセル",
      variant: "danger",
      onConfirm: () => {
        const nextList = notes.filter(n => n.id !== id);
        setNotes(nextList);
        
        let nextActiveId = activeId;
        if (activeId === id) {
          nextActiveId = nextList[0]?.id || null;
          setActiveId(nextActiveId);
        }

        triggerLocalSave(nextList, nextActiveId);
        pushDeleteToServer(id);
        setAiPanelOpen(false);
        toast("ノートを削除しました");
      }
    });
  };

  // Editor Change functions
  const scheduleDelayedSave = (note: Note) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      pushNoteToServer(note);
    }, 1500);
  };

  const handleNoteContentChange = (val: string) => {
    const active = getActiveNote();
    if (!active) return;

    const updated: Note = {
      ...active,
      content: val,
      summary: val, // E列（summary）にも同じ内容を反映して保存させる
      updatedAt: Date.now()
    };

    let newList: Note[] = [];
      setNotes(prev => {
        newList = prev.map(n => n.id === active.id ? updated : n);
        triggerLocalSave(newList, active.id);
        return newList;
      });
    scheduleDelayedSave(updated);

    // Track Autocomplete query on [[ trigger
    checkForWikiLinksSuggest(val);
  };

  const handleNoteTitleChange = (val: string) => {
    const active = getActiveNote();
    if (!active) return;

    const updated: Note = {
      ...active,
      title: val,
      updatedAt: Date.now()
    };

    let newList: Note[] = [];
      setNotes(prev => {
        newList = prev.map(n => n.id === active.id ? updated : n);
        triggerLocalSave(newList, active.id);
        return newList;
      });
    scheduleDelayedSave(updated);
  };

  const handleNoteFolderChange = (val: string) => {
    const active = getActiveNote();
    if (!active) return;

    const newFolder = val.trim();
    let kws = active.keywords || "";

    if (kws.includes("[folder:")) {
      if (newFolder) {
        kws = kws.replace(/\[folder:(.+?)\]/, `[folder:${newFolder}]`);
      } else {
        kws = kws.replace(/\[folder:(.+?)\]/, "").trim();
        kws = kws.replace(/^,\s*/, "").replace(/,\s*$/, "").replace(/,\s*,/g, ",");
      }
    } else if (newFolder) {
      kws = kws ? `${kws}, [folder:${newFolder}]` : `[folder:${newFolder}]`;
    }

    const updated = {
      ...active,
      keywords: kws,
      updatedAt: Date.now()
    };

    let newList: Note[] = [];
      setNotes(prev => {
        newList = prev.map(n => n.id === active.id ? updated : n);
        triggerLocalSave(newList, active.id);
        return newList;
      });
    scheduleDelayedSave(updated);
  };

  // Autocomplete suggestions handler
  const checkForWikiLinksSuggest = (val: string) => {
    if (!editorRef.current) return;
    const pos = editorRef.current.selectionStart;
    const textBefore = val.slice(0, pos);
    const lastOpen = textBefore.lastIndexOf("[[");
    const lastClose = textBefore.lastIndexOf("]]");

    if (lastOpen !== -1 && lastOpen >= lastClose) {
      const query = textBefore.slice(lastOpen + 2);
      if (query.includes("\n")) {
        setSuggest(prev => ({ ...prev, show: false }));
        return;
      }

      const filteredTitles = notes.map(n => n.title)
        .filter(t => !query || t.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 10);

      // Compute cursor layout coordinates organically
      const rect = editorRef.current.getBoundingClientRect();
      const lh = 22; // Computed selection coordinates offset
      const top = Math.min(rect.height + 20, 240); // Standard layout heights

      setSuggest({
        show: true,
        query,
        items: filteredTitles,
        index: 0,
        startPos: lastOpen,
        top,
        left: 45
      });
    } else {
      setSuggest(prev => ({ ...prev, show: false }));
    }
  };

  const applyWikiLinkSuggestion = (index: number = suggest.index) => {
    if (!editorRef.current || suggest.startPos === -1) return;

    const val = editorRef.current.value;
    const pos = editorRef.current.selectionStart;
    const before = val.slice(0, suggest.startPos);
    let after = val.slice(pos);

    if (after.startsWith("]]")) {
      after = after.slice(2);
    }

    let inserted = "";
    if (suggest.items.length === 0 || index < 0 || index >= suggest.items.length) {
      inserted = `[[${suggest.query}]] `;
    } else {
      inserted = `[[${suggest.items[index]}]] `;
    }

    const resultText = before + inserted + after;
    handleNoteContentChange(resultText);

    const newPos = before.length + inserted.length;
    setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.setSelectionRange(newPos, newPos);
        editorRef.current.focus();
      }
    }, 50);

    setSuggest(prev => ({ ...prev, show: false }));
  };

  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!suggest.show) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const len = suggest.items.length || 1;
      setSuggest(prev => ({ ...prev, index: (prev.index + 1) % len }));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const len = suggest.items.length || 1;
      setSuggest(prev => ({ ...prev, index: (prev.index - 1 + len) % len }));
    } else if (e.key === "Enter") {
      e.preventDefault();
      applyWikiLinkSuggestion();
    } else if (e.key === "Escape") {
      setSuggest(prev => ({ ...prev, show: false }));
    }
  };

  // Parsing WikiLinks and raw elements inside Markdown Renderer
  const handleWikiLinkClick = (targetTitle: string) => {
    const target = notes.find(n => n.title.toLowerCase() === targetTitle.toLowerCase());
    if (target) {
      setActiveId(target.id);
      setMode("preview");
    } else {
      handleCreateNote(targetTitle);
    }
  };

  // Navigates to the next or previous note dynamically
  const navigateNote = (direction: "next" | "prev") => {
    const { groups, sortedFolders } = getCategorizedNotes();
    const orderedList: Note[] = [];
    sortedFolders.forEach(folderName => {
      const groupList = groups[folderName] || [];
      orderedList.push(...groupList);
    });

    if (orderedList.length === 0) return;

    const currentIndex = orderedList.findIndex(n => n.id === activeId);
    if (currentIndex === -1) {
      setActiveId(orderedList[0].id);
      return;
    }

    let targetIndex = currentIndex;
    if (direction === "next") {
      targetIndex = currentIndex + 1;
      if (targetIndex >= orderedList.length) {
        targetIndex = 0; // Loop around
      }
    } else {
      targetIndex = currentIndex - 1;
      if (targetIndex < 0) {
        targetIndex = orderedList.length - 1; // Loop around
      }
    }

    const targetNote = orderedList[targetIndex];
    if (targetNote) {
      setActiveId(targetNote.id);
      setAiPanelOpen(false);
      setSidebarOpen(false);
      toast(`📖 [[${targetNote.title}]] へ切り替えました`);
    }
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1) {
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!touchStartRef.current) return;
    const start = touchStartRef.current;
    touchStartRef.current = null;

    if (e.changedTouches.length === 1) {
      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const deltaX = endX - start.x;
      const deltaY = endY - start.y;

      const minSwipeDistance = 60; // min 60px horizontal move
      const maxVerticalVariance = 50; // max 50px vertical move to keep it clean and scrolling unaffected

      if (Math.abs(deltaX) > minSwipeDistance && Math.abs(deltaY) < maxVerticalVariance) {
        if (deltaX > 0) {
          // Swipe Right -> Next Note! (Going down in list)
          navigateNote("next");
        } else {
          // Swipe Left -> Previous Note! (Going up in list)
          navigateNote("prev");
        }
      }
    }
  };

  const parseInlineMarkdownToElements = (text: string): React.ReactNode[] => {
    // Stage 1: WikiLink [[links]]
    let parts: React.ReactNode[] = [text];
    
    const wikiRegex = /\[\[([^\]]+)\]\]/g;
    let nextParts: React.ReactNode[] = [];
    for (const part of parts) {
      if (typeof part !== "string") {
        nextParts.push(part);
        continue;
      }
      
      let lastIndex = 0;
      let match;
      wikiRegex.lastIndex = 0;
      
      while ((match = wikiRegex.exec(part)) !== null) {
        const matchIndex = match.index;
        if (matchIndex > lastIndex) {
          nextParts.push(part.slice(lastIndex, matchIndex));
        }
        
        const lTitle = match[1].trim();
        const exists = notes.some(n => n.title.toLowerCase() === lTitle.toLowerCase());
        const noteExistsObj = notes.find(n => n.title.toLowerCase() === lTitle.toLowerCase());
        const isEmpty = noteExistsObj ? (!noteExistsObj.content || noteExistsObj.content.trim().length <= noteExistsObj.title.length + 5) : false;
        
        let linkCls = "wiki-link exists";
        if (!exists) linkCls = "wiki-link new";
        else if (isEmpty) linkCls = "wiki-link empty-node";
        
        nextParts.push(
          <span
            key={`wiki-${matchIndex}-${lTitle}`}
            className={linkCls}
            onClick={() => handleWikiLinkClick(lTitle)}
          >
            {lTitle}
          </span>
        );
        lastIndex = wikiRegex.lastIndex;
      }
      if (lastIndex < part.length) {
        nextParts.push(part.slice(lastIndex));
      }
    }
    parts = nextParts;

    // Stage 2: Markdown Links [text](url)
    nextParts = [];
    const mdLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g;
    for (const part of parts) {
      if (typeof part !== "string") {
        nextParts.push(part);
        continue;
      }
      
      let lastIndex = 0;
      let match;
      mdLinkRegex.lastIndex = 0;
      
      while ((match = mdLinkRegex.exec(part)) !== null) {
        const matchIndex = match.index;
        if (matchIndex > lastIndex) {
          nextParts.push(part.slice(lastIndex, matchIndex));
        }
        
        const linkText = match[1];
        const linkUrl = match[2];
        
        nextParts.push(
          <a
            key={`mdlink-${matchIndex}`}
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--blue)] hover:underline break-all"
          >
            {linkText}
          </a>
        );
        lastIndex = mdLinkRegex.lastIndex;
      }
      if (lastIndex < part.length) {
        nextParts.push(part.slice(lastIndex));
      }
    }
    parts = nextParts;

    // Stage 3: Raw URLs and bracketed URLs
    nextParts = [];
    const rawUrlRegex = /(https?:\/\/[^\s\)\"\'\>]+)/g;
    for (const part of parts) {
      if (typeof part !== "string") {
        nextParts.push(part);
        continue;
      }
      
      let lastIndex = 0;
      let match;
      rawUrlRegex.lastIndex = 0;
      
      while ((match = rawUrlRegex.exec(part)) !== null) {
        const matchIndex = match.index;
        if (matchIndex > lastIndex) {
          nextParts.push(part.slice(lastIndex, matchIndex));
        }
        
        const urlValue = match[1];
        
        nextParts.push(
          <a
            key={`rawurl-${matchIndex}`}
            href={urlValue}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--blue)] hover:underline break-all"
          >
            {urlValue}
          </a>
        );
        lastIndex = rawUrlRegex.lastIndex;
      }
      if (lastIndex < part.length) {
        nextParts.push(part.slice(lastIndex));
      }
    }
    parts = nextParts;

    // Stage 4: Bold form formatting
    nextParts = [];
    const boldRegex = /\*\*(.*?)\*\*/g;
    for (const part of parts) {
      if (typeof part !== "string") {
        nextParts.push(part);
        continue;
      }
      
      let lastIndex = 0;
      let match;
      boldRegex.lastIndex = 0;
      
      while ((match = boldRegex.exec(part)) !== null) {
        const matchIndex = match.index;
        if (matchIndex > lastIndex) {
          nextParts.push(part.slice(lastIndex, matchIndex));
        }
        
        const boldText = match[1];
        
        nextParts.push(
          <strong key={`bold-${matchIndex}`}>
            {boldText}
          </strong>
        );
        lastIndex = boldRegex.lastIndex;
      }
      if (lastIndex < part.length) {
        nextParts.push(part.slice(lastIndex));
      }
    }
    parts = nextParts;

    // Stage 5: Mono code formatting
    nextParts = [];
    const codeRegex = /`(.*?)`/g;
    for (const part of parts) {
      if (typeof part !== "string") {
        nextParts.push(part);
        continue;
      }
      
      let lastIndex = 0;
      let match;
      codeRegex.lastIndex = 0;
      
      while ((match = codeRegex.exec(part)) !== null) {
        const matchIndex = match.index;
        if (matchIndex > lastIndex) {
          nextParts.push(part.slice(lastIndex, matchIndex));
        }
        
        const codeText = match[1];
        
        nextParts.push(
          <code key={`code-${matchIndex}`} className="bg-[var(--surface)] text-[var(--orange)] p-0.5 rounded px-1.5 font-mono text-xs">
            {codeText}
          </code>
        );
        lastIndex = codeRegex.lastIndex;
      }
      if (lastIndex < part.length) {
        nextParts.push(part.slice(lastIndex));
      }
    }
    // Stage 6: <br> formatting
    nextParts = [];
    const brRegex = /<br\s*\/?>/gi;
    for (const part of parts) {
      if (typeof part !== "string") {
        nextParts.push(part);
        continue;
      }
      
      let lastIndex = 0;
      let match;
      brRegex.lastIndex = 0;
      
      while ((match = brRegex.exec(part)) !== null) {
        const matchIndex = match.index;
        if (matchIndex > lastIndex) {
          nextParts.push(part.slice(lastIndex, matchIndex));
        }
        
        nextParts.push(
          <br key={`br-${matchIndex}`} />
        );
        lastIndex = brRegex.lastIndex;
      }
      if (lastIndex < part.length) {
        nextParts.push(part.slice(lastIndex));
      }
    }
    parts = nextParts;

    return parts;
  };

const renderMarkdownToElements = (contentStr: string) => {
  if (!contentStr) return null;
  const lines = contentStr.split("\n");
  const elements: React.ReactNode[] = [];
  
  let i = 0;
  let keySeq = 0;

  // テーブルをパースするヘルパー関数
  const parseTable = (startIdx: number): { element: React.ReactNode; nextIdx: number } | null => {
    // 最低でもヘッダーとセパレータの2行が必要
    if (startIdx + 1 >= lines.length) return null;
    
    const headerLine = lines[startIdx];
    const separatorLine = lines[startIdx + 1];
    
    // 簡易的なテーブル判定（行が | で始まり | で終わる、かつ2行目がセパレータ形式か）
    const isTable = headerLine.trim().startsWith("|") && 
                    separatorLine.trim().startsWith("|") && 
                    /^[|:\s-]+$/.test(separatorLine.trim());
    
    if (!isTable) return null;

    const parseRow = (rowStr: string) => {
      // 前後の | を削除して分割
      const trimmed = rowStr.trim().replace(/^\||\|$/g, "");
      return trimmed.split("|").map(cell => cell.trim());
    };

    const headers = parseRow(headerLine);
    const aligns = parseRow(separatorLine).map(col => {
      if (col.startsWith(":") && col.endsWith(":")) return "center";
      if (col.endsWith(":")) return "right";
      return "left"; // デフォルト
    });

    const rows: string[][] = [];
    let currentIdx = startIdx + 2;

    // 後続のデータ行を収集
    while (currentIdx < lines.length && lines[currentIdx].trim().startsWith("|")) {
      rows.push(parseRow(lines[currentIdx]));
      currentIdx++;
    }

    const tableElement = (
      <table key={`table-${keySeq++}`} className="min-w-full border-collapse my-4 border border-[var(--border)]">
        <thead>
          <tr className="bg-[var(--surface)]">
            {headers.map((h, idx) => (
              <th key={idx} style={{ textAlign: aligns[idx] as any }} className="border border-[var(--border)] p-2 font-bold text-sm">
                {parseInlineMarkdownToElements(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rIdx) => (
            <tr key={rIdx} className="odd:bg-[var(--background)] even:bg-[var(--surface)]">
              {headers.map((_, cIdx) => (
                <td key={cIdx} style={{ textAlign: aligns[cIdx] as any }} className="border border-[var(--border)] p-2 text-sm">
                  {parseInlineMarkdownToElements(row[cIdx] || "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );

    return { element: tableElement, nextIdx: currentIdx };
  };

  // メインループ
  while (i < lines.length) {
    const line = lines[i];

    // 1. コードブロック処理
    if (line.startsWith("```")) {
      const codeBlockLanguage = line.slice(3).trim();
      const codeBlockContent: string[] = [];
      i++; // 最初の ``` を消費
      
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeBlockContent.push(lines[i]);
        i++;
      }
      
      const codeString = codeBlockContent.join("\n");
      if (codeBlockLanguage.toLowerCase() === "mermaid") {
        elements.push(<MermaidViewer key={`code-${keySeq++}`} code={codeString} />);
      } else {
        elements.push(
          <pre key={`code-${keySeq++}`} className="bg-[var(--surface)] text-[var(--fg)] p-4 rounded-md my-4 overflow-x-auto text-sm font-mono border border-[var(--border)]">
            <code>{codeString}</code>
          </pre>
        );
      }
      i++; // 閉じ ``` を消費
      continue;
    }

    // 2. テーブル処理（先読み判定）
    if (line.trim().startsWith("|")) {
      const tableResult = parseTable(i);
      if (tableResult) {
        elements.push(tableResult.element);
        i = tableResult.nextIdx; // テーブルとして消費した行の次へ進める
        continue;
      }
    }

    // 3. その他単一行要素の処理
    if (line.startsWith("# ")) {
      elements.push(<h1 key={keySeq++}>{parseInlineMarkdownToElements(line.slice(2))}</h1>);
    } else if (line.startsWith("## ")) {
      elements.push(<h2 key={keySeq++}>{parseInlineMarkdownToElements(line.slice(3))}</h2>);
    } else if (line.startsWith("### ")) {
      elements.push(<h3 key={keySeq++}>{parseInlineMarkdownToElements(line.slice(4))}</h3>);
    } else if (line.startsWith("> ")) { // 引用ブロックの追加
      elements.push(<blockquote key={keySeq++} className="border-l-4 border-[var(--border)] pl-4 italic my-2 text-[var(--fg-muted)]">{parseInlineMarkdownToElements(line.slice(2))}</blockquote>);
    } else if (line.startsWith("- [x] ")) {
      elements.push(
        <div key={keySeq++} className="check-row">
          <span className="check-icon done">✓</span>
          <span className="done-text">{parseInlineMarkdownToElements(line.slice(6))}</span>
        </div>
      );
    } else if (line.startsWith("- [ ] ")) {
      elements.push(
        <div key={keySeq++} className="check-row">
          <span className="check-icon todo">○</span>
          <span>{parseInlineMarkdownToElements(line.slice(6))}</span>
        </div>
      );
    } else if (line.startsWith("- ")) {
      elements.push(
        <div key={keySeq++} className="list-item">
          <span className="bullet">▸</span>
          <span>{parseInlineMarkdownToElements(line.slice(2))}</span>
        </div>
      );
    } else if (line === "---" || line === "***") {
      elements.push(<hr key={keySeq++} style={{ border: "none", borderTop: "1px solid var(--border)", margin: "14px 0" }} />);
    } else if (line === "") {
      elements.push(<div key={keySeq++} className="spacer" />);
    } else {
      elements.push(<p key={keySeq++}>{parseInlineMarkdownToElements(line)}</p>);
    }

    i++;
  }

  return elements;
};

  // Backlink & outlink statistics
  const getBacklinks = (noteTitle: string): Note[] => {
    return notes.filter(n => n.title.toLowerCase() !== noteTitle.toLowerCase() && n.content.toLowerCase().includes(`[[${noteTitle.toLowerCase()}]]`));
  };

  const getOutlinks = (content: string): string[] => {
    if (!content) return [];
    const matches = content.match(/\[\[([^\]]+)\]\]/g) || [];
    return Array.from(new Set(matches.map(m => m.slice(2, -2).trim())));
  };

  // Downloader
  const downloadBlob = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadSingleMarkdown = () => {
    const active = getActiveNote();
    if (!active) return;
    downloadBlob(active.content, `${active.title}.md`, "text/markdown");
    toast("ダウンロードしました");
  };

  const downloadAllMarkdowns = () => {
    const assembledStr = notes.map(n => `# ${n.title}\n\n${n.content}\n\n---\n`).join("\n");
    downloadBlob(assembledStr, `connected-notes-${formatDateStr(Date.now())}.md`, "text/markdown");
    toast("全ファイルをマージダウンロードしました");
  };

  const downloadBackupJSON = () => {
    const data = JSON.stringify({ notes, exportedAt: new Date().toISOString() }, null, 2);
    downloadBlob(data, `cn-backup-${formatDateStr(Date.now())}.json`, "application/json");
    toast("JSONバックアップファイルをダウンロードしました");
  };

  // Gemini AI Operations
  const optimizeTitleWithAI = async () => {
    const active = getActiveNote();
    if (!active) return;
    if (active.content.trim().length < 10) return toast("本文が短すぎてタイトルを生成できません");

    const apiKey = localStorage.getItem("cn_gemini_key");
    if (!apiKey) {
      toast("AI設定 ⚙ から Gemini APIキーを設定してください");
      setIsSettingsOpen(true);
      return;
    }

    const btn = document.getElementById("ai-title-btn");
    if (btn) btn.classList.add("loading");

    try {
      let model = localStorage.getItem("cn_gemini_model") || "gemini-flash-latest";

      const promptTemplate = getStoredPrompt("TITLE");
      const prompt = promptTemplate.replace("{content}", active.content.substring(0, 2000));

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: "POST",
        referrerPolicy: "no-referrer",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.5, maxOutputTokens: 60 }
        })
      });

      if (!res.ok) throw new Error(`HTTP Error ${res.status}: ${res.status === 404 ? 'API Endpoint not found. Please check your URL or Model settings.' : ''}`);
      const data = await res.json();
      let optTitle = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

      if (optTitle) {
        optTitle = optTitle.replace(/^#\s*/, "").replace(/[\"\'「」]/g, "").trim();
        handleNoteTitleChange(optTitle);
        toast("タイトルを最適化完了しました ✦");
      }
    } catch (e: any) {
      toast("タイトル提案エラー: " + e.message);
    } finally {
      if (btn) btn.classList.remove("loading");
    }
  };

  const buildAnalysisPrompt = (activeNote: Note, options: { allTitles?: boolean; taskBacklink?: boolean; taskAnalysis?: boolean; taskStructure?: boolean } = {}): string => {
    const { allTitles = false, taskBacklink = true, taskAnalysis = true, taskStructure = false } = options;
    const optimizeEnabled = localStorage.getItem("cn_optimize_api_tokens") !== "false";
    const maxCandidatesLimit = parseInt(localStorage.getItem("cn_max_candidates_limit") || "20", 10);
    const maxContentLength = parseInt(localStorage.getItem("cn_max_content_length") || "2500", 10);

    const compressedContent = compressContent(activeNote.content, maxContentLength);

    // 類似度に基づく事前フィルタリング
    const getTokens = (text: string) => {
      const t = text.replace(/\s+/g, "").toLowerCase();
      const tokens = new Set<string>();
      for (let i = 0; i < t.length - 1; i++) {
        tokens.add(t.substring(i, i + 2));
      }
      return tokens;
    };
    
    const activeTokens = getTokens(activeNote.title + compressedContent + (activeNote.keywords || ""));

    const scoredNotes = notes
      .filter(n => n.id !== activeNote.id)
      .map(n => {
        const isMentioned = activeNote.content.toLowerCase().includes(n.title.toLowerCase());
        
        let score = 0;
        if (isMentioned) {
          score += 10000;
        }
        
        const nTokens = getTokens(n.title + n.content.substring(0, 1000) + (n.keywords || ""));
        let matchCount = 0;
        for (const tk of nTokens) {
          if (activeTokens.has(tk)) matchCount++;
        }
        score += matchCount / (activeTokens.size + nTokens.size - matchCount || 1);
        
        return { note: n, score, isMentioned };
      })
      .filter(item => allTitles || item.isMentioned || item.score > 0.01)
      .sort((a, b) => b.score - a.score);

    const targetNotes = allTitles ? scoredNotes : scoredNotes.slice(0, maxCandidatesLimit);

    const existingTitles = targetNotes
      .map(({ note: n, isMentioned }) => {
        const suffix = isMentioned ? " (★本文中で直接言及されています - 接続を強く推奨)" : "";
        if (optimizeEnabled) {
          const folder = getFolder(n);
          let kws = n.keywords || "";
          kws = kws.replace(/\[folder:(.+?)\]/g, "").trim();
          const kwStr = kws ? `, キーワード: ${kws}` : "";
          return `- ${n.title} (フォルダ: ${folder}${kwStr})${suffix}`;
        } else {
          return `- ${n.title}${suffix}`;
        }
      })
      .join("\n");

    const optSummary = localStorage.getItem("cn_ai_opt_summary") === "true";
    const skipKw = localStorage.getItem("cn_ai_opt_skip_keywords");
    const optSkipKeywords = skipKw === null ? true : skipKw === "true";

    let hasKeywords = false;
    if (activeNote.keywords) {
      const clean = activeNote.keywords.replace(/\[folder:(.+?)\]/, "").trim();
      if (clean.length > 0) hasKeywords = true;
    }

    const needSummary = taskAnalysis && optSummary;
    const needKeywords = taskAnalysis && !(optSkipKeywords && hasKeywords);

    const jsonFields: string[] = [];
    const instructions: string[] = [];

    if (needKeywords) {
      jsonFields.push(`  "keywords": ["キーワード1", "キーワード2", "キーワード3", "キーワード4", "キーワード5"]`);
      jsonFields.push(`  "new_keywords": ["新規に作成すべきキーワード1", "新規に作成すべきキーワード2"]`);
      instructions.push(`- keywordsは固有名詞・概念・テーマを5〜8個抽出（名詞のみ）`);
      instructions.push(`- new_keywordsはkeywordsの中でまだ既存ノートにないもの`);
    }
    if (needSummary) {
      jsonFields.push(`  "summary": "このメモの要点を2〜3文で日本語でまとめてください"`);
    }
    
    if (taskStructure) {
      jsonFields.push(`    "visual_structure": "該当ノートの比較・時系列・因果関係を示すMermaidコードと簡単な説明文。該当情報がなければ空文字"`);
      instructions.push(`- visual_structureには、「比較できるもの」「時系列で変化したもの」「因果関係があるもの」「情報の階層構造」をMermaid記法の図として出力してください（目的は要約の網羅性ではなく、理解コストの削減）。`);
      instructions.push(`- 【重要】出力形式ルール:
  1. Mermaidの図解は、必ず \`\`\`mermaid [コード] \`\`\` の形式で出力すること。省略や要約（「...」など）をせず、必ず実行可能な完全なコードを出力してください。
  2. Mermaid以外のテキスト（解説やまとめ）も、必ず見出し(#)、箇条書き(-)、太字(**)などのMarkdown記法を使用して構造化すること。
  3. すべてのMermaidコードブロックの先頭に必ず次のinit行を挿入すること: %%{init: {'theme': 'dark', 'themeVariables': { 'primaryColor': '#1f6feb', 'primaryTextColor': '#ffffff', 'primaryBorderColor': '#ffffff', 'lineColor': '#58a6ff', 'textColor': '#ffffff', 'background': '#0d1117', 'mainBkg': '#0d1117', 'nodeBorder': '#ffffff', 'clusterBkg': '#0d1117', 'edgeLabelBackground':'#0d1117', 'fontSize': '16px' }}}%%
  4. グラフ直下に簡単な説明文（100文字程度）をセットで含めること。
  5. 枠からはみ出さないよう、flowchartのノード内やtimelineの項目は短く（1行10文字以内目安）し、必要に応じ<br>で改行すること。
  6. グラフ種別: 量の比較は xychart-beta または pie。xychart-beta は構文が厳格なため、以下の形式を厳守すること。
     【xychart-beta 正解例】: xychart-beta [改行] title "売上比較" [改行] x-axis ["1月", "2月"] [改行] y-axis "万円" 0 --> 100 [改行] bar [50, 80]
  7. Mermaidコードブロック前後には必ず空行を入れること。`);
    }
    
    if (taskBacklink) {
      jsonFields.push(`  "related_notes": ["既存ノートタイトル1", "既存ノートタイトル2"]`);
      instructions.push(`- related_notesは既存ノートの中から関連するもの・テーマが著しく類似するもの・相互に補完しあうナレッジを抽出（なければ空配列）`);
      instructions.push(`- 特に入力タイトル一覧に「★本文中で直接言及されています」と付いている既存ノートは、本文中で明示的に語られているため、確実に related_notes に含めてください。`);
      instructions.push(`- 既存ノートの持つタグ（フォルダ）や抽出済みキーワード情報を手がかりに、テーマの潜在的なつながりを的確に捉え、リンク判定の抜け漏れがないようにしてください。`);
    }

    const template = getStoredPrompt("ANALYZE");
    let prompt = template
      .replace("{title}", activeNote.title)
      .replace("{content}", compressedContent)
      .replace("{instructions}", taskBacklink ? "- 上記の【対象のメモ】と、最後にある【既存ノートのタイトル一覧】を必ず最後まで読み込んでから処理を開始してください。\n" + instructions.join("\n") : instructions.join("\n"))
      .replace("{jsonFields}", jsonFields.join(",\n"));
      
    if (taskBacklink) {
      prompt = prompt.replace("{existingTitles}", existingTitles || "（まだ他のノートはありません）");
    } else {
      prompt = prompt.replace("{existingTitles}", "");
    }
    return prompt;
  };

  const buildBulkAnalysisPrompt = (targetNotesList: Note[], options: { allTitles?: boolean; taskBacklink?: boolean; taskAnalysis?: boolean; taskStructure?: boolean } = {}): string => {
    const { allTitles = false, taskBacklink = true, taskAnalysis = true, taskStructure = false } = options;
    const optimizeEnabled = localStorage.getItem("cn_optimize_api_tokens") !== "false";
    const maxContentLength = parseInt(localStorage.getItem("cn_max_content_length") || "2500", 10);
    
    const optSummary = localStorage.getItem("cn_ai_opt_summary") === "true";

    const jsonFields: string[] = [];
    const instructions: string[] = [];

    jsonFields.push(`    "id": "対象ノートのID"`);

    if (taskAnalysis) {
      jsonFields.push(`    "keywords": ["キーワード1", "キーワード2"]`);
      jsonFields.push(`    "new_keywords": ["新規キーワード1", "新規キーワード2"]`);
      instructions.push(`- keywordsは固有名詞・概念・テーマを3〜5個抽出`);
      instructions.push(`- new_keywordsはキーワードの中でまだ既存ノートにないもの`);
      
      if (optSummary) {
        jsonFields.push(`    "summary": "このメモの要点を2〜3文で要約"`);
      }
    }
    
    if (taskStructure) {
      jsonFields.push(`    "visual_structure": "該当ノートの比較・時系列・因果関係を示すMermaidコードと簡単な説明文。該当情報がなければ空文字"`);
      instructions.push(`- visual_structureには、「比較できるもの」「時系列で変化したもの」「因果関係があるもの」「情報の階層構造」をMermaid記法の図として出力してください（目的は要約の網羅性ではなく、理解コストの削減）。`);
      instructions.push(`- 【重要】出力形式ルール:
  1. Mermaidの図解は、必ず \`\`\`mermaid [コード] \`\`\` の形式で出力すること。省略や要約（「...」など）をせず、必ず実行可能な完全なコードを出力してください。
  2. Mermaid以外のテキスト（解説やまとめ）も、必ず見出し(#)、箇条書き(-)、太字(**)などのMarkdown記法を使用して構造化すること。
  3. すべてのMermaidコードブロックの先頭に必ず次のinit行を挿入すること: %%{init: {'theme': 'dark', 'themeVariables': { 'primaryColor': '#1f6feb', 'primaryTextColor': '#ffffff', 'primaryBorderColor': '#ffffff', 'lineColor': '#58a6ff', 'textColor': '#ffffff', 'background': '#0d1117', 'mainBkg': '#0d1117', 'nodeBorder': '#ffffff', 'clusterBkg': '#0d1117', 'edgeLabelBackground':'#0d1117', 'fontSize': '16px' }}}%%
  4. グラフ直下に簡単な説明文（100文字程度）をセットで含めること。
  5. 枠からはみ出さないよう、flowchartのノード内やtimelineの項目は短く（1行10文字以内目安）し、必要に応じ<br>で改行すること。
  6. グラフ種別: 量の比較は xychart-beta または pie。xychart-beta は構文が厳格なため、以下の形式を厳守すること。
     【xychart-beta 正解例】: xychart-beta [改行] title "売上比較" [改行] x-axis ["1月", "2月"] [改行] y-axis "万円" 0 --> 100 [改行] bar [50, 80]
  7. Mermaidコードブロック前後には必ず空行を入れること。`);
    }
    
    if (taskBacklink) {
      jsonFields.push(`    "related_notes": ["既存ノートタイトル1", "既存ノートタイトル2"]`);
      instructions.push(`- related_notesは既存ノートの中から関連するもの・テーマが著しく類似するもの・相互に補完しあうナレッジを抽出（なければ空配列）`);
      instructions.push(`- 既存ノートの持つタグ（フォルダ）やキーワード情報を手がかりに、テーマの潜在的なつながりを的確に捉え、リンク判定の抜け漏れがないようにしてください。`);
    }

    let notesText = "";
    targetNotesList.forEach(activeNote => {
       const compressedContent = compressContent(activeNote.content, Math.min(maxContentLength, 1500)); 
       notesText += `\n---\nID: ${activeNote.id}\nタイトル: ${activeNote.title}\n本文:\n"""\n${compressedContent}\n"""\n`;
    });

    const existingTitles = notes
      .map(n => {
        if (optimizeEnabled) {
          const folder = getFolder(n);
          let kws = n.keywords || "";
          kws = kws.replace(/\[folder:(.+?)\]/g, "").trim();
          const kwStr = kws ? `, キーワード: ${kws}` : "";
          return `- ${n.title} (フォルダ: ${folder}${kwStr})`;
        } else {
          return `- ${n.title}`;
        }
      })
      .join("\n");

    const template = getStoredPrompt("ANALYZE_BULK");
    return template
      .replace("{notesText}", notesText)
      .replace("{instructions}", instructions.join("\n"))
      .replace("{jsonFields}", jsonFields.join(",\n"))
      .replace("{existingTitles}", existingTitles || "（まだ他のノートはありません）");
  };

  const handleApplyExternalJSON = () => {
    if (!externalPasteText.trim()) {
      toast("JSONが入力されていません");
      return;
    }
    
    try {
      const isArray = externalPasteText.includes('[') && externalPasteText.indexOf('[') < externalPasteText.indexOf('{');
      
      const jsonStr = externalPasteText.substring(
        isArray ? externalPasteText.indexOf('[') : externalPasteText.indexOf('{'),
        (isArray ? externalPasteText.lastIndexOf(']') : externalPasteText.lastIndexOf('}')) + 1
      );
      
      if (!jsonStr) throw new Error("JSONが見つかりません");
      
      const parsed = parseAIJSON(jsonStr);
      
      if (Array.isArray(parsed)) {
        let updatedCount = 0;
        let newNotesList = [...notes];
        
        parsed.forEach((resultItem: any) => {
          if (!resultItem.id) return;
          const targetIndex = newNotesList.findIndex(n => n.id === resultItem.id);
          if (targetIndex !== -1) {
            const current = newNotesList[targetIndex];
            
            let linkStr = "";
            if (resultItem.related_notes && Array.isArray(resultItem.related_notes)) {
              linkStr = resultItem.related_notes
                .map((title: string) => `[[${title.replace(/^-\s*/, "").replace(/ \(フォルダ:.*$/, "").replace(/ \(★本文中で直接言及されています.*\)/, "").trim()}]]`)
                .join("\n");
            }
            
            let baseText = resultItem.summary || current.summary;
            let newContent = baseText;
            if (linkStr) {
              const existingLinks = baseText.match(/\[\[(.*?)\]\]/g) || [];
              const newLinks = linkStr.split('\n').filter(l => !existingLinks.includes(l));
              if (newLinks.length > 0) {
                newContent = baseText + "\n\n" + newLinks.join('\n');
              }
            }
            if (resultItem.visual_structure) {
              const trimmed = resultItem.visual_structure.trim();
              const wrapped = (trimmed.includes('```mermaid')) 
                ? resultItem.visual_structure 
                : "```mermaid\n" + trimmed + "\n```";
              newContent = newContent + "\n\n" + wrapped;
            }
            
            let newKeywords = current.keywords;
            if (resultItem.keywords && Array.isArray(resultItem.keywords)) {
              const folder = getFolder(current);
              const kwsStr = resultItem.keywords.join(", ");
              newKeywords = folder !== "未分類" ? `${kwsStr}, [folder:${folder}]` : kwsStr;
            }
            
            newNotesList[targetIndex] = {
              ...current,
              content: newContent,
              summary: newContent, // 常に完全同期
              keywords: newKeywords,
              updatedAt: Date.now()
            };
            updatedCount++;
          }
        });
        
        if (updatedCount > 0) {
          setNotes(newNotesList);
          const active = getActiveNote();
          if (active) {
            triggerLocalSave(newNotesList, active.id);
          } else if (newNotesList.length > 0) {
            triggerLocalSave(newNotesList, newNotesList[0].id);
          }
          toast(`${updatedCount}件のノートを一括更新しました ✦`);
        } else {
          toast("更新対象のノートが見つかりませんでした");
        }
        
        setIsExternalPasteOpen(false);
        setExternalPasteText("");
        
      } else {
        if (!parsed.keywords && !parsed.summary && !parsed.related_notes) {
          throw new Error("必要なプロパティ(keywords, summary, related_notes 等)が見つかりません");
        }
        
        setAiResults(parsed);
        setAiPanelOpen(true);
        setIsExternalPasteOpen(false);
        setExternalPasteText("");
        toast("外部AIの結果を読み込みました ✦");
      }
    } catch (e: any) {
      toast("JSONの解析に失敗しました: " + e.message);
    }
  };

  const copyAIPromptForExternal = () => {
    const active = getActiveNote();
    if (!active) return toast("ノートを選択してください");
    if (active.content.trim().length < 15) return toast("内容が短すぎます");
    setExternalExportTarget({ type: 'single' });
  };

  const copyAIPromptForFolder = (folderName: string) => {
    const folderNotes = notes.filter(n => getFolder(n) === folderName);
    if (folderNotes.length === 0) return toast("ノートがありません");
    setExternalExportTarget({ type: 'folder', folderName });
  };

  const handleExternalAiExport = async (options: { includeAll: boolean; taskBacklink: boolean; taskAnalysis: boolean; taskStructure: boolean }) => {
    const target = externalExportTarget;
    setExternalExportTarget(null);
    if (!target) return;

    if (target.type === 'single') {
      const active = getActiveNote();
      if (!active) return;
      
      const prompt = buildAnalysisPrompt(active, {
        allTitles: options.includeAll,
        taskBacklink: options.taskBacklink,
        taskAnalysis: options.taskAnalysis,
        taskStructure: options.taskStructure
      });
      
      const blob = new Blob([prompt], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Prompt_AI_Analysis_${active.title.replace(/[\\/:*?"<>|]/g, "_").substring(0, 30)}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      await copyToClipboard(prompt, "プロンプトをコピーし、テキストファイルとしてもダウンロードしました ✦");
    } else if (target.type === 'folder') {
      const folderNotes = notes.filter(n => getFolder(n) === target.folderName && n.content.trim().length >= 15);
      if (folderNotes.length === 0) return toast("出力できるノートがありません（内容が短すぎます）");

      const prompt = buildBulkAnalysisPrompt(folderNotes, {
        allTitles: options.includeAll,
        taskBacklink: options.taskBacklink,
        taskAnalysis: options.taskAnalysis,
        taskStructure: options.taskStructure
      });

      const blob = new Blob([prompt], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeFolderName = target.folderName.replace(/[\\/:*?"<>|]/g, "_");
      a.download = `Bulk_Prompt_${safeFolderName}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      await copyToClipboard(prompt, `フォルダ「${target.folderName}」用の一括プロンプトをコピー・ダウンロードしました ✦`);
    }
  };

  const handleAppendFromClipboard = async () => {
    const active = getActiveNote();
    if (!active) return toast("ノートを選択してください");

    try {
      let text = "";
      try {
        text = await navigator.clipboard.readText();
      } catch (clipErr) {
        console.warn("Clipboard API failed, falling back to prompt", clipErr);
        const promptText = window.prompt("クリップボードの読み取り許可がありません。ここにテキストを貼り付けてください:");
        if (promptText === null) return; // User cancelled
        text = promptText;
      }

      if (!text.trim()) {
        return toast("テキストが入力されていません");
      }

      const updated = {
        ...active,
        content: active.content.trim() + "\n\n" + (() => {
          const trimmed = text.trim();
          const mermaidKeywords = ['graph', 'flowchart', 'sequenceDiagram', 'classDiagram', 'stateDiagram', 'erDiagram', 'journey', 'gantt', 'pie', 'quadrantChart', 'xychart-beta', 'timeline'];
          const lines = trimmed.split('\n');
          const firstLine = lines[0].toLowerCase();
          const secondLine = lines.length > 1 ? lines[1].toLowerCase() : "";
          const isMermaid = mermaidKeywords.some(kw => firstLine.includes(kw) || secondLine.includes(kw)) || trimmed.startsWith('%%{init');
          
          if (isMermaid && !trimmed.includes('```mermaid')) {
            return "```mermaid\n" + trimmed + "\n```\n";
          }
          return text;
        })(),
        updatedAt: Date.now()
      };
      let newList: Note[] = [];
      setNotes(prev => {
        newList = prev.map(n => n.id === active.id ? updated : n);
        triggerLocalSave(newList, active.id);
        return newList;
      });
      toast("内容を末尾に追記しました ✦");
    } catch (e: any) {
      console.error(e);
      toast("追記に失敗しました。");
    }
  };

  const runVisualExtraction = async () => {
    const active = getActiveNote();
    if (!active) return toast("ノートを選択してください");
    if (active.content.trim().length < 15) return toast("内容が短すぎます");
    
    setIsExtractingStructure(true);
    
    const template = getStoredPrompt("EXTRACT_STRUCTURE");
    const promptText = template.replace("{content}", active.columnJ || active.content);

    await copyToClipboard(promptText, "外部AI用のプロンプトをコピーしました📋 ChatGPT等に貼り付けて実行し、得られた結果をこのノートの本文に貼り付けてください");
    setIsExtractingStructure(false);
  };


  const runGeminiAnalysis = async () => {

    const active = getActiveNote();
    if (!active) return toast("ノートを選択してください");
    if (active.content.trim().length < 15) return toast("内容が短すぎます");

    const apiKey = localStorage.getItem("cn_gemini_key");
    if (!apiKey) {
      toast("まずAI設定 ⚙ から Gemini APIキーを設定してください");
      setIsSettingsOpen(true);
      return;
    }

    setAiIsLoading(true);
    setAiPanelOpen(true);

    const prompt = buildAnalysisPrompt(active);

    const optSummary = localStorage.getItem("cn_ai_opt_summary") === "true";
    const skipKw = localStorage.getItem("cn_ai_opt_skip_keywords");
    const optSkipKeywords = skipKw === null ? true : skipKw === "true";

    let hasKeywords = false;
    if (active.keywords) {
      const clean = active.keywords.replace(/\[folder:(.+?)\]/, "").trim();
      if (clean.length > 0) hasKeywords = true;
    }

    const needSummary = optSummary;
    const needKeywords = !(optSkipKeywords && hasKeywords);

    try {
      let model = localStorage.getItem("cn_gemini_model") || "gemini-flash-latest";

      const temperature = parseFloat(localStorage.getItem("cn_gemini_temp") || "0.1");
      const maxOutputTokens = parseInt(localStorage.getItem("cn_gemini_tokens") || "1200", 10);

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: "POST",
        referrerPolicy: "no-referrer",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature, maxOutputTokens, response_mime_type: "application/json" }
        })
      });

      if (!res.ok) throw new Error("API call failed");
      const rData = await res.json();
      const rawText = rData.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const resultObj = parseAIJSON(rawText);

      setAiResults(resultObj);

      // Save intermediate keywords directly to note if extracted
      if (needKeywords && resultObj.keywords) {
        const folder = getFolder(active);
        const kwsStr = resultObj.keywords.join(", ");
        const updatedKw = folder !== "未分類" ? `${kwsStr}, [folder:${folder}]` : kwsStr;

        const newSummary = needSummary ? (resultObj.summary || "") : active.summary;
        const updated = {
          ...active,
          keywords: updatedKw,
          summary: newSummary,
          content: newSummary, // E列用に同期
          updatedAt: Date.now()
        };

        let newList: Note[] = [];
      setNotes(prev => {
        newList = prev.map(n => n.id === active.id ? updated : n);
        triggerLocalSave(newList, active.id);
        return newList;
      });
        pushNoteToServer(updated);
      } else if (needSummary && resultObj.summary) {
        const updated = {
          ...active,
          summary: resultObj.summary,
          content: resultObj.summary, // E列用に同期
          updatedAt: Date.now()
        };

        let newList: Note[] = [];
      setNotes(prev => {
        newList = prev.map(n => n.id === active.id ? updated : n);
        triggerLocalSave(newList, active.id);
        return newList;
      });
        pushNoteToServer(updated);
      }

      toast("AI分析完了しました ✦");
    } catch (e: any) {
      toast("AI解析エラー: " + e.message);
    } finally {
      setAiIsLoading(false);
    }
  };

  const insertSingleKeyword = (kw: string) => {
    const active = getActiveNote();
    if (!active) return;

    if (active.content.includes(`[[${kw}]]`)) {
      return toast(`[[${kw}]] は既に挿入されています`);
    }

    let nextContent = active.content;
    if (nextContent.includes("## キーワード")) {
      nextContent = nextContent.replace("## キーワード", `## キーワード\n- [[${kw}]]`);
    } else {
      nextContent = nextContent.trimEnd() + `\n\n## キーワード\n- [[${kw}]]`;
    }

    handleNoteContentChange(nextContent);
    toast(`[[${kw}]] を挿入しました`);
  };

  const insertAllKeywordsChain = () => {
    const active = getActiveNote();
    if (!active || !aiResults) return;

    const allKws = [...new Set([
      ...(aiResults.keywords || []),
      ...(aiResults.new_keywords || [])
    ])];

    const uninserted = allKws.filter(k => !active.content.includes(`[[${k}]]`));
    if (uninserted.length === 0) return toast("全キーワードは既に挿入済みです");

    let nextContent = active.content.trimEnd();
    const listLines = uninserted.map(k => `- [[${k}]]`).join("\n");

    if (nextContent.includes("## キーワード")) {
      nextContent = nextContent.replace("## キーワード", `## キーワード\n${listLines}`);
    } else {
      nextContent += `\n\n## キーワード\n${listLines}`;
    }

    handleNoteContentChange(nextContent);
    toast(`${uninserted.length}個のキーワードを挿入しました ✦`);
  };

  const insertAiSummaryQuote = () => {
    const active = getActiveNote();
    if (!active || !aiResults?.summary) return;

    const quotePrefix = `> [!NOTE] AI要約 (${new Date().toLocaleDateString("ja-JP")})`;
    const blockText = `${quotePrefix}\n> ${aiResults.summary.replace(/\n/g, "\n> ")}\n\n`;

    let nextContent = active.content;
    const titleMatch = nextContent.match(/^# .+\n/);

    if (titleMatch) {
      nextContent = nextContent.replace(titleMatch[0], titleMatch[0] + "\n" + blockText);
    } else {
      nextContent = blockText + nextContent;
    }

    handleNoteContentChange(nextContent);
    toast("要約を挿入しました ✦");
  };

  const insertRelatedNotesLinks = () => {
    const active = getActiveNote();
    if (!active || !aiResults?.related_notes) return;

    const bulletList = aiResults.related_notes.map((t: string) => `- [[${t}]]`).join("\n");
    const nextContent = active.content.trimEnd() + `\n\n## 関連ノート\n${bulletList}`;

    handleNoteContentChange(nextContent);
    toast("関連リンクを末尾にバインドしました");
  };

  // Group notes dynamically based on categorized Folder tags
  const getCategorizedNotes = () => {
    const query = searchQuery.toLowerCase().trim();
    
    const filterStart = filterStartDate;
    const filterEnd = filterEndDate;
    const startMilli = filterStart ? new Date(filterStart + "T00:00:00").getTime() : null;
    const endMilli = filterEnd ? new Date(filterEnd + "T23:59:59").getTime() : null;

    const filtered = notes.filter(n => {
      if (startMilli && n.createdAt < startMilli) return false;
      if (endMilli && n.createdAt > endMilli) return false;
      
      const folderName = getFolder(n);
      
      if (!query) {
        return true;
      }

      return (
        n.title.toLowerCase().includes(query) ||
        n.content.toLowerCase().includes(query) ||
        folderName.toLowerCase().includes(query)
      );
    });

    const groups: { [folderName: string]: Note[] } = {};
    filtered.forEach(n => {
      const folder = getFolder(n);
      if (!groups[folder]) groups[folder] = [];
      groups[folder].push(n);
    });

    const sortedFolders = Object.keys(groups).sort((a, b) => {
      if (a === "未分類") return 1;
      if (b === "未分類") return -1;
      return b.localeCompare(a); // Descending chronological folder naming
    });

    return { groups, sortedFolders };
  };

  const toggleFolderCollapse = (folderName: string) => {
    setCollapsedFolders(prev => {
      const current = prev[folderName] ?? true;
      return {
        ...prev,
        [folderName]: !current
      };
    });
  };

  const collapseAllFolders = () => {
    setCollapsedFolders({});
    toast("全てのフォルダを折りたたみました ✦");
  };

  const expandAllFolders = () => {
    const { sortedFolders } = getCategorizedNotes();
    const nextCollapsed: { [f: string]: boolean } = {};
    sortedFolders.forEach(folder => {
      nextCollapsed[folder] = false;
    });
    setCollapsedFolders(nextCollapsed);
    toast("全てのフォルダを展開しました ✦");
  };

  // TTS Initialization and Handlers
  useEffect(() => {
    const audio = new Audio();
    audio.onended = () => {
      setTtsQueue(prev => prev.slice(1));
    };
    audio.onerror = (e) => {
      if (!audio.src || audio.src === window.location.href) return;
      console.error("Audio error", e);
      setIsTtsPlaying(false);
      toast("音声の再生に失敗しました");
    };
    audioRef.current = audio;
    return () => {
      audio.pause();
      audio.src = "";
    };
  }, []);

  useEffect(() => {
    if (isTtsPlaying && !isTtsLoading && ttsQueue.length > 0) {
      if (!audioRef.current || audioRef.current.paused) {
        playNextTts();
      }
    } else if (ttsQueue.length === 0 && isTtsPlaying) {
      setIsTtsPlaying(false);
      toast("フォルダ内のすべてのノートの読み上げが完了しました ✦");
    }
  }, [isTtsPlaying, ttsQueue, isTtsLoading]);

  const playNextTts = async () => {
    if (ttsQueue.length === 0) return;
    
    const currentNote = ttsQueue[0];
    setIsTtsLoading(true);
    
    try {
      let rawText = currentNote.content;
      // Remove everything after "保存日時" (or variations) if it exists
      rawText = rawText.split(/保存日時|保存:|保存：/)[0];
      
      // Remove the title from the start of the note if it exists
      const escapedTitle = currentNote.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const titleRegex = new RegExp(`^\\s*#*\\s*${escapedTitle}\\s*`, 'i');
      rawText = rawText.replace(titleRegex, '');

      const cleanText = rawText.replace(/#+\s/g, '').replace(/\[\[(.*?)\]\]/g, '$1').replace(/\*/g, '').trim();
      
      if (!cleanText) {
        setTtsQueue(prev => prev.slice(1));
        setIsTtsLoading(false);
        return;
      }
      
      const apiKey = localStorage.getItem("cn_gcp_tts_key");

      if (!apiKey) {
        throw new Error("APIキーが設定されていません。設定画面からGoogle Cloud TTS APIキーを入力してください。");
      }

      let textToRead = cleanText;
      if (cleanText.length > 1500) {
        textToRead = cleanText.substring(0, 1500);
        const remainingText = cleanText.substring(1500);
        
        // Add the remaining text as the next item in the queue
        setTtsQueue(prev => {
          const newQueue = [...prev];
          newQueue.splice(1, 0, { ...currentNote, content: remainingText, title: "" });
          return newQueue;
        });
      }

      const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
        method: 'POST',
        referrerPolicy: 'no-referrer',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text: textToRead },
          voice: { languageCode: "ja-JP", name: "ja-JP-Neural2-B" },
          audioConfig: { audioEncoding: "MP3" }
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || 'TTS Fetch Failed');
      }

      const data = await res.json();
      
      if (data.audioContent) {
        const byteCharacters = atob(data.audioContent);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'audio/mp3' });
        const audioSrc = URL.createObjectURL(blob);

        if (audioRef.current) {
          if (audioRef.current.src && audioRef.current.src.startsWith('blob:')) {
            URL.revokeObjectURL(audioRef.current.src);
          }
          audioRef.current.src = audioSrc;
          audioRef.current.playbackRate = parseFloat(localStorage.getItem("cn_tts_speed") || "1.2");
          
          if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
              title: currentNote.title,
              artist: getFolder(currentNote),
              album: 'Connected Notes'
            });
            navigator.mediaSession.setActionHandler('nexttrack', () => {
              if (audioRef.current) audioRef.current.pause();
              setTtsQueue(prev => prev.slice(1));
            });
            navigator.mediaSession.setActionHandler('stop', () => stopTts());
          }
          
          await audioRef.current.play();
        }
      }
    } catch (e) {
      console.error(e);
      toast("音声の取得に失敗しました");
      setIsTtsPlaying(false);
    } finally {
      setIsTtsLoading(false);
    }
  };

  const startTtsFromCurrent = () => {
    const active = getActiveNote();
    if (!active) return;
    
    const { groups } = getCategorizedNotes();
    const folder = getFolder(active);
    const groupList = groups[folder] || [];
    const startIndex = groupList.findIndex(n => n.id === active.id);
    
    if (startIndex === -1) return;
    
    const queue = groupList.slice(startIndex);
    setTtsQueue(queue);
    setIsTtsPlaying(true);
    toast(`${queue.length}件の記事の連続読み上げを開始します ✦`);
  };

  const stopTts = () => {
    setIsTtsPlaying(false);
    setTtsQueue([]);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
    }
  };

  const copyNoteToClipboard = async () => {
    const activeNote = getActiveNote();
    if (!activeNote) return;
    await copyToClipboard(activeNote.content, "記事の内容をクリップボードにコピーしました 📋");
  };

  const exportToPDF = async () => {
    const activeNote = getActiveNote();
    if (!activeNote) return;

    if (mode !== "preview") {
      toast("プレビューモードにしてからPDFダウンロードを実行してください。");
      setMode("preview");
      return;
    }

    // ブラウザのネイティブ印刷機能（Save as PDF）を呼び出す
    // CSSの @media print と @page 設定が適用されます
    window.print();
  };

  const exportNoteToJSON = () => {
    const activeNote = getActiveNote();
    if (!activeNote) return;

    const dataFromNote = {
      id: activeNote.id,
      title: activeNote.title,
      content: activeNote.content,
      summary: activeNote.summary || "",
      keywords: activeNote.keywords || "",
      sourceUrl: activeNote.sourceUrl || "",
      createdAt: activeNote.createdAt,
      updatedAt: activeNote.updatedAt,
      timeline: activeNote.timeline || "",
      columnJ: activeNote.columnJ || ""
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(dataFromNote, null, 2));
    const downloadAnchorNode = document.createElement("a");
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `${activeNote.title || "note"}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    toast(`JSONバックアップをダウンロードしました`);
  };

  const handleRenameFolderInline = (oldName: string, newName: string) => {
    if (oldName === "未分類") return toast("「未分類」は変更できません");
    if (!newName || newName.trim() === "" || newName.trim() === oldName) {
      setEditingFolder(null);
      return;
    }

    const trimmedNewName = newName.trim();
    const updatedList = notes.map(n => {
      if (getFolder(n) === oldName) {
        const reKeywords = n.keywords.replace(`[folder:${oldName}]`, `[folder:${trimmedNewName}]`);
        return {
          ...n,
          keywords: reKeywords,
          updatedAt: Date.now()
        };
      }
      return n;
    });

    setNotes(updatedList);
    setEditingFolder(null);
    triggerLocalSave(updatedList, activeId);
    if (autoSyncRef.current) {
      apiPost({ action: "saveAll", notes: updatedList })
        .then(() => toast("フォルダ名を変更し、クラウドへ同期しました"))
        .catch((e) => toast("更新保存エラー: " + e.message));
    } else {
      toast("フォルダ名を変更しました（手動同期モード）");
    }
  };

  const autoOrganizeWithAIPipeline = async () => {
    const apiKey = localStorage.getItem("cn_gemini_key");
    if (!apiKey) {
      toast("APIキーが設定されていません。AI設定より有効化してください。");
      setIsSettingsOpen(true);
      return;
    }

    const unorganized = notes.filter(n => getFolder(n) === "未分類" && n.content.trim().length > 10);
    if (unorganized.length === 0) {
      return toast("整理が必要な「未分類」ノートが見つかりませんでした。");
    }

    showConfirm({
      title: "AIでフォルダを自動整理しますか？",
      message: `未分類のノート ${unorganized.length} 件の内容をAIで分析し、最適なフォルダに自動的に振り分けます。よろしいですか？`,
      confirmText: "自動整理を開始する",
      cancelText: "キャンセル",
      variant: "primary",
      onConfirm: async () => {
        const btn = document.getElementById("ai-organize-btn");
        if (btn) btn.setAttribute("disabled", "true");
        toast("AIがカテゴリを推論中...");

        try {
          const listStr = unorganized.map(n => `[ID: ${n.id}, Title: ${n.title}]`).join("\n");
          const template = getStoredPrompt("ORGANIZE_FOLDER");
          const prompt = template.replace("{listStr}", listStr);

          let model = localStorage.getItem("cn_gemini_model") || "gemini-flash-latest";

          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
            method: "POST",
        referrerPolicy: "no-referrer",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.2, response_mime_type: "application/json" }
            })
          });

          if (!res.ok) { const errText = await res.text(); throw new Error(`Gemini API call failed: ${res.status} ${errText}`); }
          const rData = await res.json();
          const text = rData.candidates?.[0]?.content?.parts?.[0]?.text;
          
          let cleanText = (text || "").trim();
          if (cleanText.startsWith("```")) {
            cleanText = cleanText.replace(/^```json\s*/, "").replace(/^```\s*/, "").replace(/```$/, "").trim();
          }
          const mapping = parseAIJSON(cleanText);

          let finalUpdatedList: Note[] = [];
          setNotes(prev => {
            finalUpdatedList = prev.map(n => {
              const nextFolder = mapping[n.id];
              if (nextFolder) {
                let kws = n.keywords || "";
                if (kws.includes("[folder:")) {
                  kws = kws.replace(/\[folder:(.+?)\]/, `[folder:${nextFolder}]`);
                } else {
                  kws = kws ? `${kws}, [folder:${nextFolder}]` : `[folder:${nextFolder}]`;
                }
                return {
                  ...n,
                  keywords: kws,
                  updatedAt: Date.now()
                };
              }
              return n;
            });
            triggerLocalSave(finalUpdatedList, activeId);
            return finalUpdatedList;
          });
          if (autoSyncRef.current) {
            await apiPost({ action: "saveAll", notes: finalUpdatedList });
            toast("AI一括カテゴリフォルダ分類が完了し、クラウドへ保存しました ✦");
          } else {
            toast("AI一括カテゴリフォルダ分類が完了しました（手動同期モード） ✦");
          }
        } catch (e: any) {
          toast("AIフォルダ自動化エラー: " + e.message);
        } finally {
          if (btn) btn.removeAttribute("disabled");
        }
      }
    });
  };

  const bulkFolderAiLinkPipeline = (folderName: string) => {
    const folderNotes = notes.filter(n => getFolder(n) === folderName);
    if (folderNotes.length < 2) {
      return toast("一括関連リンクを構築するには、フォルダ内に2つ以上のノートが必要です。");
    }

    bulkCancelRef.current = false;
    setBulkProgress({
      isOpen: true,
      folderName,
      total: folderNotes.length,
      current: 0,
      activeTitle: "",
      mode: "choosing",
      logs: [`フォルダ「${folderName}」に ${folderNotes.length} 件のノートがあります。相互リンクの構築方法を設定してください。`]
    });
  };

  const runBulkLinkingProcess = async (mode: "ai" | "local") => {
    if (!bulkProgress) return;
    const { folderName } = bulkProgress;

    const apiKey = localStorage.getItem("cn_gemini_key");
    if (mode === "ai" && !apiKey) {
      toast("APIキーが設定されていません。AI設定より有効化してください。");
      setIsSettingsOpen(true);
      setBulkProgress(null);
      return;
    }

    setBulkProgress(prev => prev ? {
      ...prev,
      mode,
      logs: [...prev.logs, mode === "ai" ? "【精度最高・AI個別解析バッチ】処理を開始します..." : "【コスト優先・ローカル自動文字照合】処理を開始します..."]
    } : null);

    const folderNotes = notesRef.current.filter(n => getFolder(n) === folderName);
    const allExistingNotes = notesRef.current;
    let updatedNotesState = [...allExistingNotes];

    try {
      for (let i = 0; i < folderNotes.length; i++) {
        if (bulkCancelRef.current) {
          setBulkProgress(prev => prev ? {
            ...prev,
            logs: [...prev.logs, "🛑 ユーザーにより処理がキャンセルされました。"]
          } : null);
          break;
        }

        const note = folderNotes[i];
        const freshNote = updatedNotesState.find(n => n.id === note.id);
        if (!freshNote) continue;

        setBulkProgress(prev => prev ? {
          ...prev,
          current: i + 1,
          activeTitle: freshNote.title,
          logs: [...prev.logs, `🔄 [${i + 1}/${folderNotes.length}] 「${freshNote.title}」を解析中...`]
        } : null);

        let linksToAdd: string[] = [];

        if (mode === "local") {
          const otherTitles = allExistingNotes
            .filter(n => n.id !== freshNote.id && n.title.trim().length > 0)
            .map(n => n.title);

          const contentLower = freshNote.content.toLowerCase();
          otherTitles.forEach(t => {
            const tLower = t.toLowerCase();
            if (contentLower.includes(tLower) && !freshNote.content.includes(`[[${t}]]`)) {
              linksToAdd.push(t);
            }
          });

          if (linksToAdd.length > 0) {
            let currentContent = freshNote.content;
            const bulletList = linksToAdd.map(t => `- [[${t}]]`).join("\n");
            
            if (currentContent.includes("## 関連ノート")) {
              currentContent = currentContent.replace("## 関連ノート", `## 関連ノート\n${bulletList}`);
            } else {
              currentContent = currentContent.trimEnd() + `\n\n## 関連ノート\n${bulletList}`;
            }

            updatedNotesState = updatedNotesState.map(n => n.id === freshNote.id ? {
              ...n,
              content: currentContent,
              updatedAt: Date.now()
            } : n);

            setBulkProgress(prev => prev ? {
              ...prev,
              logs: [...prev.logs, `  ↳ 【ローカル検出】${linksToAdd.length}件の言及（${linksToAdd.join(", ")}）を自動リンク化しました。`]
            } : null);
          } else {
            setBulkProgress(prev => prev ? {
              ...prev,
              logs: [...prev.logs, "  ↳ 本文中に他のノートタイトルと言及が一致しませんでした。"]
            } : null);
          }

        } else if (mode === "ai") {
          const optimizeEnabled = localStorage.getItem("cn_optimize_api_tokens") !== "false";
          const maxCandidatesLimit = parseInt(localStorage.getItem("cn_max_candidates_limit") || "20", 10);
          const maxContentLength = parseInt(localStorage.getItem("cn_max_content_length") || "2500", 10);

          const compressedContent = compressContent(freshNote.content, maxContentLength);

          // Get tokens for similarity filtering
          const getTokens = (text: string) => {
            const t = text.replace(/\s+/g, "").toLowerCase();
            const tokens = new Set<string>();
            for (let i = 0; i < t.length - 1; i++) {
              tokens.add(t.substring(i, i + 2));
            }
            return tokens;
          };

          const activeTokens = getTokens(freshNote.title + compressedContent + (freshNote.keywords || ""));

          const scoredNotes = allExistingNotes
            .filter(n => n.id !== freshNote.id)
            .map(n => {
              const isMentioned = freshNote.content.toLowerCase().includes(n.title.toLowerCase());
              let score = 0;
              if (isMentioned) {
                score += 10000;
              }
              const nTokens = getTokens(n.title + n.content.substring(0, 1000) + (n.keywords || ""));
              let matchCount = 0;
              for (const tk of nTokens) {
                if (activeTokens.has(tk)) matchCount++;
              }
              score += matchCount / (activeTokens.size + nTokens.size - matchCount || 1);
              return { note: n, score, isMentioned };
            })
            .filter(item => item.isMentioned || item.score > 0.01)
            .sort((a, b) => b.score - a.score);

          const targetCandidates = scoredNotes.slice(0, maxCandidatesLimit);

          const candidateNotesInfo = targetCandidates
            .map(({ note: n }) => {
              const fName = getFolder(n);
              if (optimizeEnabled) {
                let kws = n.keywords || "";
                kws = kws.replace(/\[folder:(.+?)\]/g, "").trim();
                const kwStr = kws ? ` (キーワード: ${kws})` : "";
                return `- ${n.title} (フォルダ: ${fName}${kwStr})`;
              } else {
                return `- ${n.title} (フォルダ: ${fName})`;
              }
            })
            .join("\n");

          const template = getStoredPrompt("FIND_RELATED");
          const prompt = template
            .replace("{title}", freshNote.title)
            .replace("{content}", compressedContent)
            .replace("{candidateNotesInfo}", candidateNotesInfo || "（候補となる既存ノートはありません）");

          let model = localStorage.getItem("cn_gemini_model") || "gemini-flash-latest";

          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
            method: "POST",
        referrerPolicy: "no-referrer",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { 
                temperature: 0.1, 
                maxOutputTokens: 600,
                response_mime_type: "application/json"
              }
            })
          });

          if (!res.ok) throw new Error(`Gemini API 呼び出し失敗: status ${res.status}`);
          const rData = await res.json();
          const text = rData.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
          let cleanText = text.trim();
          if (cleanText.startsWith("```")) {
            cleanText = cleanText.replace(/^```json\s*/, "").replace(/^```\s*/, "").replace(/```$/, "").trim();
          }

          let aiParsedList: string[] = [];
          try {
            aiParsedList = parseAIJSON(cleanText);
          } catch (jsonErr) {
            console.error("Failed to parse AI response JSON:", cleanText);
            setBulkProgress(prev => prev ? {
              ...prev,
              logs: [...prev.logs, "  ↳ ⚠️ AIの応答をJSON解析できませんでした。スキップします。"]
            } : null);
            continue;
          }

          if (Array.isArray(aiParsedList) && aiParsedList.length > 0) {
            const filteredAiList = aiParsedList.filter(t => t && t.trim() !== "" && !freshNote.content.includes(`[[${t}]]`));
            if (filteredAiList.length > 0) {
              let currentContent = freshNote.content;
              const bulletList = filteredAiList.map(t => `- [[${t}]]`).join("\n");
              
              if (currentContent.includes("## 関連ノート")) {
                currentContent = currentContent.replace("## 関連ノート", `## 関連ノート\n${bulletList}`);
              } else {
                currentContent = currentContent.trimEnd() + `\n\n## 関連ノート\n${bulletList}`;
              }

              updatedNotesState = updatedNotesState.map(n => n.id === freshNote.id ? {
                ...n,
                content: currentContent,
                updatedAt: Date.now()
              } : n);

              setBulkProgress(prev => prev ? {
                ...prev,
                logs: [...prev.logs, `  ↳ ✦ 【AI推薦】潜在的リンクを ${filteredAiList.length} 件検出しました:（${filteredAiList.join(", ")}）`]
              } : null);
            } else {
              setBulkProgress(prev => prev ? {
                ...prev,
                logs: [...prev.logs, "  ↳ AIは既存リンク以上の新しいつながりを見つけませんでした。"]
              } : null);
            }
          } else {
            setBulkProgress(prev => prev ? {
              ...prev,
              logs: [...prev.logs, "  ↳ 関連テーマの検出はありませんでした。"]
            } : null);
          }
        }

        
        // 1件完了ごとにステートを更新して保存（進行度の同期）
        let nextState: Note[] = [];
        setNotes(prev => {
          nextState = prev.map(n => n.id === freshNote.id ? updatedNotesState.find(u => u.id === freshNote.id) || n : n);
          triggerLocalSave(nextState, activeId);
          return nextState;
        });
        if (autoSyncRef.current) {
          apiPost({ action: "saveNote", note: nextState.find(n => n.id === freshNote.id)! }).catch(err => {
            console.warn("Intermediate server sync mismatch:", err);
          });
        }


        // 1件毎の冷却スリープ（AI時のみ）
        if (mode === "ai" && i < folderNotes.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 600));
        }
      }

      setBulkProgress(prev => prev ? {
        ...prev,
        logs: [...prev.logs, "✨ フォルダ内の相互リンク一括構築が正常に完了しました！"]
      } : null);

      toast("相互リンク構築が完了しました！✦");
    } catch (e: any) {
      setBulkProgress(prev => prev ? {
        ...prev,
        logs: [...prev.logs, `⚠️ エラーが発生しました: ${e.message}`]
      } : null);
      toast("一括リンク処理中にエラー: " + e.message);
    }
  };

  const handleCommonDateFilterChange = (start: string, end: string) => {
    setFilterStartDate(start);
    setFilterEndDate(end);
    
    if (start) {
      localStorage.setItem("cn_filter_start_date", start);
    } else {
      localStorage.removeItem("cn_filter_start_date");
    }
    
    if (end) {
      localStorage.setItem("cn_filter_end_date", end);
    } else {
      localStorage.removeItem("cn_filter_end_date");
    }
  };

  const activeNote = getActiveNote();
  const { groups: categorizedGroups, sortedFolders } = getCategorizedNotes();

  return (
    <div className={`flex h-screen overflow-hidden bg-[#0d1117] text-[var(--text)] text-sm font-sans select-none antialiased print:block print:h-auto print:overflow-visible print:bg-white print:text-black print:p-0 print:m-0 ${
      isFullScreen ? "p-0 gap-0" : "p-2 md:p-3 gap-2 md:gap-3"
    }`}>
      
      {/* SIDEBAR CANVASES */}
      <div
        className={`w-[260px] min-w-[260px] bg-[#161b22] border border-[#30363d] rounded-2xl flex flex-col z-[100] transition-transform duration-200 absolute md:relative h-full md:m-0 print:hidden print:w-0 print:h-0 ${
          isFullScreen ? "hidden md:hidden" : (sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0")
        }`}
      >
        <div className="p-4 border-b border-[var(--border)] flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold tracking-wider text-[var(--blue)] uppercase flex items-center gap-2">
              <span className="p-1 rounded bg-blue-500/10 text-[var(--blue)] font-bold">◈</span>
              Connected Notes
            </div>
            
            <div
              className={`text-[9.5px] font-medium p-1 px-2 rounded-full cursor-pointer hover:brightness-110 whitespace-nowrap select-none ${
                syncStatus === "synced" ? "bg-[rgba(63,185,80,0.12)] text-[var(--green)]" :
                syncStatus === "syncing" ? "bg-[rgba(88,166,255,0.12)] text-[var(--blue)]" :
                "bg-[rgba(240,136,62,0.12)] text-[var(--orange)]"
              }`}
              onClick={() => setIsSyncManagerOpen(true)}
              title="クリックして同期オプションを選択（アップロード・ダウンロード・自動マージ）"
              style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              {syncStatus === "syncing" ? (
                <RefreshCw className="w-2.5 h-2.5 animate-spin" />
              ) : (
                "●"
              )}
              {syncLabel}
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 text-[11px] text-[var(--subtle)] cursor-pointer select-none hover:text-white transition-colors">
              <input
                type="checkbox"
                checked={autoSync}
                onChange={(e) => {
                  const val = e.target.checked;
                  setAutoSync(val);
                  if (val) {
                    toast("クラウド自動同期を有効化しました ✦");
                  } else {
                    toast("手動同期モードに切り替えました（勝手な同期は行われません） 🔒");
                  }
                }}
                className="rounded bg-[#0d1117] border-[#30363d] text-[var(--blue)] focus:ring-0 cursor-pointer w-3.5 h-3.5"
                title={autoSync ? "自動同期が有効です。チェックを外すと勝手な同期を停止します。" : "チェックを入れると編集時に自動でスプレッドシートへ同期します。"}
              />
              <span className={autoSync ? "text-[var(--blue)] font-medium" : "text-gray-400"}>
                {autoSync ? "クラウド自動同期: ON" : "自動同期: OFF (手動)"}
              </span>
            </label>
          </div>

          <button
            onClick={() => {
              setActiveId(null);
              setSidebarOpen(false);
            }}
            className={`w-full p-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all ${
              activeId === null
                ? "bg-[#58a6ff1a] border-[#58a6ff44] text-[var(--blue)] font-bold shadow-sm"
                : "bg-transparent border-[var(--border2)] text-[var(--subtle)] hover:bg-[var(--border)] hover:text-white"
            }`}
          >
            <Grid className="w-3.5 h-3.5" /> ダッシュボード表示
          </button>

          <div className="flex gap-2">
            <button
              onClick={() => handleCreateNote()}
              className="flex-1 p-2 bg-transparent border border-[var(--border2)] text-xs text-[var(--subtle)] rounded-lg font-semibold hover:bg-[var(--border)] hover:text-white hover:border-[#58a6ff44] cursor-pointer transition-all flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5 text-[var(--blue)]" /> 新規ノート
            </button>
            <button
              onClick={() => setIsImportOpen(true)}
              className="p-2 px-3 bg-transparent border border-[var(--border2)] text-xs rounded-lg hover:bg-[var(--border)] hover:text-white cursor-pointer transition-colors"
              title="外部ドキュメント・PDF取り込み"
            >
              📥
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 px-3 bg-transparent border border-[var(--border2)] text-[var(--subtle)] text-xs rounded-lg hover:bg-[var(--border)] hover:text-white cursor-pointer transition-colors"
              title="AI / 全体設定"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Searching & auto categorization */}
        <div className="p-3 border-b border-[var(--border)] flex gap-2">
          <input
            className="flex-1 p-2 bg-[var(--bg)] border border-[var(--border)] rounded-md text-xs placeholder:text-[var(--muted)] text-[var(--text)] outline-none focus:border-blue-500/50"
            placeholder="ノートを検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button
            id="ai-organize-btn"
            onClick={autoOrganizeWithAIPipeline}
            className="p-1 px-2.5 bg-[#a371f715] hover:bg-[#a371f728] border border-[#a371f744] text-[var(--purple)] text-[10px] font-bold rounded-md cursor-pointer transition-colors whitespace-nowrap"
            title="未分類ノートをAIで自動的にフォルダ分けします"
          >
            ✦ 整理
          </button>
        </div>

        {/* Category lists elements */}
        <div className="px-3 py-1.5 flex items-center justify-between border-b border-[var(--border)] bg-[#11141a] text-[10px] text-[var(--muted)] font-semibold select-none shrink-0 border-t">
          <span>フォルダリスト ({sortedFolders.length}個)</span>
          <div className="flex gap-2">
            <button
              onClick={collapseAllFolders}
              className="hover:text-white hover:underline transition-colors cursor-pointer bg-none border-none p-0 text-[10px] font-semibold"
              title="全てのフォルダを折りたたむ"
            >
              一括たたむ
            </button>
            <span className="opacity-30">|</span>
            <button
              onClick={expandAllFolders}
              className="hover:text-white hover:underline transition-colors cursor-pointer bg-none border-none p-0 text-[10px] font-semibold"
              title="全てのフォルダを展開する"
            >
              一括展開
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {sortedFolders.map(folderName => {
            const groupList = categorizedGroups[folderName] || [];
            const isCollapsed = collapsedFolders[folderName] ?? true;

            return (
              <div key={folderName} className="mb-0.5">
                <div
                  onClick={() => toggleFolderCollapse(folderName)}
                  className="group p-2 px-3 flex items-center gap-1.5 text-xs text-gray-200 hover:text-[var(--text)] hover:bg-[#1c2128] cursor-pointer font-bold select-none"
                >
                  <span className="text-[9px] text-[var(--muted)] scale-90 w-3">
                    {isCollapsed ? "▶" : "▼"}
                  </span>
                  <Folder className="w-3.5 h-3.5 text-blue-400/80 shrink-0" />
                  
                  {editingFolder === folderName ? (
                    <input
                      type="text"
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.stopPropagation();
                          handleRenameFolderInline(folderName, editingValue);
                        } else if (e.key === "Escape") {
                          e.stopPropagation();
                          setEditingFolder(null);
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                      className="flex-1 min-w-[50px] bg-[#0d1117] border border-blue-500 rounded text-xs px-1.5 py-0.5 text-white outline-none font-bold"
                    />
                  ) : (
                    <span className="flex-1 truncate">{folderName}</span>
                  )}

                  <span className="text-[10px] font-normal text-[var(--border2)] shrink-0">{groupList.length}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* 外部AI用プロンプト一括出力ボタン */}
                    {!isCollapsed && groupList.length >= 2 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          copyAIPromptForFolder(folderName);
                        }}
                        className="bg-green-900/40 border border-green-500/20 hover:bg-green-600 hover:text-white p-1 rounded text-green-400 cursor-pointer flex items-center justify-center gap-1 px-1.5 transition-all text-[9px] shrink-0"
                        title="外部AI用プロンプト一括出力"
                      >
                        <Download className="w-3 h-3 text-green-300" />
                        <span>AI出力</span>
                      </button>
                    )}
                    {/* 一括AI相互リンク生成ボタン（2つ以上のノートがあるときに表示） */}
                    {!isCollapsed && groupList.length >= 2 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          bulkFolderAiLinkPipeline(folderName);
                        }}
                        className="bg-purple-900/40 border border-purple-500/20 hover:bg-purple-600 hover:text-white p-1 rounded text-purple-400 cursor-pointer flex items-center justify-center gap-1 px-1.5 transition-all text-[9px] shrink-0"
                        title="フォルダ内相互リンク一括構築 (ローカル文字照合 または AI抽出)"
                      >
                        <Link2 className="w-3 h-3 text-purple-300" />
                        <span>リンク一括</span>
                      </button>
                    )}

                    {folderName !== "未分類" ? (
                      editingFolder === folderName ? (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRenameFolderInline(folderName, editingValue);
                            }}
                            className="p-0.5 hover:bg-green-500/20 text-green-400 rounded cursor-pointer"
                            title="保存"
                          >
                            ✓
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingFolder(null);
                            }}
                            className="p-0.5 hover:bg-red-500/20 text-red-400 rounded cursor-pointer"
                            title="キャンセル"
                          >
                            ✕
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingFolder(folderName);
                            setEditingValue(folderName);
                          }}
                          className="opacity-0 group-hover:opacity-100 hover:opacity-100 p-0.5 hover:bg-[var(--border2)] rounded text-[var(--muted)] hover:text-white cursor-pointer"
                          title="フォルダ名変更"
                        >
                          ✎
                        </button>
                      )
                    ) : null}
                  </div>
                </div>

                {!isCollapsed && (
                  <div className="flex flex-col pl-6">
                    {groupList.map(n => {
                      const isEmpty = !n.content || n.content.trim().length <= n.title.length + 5;
                      return (
                        <div
                          key={n.id}
                          onClick={() => {
                            setActiveId(n.id);
                            setAiPanelOpen(false);
                            setSidebarOpen(false);
                          }}
                          className={`note-item relative group flex items-center gap-2 p-2 px-3 text-xs border-l-2 cursor-pointer transition-all hover:bg-[#1c2128] ${
                            activeId === n.id ? "bg-[#1f2d3d] border-[var(--blue)] text-[var(--bright)] font-semibold" : "border-transparent text-[var(--subtle)]"
                          }`}
                        >
                          {isEmpty ? (
                            <BookOpen className="w-3.5 h-3.5 text-[var(--muted)] flex-shrink-0" />
                          ) : (
                            <FileText className={`w-3.5 h-3.5 flex-shrink-0 ${activeId === n.id ? "text-[var(--blue)]" : "text-[var(--muted)]"}`} />
                          )}
                          <span className={`${isEmpty ? "text-[var(--muted)] italic" : ""} flex-1 truncate`}>{n.title}</span>
                          <button
                            onClick={(e) => handleDeleteNote(n.id, e)}
                            className="absolute right-2 opacity-0 group-hover:opacity-100 hover:opacity-100 border-0 bg-transparent text-[var(--muted)] hover:text-[var(--red)] p-0.5 cursor-pointer"
                            title="ノートを削除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footing exports box */}
        <div className="p-4 border-t border-[var(--border)] bg-[#10141b]/40 flex flex-col gap-2">
          <div 
            onClick={toggleExportCollapsed}
            className="text-[10px] font-bold text-[var(--muted)] tracking-wider uppercase flex justify-between items-center cursor-pointer select-none hover:text-[var(--bright)] transition-colors py-0.5"
          >
            <span>エクスポート</span>
            <span className="text-[10px] transition-transform duration-200" style={{ transform: isExportCollapsed ? "rotate(0deg)" : "rotate(180deg)" }}>
              ▲
            </span>
          </div>
          
          {!isExportCollapsed && (
            <div className="flex flex-col gap-2 animate-[fadeIn_0.15s_ease-out] mt-1">
              <button
                onClick={downloadSingleMarkdown}
                className="w-full text-left p-1.5 bg-transparent hover:bg-[var(--border)] border border-[var(--border)] rounded text-[var(--subtle)] hover:text-white hover:border-[var(--border2)] text-[11px] cursor-pointer transition-all flex items-center gap-1.5"
              >
                <Download className="w-3 h-3 text-[var(--green)]" /> このノート (.md)
              </button>
              <button
                onClick={downloadAllMarkdowns}
                className="w-full text-left p-1.5 bg-transparent hover:bg-[var(--border)] border border-[var(--border)] rounded text-[var(--subtle)] hover:text-white hover:border-[var(--border2)] text-[11px] cursor-pointer transition-all flex items-center gap-1.5"
              >
                <Download className="w-3 h-3 text-[var(--green)]" /> 全ノート (.md)
              </button>
              <button
                onClick={downloadBackupJSON}
                className="w-full text-left p-1.5 bg-transparent hover:bg-[var(--border)] border border-[var(--border)] rounded text-[var(--subtle)] hover:text-white hover:border-[var(--border2)] text-[11px] cursor-pointer transition-all flex items-center gap-1.5"
              >
                <Download className="w-3 h-3 text-[var(--green)]" /> バックアップ (.json)
              </button>
            </div>
          )}
        </div>
      </div>

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-[#00000060] z-[99] md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* MAIN CONTAINER WORKSPACE */}
      <div className={`flex-1 flex flex-col overflow-hidden bg-[#161b22] min-w-0 print:border-none print:h-auto print:overflow-visible print:bg-white ${
        isFullScreen ? "border-0 rounded-none" : "border border-[#30363d] rounded-2xl"
      }`}>
        {activeNote ? (
          <div 
            className="flex-1 flex flex-col overflow-hidden print:h-auto print:overflow-visible print:bg-white"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {/* TOOLBAR */}
            <div className={`p-3.5 border-b border-[var(--border)] flex justify-between items-center bg-[var(--bg)] flex-wrap gap-2.5 z-10 select-none print:hidden ${
              isFullScreen ? "landscape:hidden" : ""
            }`}>
              {!isFullScreen && (
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <button
                    onClick={() => setSidebarOpen(true)}
                    className="md:hidden border-0 bg-transparent text-[var(--subtle)] mr-1 cursor-pointer"
                  >
                    <Menu className="w-5 h-5" />
                  </button>

                  <div className="flex-1 flex flex-col min-w-0">
                    <div className="flex items-center w-full gap-2">
                      <input
                        className="text-base font-bold bg-transparent border-0 text-[var(--bright)] outline-none w-full min-w-0 focus:border-b focus:border-[var(--border2)]"
                        placeholder="タイトル"
                        value={activeNote.title}
                        onChange={(e) => handleNoteTitleChange(e.target.value)}
                      />
                      <button
                        id="ai-title-btn"
                        onClick={optimizeTitleWithAI}
                        className="p-1 rounded text-[var(--purple)] bg-transparent opacity-65 hover:opacity-100 hover:scale-105 active:scale-95 transition-all cursor-pointer flex-shrink-0"
                        title="AIでタイトルを最適化する"
                      >
                        <Sparkles className="w-4 h-4 text-[var(--purple)]" />
                      </button>
                    </div>

                    <div className="flex items-center gap-1 mt-0.5 text-[var(--muted)]">
                      <span className="scale-90 text-[10px]">📁</span>
                      <input
                        className="bg-transparent border-0 text-[11px] text-[var(--muted)] outline-none w-full placeholder:text-[var(--muted)]/50 focus:text-white"
                        placeholder="フォルダ名 (空欄で未分類)"
                        value={getFolder(activeNote) === "未分類" ? "" : getFolder(activeNote)}
                        onChange={(e) => handleNoteFolderChange(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* View tabs and Charts switch and API settings configs */}
              <div className="flex gap-1.5 items-center flex-wrap">
                <div className="flex bg-[#1c2128] border border-[var(--border2)] rounded-md p-0.5">
                  <button
                    className={`px-3 py-1 text-[11px] font-semibold border-0 rounded cursor-pointer transition-all ${
                      mode === "preview" ? "bg-[var(--border)] text-[var(--blue)] font-bold mb-0" : "text-[var(--subtle)] hover:bg-[#ffffff08]"
                    }`}
                    onClick={() => setMode("preview")}
                  >
                    プレビュー
                  </button>
                  <button
                    className={`px-3 py-1 text-[11px] font-semibold border-0 rounded cursor-pointer transition-all ${
                      mode === "edit" ? "bg-[var(--border)] text-[var(--blue)] font-bold mb-0" : "text-[var(--subtle)] hover:bg-[#ffffff08]"
                    }`}
                    onClick={() => setMode("edit")}
                  >
                    編集
                  </button>
                </div>

                <button
                  onClick={() => setIsFullScreen(!isFullScreen)}
                  className={`p-1 px-2.5 bg-transparent border text-xs font-semibold rounded-md cursor-pointer flex items-center gap-1.5 transition-all ${
                    isFullScreen 
                      ? "bg-blue-900/30 border-blue-500/30 text-blue-300 hover:bg-blue-900/50 animate-pulse" 
                      : "border-[var(--border2)] text-[var(--subtle)] hover:text-white hover:bg-[var(--border)]"
                  }`}
                  title={isFullScreen ? "全画面表示を解除します" : "サイドバーを非表示にして全画面で記事を表示します"}
                >
                  {isFullScreen ? <Minimize2 className="w-3.5 h-3.5 text-blue-400" /> : <Maximize2 className="w-3.5 h-3.5 text-blue-400" />}
                  <span>{isFullScreen ? "全画面解除" : "全画面"}</span>
                </button>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={isTtsPlaying ? stopTts : startTtsFromCurrent}
                    className={`p-1 px-2.5 bg-transparent border border-[var(--border2)] text-xs font-medium rounded-md cursor-pointer flex items-center gap-1.5 transition-all ${
                      isTtsPlaying ? "text-red-400 hover:text-red-300 hover:bg-red-900/30" : "text-[var(--subtle)] hover:text-white hover:bg-[var(--border)]"
                    }`}
                    title="このフォルダの末尾まで記事を連続で読み上げます（バックグラウンド再生対応）"
                  >
                    {isTtsLoading ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-[var(--blue)]" />
                    ) : isTtsPlaying ? (
                      <Square className="w-3.5 h-3.5" />
                    ) : (
                      <Volume2 className="w-3.5 h-3.5 text-green-400" />
                    )}
                    <span className="hidden sm:inline">{isTtsPlaying ? "停止" : "読み上げ"}</span>
                  </button>

                  <button
                    onClick={copyNoteToClipboard}
                    className="p-1 px-2.5 bg-transparent border border-[var(--border2)] text-xs text-[var(--subtle)] hover:text-white hover:bg-[var(--border)] font-medium rounded-md cursor-pointer flex items-center gap-1.5 transition-all"
                    title="この記事の内容（テキスト・Markdown）をクリップボードにコピー"
                  >
                    <Copy className="w-3.5 h-3.5 text-[var(--blue)]" />
                    <span className="hidden sm:inline">コピー</span>
                  </button>

                  <button
                    onClick={exportToPDF}
                    className="p-1 px-2.5 bg-transparent border border-[var(--border2)] text-xs text-[var(--subtle)] hover:text-white hover:bg-[var(--border)] font-medium rounded-md cursor-pointer flex items-center gap-1.5 transition-all"
                    title="A4サイズPDFとして出力（プレビューモード時）"
                  >
                    <Download className="w-3.5 h-3.5 text-[var(--green)]" />
                    <span className="hidden sm:inline">PDF</span>
                  </button>

                  <button
                    onClick={exportNoteToJSON}
                    className="p-1 px-2.5 bg-transparent border border-[var(--border2)] text-xs text-[var(--subtle)] hover:text-white hover:bg-[var(--border)] font-medium rounded-md cursor-pointer flex items-center gap-1.5 transition-all"
                    title="この記事をJSONファイルとしてダウンロード"
                  >
                    <FileJson className="w-3.5 h-3.5 text-[var(--accent)]" />
                    <span className="hidden sm:inline">JSON</span>
                  </button>

                  <button
                    onClick={runVisualExtraction}
                    disabled={isExtractingStructure}
                    className={`p-1 px-2.5 bg-transparent border border-[var(--border2)] text-xs font-medium rounded-md cursor-pointer flex items-center gap-1.5 transition-all ${isExtractingStructure ? 'opacity-50 cursor-not-allowed' : 'text-[var(--subtle)] hover:text-white hover:bg-[var(--border)]'}`}
                    title="記事の図解（比較・時系列・因果）を抽出する"
                  >
                    {isExtractingStructure ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-[var(--accent)]" /> : <Grid className="w-3.5 h-3.5 text-[var(--accent)]" />}
                    <span className="hidden sm:inline">図解抽出</span>
                  </button>

                  <button
                    onClick={handleAppendFromClipboard}
                    className="p-1 px-2.5 bg-transparent border border-[var(--border2)] text-xs font-medium rounded-md cursor-pointer flex items-center gap-1.5 transition-all text-[var(--subtle)] hover:text-white hover:bg-[var(--border)]"
                    title="クリップボードの内容をノートの末尾に追記する"
                  >
                    <Clipboard className="w-3.5 h-3.5 text-[var(--blue)]" />
                    <span className="hidden sm:inline">末尾に貼り付け</span>
                  </button>

                  {(activeNote.columnJ || activeNote.rawContent) && (activeNote.columnJ || activeNote.rawContent)!.trim() !== "" && (
                    <button
                      onClick={() => setShowSourceMemo(!showSourceMemo)}
                      className={`p-1 px-2.5 border text-xs font-medium rounded-md cursor-pointer flex items-center gap-1.5 transition-all
                        ${showSourceMemo 
                          ? "bg-blue-900/30 border-blue-500/30 text-blue-300 hover:bg-blue-900/50" 
                          : "bg-transparent border-[var(--border2)] text-[var(--subtle)] hover:text-white hover:bg-[var(--border)]"}`}
                      title="元の記事本文(I列)の表示切り替え"
                    >
                      <FileText className={`w-3.5 h-3.5 flex-shrink-0 ${showSourceMemo ? "text-blue-400" : "text-[var(--subtle)]"}`} />
                      <span>記事全文</span>
                    </button>
                  )}
                </div>

                {!isFullScreen && (
                  <>
                    <div className="h-4 w-[1px] bg-[var(--border)] mx-1" />

                    {/* Analytical Charts */}
                    <button
                      onClick={() => setIsGraphOpen(true)}
                      className="p-1 px-2.5 bg-transparent border border-[var(--border2)] text-xs text-[var(--subtle)] hover:text-white hover:bg-[var(--border)] font-medium rounded-md cursor-pointer flex items-center gap-1 transition-all"
                      title="ナレッジグラフ表示"
                    >
                      🕸 <span className="hidden sm:inline">グラフ</span>
                    </button>

                    <button
                      onClick={() => setIsTimelineOpen(true)}
                      className="p-1 px-2.5 bg-transparent border border-[var(--border2)] text-xs text-[var(--subtle)] hover:text-white hover:bg-[var(--border)] font-medium rounded-md cursor-pointer flex items-center gap-1 transition-all"
                      title="時系列年表表示"
                    >
                      📅 <span className="hidden sm:inline">年表</span>
                    </button>
                    
                    <button
                      onClick={() => setIsHeatmapOpen(true)}
                      className="p-1 px-2.5 bg-transparent border border-[var(--border2)] text-xs text-[var(--subtle)] hover:text-white hover:bg-[var(--border)] font-medium rounded-md cursor-pointer flex items-center gap-1 transition-all"
                      title="ヒートマップ表示"
                    >
                      <Grid className="w-3.5 h-3.5 text-blue-400" /> <span className="hidden sm:inline">ヒートマップ</span>
                    </button>

                    <button
                      onClick={() => setIsCoOccurOpen(true)}
                      className="p-1 px-2.5 bg-transparent border border-[var(--border2)] text-xs text-[var(--subtle)] hover:text-white hover:bg-[var(--border)] font-medium rounded-md cursor-pointer flex items-center gap-1 transition-all"
                      title="キーワード共起ネットワーク表示"
                    >
                      <Globe className="w-3.5 h-3.5 text-blue-400" /> <span className="hidden sm:inline">共起</span>
                    </button>

                    <button
                      onClick={() => setIsStreamOpen(true)}
                      className="p-1 px-2.5 bg-transparent border border-[var(--border2)] text-xs text-[var(--subtle)] hover:text-white hover:bg-[var(--border)] font-medium rounded-md cursor-pointer flex items-center gap-1 transition-all"
                      title="推移ストリームグラフ表示"
                    >
                      <Waves className="w-3.5 h-3.5 text-blue-400" /> <span className="hidden sm:inline">ストリーム</span>
                    </button>

                    <button
                      onClick={() => setIsBubbleOpen(true)}
                      className="p-1 px-2.5 bg-transparent border border-[var(--border2)] text-xs text-[var(--subtle)] hover:text-white hover:bg-[var(--border)] font-medium rounded-md cursor-pointer flex items-center gap-1 transition-all"
                      title="カテゴリバブルチャート表示"
                    >
                      <AreaChart className="w-3.5 h-3.5 text-blue-400" /> <span className="hidden sm:inline">バブル</span>
                    </button>

                    <div className="h-4 w-[1px] bg-[var(--border)] mx-1" />
                  </>
                )}

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={copyAIPromptForExternal}
                    className="p-1 px-3 bg-[#2ea0431c] border border-[#2ea04344] hover:bg-[#2ea0432c] text-[#7ee787] font-bold text-xs rounded-md cursor-pointer flex items-center gap-1.5 transition-all"
                    title="外部AI（ChatGPT等）で解析するためのプロンプトをダウンロードします（テキストファイルをAIに添付してください）"
                  >
                    <Download className="w-3.5 h-3.5" /> <span className="hidden sm:inline">外部AI用に出力</span>
                  </button>

                  <button
                    onClick={() => setIsExternalPasteOpen(true)}
                    className="p-1 px-3 bg-[#2ea0431c] border border-[#2ea04344] hover:bg-[#2ea0432c] text-[#7ee787] font-bold text-xs rounded-md cursor-pointer flex items-center gap-1.5 transition-all"
                    title="外部AI（ChatGPT等）から得られたJSON結果を適用します"
                  >
                    <Clipboard className="w-3.5 h-3.5" /> <span className="hidden sm:inline">結果を適用</span>
                  </button>

                  <button
                    onClick={runGeminiAnalysis}
                    className="p-1 px-3 bg-[#a371f71c] border border-[#a371f744] hover:bg-[#a371f72c] text-[var(--purple)] font-bold text-xs rounded-md cursor-pointer flex items-center gap-1.5 transition-all"
                    title="Gemini AIで抽出解析"
                    disabled={aiIsLoading}
                  >
                    <Sparkles className="w-3.5 h-3.5" /> ✦ <span className="hidden sm:inline">AI解析</span>
                  </button>
                </div>
              </div>
            </div>

            {/* CONTENT SPLIT EDITOR PANE */}
            <div className="flex-1 flex overflow-hidden relative print:overflow-visible print:bg-white print:border-none print:m-0 print:p-0">
              <div className="flex-1 flex flex-col overflow-hidden relative print:overflow-visible print:bg-white print:border-none print:m-0 print:p-0">
                {showSourceMemo && (activeNote.columnJ || activeNote.rawContent) && (
                  <div className="mx-auto mt-6 md:mt-8 w-[99%] max-w-3xl p-4 bg-[#0d1117] border border-[#30363d] rounded-lg animate-in fade-in flex flex-col shrink-0 max-h-[58vh] print:hidden">
                    <div className="text-xs text-gray-400 font-semibold mb-3 flex flex-shrink-0 items-center justify-between border-b border-[#30363d] pb-2">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 text-blue-400 font-medium">
                          <FileText className="w-4 h-4" />
                          <span>記事全文 (I列)</span>
                        </div>
                        <div className="flex items-center gap-1 bg-[#161b22] p-0.5 rounded border border-[#30363d]">
                          <span className="text-gray-500 px-1">文字:</span>
                          <button 
                            onClick={() => setSourceMemoFontSize("text-base")} 
                            className={`px-2.5 py-1 rounded-sm transition-colors ${sourceMemoFontSize === "text-base" ? "bg-[#30363d] text-gray-200" : "text-gray-500 hover:text-gray-300"}`}
                            title="小サイズ"
                          >
                            小
                          </button>
                          <button 
                            onClick={() => setSourceMemoFontSize("text-lg")} 
                            className={`px-2.5 py-1 rounded-sm transition-colors ${sourceMemoFontSize === "text-lg" ? "bg-[#30363d] text-gray-200" : "text-gray-500 hover:text-gray-300"}`}
                            title="中サイズ"
                          >
                            中
                          </button>
                          <button 
                            onClick={() => setSourceMemoFontSize("text-xl")} 
                            className={`px-2.5 py-1 rounded-sm transition-colors ${sourceMemoFontSize === "text-xl" ? "bg-[#30363d] text-gray-200" : "text-gray-500 hover:text-gray-300"}`}
                            title="大サイズ"
                          >
                            大
                          </button>
                        </div>
                        <div className="flex items-center gap-1 bg-[#161b22] p-0.5 rounded border border-[#30363d]">
                          <span className="text-gray-500 px-1">行間:</span>
                          <button 
                            onClick={() => setSourceMemoLineHeight("1.2")} 
                            className={`px-2.5 py-1 rounded-sm transition-colors ${sourceMemoLineHeight === "1.2" ? "bg-[#30363d] text-gray-200" : "text-gray-500 hover:text-gray-300"}`}
                            title="狭い"
                          >
                            狭
                          </button>
                          <button 
                            onClick={() => setSourceMemoLineHeight("1.5")} 
                            className={`px-2.5 py-1 rounded-sm transition-colors ${sourceMemoLineHeight === "1.5" ? "bg-[#30363d] text-gray-200" : "text-gray-500 hover:text-gray-300"}`}
                            title="標準 (フォントサイズの半分)"
                          >
                            普
                          </button>
                          <button 
                            onClick={() => setSourceMemoLineHeight("2.0")} 
                            className={`px-2.5 py-1 rounded-sm transition-colors ${sourceMemoLineHeight === "2.0" ? "bg-[#30363d] text-gray-200" : "text-gray-500 hover:text-gray-300"}`}
                            title="広い"
                          >
                            広
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={async () => {
                            const fullTxt = activeNote.columnJ || activeNote.rawContent || "";
                            if (fullTxt) {
                              await copyToClipboard(fullTxt, "記事全文をコピーしました");
                            }
                          }}
                          className="p-1 px-2.5 bg-transparent border border-[#30363d] text-xs text-gray-400 hover:text-white hover:bg-[#30363d] font-medium rounded-md cursor-pointer flex items-center gap-1.5 transition-all"
                          title="全文をコピー"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>コピー</span>
                        </button>
                        <button onClick={() => setShowSourceMemo(false)} className="hover:text-gray-200 cursor-pointer p-1">✕</button>
                      </div>
                    </div>
                    <div 
                      className={`${sourceMemoFontSize} text-[var(--text)] whitespace-pre-wrap overflow-y-auto custom-scrollbar pr-2 flex-1 select-text`}
                      style={{ fontFamily: "var(--font-sans)", lineHeight: sourceMemoLineHeight }}
                    >
                      {activeNote.columnJ || activeNote.rawContent}
                    </div>
                  </div>
                )}

                {mode === "edit" ? (
                  <textarea
                    ref={editorRef}
                    id="editor"
                    className="flex-1 p-6 md:p-8 bg-transparent text-[var(--text)] font-mono text-sm leading-relaxed overflow-y-auto outline-none border-0 resize-none select-text print:hidden"
                    placeholder="ここにメモを書きましょう。&#10;[[ノート名]] と書くと自動的につながり（リンク）になります。"
                    value={activeNote.content}
                    onChange={(e) => handleNoteContentChange(e.target.value)}
                    onKeyDown={handleEditorKeyDown}
                  />
                ) : (
                  <div id="preview" className="flex-1 p-6 md:p-8 overflow-y-auto block md select-text print:p-0 print:m-0 print:overflow-visible">
                    <h1 className="hidden print:block text-3xl font-bold mb-6 text-black border-b pb-2">{activeNote.title || "Untitled Note"}</h1>
                    {renderMarkdownToElements(activeNote.content)}
                  </div>
                )}

                {/* Floating Autocomplete popup snippet */}
                {suggest.show && (
                  <div
                    className="absolute bg-[#161b22] border border-[#30363d] rounded-md z-[1000] shadow-[0_4px_12px_rgba(0,0,0,0.5)] min-w-[200px] overflow-hidden"
                    style={{ top: suggest.top, left: suggest.left }}
                  >
                    {suggest.items.length === 0 ? (
                      <div
                        className={`p-2 px-3 text-xs text-[var(--subtle)] flex items-center gap-2 cursor-pointer transition-colors hover:bg-[#1f2d3d]`}
                        onClick={() => applyWikiLinkSuggestion(-1)}
                      >
                        <Plus className="w-3 h-3 text-[var(--blue)]" />
                        <span>新規作成: [[{suggest.query}]]</span>
                      </div>
                    ) : (
                      suggest.items.map((it, idx) => (
                        <div
                          key={it}
                          className={`p-2 px-3 text-xs text-[var(--text)] flex items-center gap-2 cursor-pointer transition-colors ${
                            idx === suggest.index ? "bg-[#1f2d3d] text-white font-semibold" : "hover:bg-[#1c2128]"
                          }`}
                          onClick={() => applyWikiLinkSuggestion(idx)}
                        >
                          <BookOpen className="w-3 h-3 text-[var(--muted)]" />
                          <span>{it}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* BACKLINKS RIGHT SIDE PANEL */}
              <div className={`w-[210px] min-w-[210px] border-l border-[var(--border)] bg-[var(--surface)] p-4 overflow-y-auto print:hidden ${
                isFullScreen ? "hidden" : "hidden md:block"
              }`}>
                {/* Backlinks */}
                {(() => {
                  const bls = getBacklinks(activeNote.title);
                  return (
                    <div className="mb-6 select-none">
                      <div className="text-[10px] font-bold tracking-wider text-[var(--muted)] uppercase mb-3">
                        バックリンク ({bls.length})
                      </div>
                      {bls.length === 0 ? (
                        <div className="text-[11px] text-[var(--muted)] opacity-50 italic py-1 text-center">リンクなし</div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {bls.map(b => (
                            <div
                              key={b.id}
                              onClick={() => {
                                setActiveId(b.id);
                                setMode("preview");
                                setAiPanelOpen(false);
                              }}
                              className="p-1 px-2 border border-transparent rounded bg-[var(--bg)] hover:bg-[#1c2128] hover:border-[var(--border)] cursor-pointer transition-all min-w-0"
                            >
                              <div className="text-[11px] font-semibold text-[var(--blue)] truncate">
                                ◈ {b.title}
                              </div>
                              <div className="text-[10px] text-[var(--muted)] line-clamp-2 mt-0.5 leading-normal">
                                {b.content.replace(/#\s.+/, "").substring(0, 50)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Outlinks */}
                {(() => {
                  const ols = getOutlinks(activeNote.content);
                  return (
                    <div className="select-none">
                      <div className="text-[10px] font-bold tracking-wider text-[var(--muted)] uppercase mb-3">
                        登録リンク先 ({ols.length})
                      </div>
                      {ols.length === 0 ? (
                        <div className="text-[11px] text-[var(--muted)] opacity-50 italic py-1 text-center">空っぽ</div>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          {ols.map(l => {
                            const foundObj = notes.find(n => n.title.toLowerCase() === l.toLowerCase());
                            const isEmptyNote = foundObj ? (!foundObj.content || foundObj.content.trim().length <= foundObj.title.length + 5) : false;

                            return (
                              <div
                                key={l}
                                onClick={() => handleWikiLinkClick(l)}
                                className={`p-1.5 rounded text-[11px] text-[var(--blue)] hover:bg-[#1c2128] hover:text-white cursor-pointer transition-colors flex items-center justify-between gap-1.5 ${
                                  isEmptyNote ? "opacity-60 italic" : ""
                                }`}
                              >
                                <span className="truncate flex-1">→ {l}</span>
                                {!foundObj && <span className="text-[9px] text-[var(--orange)] border border-[var(--orange)]/30 px-1 rounded-sm flex-shrink-0 font-bold scale-90">新規</span>}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* AI DRAWER BOTTOM PANE */}
            <div
              className={`border-t border-[var(--border)] bg-[#0d1117] transition-all duration-300 overflow-hidden relative ${
                aiPanelOpen ? "max-h-[380px] overflow-y-auto border-t-[3px] border-t-[var(--purple)]/35 shadow-2xl" : "max-h-0"
              }`}
            >
              <div className="p-4 px-6 relative">
                {/* Dismiss Drawer button */}
                <button
                  className="absolute right-5 top-4 border-0 bg-transparent text-xl font-normal text-[var(--muted)] hover:text-white cursor-pointer"
                  onClick={() => setAiPanelOpen(false)}
                >
                  ✕
                </button>

                {aiIsLoading ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-3">
                    <RefreshCw className="w-8 h-8 text-[var(--purple)] animate-spin" />
                    <span className="text-xs text-[var(--subtle)] font-medium animate-pulse">LMMモデルで内容を深く分析中...</span>
                  </div>
                ) : aiResults ? (
                  <div className="flex flex-col gap-4 text-xs">
                    {/* Summary */}
                    {aiResults.summary && (
                      <div>
                        <div className="text-[10px] font-bold text-[var(--purple)] tracking-wider uppercase mb-2">✦ AI要約</div>
                        <div className="p-3 bg-[var(--surface)] border border-[var(--border)] rounded-md text-[var(--subtle)] italic leading-relaxed whitespace-pre-wrap">
                          {aiResults.summary}
                        </div>
                        <button
                          className="mt-2 text-[11px] text-[var(--blue)] border border-[#58a6ff33] rounded p-1.5 px-3 hover:bg-[#58a6ff1a] cursor-pointer font-semibold transition-all flex items-center gap-1"
                          onClick={insertAiSummaryQuote}
                        >
                          <Sparkles className="w-3.5 h-3.5 text-[var(--blue)]" /> この要約の引用を、ノート先頭に挿入
                        </button>
                      </div>
                    )}

                    {/* Extracted Keywords */}
                    {(() => {
                      const allKws = [...new Set([
                        ...(aiResults.keywords || []),
                        ...(aiResults.new_keywords || [])
                      ])];

                      if (allKws.length === 0) return null;
                      return (
                        <div className="mt-1">
                          <div className="text-[10px] font-bold text-[var(--purple)] tracking-wider uppercase mb-2">
                            ✦ 抽出キーワード <span className="text-[9px] text-[var(--muted)] font-normal tracking-wide lowercase italic border-0">（クリックで挿入）</span>
                          </div>
                          <div className="flex flex-wrap gap-2.5">
                            {allKws.map(kw => {
                              const exists = notes.some(n => n.title.toLowerCase() === kw.toLowerCase());
                              const linked = activeNote.content.includes(`[[${kw}]]`);

                              return (
                                <button
                                  key={kw}
                                  className={`p-1 px-3 border rounded-full text-[11px] cursor-pointer transition-all ${
                                    linked ? "opacity-45 line-through border-[var(--border)] bg-[#1c2128]" :
                                    exists ? "text-[var(--blue)] border-[var(--blue)]/40 hover:bg-[#58a6ff15]" :
                                    "text-[var(--orange)] border-[var(--orange)]/40 hover:bg-[#f0883e15]"
                                  }`}
                                  onClick={() => !linked && insertSingleKeyword(kw)}
                                  disabled={linked}
                                >
                                  [[{kw}]] {exists ? "◈" : "New"}
                                </button>
                              );
                            })}
                          </div>
                          <button
                            className="mt-3.5 text-[11.5px] text-purple-300 border border-[var(--purple)]/30 bg-[#a371f710] rounded p-2 px-4 hover:bg-[#a371f720] cursor-pointer font-bold transition-all w-full flex items-center justify-center gap-1.5"
                            onClick={insertAllKeywordsChain}
                          >
                            <Plus className="w-3.5 h-3.5" /> 全てのキーワードをまとめて挿入 (一括Wikiタグ化)
                          </button>
                        </div>
                      );
                    })()}

                    {/* Related links */}
                    {aiResults.related_notes && aiResults.related_notes.length > 0 && (
                      <div className="mt-1">
                        <div className="text-[10px] font-bold text-[var(--purple)] tracking-wider uppercase mb-2">✦ 関連する既存ノート</div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                          {aiResults.related_notes.map((t: string) => {
                            const existsObj = notes.find(n => n.title.toLowerCase() === t.toLowerCase());
                            return (
                              <button
                                key={t}
                                className="text-left p-1.5 border border-[var(--border)] hover:border-[var(--border2)] rounded bg-[var(--surface)] text-[var(--blue)] hover:text-white text-[11px] transition-colors truncate flex items-center gap-1.5"
                                onClick={() => {
                                  if (existsObj) {
                                    setActiveId(existsObj.id);
                                    setAiPanelOpen(false);
                                  }
                                }}
                                disabled={!existsObj}
                              >
                                <span>{existsObj ? "◈" : "◇"}</span>
                                <span className="truncate flex-1">{t}</span>
                              </button>
                            );
                          })}
                        </div>
                        <button
                          className="mt-3 text-[11px] text-[var(--blue)] border border-[#58a6ff33] rounded p-1.5 px-3 hover:bg-[#58a6ff1a] cursor-pointer font-semibold transition-all flex items-center gap-1"
                          onClick={insertRelatedNotesLinks}
                        >
                          <Plus className="w-3.5 h-3.5" /> 関連ノートへのリンクを本文末尾に追記
                        </button>
                      </div>
                    )}

                    {aiResults.visual_structure && (
                      <div className="mt-4 pt-4 border-t border-[var(--border2)]">
                        <div className="text-[10px] font-bold text-[var(--purple)] tracking-wider uppercase mb-2">✦ 抽出された図解 (Mermaid)</div>
                        <pre className="text-[10px] text-[var(--subtle)] whitespace-pre-wrap font-mono p-2 bg-[#0d1117] rounded border border-[var(--border2)] max-h-32 overflow-y-auto mb-2">
                          {aiResults.visual_structure}
                        </pre>
                        <button
                          className="text-[11px] text-[var(--blue)] border border-[#58a6ff33] rounded p-1.5 px-3 hover:bg-[#58a6ff1a] cursor-pointer font-semibold transition-all flex items-center gap-1"
                          onClick={() => {
                            const active = getActiveNote();
                            if (active) {
                              const updated = {
                                ...active,
                                content: active.content + "\n\n" + (aiResults.visual_structure.includes('```mermaid') ? aiResults.visual_structure : "```mermaid\n" + aiResults.visual_structure.trim() + "\n```"),
                                updatedAt: Date.now()
                              };
                              let newList: Note[] = [];
      setNotes(prev => {
        newList = prev.map(n => n.id === active.id ? updated : n);
        triggerLocalSave(newList, active.id);
        return newList;
      });
                              toast("図解（Mermaid）を本文末尾に追記しました ✦");
                            }
                          }}
                        >
                          <Plus className="w-3.5 h-3.5" /> 本文末尾に図解を追記
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-center text-xs text-[var(--muted)] py-6 italic border-0">分析結果なし</p>
                )}
              </div>
            </div>

            {/* METRICS METADATA BAR FOOTERS */}
            <div className="p-1 px-8 border-t border-[var(--border)] text-[10px] text-[var(--muted)] flex gap-4 select-none items-center">
              <span>作成日: {new Date(activeNote.createdAt).toLocaleString("ja-JP")}</span>
              <span>更新日: {new Date(activeNote.updatedAt).toLocaleString("ja-JP")}</span>
              <span className="ml-auto md:ml-0 flex items-center">
                {activeNote.sourceUrl ? (
                  <a
                    href={activeNote.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--blue)] bg-blue-900/30 border border-blue-500/30 px-1.5 py-0.5 rounded flex items-center hover:bg-blue-900/50 transition-colors"
                  >
                    🔗 {activeNote.sourceUrl.split('.').pop()?.split('?')[0].toUpperCase().substring(0, 4) || 'LINK'}
                  </a>
                ) : (
                  <span className="md:hidden text-[var(--purple)] bg-[#a371f710] border border-[#a371f720] px-1.5 py-0.5 rounded">📱 左右スワイプで記事読込</span>
                )}
              </span>
              <span className="ml-auto hidden md:inline">文字数: {activeNote.content.length} 文字</span>
              <span>リンク数: {getOutlinks(activeNote.content).length} 個</span>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-[#0d1117] text-white">
            {/* TITLE SECTION WITH RE-SYNC & NEW NOTE */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="md:hidden p-1.5 border border-[#30363d] bg-[#161b22] rounded-lg hover:bg-[#30363d] cursor-pointer text-white flex items-center justify-center shrink-0"
                  title="メニューを開く"
                >
                  <Menu className="w-5 h-5" />
                </button>
                <div>
                  <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-blue-500/10 text-[var(--blue)] border border-[#58a6ff33] hidden sm:inline-block">◈</span>
                    Connected Notes Analytics Dashboard
                  </h1>
                  <p className="text-xs text-[var(--muted)] mt-1">
                    Bento Layout | WikiLinks & Co-occurrence Network Live Analysis
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCreateNote()}
                  className="p-2 px-4 bg-[#58a6ff15] hover:bg-[#58a6ff28] border border-[#58a6ff44] text-[var(--blue)] text-xs font-semibold rounded-lg cursor-pointer transition-all flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> 新規ノート作成
                </button>
                <button
                  onClick={() => setIsImportOpen(true)}
                  className="p-2 border border-[#30363d] bg-[#161b22] text-xs rounded-lg hover:bg-[#30363d] cursor-pointer text-white"
                  title="外部取り込み"
                >
                  📥
                </button>
                <button
                  onClick={() => setIsSettingsOpen(true)}
                  className="p-2 border border-[#30363d] bg-[#161b22] text-[var(--subtle)] text-xs rounded-lg hover:bg-[#30363d] hover:text-white cursor-pointer"
                  title="AI / 全体設定"
                >
                  <Settings className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* BENTO GRID */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              
              {/* CARD 1: WikiLink Analysis stats (col-span-4) */}
              <div className="md:col-span-4 group hover:border-[#58a6ff44] bg-[#161b22] border border-[#30363d] rounded-xl p-5 relative overflow-hidden transition-all duration-300 flex flex-col justify-between min-h-[180px]">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-bold text-[var(--blue)] tracking-wider uppercase">Overview</span>
                    <h2 className="text-lg font-bold text-white mt-1">WikiLink 分析統計</h2>
                  </div>
                  <span className="text-lg opacity-40 group-hover:opacity-100 group-hover:scale-110 transition-all">📈</span>
                </div>
                
                {(() => {
                  const dashboardNotes = getFilteredNotes(notes, filterStartDate, filterEndDate);
                  const totalDashboardNotesCount = dashboardNotes.length;
                  const existingTitlesSet = new Set(notes.map(n => n.title.toLowerCase()));

                  const dashboardWikiLinks: string[] = [];
                  dashboardNotes.forEach(n => {
                    dashboardWikiLinks.push(...extractWikiLinks(n.content));
                  });
                  const excludedSet = new Set(excludedKeywords.map(k => k.toLowerCase()));
                  const filteredWikiLinks = dashboardWikiLinks.filter(kw => !excludedSet.has(kw.toLowerCase()));
                  const totalDashboardWikiLinksCount = filteredWikiLinks.length;
                  const dashboardKeywords = filteredWikiLinks.filter(kw => !existingTitlesSet.has(kw.toLowerCase()));
                  const dashboardUniqueKeywordsCount = new Set(dashboardKeywords).size;
                  const dashboardFolders = Array.from(new Set(dashboardNotes.map(n => getFolder(n))));
                  const totalDashboardFoldersCount = dashboardFolders.length;

                  return (
                    <div className="grid grid-cols-2 gap-4 my-4">
                      <div>
                        <div className="text-[10px] text-[var(--muted)]">総ノート数</div>
                        <div className="text-xl font-bold text-white">{totalDashboardNotesCount}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[var(--muted)] font-mono">総WikiLink数</div>
                        <div className="text-xl font-bold text-[var(--blue)]">{totalDashboardWikiLinksCount}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[var(--muted)]" title="どことも紐づいていない（実在ノートがない）WikiLink">ユニークキーワード数</div>
                        <div className="text-xl font-bold text-[var(--purple)]">{dashboardUniqueKeywordsCount}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[var(--muted)]">分類カテゴリ数</div>
                        <div className="text-xl font-bold text-[var(--green)]">{totalDashboardFoldersCount}</div>
                      </div>
                    </div>
                  );
                })()}

                <div className="text-[10px] text-[var(--muted)] border-t border-[#30363d] pt-2">
                  ※ キーワードとは、どことも紐づいていない（まだノートが存在しない）[[WikiLink]] のことです
                </div>
              </div>

              {/* CARD 2: Date filter context (col-span-4) */}
              <div className="md:col-span-4 group hover:border-[#a371f744] bg-[#161b22] border border-[#30363d] rounded-xl p-5 relative overflow-hidden transition-all duration-300 flex flex-col justify-between min-h-[180px]">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-bold text-[var(--purple)] tracking-wider uppercase">Filter</span>
                    <h2 className="text-lg font-bold text-white mt-1">対象期間・最適化</h2>
                  </div>
                  <span className="text-lg opacity-40 group-hover:opacity-100 group-hover:scale-110 transition-all">📅</span>
                </div>
                
                <div className="my-3 space-y-1.5 flex-1 flex flex-col justify-center">
                  <div className="flex items-center justify-between text-xs bg-[#0d1117] p-2 rounded border border-[#30363d]">
                    <span className="text-[var(--muted)]">開始日:</span>
                    <span className="font-semibold font-mono text-white">{filterStartDate || "未設定 (最古)"}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs bg-[#0d1117] p-2 rounded border border-[#30363d]">
                    <span className="text-[var(--muted)]">終了日:</span>
                    <span className="font-semibold font-mono text-white">{filterEndDate || "未設定 (最新)"}</span>
                  </div>
                </div>
                
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => {
                      const today = new Date();
                      const yyyy = today.getFullYear();
                      const mm = String(today.getMonth() + 1).padStart(2, "0");
                      const dd = String(today.getDate()).padStart(2, "0");
                      const todayStr = `${yyyy}-${mm}-${dd}`;
                      handleCommonDateFilterChange(todayStr, todayStr);
                      toast("期間を「今日」に設定しました");
                    }}
                    className="flex-1 text-center py-1.5 bg-transparent hover:bg-[var(--border)] border border-[#30363d] text-xs font-semibold rounded-lg text-[var(--subtle)] hover:text-white transition-colors cursor-pointer"
                    title="今日だけをフィルタ表示"
                  >
                    今日
                  </button>
                  <button
                    onClick={() => {
                      const today = new Date();
                      const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
                      const yyyy1 = lastWeek.getFullYear();
                      const mm1 = String(lastWeek.getMonth() + 1).padStart(2, "0");
                      const dd1 = String(lastWeek.getDate()).padStart(2, "0");
                      const yyyy2 = today.getFullYear();
                      const mm2 = String(today.getMonth() + 1).padStart(2, "0");
                      const dd2 = String(today.getDate()).padStart(2, "0");
                      handleCommonDateFilterChange(`${yyyy1}-${mm1}-${dd1}`, `${yyyy2}-${mm2}-${dd2}`);
                      toast("期間を「過去1週間」に設定しました");
                    }}
                    className="flex-1 text-center py-1.5 bg-transparent hover:bg-[var(--border)] border border-[#30363d] text-xs font-semibold rounded-lg text-[var(--subtle)] hover:text-white transition-colors cursor-pointer"
                    title="今日までの1週間をフィルタ表示"
                  >
                    過去1週間
                  </button>
                  <button
                    onClick={() => {
                      handleCommonDateFilterChange("", "");
                      toast("期間フィルタをリセットしました");
                    }}
                    className="flex-1 text-center py-1.5 bg-transparent hover:bg-[var(--border)] border border-[#30363d] text-xs font-semibold rounded-lg text-[var(--subtle)] hover:text-white transition-colors cursor-pointer"
                    title="期間フィルタを解除して全期間を表示"
                  >
                    リセット
                  </button>
                </div>
                <button
                  onClick={() => setIsSettingsOpen(true)}
                  className="w-full text-center py-1.5 bg-transparent hover:bg-[var(--border)] border border-[#30363d] text-xs font-semibold rounded-lg text-[var(--subtle)] hover:text-white transition-colors cursor-pointer mt-2"
                >
                  詳細に期間を設定 ⚙
                </button>
              </div>

              {/* CARD 3: AI Quick Auto Organize category (col-span-4) */}
              <div className="md:col-span-4 group hover:border-[#f0883e44] bg-[#161b22] border border-[#30363d] rounded-xl p-5 relative overflow-hidden transition-all duration-300 flex flex-col justify-between min-h-[180px]">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-bold text-[var(--orange)] tracking-wider uppercase">Auto Category</span>
                    <h2 className="text-lg font-bold text-white mt-1">AI フォルダ自動整理</h2>
                  </div>
                  <span className="text-lg opacity-40 group-hover:opacity-100 group-hover:scale-110 transition-all">✨</span>
                </div>
                
                <div className="my-3 text-xs text-[var(--muted)] leading-relaxed">
                  未分類のノート（「未分類」フォルダにあるもの）をAIで分析し、自律的にフォルダ（タグ）にバッチ分類します。
                </div>

                <button
                  onClick={autoOrganizeWithAIPipeline}
                  className="w-full text-center py-2 bg-[#a371f715] hover:bg-[#a371f728] border border-[#a371f744] text-[var(--purple)] text-xs font-bold rounded-lg cursor-pointer transition-colors"
                >
                  ✦ AI 自動整理パイプライン実行
                </button>
              </div>

              {/* CARD 4: Network preview (col-span-8) */}
              <div
                onClick={() => setIsGraphOpen(true)}
                className="md:col-span-8 group hover:border-[#58a6ff55] bg-[#161b22] border border-[#30363d] rounded-xl p-5 relative overflow-hidden transition-all duration-300 cursor-pointer flex flex-col justify-between min-h-[300px]"
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span className="text-[10px] font-bold text-[var(--blue)] tracking-wider uppercase">Live Network</span>
                    <h2 className="text-lg font-bold text-white mt-0.5">WikiLink 共起・ナレッジ ネットワーク</h2>
                  </div>
                  <span className="text-xs text-[var(--muted)] font-mono flex items-center gap-1">
                    クリックしてフル表示 <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </span>
                </div>
                
                {/* Mini live interactive network representation inside SVG */}
                <div className="flex-1 bg-[#0d1117] rounded-lg border border-[#30363d] overflow-hidden relative flex items-center justify-center p-4">
                  {(() => {
                    const coData = parseCoOccurData(notes, filterStartDate, filterEndDate, 6, excludedKeywords);
                    const topNodes = coData.nodes;
                    
                    if (topNodes.length === 0) {
                      return (
                        <div className="text-xs text-[var(--muted)] italic text-center p-4">
                          ノートに [[WikiLink]] を書くと、自動で共起ネットワークがここに描画されます。
                        </div>
                      );
                    }

                    // Static coordinates for up to 6 nodes
                    const coord = [
                      { x: 150, y: 80 },
                      { x: 300, y: 70 },
                      { x: 100, y: 150 },
                      { x: 250, y: 180 },
                      { x: 380, y: 140 },
                      { x: 210, y: 120 }
                    ];

                    return (
                      <svg viewBox="0 0 500 240" className="w-full h-full">
                        {/* Lines */}
                        {coData.edges.slice(0, 8).map((edge, idx) => {
                          const sLabel = typeof edge.source === 'string' ? edge.source : (edge.source as any).id;
                          const tLabel = typeof edge.target === 'string' ? edge.target : (edge.target as any).id;
                          const sIdx = topNodes.findIndex(n => n.id === sLabel);
                          const tIdx = topNodes.findIndex(n => n.id === tLabel);
                          if (sIdx !== -1 && tIdx !== -1 && coord[sIdx] && coord[tIdx]) {
                            const sPt = coord[sIdx];
                            const tPt = coord[tIdx];
                            return (
                              <line
                                key={idx}
                                x1={sPt.x}
                                y1={sPt.y}
                                x2={tPt.x}
                                y2={tPt.y}
                                stroke="rgba(88, 166, 255, 0.25)"
                                strokeWidth={Math.min(edge.weight * 1.5, 4)}
                                className="animate-pulse"
                              />
                            );
                          }
                          return null;
                        })}

                        {/* Circles & Labels */}
                        {topNodes.slice(0, 6).map((node, idx) => {
                          const pt = coord[idx] || { x: 100 + idx * 50, y: 100 };
                          const size = 12 + Math.min(node.count * 1.5, 12);
                          return (
                            <g key={node.id} className="transition-all hover:scale-105">
                              <circle
                                cx={pt.x}
                                cy={pt.y}
                                r={size}
                                fill={idx === 0 ? "rgba(163, 113, 247, 0.2)" : "rgba(88, 166, 255, 0.15)"}
                                stroke={idx === 0 ? "rgba(163, 113, 247, 0.8)" : "rgba(88, 166, 255, 0.8)"}
                                strokeWidth="1.5"
                              />
                              <circle
                                cx={pt.x}
                                cy={pt.y}
                                r="4"
                                fill={idx === 0 ? "rgb(163, 113, 247)" : "rgb(88, 166, 255)"}
                              />
                              <text
                                x={pt.x}
                                y={pt.y - size - 4}
                                fill="#f0f6fc"
                                fontSize="10"
                                textAnchor="middle"
                                fontWeight="bold"
                                className="pointer-events-none drop-shadow-md select-none"
                              >
                                {node.id}
                              </text>
                            </g>
                          );
                        })}
                      </svg>
                    );
                  })()}
                </div>
              </div>

              {/* CARD 5: Keyword Timeline Contribution Matrix heatmap (col-span-4) */}
              <div
                onClick={() => setIsHeatmapOpen(true)}
                className="md:col-span-4 group hover:border-[#3fb95055] bg-[#161b22] border border-[#30363d] rounded-xl p-5 relative overflow-hidden transition-all duration-300 cursor-pointer flex flex-col justify-between min-h-[300px]"
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span className="text-[10px] font-bold text-[var(--green)] tracking-wider uppercase">Keyword Intensity</span>
                    <h2 className="text-lg font-bold text-white mt-0.5">WikiLink 発現ヒートマップ</h2>
                  </div>
                  <span className="text-lg opacity-40 group-hover:opacity-100 transition-all">🟩</span>
                </div>

                <div className="flex-1 bg-[#0d1117] rounded-lg border border-[#30363d] p-3 flex flex-col gap-3.5 justify-center">
                  {(() => {
                    const hmData = parseHeatmapData(notes, filterStartDate, filterEndDate, 4, excludedKeywords);
                    if (hmData.keywords.length === 0) {
                      return (
                        <div className="text-[10px] text-[var(--muted)] italic text-center">ノートを作成すると表示。</div>
                      );
                    }

                    const maxVal = Math.max(...hmData.matrix.flat(), 1);

                    return (
                      <div className="space-y-4">
                        <div className="text-[10px] text-[var(--muted)] text-right font-mono pr-1">← 古い順 | 最新 10日間 →</div>
                        {hmData.keywords.map((kw, i) => {
                          const rowValues = hmData.matrix[i].slice(-10);
                          return (
                            <div key={kw} className="space-y-1">
                              <div className="flex justify-between items-center pr-1">
                                <span className="text-[10.5px] font-bold text-white truncate max-w-[120px]">
                                  [[{kw}]]
                                </span>
                                <span className="text-[9px] text-[var(--muted)]">
                                  {rowValues.reduce((a, b) => a + b, 0)} 回
                                </span>
                              </div>
                              
                              <div className="grid grid-cols-10 gap-1">
                                {rowValues.map((val, cellIdx) => {
                                  let fillClass = "bg-[#161b22] hover:bg-[#30363d]";
                                  if (val > 0) {
                                    const ratio = val / maxVal;
                                    if (ratio < 0.3) fillClass = "bg-green-900/40 border border-green-700/30";
                                    else if (ratio < 0.6) fillClass = "bg-green-700/60 border border-green-500/40";
                                    else fillClass = "bg-green-500 border border-green-300";
                                  }
                                  return (
                                    <div
                                      key={cellIdx}
                                      className={`h-4.5 rounded transition-all cursor-crosshair ${fillClass}`}
                                      title={`Keyword: ${kw}, Value: ${val}`}
                                    />
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* CARD 6: Dynamic flowing Stream (col-span-6) */}
              <div
                onClick={() => setIsStreamOpen(true)}
                className="md:col-span-6 group hover:border-[#12adff55] bg-[#161b22] border border-[#30363d] rounded-xl p-5 relative overflow-hidden transition-all duration-300 cursor-pointer flex flex-col justify-between min-h-[220px]"
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span className="text-[10px] font-bold text-[var(--blue)] tracking-wider uppercase">Trends Volume</span>
                    <h2 className="text-lg font-bold text-white mt-0.5">時間推移ストリームグラフ</h2>
                  </div>
                  <span className="text-xs text-[var(--muted)] font-mono flex items-center gap-1">
                    表示 <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                  </span>
                </div>

                <div className="flex-1 bg-[#0d1117] rounded-lg border border-[#30363d] overflow-hidden flex items-center justify-center p-2 relative">
                  <svg viewBox="0 0 500 130" className="w-full h-full">
                    <path
                      d="M0,65 C80,30 160,110 240,65 C320,20 400,90 500,55 L500,130 L0,130 Z"
                      fill="url(#gradient-blue)"
                      className="transition-all hover:opacity-95"
                    />
                    <path
                      d="M0,85 C90,60 170,120 250,85 C330,50 420,105 500,75 L500,130 L0,130 Z"
                      fill="url(#gradient-green)"
                      className="transition-all hover:opacity-95"
                    />
                    <path
                      d="M0,100 C100,90 180,115 260,100 C340,85 410,110 500,95 L500,130 L0,130 Z"
                      fill="url(#gradient-orange)"
                      className="transition-all hover:opacity-95"
                    />
                    
                    <defs>
                      <linearGradient id="gradient-blue" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="rgba(88, 166, 255, 0.45)" />
                        <stop offset="100%" stopColor="rgba(88, 166, 255, 0.08)" />
                      </linearGradient>
                      <linearGradient id="gradient-green" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="rgba(63, 185, 80, 0.45)" />
                        <stop offset="100%" stopColor="rgba(63, 185, 80, 0.08)" />
                      </linearGradient>
                      <linearGradient id="gradient-orange" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="rgba(240, 136, 62, 0.35)" />
                        <stop offset="100%" stopColor="rgba(240, 136, 62, 0.05)" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
              </div>

              {/* CARD 7: Category Bubble Chart Density (col-span-6) */}
              <div
                onClick={() => setIsBubbleOpen(true)}
                className="md:col-span-6 group hover:border-[#f0883e55] bg-[#161b22] border border-[#30363d] rounded-xl p-5 relative overflow-hidden transition-all duration-300 cursor-pointer flex flex-col justify-between min-h-[220px]"
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span className="text-[10px] font-bold text-[var(--orange)] tracking-wider uppercase">Density Distribution</span>
                    <h2 className="text-lg font-bold text-white mt-0.5">カテゴリ & キーワードバブル</h2>
                  </div>
                  <span className="text-xs text-[var(--muted)] font-mono flex items-center gap-1">
                    表示 <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                  </span>
                </div>

                <div className="flex-1 bg-[#0d1117] rounded-lg border border-[#30363d] p-3 flex items-center justify-around relative">
                  {(() => {
                    const cats = notes.map(n => getFolder(n));
                    const catCounts: { [c: string]: number } = {};
                    cats.forEach(c => { catCounts[c] = (catCounts[c] || 0) + 1; });
                    
                    let sortedCats = Object.keys(catCounts).sort((a,b)=>catCounts[b]-catCounts[a]).slice(0, 4);
                    if (sortedCats.length === 0) {
                      sortedCats = ["未分類", "タスク", "研究", "アイデア"];
                    }
                    const themeColors = [
                      "rgba(88, 166, 255, 0.25)",
                      "rgba(163, 113, 247, 0.25)",
                      "rgba(63, 185, 80, 0.25)",
                      "rgba(240, 136, 62, 0.25)"
                    ];
                    const borderColors = [
                      "border-[#58a6ff66]",
                      "border-[#a371f766]",
                      "border-[#3fb95066]",
                      "border-[#f0883e66]"
                    ];

                    return (
                      <div className="flex justify-around items-center w-full">
                        {sortedCats.length === 0 ? (
                          <div className="text-xs text-gray-500 italic py-6">
                            ノートがありません (0個)
                          </div>
                        ) : (
                          sortedCats.map((cat, idx) => {
                            const count = catCounts[cat] || 0;
                            const size = 48 + Math.min(count * 10, 40);
                            return (
                              <div
                                key={cat}
                                style={{ width: size, height: size, backgroundColor: themeColors[idx % 4] }}
                                className={`rounded-full flex flex-col items-center justify-center border font-semibold hover:scale-110 transition-all text-center p-1 cursor-pointer shadow-lg ${borderColors[idx % 4]}`}
                              >
                                <span className="text-[10.5px] text-white truncate max-w-full font-bold">{cat}</span>
                                <span className="text-[9px] text-[var(--subtle)] font-semibold mt-0.5">{count}個</span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* CARD 7: Chronology Timeline Bento block (col-span-12) */}
              <div
                onClick={() => setIsTimelineOpen(true)}
                className="md:col-span-12 group hover:border-[#2dd4bf66] bg-[#161b22] border border-[#30363d] rounded-xl p-5 relative overflow-hidden transition-all duration-300 cursor-pointer flex flex-col justify-between min-h-[140px]"
                title="記事から抽出された提携関係、設立日等の日程を時系列に沿って並べたパノラマ年表を表示"
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span className="text-[10px] font-bold text-teal-400 tracking-wider uppercase">Strategic Chronology</span>
                    <h2 className="text-lg font-bold text-white mt-0.5">🗓 戦略ナレッジ時系列年表</h2>
                  </div>
                  <span className="text-xs text-[var(--muted)] font-mono flex items-center gap-1">
                    クリックして年表一覧を表示 <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                  </span>
                </div>

                <div className="flex-1 overflow-hidden mt-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {(() => {
                    const demoExtracted: { date: string, event: string, title?: string }[] = [];
                    const dateRegex = /(?:(\d{4})[./-](\d{1,2})[./-](\d{1,2}))|(?:(\d{4})年\s*(\d{1,2})月(?:\s*(\d{1,2})日)?)/g;
                    
                    for (const note of notes) {
                      const lines = note.content.split(/\n/);
                      for (const line of lines) {
                        dateRegex.lastIndex = 0;
                        const match = dateRegex.exec(line);
                        if (match) {
                          const year = match[1] || match[4];
                          const month = match[2] || match[5];
                          let displayDate = `${year}年`;
                          if (month) displayDate += `${month}月`;
                          
                          demoExtracted.push({
                            date: displayDate,
                            event: line.trim().slice(0, 52) + (line.length > 52 ? "..." : ""),
                            title: note.title
                          });
                          break;
                        }
                      }
                      if (demoExtracted.length >= 3) break;
                    }

                    if (demoExtracted.length === 0) {
                      return (
                        <div className="sm:col-span-3 text-center text-xs text-gray-500 italic py-4 bg-[#0d1117] rounded-lg border border-[#30363d]/50">
                          本文に「2026年3月」など日付を含む記述をノートに作成すると、ここに自動でタイムラインのプレビューが表示されます。
                        </div>
                      );
                    }

                    return demoExtracted.map((ev, idx) => (
                      <div key={idx} className="bg-[#0d1117] border border-[#2d333b] p-3 rounded-lg flex flex-col gap-1 transition group-hover:border-teal-500/30">
                        <span className="text-[10px] font-mono font-bold text-teal-400">{ev.date}</span>
                        <p className="text-[11px] text-gray-300 font-medium truncate">{ev.event}</p>
                        <span className="text-[9px] text-gray-500 truncate mt-1">🏷 源泉: {ev.title}</span>
                      </div>
                    ));
                  })()}
                </div>
              </div>

            </div>
          </div>
        )}
      </div>

      {/* RENDER MODAL INTEGRATIONS */}
      {isHeatmapOpen && (
        <HeatmapModal
          isOpen={isHeatmapOpen}
          onClose={() => setIsHeatmapOpen(false)}
          notes={notes}
          filterStart={filterStartDate}
          filterEnd={filterEndDate}
          excludedKeywords={excludedKeywords}
          onExcludeKeyword={handleExcludeKeyword}
          onIncludeKeyword={handleIncludeKeyword}
          focusNote={activeNote}
        />
      )}

      {isCoOccurOpen && (
        <CoOccurModal
          isOpen={isCoOccurOpen}
          onClose={() => setIsCoOccurOpen(false)}
          notes={notes}
          filterStart={filterStartDate}
          filterEnd={filterEndDate}
          excludedKeywords={excludedKeywords}
          onExcludeKeyword={handleExcludeKeyword}
          onIncludeKeyword={handleIncludeKeyword}
          focusNote={activeNote}
        />
      )}

      {isStreamOpen && (
        <StreamModal
          isOpen={isStreamOpen}
          onClose={() => setIsStreamOpen(false)}
          notes={notes}
          filterStart={filterStartDate}
          filterEnd={filterEndDate}
          excludedKeywords={excludedKeywords}
          onExcludeKeyword={handleExcludeKeyword}
          onIncludeKeyword={handleIncludeKeyword}
          onCopy={copyToClipboard}
          focusNote={activeNote}
        />
      )}

      {isBubbleOpen && (
        <BubbleModal
          isOpen={isBubbleOpen}
          onClose={() => setIsBubbleOpen(false)}
          notes={notes}
          filterStart={filterStartDate}
          filterEnd={filterEndDate}
          excludedKeywords={excludedKeywords}
          onExcludeKeyword={handleExcludeKeyword}
          onIncludeKeyword={handleIncludeKeyword}
          excludedCategories={excludedCategories}
          onExcludeCategory={handleExcludeCategory}
          onIncludeCategory={handleIncludeCategory}
          focusNote={activeNote}
        />
      )}

      {externalExportTarget !== null && (
        <ExternalAiExportModal
          isOpen={externalExportTarget !== null}
          onClose={() => setExternalExportTarget(null)}
          onExport={handleExternalAiExport}
          isBulk={externalExportTarget.type === 'folder'}
          targetName={externalExportTarget.type === 'folder' ? externalExportTarget.folderName : undefined}
        />
      )}

      {isTimelineOpen && (
        <TimelineModal
          isOpen={isTimelineOpen}
          onClose={() => setIsTimelineOpen(false)}
          notes={notes}
          filterStart={filterStartDate}
          filterEnd={filterEndDate}
          onSelectNote={(noteId) => {
            setActiveId(noteId);
            setMode("preview");
          }}
          toast={toast}
          focusNote={activeNote}
        />
      )}

      {isGraphOpen && (
        <KnowledgeGraphModal
          isOpen={isGraphOpen}
          onClose={() => setIsGraphOpen(false)}
          notes={notes}
          onSelectNote={(id) => {
            setActiveId(id);
            setMode("preview");
          }}
          onSaveToast={toast}
          onCreateNoteExt={handleCreateNoteFromExternal}
          apiPost={apiPost}
          onForceRefreshNotes={syncFromServer}
          filterStart={filterStartDate}
          filterEnd={filterEndDate}
          initialCenterNodeId={activeId || undefined}
        />
      )}

      {/* 外部AI JSON適用モーダル */}
      {isExternalPasteOpen && (
        <div className="fixed inset-0 bg-[#0d1117]/80 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-[#161b22] border border-[var(--border2)] rounded-lg w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-3 border-b border-[var(--border2)]">
              <h2 className="text-sm font-bold text-[var(--text)] flex items-center gap-2">
                <Clipboard className="w-4 h-4 text-[#7ee787]" />
                外部AIの結果を適用
              </h2>
              <button onClick={() => setIsExternalPasteOpen(false)} className="text-[var(--subtle)] hover:text-[var(--text)]">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <p className="text-xs text-[var(--subtle)]">外部AI（ChatGPTなど）が生成したJSONをここに貼り付けてください。<br /><span className="text-[10px] text-gray-400">※ 単一ノート用、または一括更新用のJSON配列のどちらでも適用可能です。</span></p>
              <textarea
                className="w-full h-64 p-3 font-mono text-xs bg-[var(--bg)] border border-[var(--border2)] rounded text-[var(--text)] outline-none focus:border-[var(--purple)]"
                placeholder={'{\n  "keywords": [...],\n  "summary": "...",\n  "related_notes": [...]\n}\n\n// または配列\n[\n  { "id": "...", ... }\n]'}
                value={externalPasteText}
                onChange={(e) => setExternalPasteText(e.target.value)}
              />
            </div>
            <div className="p-3 border-t border-[var(--border2)] flex justify-end gap-2">
              <button onClick={() => setIsExternalPasteOpen(false)} className="px-3 py-1.5 text-xs text-[var(--subtle)] hover:bg-[var(--border)] rounded cursor-pointer">キャンセル</button>
              <button onClick={handleApplyExternalJSON} className="px-3 py-1.5 text-xs bg-[var(--purple)] hover:opacity-90 text-white rounded font-bold cursor-pointer">適用する</button>
            </div>
          </div>
        </div>
      )}

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onPromptOpen={() => {
          setIsSettingsOpen(false);
          setIsPromptOpen(true);
        }}
        onSaveToast={toast}
        onFilterChange={handleCommonDateFilterChange}
      />

      <PromptSettingsModal
        isOpen={isPromptOpen}
        onClose={() => setIsPromptOpen(false)}
        onSettingsClick={() => {
          setIsPromptOpen(false);
          setIsSettingsOpen(true);
        }}
        onSaveToast={toast}
      />

      <ImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onCreateNoteExt={(title, content, folder, sUrl) => {
          handleCreateNoteFromExternal(title, content, folder, sUrl);
        }}
        onSaveToast={toast}
        apiPost={apiPost}
        onNotesUpdateBatch={handleBatchUpgradeNotes}
        onSyncExternalSources={handleSyncExternalSources}
        onSyncFromServer={syncFromServer}
        syncStatus={syncStatus}
        syncLabel={syncLabel}
        notesCount={notes.length}
      />

      <ConfirmModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.confirmText}
        cancelText={confirmState.cancelText}
        variant={confirmState.variant}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
      />

      <SyncManagerModal
        isOpen={isSyncManagerOpen}
        onClose={() => setIsSyncManagerOpen(false)}
        onMergeSync={syncFromServer}
        onForceDownload={forceDownloadFromServer}
        onForceUpload={forceUploadToServer}
        syncStatus={syncStatus}
        syncLabel={syncLabel}
        autoSync={autoSync}
        setAutoSync={setAutoSync}
      />

      {/* Batch Folder Link progress modal */}
      {bulkProgress && bulkProgress.isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[200] p-4 animate-in fade-in duration-200">
          <div className="bg-[#1b222c] border border-[#30363d] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-4 border-b border-[#30363d] flex items-center justify-between bg-[#161b22]">
              <div className="flex items-center gap-2">
                <Link2 className="w-5 h-5 text-purple-400" />
                <span className="font-semibold text-gray-100 text-sm">
                  {bulkProgress.mode === "choosing" 
                    ? `「${bulkProgress.folderName}」の相互リンク一括構築` 
                    : `相互リンク構築中...`}
                </span>
              </div>
              {bulkProgress.mode === "choosing" && (
                <button 
                  onClick={() => setBulkProgress(null)} 
                  className="text-gray-400 hover:text-gray-200 text-xs px-2 py-1 rounded hover:bg-[#21262d]"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Body */}
            <div className="p-5 flex-1 overflow-y-auto flex flex-col gap-4 text-xs text-gray-300 leading-relaxed">
              {bulkProgress.mode === "choosing" ? (
                <>
                  <p className="text-gray-400">
                    フォルダ内のメモ <strong>{bulkProgress.total} 件</strong> に対し、その他のメモへの「相互リンク [[タイトル]]」を一括接続します。記事数が増えても精度を犠牲にしない方法を選択してください。
                  </p>
                  
                  <div className="grid grid-cols-1 gap-3 mt-1">
                    {/* Mode AI Option */}
                    <div 
                      className="border border-purple-500/30 bg-purple-500/5 hover:bg-purple-500/10 p-3.5 rounded-xl transition cursor-pointer flex flex-col gap-1"
                      onClick={() => runBulkLinkingProcess("ai")}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-purple-300 text-xs">
                        <Sparkles className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
                        ✦ 精度最高：個別AI解析バッチ (Gemini)
                      </div>
                      <p className="text-[11px] text-gray-400 ml-5 leading-normal">
                        各メモを1件ずつ個別にAI分析し、全体のタイトル辞書と照合。文脈やテーマの潜在的なつながりまで見落とさず、すべての記事で【手動分析と同等の極めて高い抽出精度】を保証します。
                      </p>
                    </div>

                    {/* Mode Local Option */}
                    <div 
                      className="border border-[#30363d] bg-[#161b22] hover:bg-[#21262d] p-3.5 rounded-xl transition cursor-pointer flex flex-col gap-1"
                      onClick={() => runBulkLinkingProcess("local")}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-blue-300 text-xs">
                        <FileText className="w-3.5 h-3.5 text-blue-400" />
                        ⚡ コスト最小：ローカル文字照合 (完全無料)
                      </div>
                      <p className="text-[11px] text-gray-400 ml-5 leading-normal">
                        本文中に他のメモのタイトルがテキストとして直接含まれていれば、100%確実に検出して [[タイトル]] にWikiリンク置換。APIを全く消費せず一瞬で終わります。
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Progress Info */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-[11px] text-gray-400">
                      <span>進捗状況: {bulkProgress.current} / {bulkProgress.total} 件</span>
                      <span>{bulkProgress.total > 0 ? Math.round((bulkProgress.current / bulkProgress.total) * 100) : 0}%</span>
                    </div>
                    {/* Bar */}
                    <div className="w-full bg-[#161b22] h-2 rounded-full overflow-hidden border border-[#30363d]">
                      <div 
                        className={`h-full transition-all duration-300 ${bulkProgress.mode === "ai" ? "bg-purple-600" : "bg-blue-600"}`}
                        style={{ width: `${bulkProgress.total > 0 ? (bulkProgress.current / bulkProgress.total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>

                  {bulkProgress.activeTitle && (
                    <div className="flex items-center gap-2 bg-[#161b22] border border-[#30363d] p-2.5 rounded-lg text-[11px] text-gray-300">
                      <span className="animate-spin text-purple-400 text-xs">✦</span>
                      <span>処理中: <strong className="text-gray-100">「{bulkProgress.activeTitle}」</strong></span>
                    </div>
                  )}

                  {/* Terminal Logs */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-gray-400 uppercase tracking-wider font-mono">一括リンク中継ログ</span>
                    <div className="bg-[#0d1117] border border-[#30363d] p-3 rounded-lg h-40 overflow-y-auto font-mono text-[10px] text-slate-300 flex flex-col gap-1.5 select-text">
                      {bulkProgress.logs.map((log, idx) => (
                        <div key={idx} className="whitespace-pre-wrap leading-relaxed border-l border-purple-500/20 pl-2">
                          {log}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="p-3 bg-[#161b22] border-t border-[#30363d] flex justify-end gap-2">
              {bulkProgress.mode === "choosing" ? (
                <button
                  onClick={() => setBulkProgress(null)}
                  className="px-4 py-1.5 rounded-lg text-xs bg-gray-800 hover:bg-gray-700 text-gray-200 transition cursor-pointer"
                >
                  キャンセル
                </button>
              ) : (
                <>
                  {bulkProgress.current < bulkProgress.total && !bulkProgress.logs.some(l => l.includes("🛑") || l.includes("⚠️")) ? (
                    <button
                      onClick={() => {
                        bulkCancelRef.current = true;
                        toast("処理の中止をリクエストしました...");
                      }}
                      className="px-4 py-1.5 rounded-lg text-xs bg-red-600 hover:bg-red-500 text-white font-medium transition cursor-pointer"
                    >
                      処理を中止
                    </button>
                  ) : (
                    <button
                      onClick={() => setBulkProgress(null)}
                      className="px-5 py-1.5 rounded-lg text-xs bg-purple-600 hover:bg-purple-500 text-white font-medium transition cursor-pointer animate-pulse"
                    >
                      完了
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Central Notification Toast element */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 p-2 px-5 rounded-lg bg-[var(--surface)] text-[var(--bright)] text-xs font-semibold border border-[var(--border2)] shadow-2xl z-[9999] pointer-events-none transition-all duration-300">
          {toastMessage}
        </div>
      )}
    </div>
  );
}