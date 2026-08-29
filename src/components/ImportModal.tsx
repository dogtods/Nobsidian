/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Note } from "../types";
import { formatDateStr } from "../utils/graphDataParser";
import { getStoredPrompt, DEFAULT_PROMPTS, PROMPT_KEYS } from "./PromptSettingsModal";
import { SYNC_AND_SAVE_GAS_SCRIPT } from "../gasScriptCode";
import { fetchGasGet, fetchGasPost, sanitizeGasUrl } from "../utils/gasClient";
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
  ExternalLink,
  Link
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
    driveSourceFolder?: string;
    driveProcessedFolder?: string; 
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
  const [activeTab, setActiveTab] = useState<"hub_config" | "step_2" | "prompts">("hub_config");
  const [driveSourceFolderInput, setDriveSourceFolderInput] = useState("");
  const [driveProcessedFolderInput, setDriveProcessedFolderInput] = useState("");

  // ==========================================
  // STEP 1: External Source Data Collection Config
  // ==========================================
  const [gasUrl, setGasUrl] = useState("");
  const [externalSyncSheetName, setExternalSyncSheetName] = useState("");
  const [syncRaindrop, setSyncRaindrop] = useState(false);
  const [syncDrive, setSyncDrive] = useState(true);
  const [showGasUrlHelp, setShowGasUrlHelp] = useState(false);
  const [isCopiedSyncSave, setIsCopiedSyncSave] = useState(false);
  
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
  // Prompts config
  // ==========================================
  const [activePromptSubTab, setActivePromptSubTab] = useState<"persona" | "sync" | "weekly">("persona");
  const [syncPersonaInput, setSyncPersonaInput] = useState(() => getStoredPrompt("SYSTEM_PERSONA"));
  const [syncPromptInput, setSyncPromptInput] = useState(() => getStoredPrompt("SYNC_PROMPT"));
  const [weeklyReportPromptInput, setWeeklyReportPromptInput] = useState(() => getStoredPrompt("WEEKLY_REPORT_PROMPT"));

  // ==========================================
  // STEP 2: Direct Sheet Extraction / File Import
  // ==========================================
  const [extractSheetUrl, setExtractSheetUrl] = useState("https://docs.google.com/spreadsheets/d/.../edit");
  const [extractSheetName, setExtractSheetName] = useState("未処理データ");
  const [targetSsUrl, setTargetSsUrl] = useState(() => localStorage.getItem("cn_target_ss_url") || "");
  const [gasSheetName, setGasSheetName] = useState(() => localStorage.getItem("cn_gas_sheet_name") || "Notes");
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
      setGasSheetName(storedAppSheet);
      setTargetSsUrl(localStorage.getItem("cn_target_ss_url") || "");

      setGasUrl(storedGasUrl);
      setExternalSyncSheetName(storedExtSheet);
      setDriveSourceFolderInput(localStorage.getItem("cn_drive_source_folder") || "");
      setDriveProcessedFolderInput(localStorage.getItem("cn_drive_processed_folder") || "");

      const storedRaindrop = localStorage.getItem("cn_sync_raindrop");
      setSyncRaindrop(storedRaindrop !== null ? storedRaindrop === "true" : false);

      const storedDrive = localStorage.getItem("cn_sync_drive");
      setSyncDrive(storedDrive !== null ? storedDrive === "true" : true);

      setExtractSheetUrl(localStorage.getItem("cn_extract_sheet_url") || "");
      setExtractSheetName(localStorage.getItem("cn_extract_sheet_name") || storedExtSheet);

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
  const saveAllSettings = (overrideUrl?: string, overrideExtSheet?: string) => {
    const finalUrl = (overrideUrl !== undefined ? overrideUrl : gasUrl).trim();
    const finalExtSheet = (overrideExtSheet !== undefined ? overrideExtSheet : externalSyncSheetName).trim();

    if (finalUrl) {
      localStorage.setItem("cn_gas_api_url", finalUrl);
    } else {
      localStorage.removeItem("cn_gas_api_url");
    }

    if (driveSourceFolderInput) localStorage.setItem("cn_drive_source_folder", driveSourceFolderInput.trim());
    else localStorage.removeItem("cn_drive_source_folder");

    if (driveProcessedFolderInput) localStorage.setItem("cn_drive_processed_folder", driveProcessedFolderInput.trim());
    else localStorage.removeItem("cn_drive_processed_folder");

    if (finalExtSheet) {
      localStorage.setItem("cn_external_sync_sheet_name", finalExtSheet);
    } else {
      localStorage.removeItem("cn_external_sync_sheet_name");
    }
  };

  // Test GAS Connection
  const handleTestConnection = async () => {
    // Sanitize URL (strip quotes, spaces, newlines, fullwidth spaces)
    const cleaned = sanitizeGasUrl(gasUrl);
    if (cleaned !== gasUrl) {
      setGasUrl(cleaned);
    }

    if (!cleaned) {
      setTestStatus("error");
      setTestMessage("WebアプリURLが入力されていません。");
      return;
    }
    if (!cleaned.startsWith("https://script.google.com/macros/s/") || !cleaned.endsWith("/exec")) {
      setTestStatus("error");
      setTestMessage("URLの形式が正しくありません。「https://script.google.com/macros/s/.../exec」の形式（本番デプロイURL）を入力してください。末尾が /dev のテストURLは動作しません。");
      return;
    }

    saveAllSettings(cleaned);
    setTestStatus("testing");
    setTestMessage("GAS Webアプリに疎通確認中（Pingテスト実行中）...");

    try {
      // Step 1: Base URL Ping Test (confirms Web API deployment and doGet response)
      let pingSuccess = false;
      let pingMessage = "";
      try {
        const pingJson = await fetchGasGet(cleaned);
        if (pingJson && (pingJson.status === "ok" || pingJson.message || pingJson.success !== false)) {
          pingSuccess = true;
          pingMessage = pingJson.message || "GAS Web API は正常に応答しています。";
        }
      } catch (pingErr) {
        // Continue to check via query parameters
      }

      // Step 2: Spreadsheet / Sheet Access Test
      const targetSheet = externalSyncSheetName.trim() || "Notes";
      const data = await fetchGasGet(cleaned, { action: "getNotes", sheetName: targetSheet });

      if (!data || data.error) {
        if (pingSuccess || data?.status === "ok") {
          const errDetail = data?.error || "スプレッドシートへのアクセスに失敗しました";
          setTestStatus("success");
          setTestMessage(`✅ WebアプリのAPI疎通は成功しました！ （※スプレッドシート側: ${errDetail}。シート名「${targetSheet}」またはスクリプトプロパティの SHEET_ID をご確認ください）`);
          return;
        }

        setTestStatus("error");
        setTestMessage(data?.error || `接続エラーが発生しました`);
        return;
      }

      setTestStatus("success");
      setTestMessage(`✅ 接続テスト完全成功！GAS Webアプリ疎通およびスプレッドシート（シート: ${data.sheetName || targetSheet}、現在のノート数: ${data.notes?.length ?? 0}件）の読み取りが確認できました。`);
    } catch (e: any) {
      setTestStatus("error");
      setTestMessage(e.message || "接続テストに失敗しました");
    }
  };

  const handleCopyAiSyncCode = () => {
    navigator.clipboard.writeText(SYNC_AND_SAVE_GAS_SCRIPT);
    setIsCopiedSyncSave(true);
    onSaveToast("統合版GASコードをコピーしました！");
    setTimeout(() => setIsCopiedSyncSave(false), 3000);
  };

  // Handle External Sync Execution (STEP 1)
  const handleExecuteExternalSync = async () => {
    const trimmedUrl = gasUrl.trim();
    if (!trimmedUrl) {
      onSaveToast("GAS WebアプリURLを設定してください");
      return;
    }
    if (!syncRaindrop && !syncDrive) {
      onSaveToast("取り込み対象（Raindrop または Googleドライブ）を少なくとも1つ選択してください");
      return;
    }

    const targetExtSheet = externalSyncSheetName.trim() || "Notes";
    saveAllSettings(trimmedUrl, targetExtSheet);

    setIsSyncingExternal(true);
    setExternalSyncStatus("スプレッドシートへ外部データを収集中・AI解析中...（最大3.5分）");
    setExternalSyncResult(null);

    const syncOptions = {
      raindrop: syncRaindrop,
      drive: syncDrive,
      driveSourceFolder: driveSourceFolderInput.trim(),
      driveProcessedFolder: driveProcessedFolderInput.trim(),
      persona: syncPersonaInput || getStoredPrompt("SYSTEM_PERSONA"),
      syncPrompt: syncPromptInput || getStoredPrompt("SYNC_PROMPT"),
      weeklyReportPrompt: weeklyReportPromptInput || getStoredPrompt("WEEKLY_REPORT_PROMPT"),
      targetSheetName: targetExtSheet
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
      const processed = res?.processedCount || 0;
      let msg = "";
      if (added > 0) {
        msg = `${added} 件の新規データをスプレッドシート（シート: ${targetExtSheet}）へ追加しました（処理ファイル数: ${processed}件） ✦`;
      } else if (processed > 0) {
        msg = `Googleドライブから ${processed} 件のファイルを検出し処理（処理済みフォルダへ移動）しました（新規追加は0件、または既に登録済みです）。`;
      } else {
        msg = `Googleドライブ（指定フォルダ）に対象の未処理データはありませんでした。`;
      }

      setExternalSyncResult({
        addedCount: added,
        isTimeOut: res?.isTimeOut,
        problematicItem: res?.problematicItem,
        message: msg
      });

      onSaveToast(added > 0 ? `外部データの自動取り込み完了: ${added} 件追加 (シート: ${targetExtSheet})` : (processed > 0 ? `ファイル ${processed}件を処理・移動しました` : `指定フォルダに未処理ファイルはありませんでした`));

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

  // Extract ID from Sheet URL
  const extractSheetId = (input: string) => {
    const match = input.match(/\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : input.trim();
  };

  // Fetch unprocessed data from sheet (STEP 2)
  const fetchSheetData = async () => {
    const sourceSsId = extractSheetId(extractSheetUrl);
    if (!sourceSsId) return onSaveToast("スプレッドシートのURLを入力してください");
    if (!extractSheetName.trim()) return onSaveToast("シート名を入力してください");

    localStorage.setItem("cn_extract_sheet_url", extractSheetUrl.trim());
    localStorage.setItem("cn_extract_sheet_name", extractSheetName.trim());

    onSaveToast("未処理データを取得中...");
    try {
      const cleanedUrl = sanitizeGasUrl(gasUrl);
      if (!cleanedUrl || cleanedUrl.includes("YOUR_")) {
        throw new Error("① GAS WebアプリURL を設定してください");
      }
      
      const res = await fetchGasPost(cleanedUrl, { 
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
    if (!sourceSsId) return onSaveToast("スプレッドシートのURLが無効です");

    setIsProcessing(true);
    setProcessingText("インポート中...");

    const selectedItems = selectedIndices.map(idx => pendingSheetItems[idx]);
    const rowIndices = selectedItems.map(item => item.rowIndex);

    try {
      const targetSheetName = gasSheetName.trim() || "Notes";
      const targetSsId = targetSsUrl ? extractSheetId(targetSsUrl) : undefined;
      const cleanedUrl = sanitizeGasUrl(gasUrl);
      if (!cleanedUrl || cleanedUrl.includes("YOUR_")) {
        throw new Error("① GAS WebアプリURL を設定してください");
      }
      const res = await fetchGasPost(cleanedUrl, {
        action: "importRawRowsToApp",
        sourceSsId,
        sheetName: extractSheetName.trim(),
        targetSsId,
        targetSheetName,
        rowIndices
      });

      if (!res.success) throw new Error(res.error || "インポートに失敗しました");

      onSaveToast(`${rowIndices.length}件のデータの登録が完了しました ✦`);
      
      // 成功時に状態をリセット
      setPendingSheetItems([]);
      setSelectedIndices([]);
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
        
        let html = "";
        try {
          const res = await fetch(`/api/proxy?url=${encodeURIComponent(sourceUrl)}`);
          if (res.ok && !res.headers.get("content-type")?.includes("text/html")) {
            html = await res.text();
          } else {
            // Fallback for static hosting where /api/proxy returns index.html or 404
            const fallbackRes = await fetch(sourceUrl);
            html = await fallbackRes.text();
          }
        } catch (fetchErr) {
          try {
            // Direct fetch attempt as a last resort (will likely hit CORS but worth trying)
            const directRes = await fetch(sourceUrl);
            html = await directRes.text();
          } catch (corsErr) {
            throw new Error(`Webページの取得に失敗しました (CORS制約、または通信エラー)。静的ホスティング(GitHub Pages等)の場合、外部サイトへの直接アクセスはブラウザの仕様により制限されます。詳細: ${String(corsErr)}`);
          }
        }

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
            onClick={() => setActiveTab("hub_config")}
            className={`pb-2.5 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border-b-2 ${
              activeTab === "hub_config"
                ? "border-sky-500 text-sky-300"
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
          >
            <Link className="w-3.5 h-3.5" />
            <span>🔗 1. リンク・シート一元管理 & 外部収集・登録</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("step_2")}
            className={`pb-2.5 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border-b-2 ${
              activeTab === "step_2"
                ? "border-emerald-500 text-emerald-300"
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>📁 2. ファイル / Web URL 直接登録</span>
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

        {/* TAB 2: Direct File / URL Import */}
        {activeTab === "step_2" && (
          <div className="flex flex-col gap-4">
            {/* Direct File / URL Import */}
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 flex flex-col gap-3">
              <label className="text-xs font-bold text-gray-100 flex items-center gap-1.5">
                <UploadCloud className="w-4 h-4 text-blue-400" />
                <span>ローカルファイル / Web URL からの直接取り込み</span>
              </label>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                PC内のMHT / Markdownファイルや、Web記事のURLを指定して直接アプリへ取り込みます。
              </p>

              <div className="flex flex-col gap-2.5 mt-1">
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
                  className="flex-1 text-xs p-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-gray-100 outline-none focus:border-blue-500"
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
                  className="flex-1 py-2 bg-[#21262d] hover:bg-[#30363d] text-xs border border-[#30363d] rounded-lg text-gray-100 font-semibold cursor-pointer transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <UploadCloud className="w-3.5 h-3.5 text-blue-400" />
                  <span>{isProcessing ? processingText : "ファイル / URLを取り込む"}</span>
                </button>
              </div>
            </div>

            {/* Notice to Hub Config */}
            <div className="p-3 bg-[#161b22] border border-[#30363d] rounded-xl text-xs text-gray-400 flex items-center justify-between">
              <span>💡 スプレッドシートからの未処理データ抽出・登録は、「1. リンク・シート一元管理」のステップ2から一元的に行えます。</span>
              <button
                type="button"
                onClick={() => setActiveTab("hub_config")}
                className="text-sky-400 hover:underline shrink-0 ml-2 font-medium cursor-pointer"
              >
                一元管理を開く →
              </button>
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
                    className="flex-1 text-xs font-mono p-2.5 bg-[#0d1117] border border-[#30363d] rounded-lg text-gray-200 outline-none focus:border-purple-500"
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
                    className="flex-1 text-xs font-mono p-2.5 bg-[#0d1117] border border-[#30363d] rounded-lg text-gray-200 outline-none focus:border-purple-500"
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
                    className="flex-1 text-xs font-mono p-2.5 bg-[#0d1117] border border-[#30363d] rounded-lg text-gray-200 outline-none focus:border-purple-500"
                    value={weeklyReportPromptInput}
                    onChange={(e) => setWeeklyReportPromptInput(e.target.value)}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        
        {/* TAB 1: Hub Link & Sheet Management (Centralized Dashboard & Source Sync) */}
        {activeTab === "hub_config" && (
          <div className="flex flex-col gap-5 pb-4">
            <div className="flex items-center justify-between border-b border-[#30363d] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-300">
                  <Link className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-gray-100">リンク・シート 一元管理 & 外部収集</h3>
                  <p className="text-[10px] text-gray-400">外部データの収集からアプリ表示先へのデータの流れを一画面で設定・実行できます。</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  saveAllSettings();
                  onSaveToast("すべてのリンク・シート設定を一括保存しました ✦");
                }}
                className="px-3 py-1.5 text-xs bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Save className="w-3.5 h-3.5" />
                <span>一括保存する</span>
              </button>
            </div>

            {/* 1. 共通: GAS接続 */}
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 flex flex-col gap-3 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500/50"></div>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-gray-200 flex items-center gap-1.5">
                    <Settings2 className="w-3.5 h-3.5 text-emerald-400" />
                    【共通】システム接続設定 (GAS API)
                  </h4>
                  <p className="text-[10px] text-gray-400">アプリ全体とスプレッドシート・Driveを繋ぐためのAPIエンドポイント（GAS）です。</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyAiSyncCode}
                    className="flex items-center gap-1 px-2.5 py-1 text-[10.5px] rounded font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 transition cursor-pointer"
                    title="GASエディタに貼り付ける最新スクリプトコードをコピー"
                  >
                    {isCopiedSyncSave ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                    <span>{isCopiedSyncSave ? "コピー完了" : "📋 GASコピー"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowGasUrlHelp(!showGasUrlHelp)}
                    className="text-[10.5px] text-gray-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                  >
                    <HelpCircle className="w-3 h-3" />
                    <span>使い方</span>
                  </button>
                </div>
              </div>

              {showGasUrlHelp && (
                <div className="p-3 bg-emerald-950/30 border border-emerald-500/30 rounded-lg text-[11px] text-emerald-200 leading-relaxed space-y-1.5">
                  <p className="font-semibold text-emerald-300">💡 GAS (Google Apps Script) の導入手順：</p>
                  <p>1. 上の「📋 GASコピー」ボタンを押して最新のスクリプトコードをクリップボードにコピーします。</p>
                  <p>2. Googleスプレッドシートの「拡張機能」→「Apps Script」を開き、コードを貼り付けて保存します。</p>
                  <p>3. 画面右上の「デプロイ」→「新しいデプロイ」を選択し、種類の選択で「ウェブアプリ」を指定します。</p>
                  <p>4. <strong>次のユーザーとして実行: 自分</strong>、<strong>アクセスできるユーザー: 全員</strong> に設定してデプロイします。</p>
                  <p>5. 発行された「ウェブアプリ URL（末尾 <code>/exec</code>）」を下の入力欄に貼り付け、「接続テスト」を押してください。</p>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-gray-300">GAS Webアプリ URL</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="flex-1 font-mono text-[11px] p-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-gray-100 outline-none focus:border-emerald-500 transition-all"
                    value={gasUrl}
                    onChange={(e) => {
                      setGasUrl(e.target.value);
                      saveAllSettings(e.target.value);
                    }}
                    placeholder="https://script.google.com/macros/s/.../exec"
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
                <div className={`p-3 rounded-lg text-xs flex flex-col gap-2 border leading-relaxed ${
                  testStatus === "success" 
                    ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
                    : testStatus === "error"
                    ? "bg-red-950/40 border-red-500/40 text-red-300"
                    : "bg-blue-950/40 border-blue-500/40 text-blue-300"
                }`}>
                  <div className="flex items-start gap-2">
                    {testStatus === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />}
                    {testStatus === "error" && <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />}
                    {testStatus === "testing" && <Loader2 className="w-4 h-4 animate-spin text-blue-400 shrink-0 mt-0.5" />}
                    <div className="flex-1">
                      <p className="font-semibold text-sm">{testMessage}</p>
                    </div>
                  </div>

                  {testStatus === "error" && (
                    <div className="mt-1 pt-2 border-t border-red-500/30 text-[11px] text-red-200/90 space-y-2">
                      <div className="p-2 bg-black/40 rounded border border-red-500/20 space-y-1">
                        <p className="font-bold text-amber-300">🔍 なぜブラウザで見えるのに接続テストが失敗するのか？</p>
                        <p className="text-gray-300 text-[10.5px]">
                          ブラウザの通常タブはGoogleにログイン済みのため表示されますが、アプリは未ログイン状態でアクセスするため、GASの公開権限が「全員」でないとGoogleがブロックします。
                        </p>
                      </div>

                      <div className="space-y-1.5 text-[11px]">
                        <p className="font-bold text-white">🛠️ 解決のための3点チェックリスト：</p>
                        <div className="bg-[#161b22] p-2.5 rounded border border-[#30363d] space-y-1.5 text-gray-200">
                          <div className="flex items-start gap-1.5">
                            <span className="text-purple-400 font-bold">1.</span>
                            <span>
                              <strong>「新しいデプロイ」を作成</strong>（※「デプロイを管理」の更新では反映されないGASの不具合があります）
                            </span>
                          </div>
                          <div className="flex items-start gap-1.5">
                            <span className="text-purple-400 font-bold">2.</span>
                            <span>
                              次のユーザーとして実行: <strong className="text-emerald-300">「自分 (Me)」</strong>
                            </span>
                          </div>
                          <div className="flex items-start gap-1.5">
                            <span className="text-purple-400 font-bold">3.</span>
                            <span>
                              アクセスできるユーザー: <strong className="text-emerald-300">「全員 (Anyone)」</strong><br/>
                              <span className="text-[10px] text-gray-400">※「自分のみ」や「組織内のユーザー」は外部アクセス不可</span>
                            </span>
                          </div>
                          <div className="flex items-start gap-1.5">
                            <span className="text-purple-400 font-bold">4.</span>
                            <span>
                              新しく発行されたURL（末尾 <code>/exec</code>）を再コピーして貼り付け
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (gasUrl.trim()) {
                              navigator.clipboard.writeText(gasUrl.trim());
                              onSaveToast("URLをコピーしました！シークレットウィンドウで開いてみてください");
                            }
                          }}
                          className="px-2.5 py-1 text-[10.5px] bg-red-900/40 hover:bg-red-900/60 border border-red-400/40 rounded text-red-200 transition flex items-center gap-1 cursor-pointer"
                        >
                          📋 URLをコピーして「シークレットウィンドウ」でテストする
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Visual Arrow */}
            <div className="flex justify-center -my-2 relative z-10">
              <div className="bg-[#0d1117] border border-[#30363d] p-1.5 rounded-full text-gray-400">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>
              </div>
            </div>

            {/* 0. Drive Folders (ドライブ連携) */}
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 flex flex-col gap-4 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-blue-500/50"></div>
              <div>
                <h4 className="text-xs font-bold text-gray-200 mb-1 flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-blue-400" />
                  ステップ0: ドライブ連携 (フォルダ設定)
                </h4>
                <p className="text-[10px] text-gray-400 mb-3">Google Drive上にあるMHTファイルなどを読み込むためのフォルダ設定です。</p>
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-gray-300">取り込み前（未処理）データフォルダ (URL または ID)</label>
                    <input
                      type="text"
                      className="flex-1 font-mono text-[11px] p-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-gray-100 outline-none focus:border-blue-500 transition-all"
                      value={driveSourceFolderInput}
                      onChange={(e) => {
                        setDriveSourceFolderInput(e.target.value);
                        saveAllSettings();
                      }}
                      placeholder="未指定時は自動で「Connected Notes 取り込み」が参照されます"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-gray-300">取り込み後（処理済み）データフォルダ (URL または ID)</label>
                    <input
                      type="text"
                      className="flex-1 font-mono text-[11px] p-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-gray-100 outline-none focus:border-blue-500 transition-all"
                      value={driveProcessedFolderInput}
                      onChange={(e) => {
                        setDriveProcessedFolderInput(e.target.value);
                        saveAllSettings();
                      }}
                      placeholder="未指定時は対象フォルダ内に自動で「_processed」が参照されます"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Visual Arrow */}
            <div className="flex justify-center -my-2 relative z-10">
              <div className="bg-[#0d1117] border border-[#30363d] p-1.5 rounded-full text-gray-400">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>
              </div>
            </div>

            {/* 2. Source (収集元) */}
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 flex flex-col gap-4 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-amber-500/50"></div>
              <div>
                <h4 className="text-xs font-bold text-gray-200 mb-1 flex items-center gap-1.5">
                  <UploadCloud className="w-3.5 h-3.5 text-amber-400" />
                  ステップ1: データ収集元 (Source) & 自動取り込み
                </h4>
                <p className="text-[10px] text-gray-400">Google DriveやRaindropから取得した外部データを、一旦溜めておくためのスプレッドシートです。</p>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-gray-300">収集用スプレッドシート URL (または ID)</label>
                  <input
                    type="text"
                    className="w-full font-mono text-[11px] p-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-gray-100 outline-none focus:border-amber-500 transition-all"
                    value={extractSheetUrl}
                    onChange={(e) => {
                      setExtractSheetUrl(e.target.value);
                      localStorage.setItem("cn_extract_sheet_url", e.target.value.trim());
                    }}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                  />
                </div>
                
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-gray-300">収集用シート(タブ)名</label>
                  <input
                    type="text"
                    className="w-full font-mono text-[11px] p-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-gray-100 outline-none focus:border-amber-500 transition-all"
                    value={externalSyncSheetName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setExternalSyncSheetName(val);
                      setExtractSheetName(val);
                      saveAllSettings(gasUrl, val);
                      localStorage.setItem("cn_extract_sheet_name", val.trim());
                    }}
                    placeholder="未処理データ"
                  />
                  <span className="text-[9px] text-gray-500">※外部データの自動保存と、アプリへの読み取りの両方で共通して使用されるタブです</span>
                </div>
              </div>
                
              <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-2.5 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">収集対象ソース</span>
                  <span className="text-[10px] text-purple-300">※未処理のMHTファイルのみを抽出</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={syncRaindrop}
                      onChange={(e) => {
                        setSyncRaindrop(e.target.checked);
                        localStorage.setItem("cn_sync_raindrop", String(e.target.checked));
                      }}
                      className="w-3.5 h-3.5 accent-purple-500 cursor-pointer"
                    />
                    <span className="text-xs text-gray-200">Raindrop (Web記事・ブックマーク)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={syncDrive}
                      onChange={(e) => {
                        setSyncDrive(e.target.checked);
                        localStorage.setItem("cn_sync_drive", String(e.target.checked));
                      }}
                      className="w-3.5 h-3.5 accent-purple-500 cursor-pointer"
                    />
                    <span className="text-xs text-gray-200 font-medium text-purple-200">Googleドライブ (未処理MHTファイル解析)</span>
                  </label>
                </div>
                <p className="text-[10px] text-gray-400 leading-relaxed mt-0.5">
                  💡 Googleドライブのルートに自動作成される「Connected Notes 取り込み」フォルダ内の未処理MHT・PDFファイルを検出し、スプレッドシートへ追記します（処理済みファイルは「_processed」フォルダに退避されるため二重取り込みされません）。
                </p>
              </div>

              {/* GAS Connection Info for Step 1 */}
              <div className="bg-amber-950/20 border border-amber-500/30 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[11px] text-amber-300">
                  <Settings2 className="w-3 h-3 shrink-0" />
                  <span>接続先GAS URL：<span className="font-medium text-gray-300">【共通】システム接続設定欄で入力済み</span></span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyAiSyncCode}
                  className="flex items-center gap-1 px-2.5 py-1 text-[10.5px] rounded font-medium bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition cursor-pointer shrink-0"
                  title="このボタンを動かすためのGASスクリプトコードをコピー"
                >
                  {isCopiedSyncSave ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                  <span>{isCopiedSyncSave ? "コピー完了" : "📋 GASコードをコピー"}</span>
                </button>
              </div>
                
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

            {/* Visual Arrow */}
            <div className="flex justify-center -my-2 relative z-10">
              <div className="bg-[#0d1117] border border-[#30363d] p-1.5 rounded-full text-gray-400">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>
              </div>
            </div>

            {/* 3. Target (アプリ表示先 & 抽出登録) */}
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 flex flex-col gap-4 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-sky-500/50"></div>
              
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-gray-200 flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-sky-400" />
                    ステップ2: アプリ表示先 (Target) & 未処理データの抽出・登録
                  </h4>
                  <p className="text-[10px] text-gray-400">取り込み元シートから未処理データを抽出し、本アプリの画面（表示先シート）へ登録・反映します。</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowExtractHelp(!showExtractHelp)}
                    className="text-[10.5px] text-gray-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer"
                  >
                    <HelpCircle className="w-3 h-3" />
                    <span>使い方</span>
                  </button>
                </div>
              </div>

              {showExtractHelp && (
                <div className="p-3 bg-sky-950/30 border border-sky-500/30 rounded-lg text-[11px] text-sky-200 leading-relaxed space-y-1.5">
                  <p className="font-semibold text-sky-300">💡 アプリへのデータ抽出・登録手順：</p>
                  <p>1. <strong>取り込み元</strong>（ステップ1の収集用シート、またはハイライト保存シート）のURLとシート名を指定します。</p>
                  <p>2. <strong>アプリ表示先</strong>（本アプリで閲覧・保存するシート）のURLとシート名（例: <code>Notes</code>）を指定します。</p>
                  <p>3. <strong>「未処理データ一覧を取得」</strong>ボタンを押すと、まだ登録されていない行を自動抽出し、選択した行を本アプリへ一括取り込みます。</p>
                </div>
              )}

              <div className="flex flex-col gap-3">
                {/* Source & Target Sheets Configuration */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#0d1117] p-3 rounded-lg border border-[#30363d]">
                  <div className="flex flex-col gap-2">
                    <span className="text-[10.5px] font-bold text-amber-400 flex items-center gap-1">
                      <UploadCloud className="w-3 h-3" /> 【取り込み元】データ収集シート
                    </span>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-gray-400">取り込み元 スプレッドシートURL / ID:</label>
                      <input
                        type="text"
                        className="w-full font-mono text-[11px] p-2 bg-[#161b22] border border-[#30363d] rounded-lg text-gray-100 outline-none focus:border-amber-500 transition-all"
                        value={extractSheetUrl}
                        onChange={(e) => {
                          setExtractSheetUrl(e.target.value);
                          localStorage.setItem("cn_extract_sheet_url", e.target.value.trim());
                        }}
                        placeholder="https://docs.google.com/spreadsheets/d/..."
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-gray-400">取り込み元 シート（タブ）名:</label>
                      <input
                        type="text"
                        className="w-full font-mono text-[11px] p-2 bg-[#161b22] border border-[#30363d] rounded-lg text-gray-100 outline-none focus:border-amber-500 transition-all"
                        value={extractSheetName}
                        onChange={(e) => {
                          setExtractSheetName(e.target.value);
                          localStorage.setItem("cn_extract_sheet_name", e.target.value.trim());
                        }}
                        placeholder="未処理データ"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <span className="text-[10.5px] font-bold text-sky-400 flex items-center gap-1">
                      <Database className="w-3 h-3" /> 【取り込み先】アプリ表示シート
                    </span>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-gray-400">取り込み先 スプレッドシートURL / ID (任意):</label>
                      <input
                        type="text"
                        className="w-full font-mono text-[11px] p-2 bg-[#161b22] border border-[#30363d] rounded-lg text-gray-100 outline-none focus:border-sky-500 transition-all"
                        value={targetSsUrl}
                        onChange={(e) => {
                          setTargetSsUrl(e.target.value);
                          localStorage.setItem("cn_target_ss_url", e.target.value.trim());
                        }}
                        placeholder="未入力時はGAS紐づきシートを使用"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-gray-400">取り込み先 シート（タブ）名:</label>
                      <input
                        type="text"
                        className="w-full font-mono text-[11px] p-2 bg-[#161b22] border border-[#30363d] rounded-lg text-gray-100 outline-none focus:border-sky-500 transition-all"
                        value={gasSheetName}
                        onChange={(e) => {
                          setGasSheetName(e.target.value);
                          localStorage.setItem("cn_gas_sheet_name", e.target.value.trim());
                        }}
                        placeholder="Notes"
                      />
                    </div>
                  </div>
                </div>

                {/* GAS Web App URL - shared with common setting */}
                <div className="bg-sky-950/20 border border-sky-500/30 rounded-lg px-3 py-2 flex items-center gap-1.5 text-[11px] text-sky-300">
                  <Settings2 className="w-3 h-3 shrink-0 text-emerald-400" />
                  <span>GAS Webアプリ URL：</span>
                  <span className="font-medium text-gray-300">【共通】システム接続設定欄で入力済み</span>
                </div>

                {/* Fetch Unprocessed Button */}
                <button
                  type="button"
                  className="w-full py-2.5 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white font-bold text-xs rounded-lg transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  onClick={fetchSheetData}
                  disabled={isProcessing}
                >
                  {isProcessing && processingText === "取得中..." ? (
                    <RefreshCw className="w-4 h-4 text-white animate-spin" />
                  ) : (
                    <FileSpreadsheet className="w-4 h-4 text-white" />
                  )}
                  <span>{isProcessing && processingText === "取得中..." ? "未処理データを取得中..." : "未処理データ一覧を取得"}</span>
                </button>

                {/* Pending Items Table & Import Execution */}
                {pendingSheetItems.length > 0 && (
                  <div className="flex flex-col gap-2.5 bg-[#0d1117] p-3 rounded-lg border border-[#30363d]">
                    <div className="flex items-center justify-between text-xs text-gray-300">
                      <span>取得件数: <strong className="text-sky-400">{pendingSheetItems.length}件</strong> (選択中: {selectedIndices.length}件)</span>
                      <button
                        type="button"
                        className="text-[10px] text-sky-400 hover:underline cursor-pointer"
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
                            className="mt-0.5 accent-sky-500"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-200 truncate">{item.title || "無題"}</p>
                            <p className="text-[10px] text-gray-400 truncate">{item.highlights || item.url || "内容なし"}</p>
                          </div>
                        </label>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#30363d]">
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5 text-[11px] text-gray-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={optimizeTitle}
                            onChange={(e) => setOptimizeTitle(e.target.checked)}
                            className="accent-sky-500"
                          />
                          <span>AIでタイトルを自動最適化</span>
                        </label>
                        <label className="flex items-center gap-1.5 text-[11px] text-gray-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={overwriteBatch}
                            onChange={(e) => setOverwriteBatch(e.target.checked)}
                            className="accent-sky-500"
                          />
                          <span>既存IDと重複時は上書き</span>
                        </label>
                      </div>
                      <button
                        type="button"
                        onClick={importSelectedItems}
                        disabled={isProcessing || selectedIndices.length === 0}
                        className="px-4 py-2 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white font-bold text-xs rounded-lg transition-all shadow flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {isProcessing && (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        )}
                        <span>{isProcessing ? processingText : `選択した ${selectedIndices.length} 件をアプリへ取り込む`}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
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
