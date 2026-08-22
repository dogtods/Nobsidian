/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Note } from "../types";
import { formatDateStr } from "../utils/graphDataParser";
import { getStoredPrompt, DEFAULT_PROMPTS, PROMPT_KEYS } from "./PromptSettingsModal";
import { LATEST_GAS_SCRIPT } from "../gasScriptCode";
import { 
  HelpCircle, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  FileText, 
  Globe, 
  CheckSquare, 
  Sparkles, 
  Sliders, 
  RotateCcw, 
  Save, 
  ChevronDown, 
  ChevronUp, 
  FileSpreadsheet,
  Copy,
  Check,
  Loader2,
  Activity,
  ArrowDown,
  ArrowRight,
  Database,
  Layers,
  UploadCloud,
  Settings2,
  ExternalLink
} from "lucide-react";

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateNoteExt: (title: string, content: string, folder: string, sourceUrl: string, timestamp?: number) => void;
  onSaveToast: (msg: string) => void;
  apiPost: (body: any) => Promise<any>;
  onNotesUpdateBatch: (newNotes: Note[], overwrite?: boolean) => void;
  onSyncExternalSources?: (options: { 
    raindrop: boolean; 
    drive: boolean; 
    persona?: string; 
    syncPrompt?: string; 
    weeklyReportPrompt?: string; 
    targetSheetName?: string;
    autoReloadApp?: boolean;
  }) => Promise<any>;
  onSyncFromServer?: () => Promise<any>;
  syncStatus?: "idle" | "syncing" | "saved" | "error";
  syncLabel?: string;
  notesCount?: number;
}

export default function ImportModal({ 
  isOpen, 
  onClose, 
  onCreateNoteExt, 
  onSaveToast, 
  apiPost, 
  onNotesUpdateBatch,
  onSyncExternalSources,
  onSyncFromServer,
  syncStatus,
  syncLabel,
  notesCount = 0
}: ImportModalProps) {
  const [activeTab, setActiveTab] = useState<"step_workflow" | "sheet_extract" | "prompts">("step_workflow");

  // ==========================================
  // STEP 1: External Source Data Collection Config
  // ==========================================
  const [gasUrl, setGasUrl] = useState("");
  const [externalSyncSheetName, setExternalSyncSheetName] = useState("");
  const [syncRaindrop, setSyncRaindrop] = useState(true);
  const [syncDrive, setSyncDrive] = useState(true);
  const [showGasUrlHelp, setShowGasUrlHelp] = useState(false);
  const [isCopiedGas, setIsCopiedGas] = useState(false);
  
  // Connection Test state
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [testMessage, setTestMessage] = useState("");

  // External sync execution state
  const [isSyncingExternal, setIsSyncingExternal] = useState(false);
  const [externalSyncStatus, setExternalSyncStatus] = useState<string | null>(null);
  const [externalSyncResult, setExternalSyncResult] = useState<{
    addedCount?: number;
    isTimeOut?: boolean;
    problematicItem?: any;
    message?: string;
  } | null>(null);

  // ==========================================
  // STEP 2: App Display & Sync Config
  // ==========================================
  const [useSameUrlForApp, setUseSameUrlForApp] = useState(true);
  const [appCustomGasUrl, setAppCustomGasUrl] = useState("");
  const [gasSheetName, setGasSheetName] = useState("Notes");
  const [autoReloadApp, setAutoReloadApp] = useState(true);
  const [isSyncingApp, setIsSyncingApp] = useState(false);

  // ==========================================
  // Prompts config
  // ==========================================
  const [activePromptSubTab, setActivePromptSubTab] = useState<"persona" | "sync" | "weekly">("persona");
  const [syncPersonaInput, setSyncPersonaInput] = useState(() => getStoredPrompt("SYSTEM_PERSONA"));
  const [syncPromptInput, setSyncPromptInput] = useState(() => getStoredPrompt("SYNC_PROMPT"));
  const [weeklyReportPromptInput, setWeeklyReportPromptInput] = useState(() => getStoredPrompt("WEEKLY_REPORT_PROMPT"));

  // ==========================================
  // STEP 3: Direct Sheet Extraction / File Import
  // ==========================================
  const [extractSheetUrl, setExtractSheetUrl] = useState("https://docs.google.com/spreadsheets/d/.../edit");
  const [extractSheetName, setExtractSheetName] = useState("未処理データ");
  const [showExtractHelp, setShowExtractHelp] = useState(false);
  const [pendingSheetItems, setPendingSheetItems] = useState<any[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [optimizeTitle, setOptimizeTitle] = useState(false);
  const [overwriteBatch, setOverwriteBatch] = useState(false);

  // File / URL direct import state
  const [importUrl, setImportUrl] = useState("");
  const [importMode, setImportMode] = useState("raw");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingText, setProcessingText] = useState("実行");

  // Load stored configurations on modal open
  useEffect(() => {
    if (isOpen) {
      const storedGasUrl = localStorage.getItem("cn_gas_api_url") || "";
      const storedExtSheet = localStorage.getItem("cn_external_sync_sheet_name") || "Notes";
      const storedAppSheet = localStorage.getItem("cn_gas_sheet_name") || "Notes";

      setGasUrl(storedGasUrl);
      setExternalSyncSheetName(storedExtSheet);
      setGasSheetName(storedAppSheet);
      setAppCustomGasUrl(storedGasUrl);
      setUseSameUrlForApp(true);

      setExtractSheetUrl(localStorage.getItem("cn_extract_sheet_url") || "");
      setExtractSheetName(localStorage.getItem("cn_extract_sheet_name") || (storedExtSheet !== storedAppSheet ? storedExtSheet : "未処理データ"));

      setSyncPersonaInput(getStoredPrompt("SYSTEM_PERSONA"));
      setSyncPromptInput(getStoredPrompt("SYNC_PROMPT"));
      setWeeklyReportPromptInput(getStoredPrompt("WEEKLY_REPORT_PROMPT"));

      setPendingSheetItems([]);
      setSelectedIndices([]);
      setSelectedFile(null);
      setImportUrl("");
      setIsProcessing(false);
      setProcessingText("実行");
      setExternalSyncStatus(null);
      setExternalSyncResult(null);
      setTestStatus("idle");
      setTestMessage("");
    }
  }, [isOpen]);

  // Save current GAS settings to localStorage
  const saveAllSettings = (overrideUrl?: string, overrideExtSheet?: string, overrideAppSheet?: string) => {
    const finalUrl = (overrideUrl !== undefined ? overrideUrl : gasUrl).trim();
    const finalExtSheet = (overrideExtSheet !== undefined ? overrideExtSheet : externalSyncSheetName).trim();
    const finalAppSheet = (overrideAppSheet !== undefined ? overrideAppSheet : gasSheetName).trim();

    if (finalUrl) {
      localStorage.setItem("cn_gas_api_url", finalUrl);
    } else {
      localStorage.removeItem("cn_gas_api_url");
    }

    if (finalExtSheet) {
      localStorage.setItem("cn_external_sync_sheet_name", finalExtSheet);
    } else {
      localStorage.removeItem("cn_external_sync_sheet_name");
    }

    if (finalAppSheet) {
      localStorage.setItem("cn_gas_sheet_name", finalAppSheet);
    } else {
      localStorage.removeItem("cn_gas_sheet_name");
    }
  };

  // Test GAS Connection
  const handleTestConnection = async () => {
    const trimmed = gasUrl.trim();
    if (!trimmed) {
      setTestStatus("error");
      setTestMessage("WebアプリURLが入力されていません。");
      return;
    }
    if (!trimmed.startsWith("https://script.google.com/macros/s/") || !trimmed.endsWith("/exec")) {
      setTestStatus("error");
      setTestMessage("URLの形式が正しくありません。「https://script.google.com/macros/s/〜/exec」の形式（本番デプロイURL）を入力してください。");
      return;
    }

    saveAllSettings(trimmed);
    setTestStatus("testing");
    setTestMessage("GAS Webアプリに接続中...");

    try {
      const targetSheet = externalSyncSheetName.trim() || gasSheetName.trim() || "Notes";
      const testUrl = `${trimmed}?action=getNotes&sheetName=${encodeURIComponent(targetSheet)}`;
      const res = await fetch(`/api/proxy?url=${encodeURIComponent(testUrl)}`);
      const data = await res.json();

      if (!res.ok || data.error) {
        setTestStatus("error");
        setTestMessage(data.error || `接続エラー (HTTP ${res.status})`);
        return;
      }

      setTestStatus("success");
      setTestMessage(`✅ 接続成功！GAS Webアプリは正常に応答しています（指定シート: ${data.sheetName || targetSheet}、ノート数: ${data.notes?.length ?? 0}件）`);
    } catch (e: any) {
      setTestStatus("error");
      setTestMessage(e.message || "接続テストに失敗しました");
    }
  };

  // Copy GAS Code
  const handleCopyGasCode = () => {
    navigator.clipboard.writeText(LATEST_GAS_SCRIPT);
    setIsCopiedGas(true);
    onSaveToast("最新GASコードをクリップボードにコピーしました！");
    setTimeout(() => setIsCopiedGas(false), 3000);
  };

  // Handle External Sync Execution (STEP 1)
  const handleExecuteExternalSync = async () => {
    const trimmedUrl = gasUrl.trim();
    if (!trimmedUrl) {
      onSaveToast("外部データ取り込み用のGAS WebアプリURLを設定してください");
      return;
    }
    if (!syncRaindrop && !syncDrive) {
      onSaveToast("取り込み対象（Raindrop または Googleドライブ）を少なくとも1つ選択してください");
      return;
    }

    const targetExtSheet = externalSyncSheetName.trim() || "Notes";
    saveAllSettings(trimmedUrl, targetExtSheet, gasSheetName);

    setIsSyncingExternal(true);
    setExternalSyncStatus("スプレッドシートへ外部データを収集中・AI解析中...（最大3.5分）");
    setExternalSyncResult(null);

    const syncOptions = {
      raindrop: syncRaindrop,
      drive: syncDrive,
      persona: syncPersonaInput || getStoredPrompt("SYSTEM_PERSONA"),
      syncPrompt: syncPromptInput || getStoredPrompt("SYNC_PROMPT"),
      weeklyReportPrompt: weeklyReportPromptInput || getStoredPrompt("WEEKLY_REPORT_PROMPT"),
      targetSheetName: targetExtSheet,
      autoReloadApp: autoReloadApp
    };

    try {
      let res;
      if (onSyncExternalSources) {
        res = await onSyncExternalSources(syncOptions);
      } else {
        res = await apiPost({ 
          action: "syncExternalSources", 
          options: syncOptions, 
          sheetName: targetExtSheet 
        });
      }

      const added = res?.addedCount || 0;
      setExternalSyncResult({
        addedCount: added,
        isTimeOut: res?.isTimeOut,
        problematicItem: res?.problematicItem,
        message: `${added} 件の新規データをスプレッドシート（シート: ${targetExtSheet}）へ取り込みました ✦`
      });

      onSaveToast(`外部データの自動取り込み完了: ${added} 件追加 (シート: ${targetExtSheet})`);

      // If auto reload is enabled, sync to app
      if (autoReloadApp && onSyncFromServer) {
        await onSyncFromServer();
      }
    } catch (e: any) {
      setExternalSyncResult({
        message: `エラー: ${e.message || String(e)}`
      });
      onSaveToast("外部取り込みエラー: " + e.message);
    } finally {
      setIsSyncingExternal(false);
      setExternalSyncStatus(null);
    }
  };

  // Handle Read Into App (STEP 2)
  const handleReadIntoApp = async () => {
    if (!onSyncFromServer) {
      onSaveToast("同期機能が利用できません");
      return;
    }
    const finalAppUrl = (useSameUrlForApp ? gasUrl : appCustomGasUrl).trim();
    const finalAppSheet = gasSheetName.trim() || "Notes";

    saveAllSettings(finalAppUrl, externalSyncSheetName, finalAppSheet);

    setIsSyncingApp(true);
    try {
      await onSyncFromServer();
      onSaveToast(`スプレッドシート（シート: ${finalAppSheet}）からアプリ画面へデータを同期しました ✦`);
    } catch (e: any) {
      onSaveToast(`アプリ同期エラー: ${e.message || String(e)}`);
    } finally {
      setIsSyncingApp(false);
    }
  };

  // Extract ID from Sheet URL
  const extractSheetId = (input: string) => {
    const match = input.match(/\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : input.trim();
  };

  // Fetch unprocessed data from sheet (STEP 3)
  const fetchSheetData = async () => {
    const sourceSsId = extractSheetId(extractSheetUrl);
    if (!sourceSsId) return onSaveToast("スプレッドシートのURLを入力してください");
    if (!extractSheetName.trim()) return onSaveToast("シート名を入力してください");

    localStorage.setItem("cn_extract_sheet_url", extractSheetUrl.trim());
    localStorage.setItem("cn_extract_sheet_name", extractSheetName.trim());

    onSaveToast("未処理データを取得中...");
    try {
      const res = await apiPost({ 
        action: "fetchUnprocessedHighlights", 
        sourceSsId, 
        sheetName: extractSheetName.trim() 
      });
      if (!res.success) throw new Error(res.error);

      const items = res.items || [];
      setPendingSheetItems(items);
      setSelectedIndices(items.map((_, idx) => idx));
      if (items.length > 0) {
        onSaveToast(`${items.length}件の未処理データを自動選択して取得しました`);
      } else {
        onSaveToast("未処理のデータはありません（すべて処理済です）");
      }
    } catch (e: any) {
      onSaveToast("取得エラー: " + e.message);
    }
  };

  const handleCheckboxChange = (idx: number) => {
    if (selectedIndices.includes(idx)) {
      setSelectedIndices(selectedIndices.filter(i => i !== idx));
    } else {
      setSelectedIndices([...selectedIndices, idx]);
    }
  };

  // Import Selected Sheet Items
  const importSelectedItems = async () => {
    if (selectedIndices.length === 0) return onSaveToast("項目が選択されていません");

    const sourceSsId = extractSheetId(extractSheetUrl);
    const apiKey = localStorage.getItem("cn_gemini_key");
    let importModel = localStorage.getItem("cn_gemini_model") || "gemini-flash-latest";

    setIsProcessing(true);
    setProcessingText("インポート中...");

    const selectedItems = selectedIndices.map(idx => pendingSheetItems[idx]);
    const rowIndices = selectedItems.map(item => item.rowIndex);
    const newNotes: Note[] = [];

    try {
      const batchTitlesMap: { [key: number]: string } = {};

      if (optimizeTitle && apiKey && selectedItems.length > 1) {
        onSaveToast("全記事のタイトルをAIで一括最適化中...");
        try {
          const itemsToProcess = selectedItems.map((item, idx) => ({
            idx,
            title: item.title,
            highlightsSnippet: String(item.highlights || "").substring(0, 300)
          }));

          const prompt = `あなたは優秀なエディターです。以下の各記事データの元のタイトルと本文の断片を読み、それぞれに対して最もよく表す、短くて魅力的な日本語のタイトル（20文字以内）を1つずつ提案してください。
必ず出力は指定のキー（インデックス番号の文字列）に対応するJSONオブジェクトのみとして、説明や余計なマークダウン装飾は一切含めないでください。

入力データ：
${JSON.stringify(itemsToProcess)}

出力形式（例）：
{
  "0": "提案タイトルA",
  "1": "提案タイトルB"
}
`;

          const r = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${importModel}:generateContent?key=${apiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { 
                  temperature: 0.2,
                  maxOutputTokens: 1200,
                  responseMimeType: "application/json"
                }
              })
            }
          );

          if (r.ok) {
            const rd = await r.json();
            let rawText = rd.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "{}";
            if (rawText.startsWith("```")) {
              rawText = rawText.replace(/^```json\s*/, "").replace(/^```\s*/, "").replace(/```$/, "").trim();
            }
            try {
              const parsed = JSON.parse(rawText);
              Object.keys(parsed).forEach((k: any) => {
                const idxNum = parseInt(k, 10);
                if (!isNaN(idxNum) && parsed[k]) {
                  batchTitlesMap[idxNum] = String(parsed[k]).trim();
                }
              });
            } catch (pErr) {
              console.warn("Batch title JSON parse failed", pErr);
            }
          }
        } catch (bErr) {
          console.warn("Batch title AI optimization error", bErr);
        }
      }

      for (let i = 0; i < selectedItems.length; i++) {
        const item = selectedItems[i];
        let title = batchTitlesMap[i] || item.title || "無題";
        
        let cAt = Date.now();
        if (item.saved_at) {
          const parsed = Date.parse(item.saved_at);
          if (!isNaN(parsed)) cAt = parsed;
        }

        const dateFolderName = formatDateStr(cAt).replace(/-/g, "");

        let formatted = `# ${title}\n\n`;
        if (item.highlights) {
          formatted += `${item.highlights}\n\n`;
        }
        if (item.columnI) {
          formatted += `---\n<details><summary>メモを展開する</summary>\n\n${item.columnI}\n</details>\n\n`;
        }
        if (item.url) {
          formatted += `**URL:** [${item.url}](${item.url})\n`;
        }

        const newNote: Note = {
          id: "note_" + (Date.now() + i),
          title: title,
          content: formatted,
          summary: item.highlights || "",
          keywords: item.tags || "",
          createdAt: cAt,
          updatedAt: cAt,
          sourceUrl: item.url || "",
          timeline: item.timeline || "",
          columnJ: item.columnI || ""
        };

        newNotes.push(newNote);
      }

      onNotesUpdateBatch(newNotes, overwriteBatch);

      if (sourceSsId && rowIndices.length > 0) {
        apiPost({
          action: "markHighlightsAsProcessed",
          sourceSsId,
          sheetName: extractSheetName.trim(),
          rowIndices
        }).catch(err => console.error("Failed to mark rows as processed in sheet", err));
      }

      onSaveToast(`${newNotes.length}件のノートを取り込みました ✦`);
      onClose();
    } catch (e: any) {
      onSaveToast("インポートエラー: " + e.message);
    } finally {
      setIsProcessing(false);
      setProcessingText("実行");
    }
  };

  // Direct File / URL Import
  const handleExecuteDirectImport = async () => {
    const apiKey = localStorage.getItem("cn_gemini_key");
    const model = localStorage.getItem("cn_gemini_model") || "gemini-flash-latest";

    if (!selectedFile && !importUrl.trim()) {
      onSaveToast("ファイルを選択するか、Web URLを入力してください");
      return;
    }

    setIsProcessing(true);
    setProcessingText("処理中...");

    try {
      let title = "取り込みメモ";
      let text = "";
      let sourceUrl = "";

      if (selectedFile) {
        title = selectedFile.name.replace(/\.[^/.]+$/, "");
        const rawContent = await selectedFile.text();

        if (selectedFile.name.endsWith(".mht") || selectedFile.name.endsWith(".mhtml")) {
          const boundaryMatch = rawContent.match(/boundary="?([^"\r\n]+)"?/i);
          if (boundaryMatch) {
            const boundary = boundaryMatch[1];
            const parts = rawContent.split("--" + boundary);
            for (const part of parts) {
              if (part.includes("text/html") || part.includes("text/plain")) {
                const bodyStartIndex = part.indexOf("\r\n\r\n");
                if (bodyStartIndex !== -1) {
                  const partBody = part.substring(bodyStartIndex + 4);
                  text = partBody.replace(/<[^>]*>?/gm, " ").replace(/=\r?\n/g, "").replace(/=3D/g, "=").trim();
                  break;
                }
              }
            }
          }
          if (!text) {
            text = rawContent.replace(/<[^>]*>?/gm, " ").substring(0, 5000);
          }
        } else if (selectedFile.name.endsWith(".json")) {
          try {
            const parsed = JSON.parse(rawContent);
            if (Array.isArray(parsed)) {
              const notes: Note[] = parsed.map((item: any, idx: number) => ({
                id: item.id || `note_json_${Date.now()}_${idx}`,
                title: item.title || `JSONノート ${idx + 1}`,
                content: item.content || "",
                summary: item.summary || "",
                keywords: item.keywords || "",
                createdAt: item.createdAt || Date.now(),
                updatedAt: item.updatedAt || Date.now(),
                sourceUrl: item.sourceUrl || "",
                timeline: item.timeline || "",
                columnJ: item.columnJ || ""
              }));
              onNotesUpdateBatch(notes, overwriteBatch);
              onSaveToast(`${notes.length}件のJSONノートを取り込みました ✦`);
              onClose();
              return;
            } else {
              text = JSON.stringify(parsed, null, 2);
            }
          } catch {
            text = rawContent;
          }
        } else {
          text = rawContent;
        }
      } else if (importUrl.trim()) {
        sourceUrl = importUrl.trim();
        title = "Web記事: " + sourceUrl;
        const res = await fetch(`/api/proxy?url=${encodeURIComponent(sourceUrl)}`);
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, "text/html");
        const docTitle = doc.querySelector("title")?.textContent || "";
        if (docTitle) title = docTitle.trim();
        text = doc.body?.innerText || html.replace(/<[^>]*>?/gm, " ").substring(0, 6000);
      }

      if (importMode === "raw" || !apiKey) {
        const formatted = `# ${title}\n\n${text}\n\n${sourceUrl ? `**URL:** [${sourceUrl}](${sourceUrl})` : ""}`;
        onCreateNoteExt(title, formatted, formatDateStr(Date.now()).replace(/-/g, ""), sourceUrl);
        onSaveToast("取り込みが完了しました ✦");
        onClose();
      } else {
        const prompt = importMode === "summarize"
          ? `以下のテキストの要点を簡潔にまとめ、マークダウン形式で要約を作成してください。\n\nテキスト:\n${text.substring(0, 8000)}`
          : `以下のテキストから重要なキーワード、主要な論点、知見を箇条書きで抽出してください。\n\nテキスト:\n${text.substring(0, 8000)}`;

        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.2, maxOutputTokens: 1500 }
            })
          }
        );
        if (!r.ok) throw new Error("AI処理に失敗しました");
        const rd = await r.json();
        const processedText = rd.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const suffix = importMode === "summarize" ? " (要約)" : " (抽出)";
        const finalTitle = title + suffix;
        const formatted = `# ${finalTitle}\n\n${processedText}\n\n---\n<details><summary>元のテキスト</summary>\n\n${text}\n</details>`;
        onCreateNoteExt(finalTitle, formatted, formatDateStr(Date.now()).replace(/-/g, ""), sourceUrl);
        onSaveToast("取り込みとAI処理が完了しました ✦");
        onClose();
      }
    } catch (e: any) {
      onSaveToast("エラー: " + e.message);
      console.error(e);
    } finally {
      setIsProcessing(false);
      setProcessingText("実行");
    }
  };

  // Prompt save / reset
  const handleSavePrompts = () => {
    localStorage.setItem(PROMPT_KEYS.SYSTEM_PERSONA, syncPersonaInput);
    localStorage.setItem(PROMPT_KEYS.SYNC_PROMPT, syncPromptInput);
    localStorage.setItem(PROMPT_KEYS.WEEKLY_REPORT_PROMPT, weeklyReportPromptInput);
    onSaveToast("プロンプト設定を保存しました ✦");
  };

  const handleResetPrompts = () => {
    if (!window.confirm("プロンプト設定を初期値に戻しますか？")) return;
    localStorage.removeItem(PROMPT_KEYS.SYSTEM_PERSONA);
    localStorage.removeItem(PROMPT_KEYS.SYNC_PROMPT);
    localStorage.removeItem(PROMPT_KEYS.WEEKLY_REPORT_PROMPT);
    setSyncPersonaInput(DEFAULT_PROMPTS.SYSTEM_PERSONA);
    setSyncPromptInput(DEFAULT_PROMPTS.SYNC_PROMPT);
    setWeeklyReportPromptInput(DEFAULT_PROMPTS.WEEKLY_REPORT_PROMPT);
    onSaveToast("プロンプトを初期値に戻しました");
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-center justify-center p-4 overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[#1b222c] border border-[#30363d] rounded-2xl w-[720px] max-w-full my-auto shadow-2xl flex flex-col gap-4 animate-[fadeIn_0.15s_ease-out] max-h-[94vh] overflow-y-auto p-6 text-gray-200">
        
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#30363d] pb-3">
          <div>
            <div className="text-base font-bold text-gray-100 flex items-center gap-2">
              <span className="p-1.5 bg-purple-500/20 text-purple-300 rounded-lg text-sm">📥</span>
              <span>ノート・ナレッジの取り込み ＆ 同期ハブ</span>
            </div>
            <p className="text-xs text-gray-400 mt-1 leading-relaxed">
              MHT・Raindropのデータ収集から、フロントエンド画面へのスプレッドシート同期まで順番に設定・実行できます。
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 text-sm px-2.5 py-1 rounded-lg hover:bg-[#21262d] transition"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[#30363d] gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("step_workflow")}
            className={`pb-2.5 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border-b-2 ${
              activeTab === "step_workflow"
                ? "border-purple-500 text-purple-300 shadow-sm"
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>⚡ 1. 外部収集 ➔ アプリ同期 (MHT / Raindrop)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("sheet_extract")}
            className={`pb-2.5 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border-b-2 ${
              activeTab === "sheet_extract"
                ? "border-purple-500 text-purple-300"
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>📋 2. 個別シート抽出 / ファイル取込</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("prompts")}
            className={`pb-2.5 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border-b-2 ${
              activeTab === "prompts"
                ? "border-purple-500 text-purple-300"
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>⚙ 3. AIプロンプト設定</span>
          </button>
        </div>

        {/* TAB 1: Step Workflow (External Sync -> Frontend Sync) */}
        {activeTab === "step_workflow" && (
          <div className="flex flex-col gap-4">

            {/* ========================================================================= */}
            {/* STEP 1: External Source Data Collection Config */}
            {/* ========================================================================= */}
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 flex flex-col gap-3 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-purple-600 text-white font-bold text-[11px] flex items-center justify-center shrink-0">
                    1
                  </span>
                  <span className="text-xs font-bold text-gray-100">
                    外部データ（MHT / Raindrop）の自動収集・書き込み設定
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleCopyGasCode}
                    className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded font-medium bg-purple-500/20 text-purple-300 border border-purple-500/40 hover:bg-purple-500/30 transition cursor-pointer"
                    title="GASエディタに貼り付ける最新スクリプトコードをコピー"
                  >
                    {isCopiedGas ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                    <span>{isCopiedGas ? "コピー完了" : "📋 最新GASコード"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowGasUrlHelp(!showGasUrlHelp)}
                    className="text-[10px] text-gray-400 hover:text-purple-300 flex items-center gap-0.5 cursor-pointer ml-1"
                  >
                    <HelpCircle className="w-3 h-3" />
                    <span>ヘルプ</span>
                  </button>
                </div>
              </div>

              {showGasUrlHelp && (
                <div className="p-3 bg-purple-950/30 border border-purple-500/30 rounded-lg text-[11px] text-purple-200 leading-relaxed space-y-1.5">
                  <p className="font-bold text-purple-300">💡 外部データ自動取り込みの流れ:</p>
                  <p>1. スプレッドシートの「拡張機能」＞「Apps Script」に上記「📋 最新GASコード」を貼り付けて保存します。</p>
                  <p>2. 「デプロイ」＞「新しいデプロイ」で「アクセスできるユーザー：<strong>全員 (Anyone)</strong>」にして発行されたWebアプリURLを下記に入力します。</p>
                  <p>3. 指定した「取り込み先シート」へ、RaindropやドライブMHTの解析データ（A〜M列）が自動追記されます。</p>
                </div>
              )}

              {/* 1-1. GAS Web App URL */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-gray-300 flex items-center justify-between">
                  <span>① 外部データ収集用 GAS WebアプリURL</span>
                  <span className="text-[10px] text-gray-500 font-normal">末尾: /exec</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="flex-1 font-mono text-xs p-2.5 bg-[#0d1117] border border-[#30363d] rounded-lg text-gray-100 outline-none focus:border-purple-500 transition-all"
                    placeholder="https://script.google.com/macros/s/.../exec"
                    value={gasUrl}
                    onChange={(e) => {
                      setGasUrl(e.target.value);
                      setTestStatus("idle");
                      saveAllSettings(e.target.value);
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testStatus === "testing"}
                    className="px-3 py-2 text-xs font-semibold rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/40 hover:bg-purple-500/30 disabled:opacity-50 transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    {testStatus === "testing" ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        確認中...
                      </>
                    ) : (
                      <>
                        <Activity className="w-3.5 h-3.5" />
                        接続テスト
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Test Status Alert */}
              {testStatus !== "idle" && (
                <div className={`p-2.5 rounded-lg text-xs flex items-start gap-2 border leading-relaxed ${
                  testStatus === "success" 
                    ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
                    : testStatus === "error"
                    ? "bg-red-950/40 border-red-500/40 text-red-300"
                    : "bg-blue-950/40 border-blue-500/40 text-blue-300"
                }`}>
                  {testStatus === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />}
                  {testStatus === "error" && <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />}
                  {testStatus === "testing" && <Loader2 className="w-4 h-4 animate-spin text-blue-400 shrink-0 mt-0.5" />}
                  <div className="flex-1">
                    <p className="font-semibold">{testMessage}</p>
                    {testStatus === "error" && (
                      <div className="mt-1 pt-1 border-t border-red-500/20 text-[10px] text-red-200/90 space-y-0.5">
                        <p>・GASで「デプロイ」＞「新しいデプロイ」を実行しましたか？</p>
                        <p>・アクセスできるユーザーが「全員」になっていますか？</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 1-2. Target Sheet Name */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-gray-300 flex items-center justify-between">
                  <span>② 📥 データ収集先シート名（取り込み先シート）</span>
                  <span className="text-[10px] text-gray-500 font-mono">書き込み先タブ</span>
                </label>
                <input
                  type="text"
                  className="w-full font-mono text-xs p-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-gray-100 outline-none focus:border-purple-500 transition-all"
                  placeholder="Notes (例: 未処理データ, Notes, Raindrop_MHT)"
                  value={externalSyncSheetName}
                  onChange={(e) => {
                    setExternalSyncSheetName(e.target.value);
                    saveAllSettings(gasUrl, e.target.value);
                  }}
                />
                <p className="text-[10px] text-gray-400 leading-normal">
                  MHTやRaindropから収集・AI要約したデータ（A〜M列）を書き込むシート名です。（※直接アプリで表示したい場合は <code>Notes</code>、一旦未処理プールに貯めたい場合は <code>未処理データ</code> 等を指定）
                </p>
              </div>

              {/* 1-3. Source checkboxes */}
              <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-2.5 flex flex-col gap-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">収集対象ソース</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={syncRaindrop}
                      onChange={(e) => setSyncRaindrop(e.target.checked)}
                      className="w-3.5 h-3.5 accent-purple-500 cursor-pointer"
                    />
                    <span className="text-xs text-gray-200">Raindrop (Web記事・ブックマーク)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={syncDrive}
                      onChange={(e) => setSyncDrive(e.target.checked)}
                      className="w-3.5 h-3.5 accent-purple-500 cursor-pointer"
                    />
                    <span className="text-xs text-gray-200">Googleドライブ (MHT/PDF解析)</span>
                  </label>
                </div>
              </div>

              {/* 1-4. Execution Button */}
              <button
                type="button"
                onClick={handleExecuteExternalSync}
                disabled={isSyncingExternal}
                className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs rounded-lg transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSyncingExternal ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{externalSyncStatus || "収集中・解析中（最大3.5分）..."}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-purple-200" />
                    <span>⚡ スプレッドシートへ自動取り込みを実行</span>
                  </>
                )}
              </button>

              {/* Execution Result */}
              {externalSyncResult && (
                <div className="p-3 bg-purple-950/40 border border-purple-500/40 rounded-lg text-xs text-purple-200 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-1">
                    <p className="font-semibold">{externalSyncResult.message}</p>
                    {externalSyncResult.isTimeOut && (
                      <p className="text-[10px] text-amber-300">
                        ※GASの実行制限（3.5分）に達したため一時停止しました。再度ボタンを押すと残りのデータを取り込みます。
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ========================================================================= */}
            {/* Visual Flow Connector Arrow */}
            {/* ========================================================================= */}
            <div className="flex items-center justify-center gap-2 text-gray-400 text-xs py-0.5">
              <ArrowDown className="w-4 h-4 text-purple-400 animate-bounce" />
              <span className="font-semibold text-purple-300">取り込んだデータをアプリ画面（フロントエンド）に表示・同期</span>
              <ArrowDown className="w-4 h-4 text-purple-400 animate-bounce" />
            </div>

            {/* ========================================================================= */}
            {/* STEP 2: App Display & Frontend Sync Config */}
            {/* ========================================================================= */}
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-600 text-white font-bold text-[11px] flex items-center justify-center shrink-0">
                    2
                  </span>
                  <span className="text-xs font-bold text-gray-100">
                    アプリ画面（フロントエンド）への表示・同期設定
                  </span>
                </div>
                <span className="text-[10px] text-gray-400 font-mono bg-[#21262d] px-2 py-0.5 rounded">
                  現在のノート数: <strong className="text-purple-300">{notesCount}件</strong>
                </span>
              </div>

              {/* 2-1. URL matching */}
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-gray-300">
                  <input
                    type="checkbox"
                    checked={useSameUrlForApp}
                    onChange={(e) => {
                      setUseSameUrlForApp(e.target.checked);
                      if (e.target.checked) {
                        saveAllSettings(gasUrl, externalSyncSheetName, gasSheetName);
                      }
                    }}
                    className="w-3.5 h-3.5 accent-purple-500 cursor-pointer"
                  />
                  <span>ステップ1と同じGAS WebアプリURLを使用する（推奨）</span>
                </label>

                {!useSameUrlForApp && (
                  <div className="mt-1 flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-gray-300">アプリ同期専用 GAS WebアプリURL</label>
                    <input
                      type="text"
                      className="w-full font-mono text-xs p-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-gray-100 outline-none focus:border-purple-500 transition-all"
                      placeholder="https://script.google.com/macros/s/.../exec"
                      value={appCustomGasUrl}
                      onChange={(e) => {
                        setAppCustomGasUrl(e.target.value);
                        saveAllSettings(e.target.value);
                      }}
                    />
                  </div>
                )}
              </div>

              {/* 2-2. App Sheet Name */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-gray-300 flex items-center justify-between">
                  <span>📄 アプリ画面表示・双方向編集用シート名</span>
                  <span className="text-[10px] text-gray-500 font-mono">メインノートタブ</span>
                </label>
                <input
                  type="text"
                  className="w-full font-mono text-xs p-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-gray-100 outline-none focus:border-purple-500 transition-all"
                  placeholder="Notes (例: Notes, 調査用メモ)"
                  value={gasSheetName}
                  onChange={(e) => {
                    setGasSheetName(e.target.value);
                    saveAllSettings(gasUrl, externalSyncSheetName, e.target.value);
                  }}
                />
                <p className="text-[10px] text-gray-400 leading-normal">
                  本アプリのノート一覧、ナレッジグラフ、エディタと双方向同期するシートです（通常は <code>Notes</code>）。
                  {externalSyncSheetName && externalSyncSheetName !== gasSheetName && (
                    <span className="block text-amber-300/90 mt-0.5">
                      ※ステップ1の収集先シート（<code>{externalSyncSheetName}</code>）と異なるため、収集データをアプリに反映させるには「📋 2. 個別シート抽出」タブから選択して取り込んでください。
                    </span>
                  )}
                </p>
              </div>

              {/* 2-3. Read and Sync */}
              <div className="flex flex-col gap-2 pt-1 border-t border-[#30363d]">
                <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] text-gray-300">
                  <input
                    type="checkbox"
                    checked={autoReloadApp}
                    onChange={(e) => setAutoReloadApp(e.target.checked)}
                    className="w-3.5 h-3.5 accent-purple-500 cursor-pointer"
                  />
                  <span>外部データ収集（ステップ1）完了時にアプリ画面へ自動反映（リロード）する</span>
                </label>

                <button
                  type="button"
                  onClick={handleReadIntoApp}
                  disabled={isSyncingApp}
                  className="w-full py-2 bg-[#21262d] hover:bg-[#30363d] text-gray-100 font-semibold text-xs rounded-lg border border-[#30363d] hover:border-purple-400/50 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSyncingApp ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
                      <span>スプレッドシートから読み込み中...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 text-purple-400" />
                      <span>🔄 スプレッドシートからアプリ画面へデータを読み込む（同期）</span>
                    </>
                  )}
                </button>
              </div>

            </div>

          </div>
        )}

        {/* TAB 2: Direct Sheet Extraction / File Import */}
        {activeTab === "sheet_extract" && (
          <div className="flex flex-col gap-4">
            
            {/* Section A: Extract Unprocessed Rows from Specific Sheet */}
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-gray-100 flex items-center gap-1.5">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                  <span>A. 取り込み元シート（未処理ハイライト）から抽出・コピペ</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowExtractHelp(!showExtractHelp)}
                  className="text-[10px] text-gray-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                >
                  <HelpCircle className="w-3 h-3" />
                  <span>使い方</span>
                </button>
              </div>

              {showExtractHelp && (
                <div className="p-3 bg-emerald-950/30 border border-emerald-500/30 rounded-lg text-[11px] text-emerald-200 leading-relaxed space-y-1">
                  <p>1. ハイライトや外部収集データが入っているスプレッドシートのURLを入力します。</p>
                  <p>2. その中の対象シート名（例: <code>未処理データ</code> や <code>シート1</code>）を指定します。</p>
                  <p>3. 「未処理データ一覧を取得」を押すと、まだ処理されていない行（<code>nobsidian</code> 列が空欄の行）を抽出し、選択した項目を本アプリ（取り込み先）へインポートします。</p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-gray-400 mb-0.5 block">スプレッドシートURL / ID:</span>
                  <input
                    type="text"
                    className="w-full text-xs p-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-gray-100 font-mono outline-none focus:border-emerald-500"
                    placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                    value={extractSheetUrl}
                    onChange={(e) => setExtractSheetUrl(e.target.value)}
                  />
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 mb-0.5 block">対象シート名（タブ名）:</span>
                  <input
                    type="text"
                    className="w-full text-xs p-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-gray-100 font-mono outline-none focus:border-emerald-500"
                    placeholder="未処理データ (例: シート1, 未処理データ)"
                    value={extractSheetName}
                    onChange={(e) => setExtractSheetName(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="button"
                className="w-full py-2 bg-[#21262d] hover:bg-[#30363d] text-xs border border-[#30363d] rounded-lg text-gray-100 font-semibold cursor-pointer transition flex items-center justify-center gap-1.5"
                onClick={fetchSheetData}
                disabled={isProcessing}
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                <span>未処理データ一覧を取得</span>
              </button>

              {/* Pending Items Table */}
              {pendingSheetItems.length > 0 && (
                <div className="flex flex-col gap-2 mt-2 bg-[#0d1117] p-3 rounded-lg border border-[#30363d]">
                  <div className="flex items-center justify-between text-xs text-gray-300">
                    <span>取得件数: <strong>{pendingSheetItems.length}件</strong> (選択中: {selectedIndices.length}件)</span>
                    <button
                      type="button"
                      className="text-[10px] text-purple-300 hover:underline cursor-pointer"
                      onClick={() => {
                        if (selectedIndices.length === pendingSheetItems.length) setSelectedIndices([]);
                        else setSelectedIndices(pendingSheetItems.map((_, i) => i));
                      }}
                    >
                      {selectedIndices.length === pendingSheetItems.length ? "全解除" : "全選択"}
                    </button>
                  </div>

                  <div className="max-h-48 overflow-y-auto border border-[#30363d] rounded-md divide-y divide-[#30363d]">
                    {pendingSheetItems.map((item, idx) => (
                      <label
                        key={idx}
                        className="flex items-start gap-2 p-2 hover:bg-[#161b22] cursor-pointer text-xs transition"
                      >
                        <input
                          type="checkbox"
                          checked={selectedIndices.includes(idx)}
                          onChange={() => handleCheckboxChange(idx)}
                          className="mt-0.5 accent-purple-500"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-200 truncate">{item.title || "無題"}</p>
                          <p className="text-[10px] text-gray-400 truncate">{item.highlights || item.url || "内容なし"}</p>
                        </div>
                      </label>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-[#30363d]">
                    <label className="flex items-center gap-1.5 text-[11px] text-gray-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={optimizeTitle}
                        onChange={(e) => setOptimizeTitle(e.target.checked)}
                        className="accent-purple-500"
                      />
                      <span>AIでタイトルを自動最適化</span>
                    </label>
                    <button
                      type="button"
                      onClick={importSelectedItems}
                      disabled={isProcessing || selectedIndices.length === 0}
                      className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-lg transition cursor-pointer disabled:opacity-50"
                    >
                      {isProcessing ? processingText : `選択した ${selectedIndices.length} 件をアプリへ取り込む`}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Section B: Direct File / URL Import */}
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 flex flex-col gap-3">
              <label className="text-xs font-bold text-gray-100 flex items-center gap-1.5">
                <UploadCloud className="w-4 h-4 text-blue-400" />
                <span>B. ローカルファイル / Web URL からの直接取り込み</span>
              </label>

              <div className="flex flex-col gap-2">
                <input
                  type="file"
                  accept=".mht,.mhtml,.md,.markdown,.txt,.json"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="text-xs text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-purple-600/20 file:text-purple-300 hover:file:bg-purple-600/30 cursor-pointer"
                />

                <input
                  type="text"
                  placeholder="または Web記事のURL (https://...)"
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  className="w-full text-xs p-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-gray-100 outline-none focus:border-blue-500"
                />

                <div className="flex items-center gap-3 text-xs text-gray-300">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="importMode"
                      value="raw"
                      checked={importMode === "raw"}
                      onChange={(e) => setImportMode(e.target.value)}
                      className="accent-purple-500"
                    />
                    <span>生テキストのまま</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="importMode"
                      value="summarize"
                      checked={importMode === "summarize"}
                      onChange={(e) => setImportMode(e.target.value)}
                      className="accent-purple-500"
                    />
                    <span>AI要約を生成</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="importMode"
                      value="extract"
                      checked={importMode === "extract"}
                      onChange={(e) => setImportMode(e.target.value)}
                      className="accent-purple-500"
                    />
                    <span>知見・論点を抽出</span>
                  </label>
                </div>

                <button
                  type="button"
                  onClick={handleExecuteDirectImport}
                  disabled={isProcessing || (!selectedFile && !importUrl.trim())}
                  className="w-full py-2 bg-[#21262d] hover:bg-[#30363d] text-xs border border-[#30363d] rounded-lg text-gray-100 font-semibold cursor-pointer transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <UploadCloud className="w-3.5 h-3.5 text-blue-400" />
                  <span>{isProcessing ? processingText : "ファイル / URLを取り込む"}</span>
                </button>
              </div>
            </div>

          </div>
        )}

        {/* TAB 3: Prompts Configuration */}
        {activeTab === "prompts" && (
          <div className="flex flex-col gap-3">
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-100 flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-purple-400" />
                  <span>AIプロンプトのカスタマイズ</span>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleResetPrompts}
                    className="text-[10px] text-gray-400 hover:text-red-400 flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>初期値に戻す</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSavePrompts}
                    className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-lg transition cursor-pointer flex items-center gap-1"
                  >
                    <Save className="w-3 h-3" />
                    <span>保存</span>
                  </button>
                </div>
              </div>

              {/* Sub tabs */}
              <div className="flex gap-2 border-b border-[#30363d] pb-2">
                <button
                  type="button"
                  onClick={() => setActivePromptSubTab("persona")}
                  className={`text-xs px-2.5 py-1 rounded-md transition ${
                    activePromptSubTab === "persona"
                      ? "bg-purple-600/30 text-purple-200 font-bold"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  システムペルソナ
                </button>
                <button
                  type="button"
                  onClick={() => setActivePromptSubTab("sync")}
                  className={`text-xs px-2.5 py-1 rounded-md transition ${
                    activePromptSubTab === "sync"
                      ? "bg-purple-600/30 text-purple-200 font-bold"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  外部データ同期 (SYNC_PROMPT)
                </button>
                <button
                  type="button"
                  onClick={() => setActivePromptSubTab("weekly")}
                  className={`text-xs px-2.5 py-1 rounded-md transition ${
                    activePromptSubTab === "weekly"
                      ? "bg-purple-600/30 text-purple-200 font-bold"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  週次レポート (WEEKLY_REPORT)
                </button>
              </div>

              {activePromptSubTab === "persona" && (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-gray-400">Gemini AIの分析ペルソナ・基本方針:</span>
                  <textarea
                    rows={8}
                    className="w-full text-xs font-mono p-2.5 bg-[#0d1117] border border-[#30363d] rounded-lg text-gray-200 outline-none focus:border-purple-500"
                    value={syncPersonaInput}
                    onChange={(e) => setSyncPersonaInput(e.target.value)}
                  />
                </div>
              )}

              {activePromptSubTab === "sync" && (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-gray-400">Raindrop / MHT データ解析・要約プロンプト:</span>
                  <textarea
                    rows={8}
                    className="w-full text-xs font-mono p-2.5 bg-[#0d1117] border border-[#30363d] rounded-lg text-gray-200 outline-none focus:border-purple-500"
                    value={syncPromptInput}
                    onChange={(e) => setSyncPromptInput(e.target.value)}
                  />
                </div>
              )}

              {activePromptSubTab === "weekly" && (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-gray-400">週次レポート生成プロンプト:</span>
                  <textarea
                    rows={8}
                    className="w-full text-xs font-mono p-2.5 bg-[#0d1117] border border-[#30363d] rounded-lg text-gray-200 outline-none focus:border-purple-500"
                    value={weeklyReportPromptInput}
                    onChange={(e) => setWeeklyReportPromptInput(e.target.value)}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end pt-3 border-t border-[#30363d]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium transition cursor-pointer"
          >
            閉じる
          </button>
        </div>

      </div>
    </div>
  );
}
