/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Note } from "../types";
import { formatDateStr } from "../utils/graphDataParser";
import { getStoredPrompt, DEFAULT_PROMPTS, PROMPT_KEYS } from "./PromptSettingsModal";
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
  BookOpen, 
  Bot, 
  FileSpreadsheet
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
  }) => Promise<any>;
}

export default function ImportModal({ 
  isOpen, 
  onClose, 
  onCreateNoteExt, 
  onSaveToast, 
  apiPost, 
  onNotesUpdateBatch,
  onSyncExternalSources
}: ImportModalProps) {
  const [activeTab, setActiveTab] = useState<"external_sync" | "file_direct">("external_sync");

  // External Sync options
  const [syncRaindrop, setSyncRaindrop] = useState(true);
  const [syncDrive, setSyncDrive] = useState(true);
  const [isSyncingExternal, setIsSyncingExternal] = useState(false);
  const [externalSyncStatus, setExternalSyncStatus] = useState<string | null>(null);
  const [externalSyncResult, setExternalSyncResult] = useState<{
    addedCount?: number;
    isTimeOut?: boolean;
    problematicItem?: any;
    message?: string;
  } | null>(null);

  // Sync Prompts configuration state (SYSTEM_PERSONA, SYNC_PROMPT, WEEKLY_REPORT_PROMPT)
  const [showPromptSettings, setShowPromptSettings] = useState(false);
  const [activePromptSubTab, setActivePromptSubTab] = useState<"persona" | "sync" | "weekly">("persona");
  const [syncPersonaInput, setSyncPersonaInput] = useState(() => getStoredPrompt("SYSTEM_PERSONA"));
  const [syncPromptInput, setSyncPromptInput] = useState(() => getStoredPrompt("SYNC_PROMPT"));
  const [weeklyReportPromptInput, setWeeklyReportPromptInput] = useState(() => getStoredPrompt("WEEKLY_REPORT_PROMPT"));

  // File / URL direct import state
  const [importUrl, setImportUrl] = useState("");
  const [importMode, setImportMode] = useState("raw");
  const [optimizeTitle, setOptimizeTitle] = useState(false);
  const [sheetUrl, setSheetUrl] = useState("https://docs.google.com/spreadsheets/d/1adkx60akE6nOZI2DUq_ne1MO2kERBzRiLc1fFxz0pnM/edit?usp=sharing");
  const [sheetName, setSheetName] = useState("シート1");
  const [overwriteBatch, setOverwriteBatch] = useState(false);
  
  // Sheet state
  const [pendingSheetItems, setPendingSheetItems] = useState<any[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  
  // Local files
  const [showSheetUrlHelp, setShowSheetUrlHelp] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Loading indicator states
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingText, setProcessingText] = useState("実行");

  useEffect(() => {
    if (isOpen) {
      setImportUrl("");
      setPendingSheetItems([]);
      setSelectedIndices([]);
      setSelectedFile(null);
      setIsProcessing(false);
      setProcessingText("実行");
      setExternalSyncStatus(null);
      setExternalSyncResult(null);

      // Load latest prompts from localStorage
      setSyncPersonaInput(getStoredPrompt("SYSTEM_PERSONA"));
      setSyncPromptInput(getStoredPrompt("SYNC_PROMPT"));
      setWeeklyReportPromptInput(getStoredPrompt("WEEKLY_REPORT_PROMPT"));
    }
  }, [isOpen]);

  // Prompt Actions (Save / Reset)
  const handleSavePrompts = () => {
    localStorage.setItem(PROMPT_KEYS.SYSTEM_PERSONA, syncPersonaInput);
    localStorage.setItem(PROMPT_KEYS.SYNC_PROMPT, syncPromptInput);
    localStorage.setItem(PROMPT_KEYS.WEEKLY_REPORT_PROMPT, weeklyReportPromptInput);
    onSaveToast("同期プロンプト設定を保存しました ✦");
  };

  const handleResetPrompts = () => {
    if (!window.confirm("SYNC_PROMPT、SYSTEM_PERSONA、WEEKLY_REPORT_PROMPT をデフォルト（初期設定）に戻しますか？")) return;

    localStorage.removeItem(PROMPT_KEYS.SYSTEM_PERSONA);
    localStorage.removeItem(PROMPT_KEYS.SYNC_PROMPT);
    localStorage.removeItem(PROMPT_KEYS.WEEKLY_REPORT_PROMPT);

    setSyncPersonaInput(DEFAULT_PROMPTS.SYSTEM_PERSONA);
    setSyncPromptInput(DEFAULT_PROMPTS.SYNC_PROMPT);
    setWeeklyReportPromptInput(DEFAULT_PROMPTS.WEEKLY_REPORT_PROMPT);

    onSaveToast("プロンプトをデフォルト（初期値）に戻しました");
  };

  // Handle External Sync Execution
  const handleExecuteExternalSync = async () => {
    if (!syncRaindrop && !syncDrive) {
      onSaveToast("取り込み対象（Raindrop または Googleドライブ）を少なくとも1つ選択してください");
      return;
    }

    setIsSyncingExternal(true);
    setExternalSyncStatus("スプレッドシートへ外部データを収集中・AI解析中...（最大3.5分）");
    setExternalSyncResult(null);

    const syncOptions = {
      raindrop: syncRaindrop,
      drive: syncDrive,
      persona: syncPersonaInput || getStoredPrompt("SYSTEM_PERSONA"),
      syncPrompt: syncPromptInput || getStoredPrompt("SYNC_PROMPT"),
      weeklyReportPrompt: weeklyReportPromptInput || getStoredPrompt("WEEKLY_REPORT_PROMPT")
    };

    try {
      let res;
      if (onSyncExternalSources) {
        res = await onSyncExternalSources(syncOptions);
      } else {
        res = await apiPost({ action: "syncExternalSources", options: syncOptions });
      }

      const added = res?.addedCount || 0;
      setExternalSyncResult({
        addedCount: added,
        isTimeOut: res?.isTimeOut,
        problematicItem: res?.problematicItem,
        message: `${added} 件の新規データを取り込み、アプリへ同期しました ✦`
      });

      onSaveToast(`外部データの自動取り込み完了: ${added} 件追加`);
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

  const extractSheetId = (input: string) => {
    const match = input.match(/\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : input.trim();
  };

  const fetchSheetData = async () => {
    const sourceSsId = extractSheetId(sheetUrl);
    if (!sourceSsId) return onSaveToast("スプレッドシートのURLを入力してください");
    if (!sheetName.trim()) return onSaveToast("シート名を入力してください");

    onSaveToast("一覧を取得中...");
    try {
      const res = await apiPost({ action: "fetchUnprocessedHighlights", sourceSsId, sheetName });
      if (!res.success) throw new Error(res.error);

      const items = res.items || [];
      setPendingSheetItems(items);
      setSelectedIndices(items.map((_, idx) => idx));
      if (items.length > 0) {
        onSaveToast(`${items.length}件の未処理データを自動選択して取得しました`);
      } else {
        onSaveToast("未処理のデータはありません");
      }
    } catch (e: any) {
      onSaveToast("エラー: " + e.message);
    }
  };

  const handleCheckboxChange = (idx: number) => {
    if (selectedIndices.includes(idx)) {
      setSelectedIndices(selectedIndices.filter(i => i !== idx));
    } else {
      setSelectedIndices([...selectedIndices, idx]);
    }
  };

  const importSelectedItems = async () => {
    if (selectedIndices.length === 0) return onSaveToast("項目が選択されていません");

    const sourceSsId = extractSheetId(sheetUrl);
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
        onSaveToast("全記事のタイトルをAIで一括最適化中（API節約モード）...");
        try {
          const itemsToProcess = selectedItems.map((item, idx) => ({
            idx,
            title: item.title,
            highlightsSnippet: String(item.highlights || "").substring(0, 300)
          }));

          const prompt = `あなたは優秀なエディターです。以下の各記事データの元のタイトルと本文の断片を読み、それぞれに対して最もよく表す、短くて魅力的な日本語のタイトル（20文字以内）を1つずつ提案してください。
必ず出力は指定のキー（インデックス番号の文字列）に対応するJSONオブジェクトのみとして、説明や余計なマークダウン装飾（\`\`\`json 等）は一切含めないでください。

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

      if (newNotes.length > 0) {
        onNotesUpdateBatch(newNotes, overwriteBatch);
      }

      onSaveToast("スプレッドシートを更新中...");
      await apiPost({ action: "markHighlightsProcessed", sourceSsId, sheetName, rowIndices });

      onSaveToast(`${newNotes.length}件のノートを${overwriteBatch ? "【上書き】" : "【追加】"}インポートしました ✦`);
      onClose();

    } catch (e: any) {
      onSaveToast("エラー: " + e.message);
    } finally {
      setIsProcessing(false);
      setProcessingText("実行");
    }
  };

  const fetchAiTitle = async (contentSnippet: string, fallbackTitle: string): Promise<string> => {
    const apiKey = localStorage.getItem("cn_gemini_key");
    if (!apiKey) return fallbackTitle;
    let importModel = localStorage.getItem("cn_gemini_model") || "gemini-flash-latest";

    try {
      const prompt = `以下のテキスト内容を読み、最も相応しい簡潔で魅力的な日本語のタイトル（20文字以内）を1つだけ作成してください。タイトル文字列のみを出力し、挨拶や装飾記号、カッコは不要です。\n\n内容:\n${contentSnippet.substring(0, 2000)}`;
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${importModel}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 50 }
          })
        }
      );
      if (!res.ok) return fallbackTitle;
      const data = await res.json();
      const aiTitle = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      return aiTitle || fallbackTitle;
    } catch {
      return fallbackTitle;
    }
  };

  const runImport = async () => {
    if (!importUrl.trim() && !selectedFile) {
      return onSaveToast("URLを入力するか、ファイルを選択してください");
    }

    const apiKey = localStorage.getItem("cn_gemini_key");
    let importModel = localStorage.getItem("cn_gemini_model") || "gemini-flash-latest";
    const importTemp = parseFloat(localStorage.getItem("cn_gemini_temp") || "0.1");

    setIsProcessing(true);
    setProcessingText("抽出中...");

    try {
      let text = "";
      let title = "取り込んだノート";

      if (importUrl.trim()) {
        const res = await apiPost({ action: "fetchDriveFile", url: importUrl.trim() });
        if (!res.success) throw new Error(res.error);
        text = res.text;
        title = res.title || title;

        if (importMode === "raw") {
          if (optimizeTitle) {
            onSaveToast("タイトルを最適化中...");
            title = await fetchAiTitle(text, title);
          }
          const formatted = `# ${title}\n\n${text}\n\n**ソース:** [${importUrl.trim()}](${importUrl.trim()})`;
          onCreateNoteExt(title, formatted, formatDateStr(Date.now()).replace(/-/g, ""), importUrl.trim());
          onSaveToast("取り込みました");
        } else {
          onSaveToast("AI処理中...");
          if (!apiKey) throw new Error("AI処理にはAPIキーの設定が必要です。");
          const aiMaxTok = parseInt(localStorage.getItem("cn_gemini_tokens") || "1024", 10);
          
          const promptTemplate = importMode === "summarize"
            ? getStoredPrompt("IMPORT_SUMMARIZE")
            : getStoredPrompt("IMPORT_KEYPOINTS");
          
          const prompt = promptTemplate.replace("{content}", text.substring(0, 30000));

          const r = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${importModel}:generateContent?key=${apiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: importTemp, maxOutputTokens: aiMaxTok }
              })
            }
          );
          if (!r.ok) {
            const ae = await r.json();
            throw new Error(ae.error?.message || "AIレスポンスに失敗しました");
          }
          const rd = await r.json();
          const processedText = rd.candidates?.[0]?.content?.parts?.[0]?.text || "";

          if (optimizeTitle) {
            onSaveToast("タイトルを最適化中...");
            title = await fetchAiTitle(processedText, title);
          }

          const suffix = importMode === "summarize" ? " (要約)" : " (抽出)";
          const finalTitle = title + suffix;
          const formatted = `# ${finalTitle}\n\n${processedText}\n\n**ソース:** [${importUrl.trim()}](${importUrl.trim()})\n\n---\n<details><summary>元のテキストを展開する</summary>\n\n${text}\n</details>`;

          onCreateNoteExt(finalTitle, formatted, formatDateStr(Date.now()).replace(/-/g, ""), importUrl.trim());
          onSaveToast("取り込みとAI処理が完了しました ✦");
        }
        onClose();
      } else if (selectedFile) {
        title = selectedFile.name.replace(/\.[^/.]+$/, "");
        
        // JSON file parsing
        if (selectedFile.name.toLowerCase().endsWith(".json")) {
          onSaveToast("JSONファイルを解析中...");
          const jsonText = await selectedFile.text();
          let parsedData: any;
          try {
            parsedData = JSON.parse(jsonText);
          } catch (jsonErr: any) {
            throw new Error("JSON形式が不正です: " + jsonErr.message);
          }

          let items: any[] = [];
          if (Array.isArray(parsedData)) {
            items = parsedData;
          } else if (parsedData && Array.isArray(parsedData.notes)) {
            items = parsedData.notes;
          } else if (parsedData && typeof parsedData === "object") {
            items = [parsedData];
          }

          if (items.length === 0) throw new Error("JSON内に有効なノートデータが見つかりませんでした");

          const newNotes: Note[] = [];
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const itemTitle = item.title || item.name || `ノート_${i + 1}`;
            const itemContent = item.content || item.body || item.text || item.highlights || JSON.stringify(item, null, 2);
            const itemKeywords = item.keywords || item.tags || "";
            const itemSummary = item.summary || "";
            const itemSourceUrl = item.sourceUrl || item.url || "";
            const itemCreatedAt = typeof item.createdAt === "number" ? item.createdAt : Date.now();
            const itemUpdatedAt = typeof item.updatedAt === "number" ? item.updatedAt : itemCreatedAt;
            const itemTimeline = item.timeline || "";

            newNotes.push({
              id: item.id || ("note_" + (Date.now() + i)),
              title: itemTitle,
              content: itemContent,
              summary: itemSummary,
              keywords: itemKeywords,
              sourceUrl: itemSourceUrl,
              createdAt: itemCreatedAt,
              updatedAt: itemUpdatedAt,
              timeline: itemTimeline
            });
          }

          onNotesUpdateBatch(newNotes, overwriteBatch);
          onSaveToast(`JSONから ${newNotes.length} 件のノートを${overwriteBatch ? "【上書き】" : "【追加】"}インポートしました ✦`);
          onClose();
          return;
        }

        // General text file handling
        text = await selectedFile.text();
        if (importMode === "raw") {
          const formatted = `# ${title}\n\n${text}`;
          onCreateNoteExt(title, formatted, formatDateStr(Date.now()).replace(/-/g, ""), "");
          onSaveToast("取り込みました");
        } else {
          onSaveToast("AI処理中...");
          if (!apiKey) throw new Error("AI処理にはAPIキーの設定が必要です。");
          const aiMaxTok = parseInt(localStorage.getItem("cn_gemini_tokens") || "1024", 10);
          
          const promptTemplate = importMode === "summarize"
            ? getStoredPrompt("IMPORT_SUMMARIZE")
            : getStoredPrompt("IMPORT_KEYPOINTS");
          
          const prompt = promptTemplate.replace("{content}", text.substring(0, 30000));

          const r = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${importModel}:generateContent?key=${apiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: importTemp, maxOutputTokens: aiMaxTok }
              })
            }
          );
          if (!r.ok) throw new Error("AI処理に失敗しました");
          const rd = await r.json();
          const processedText = rd.candidates?.[0]?.content?.parts?.[0]?.text || "";
          const suffix = importMode === "summarize" ? " (要約)" : " (抽出)";
          const finalTitle = title + suffix;
          const formatted = `# ${finalTitle}\n\n${processedText}\n\n---\n<details><summary>元のテキスト</summary>\n\n${text}\n</details>`;
          onCreateNoteExt(finalTitle, formatted, formatDateStr(Date.now()).replace(/-/g, ""), "");
          onSaveToast("取り込みとAI処理が完了しました ✦");
        }
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

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-[#00000080] z-[200] flex items-center justify-center p-4 overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Modal Container */}
      <div className="bg-[var(--surface)] border border-[var(--border2)] rounded-xl p-6 w-[600px] max-w-full my-auto shadow-2xl flex flex-col gap-4 animate-[fadeIn_0.15s_ease-out] max-h-[92vh] overflow-y-auto">
        
        {/* Header */}
        <div>
          <div className="text-base font-bold text-[var(--bright)] flex items-center gap-2">
            <span>📥</span> ノート・ナレッジの取り込み
          </div>
          <p className="text-xs text-[var(--subtle)] mt-1 leading-relaxed">
            RaindropやGoogleドライブ（MHT/PDF）からの自動収集、またはファイル・URLからテキストを取り込みます。
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-[var(--border)] gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("external_sync")}
            className={`pb-2 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 border-b-2 ${
              activeTab === "external_sync"
                ? "border-[var(--purple)] text-[var(--bright)]"
                : "border-transparent text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            ⚡ 外部ソース自動同期 (Raindrop / MHT)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("file_direct")}
            className={`pb-2 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 border-b-2 ${
              activeTab === "file_direct"
                ? "border-[var(--purple)] text-[var(--bright)]"
                : "border-transparent text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            📄 ファイル / URL / 個別シート
          </button>
        </div>

        {/* TAB 1: External Source Automatic Synchronization */}
        {activeTab === "external_sync" && (
          <div className="flex flex-col gap-3">
            <div className="bg-[var(--bg)] border border-[var(--border2)] rounded-lg p-3.5 flex flex-col gap-2.5">
              <div className="text-xs font-bold text-[var(--bright)] flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span>取り込み対象の選択</span>
                </div>

                {/* Prompt Settings Toggle Button */}
                <button
                  type="button"
                  onClick={() => setShowPromptSettings(!showPromptSettings)}
                  className={`text-[11px] px-2.5 py-1 rounded-md border font-semibold flex items-center gap-1.5 cursor-pointer transition-all ${
                    showPromptSettings
                      ? "bg-purple-600/20 text-purple-300 border-purple-500/50 shadow-sm"
                      : "bg-[#21262d] text-gray-300 border-[#30363d] hover:border-purple-400/50 hover:text-purple-300"
                  }`}
                  title="SYNC_PROMPT / SYSTEM_PERSONA / WEEKLY_REPORT_PROMPT の設定"
                >
                  <Sliders className="w-3 h-3 text-purple-400" />
                  <span>プロンプト設定</span>
                  {showPromptSettings ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                </button>
              </div>

              <p className="text-[11px] text-[var(--subtle)] leading-relaxed">
                チェックを入れた外部ソースから最新データを取得し、Gemini AIで自動解析・要約してスプレッドシート（A〜M列）へ保存し、アプリへ自動同期します。
              </p>

              {/* Raindrop Checkbox */}
              <label className="flex items-start gap-2.5 p-2 rounded-md hover:bg-[#ffffff06] cursor-pointer transition-colors border border-transparent hover:border-[var(--border2)]">
                <input
                  type="checkbox"
                  id="sync-raindrop"
                  checked={syncRaindrop}
                  onChange={(e) => setSyncRaindrop(e.target.checked)}
                  className="mt-0.5 w-4 h-4 cursor-pointer accent-[var(--purple)]"
                />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-bold text-[var(--text)]">
                    Raindrop (Web記事・ブックマーク) を同期
                  </span>
                  <p className="text-[10px] text-[var(--muted)] mt-0.5">
                    Raindrop API経由で未保存のWeb記事を取得し、本文抽出とAI要約を実行します。
                  </p>
                </div>
              </label>

              {/* Drive MHT / PDF Checkbox */}
              <label className="flex items-start gap-2.5 p-2 rounded-md hover:bg-[#ffffff06] cursor-pointer transition-colors border border-transparent hover:border-[var(--border2)]">
                <input
                  type="checkbox"
                  id="sync-drive"
                  checked={syncDrive}
                  onChange={(e) => setSyncDrive(e.target.checked)}
                  className="mt-0.5 w-4 h-4 cursor-pointer accent-[var(--purple)]"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[var(--text)]">
                      Googleドライブ (MHTファイル / PDF解析) を実行
                    </span>
                    <span className="text-[9px] text-amber-400 font-bold bg-amber-500/10 px-1.5 py-0.2 rounded">
                      ※解析に数分
                    </span>
                  </div>
                  <p className="text-[10px] text-[var(--muted)] mt-0.5">
                    Googleドライブ内のMHTファイルを記事ごとに自動分割、PDFを紐付け、年表（timeline）データを抽出します。
                  </p>
                </div>
              </label>

              {/* Collapsible Prompt Settings Panel */}
              {showPromptSettings && (
                <div className="mt-2 pt-3 border-t border-[var(--border2)] flex flex-col gap-2.5 animate-[fadeIn_0.15s_ease-out]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-[var(--purple)]" />
                      <span className="text-xs font-bold text-[var(--bright)]">
                        外部同期・ナレッジプロンプト設定
                      </span>
                    </div>
                    <span className="text-[10px] text-[var(--muted)]">いつでも修正・デフォルト復元が可能</span>
                  </div>

                  {/* Sub Tabs for the 3 prompts */}
                  <div className="flex border-b border-[#30363d] gap-1 bg-[#161b22] p-1 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setActivePromptSubTab("persona")}
                      className={`flex-1 py-1.5 px-2 text-[11px] font-bold rounded-md transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        activePromptSubTab === "persona"
                          ? "bg-purple-600/30 text-purple-200 border border-purple-500/40 shadow-xs"
                          : "text-gray-400 hover:text-gray-200 hover:bg-[#21262d]"
                      }`}
                    >
                      <Bot className="w-3 h-3" />
                      <span>SYSTEM_PERSONA</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActivePromptSubTab("sync")}
                      className={`flex-1 py-1.5 px-2 text-[11px] font-bold rounded-md transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        activePromptSubTab === "sync"
                          ? "bg-purple-600/30 text-purple-200 border border-purple-500/40 shadow-xs"
                          : "text-gray-400 hover:text-gray-200 hover:bg-[#21262d]"
                      }`}
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>SYNC_PROMPT</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActivePromptSubTab("weekly")}
                      className={`flex-1 py-1.5 px-2 text-[11px] font-bold rounded-md transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        activePromptSubTab === "weekly"
                          ? "bg-purple-600/30 text-purple-200 border border-purple-500/40 shadow-xs"
                          : "text-gray-400 hover:text-gray-200 hover:bg-[#21262d]"
                      }`}
                    >
                      <FileSpreadsheet className="w-3 h-3" />
                      <span>WEEKLY_REPORT</span>
                    </button>
                  </div>

                  {/* Sub Tab 1: SYSTEM_PERSONA */}
                  {activePromptSubTab === "persona" && (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <label className="font-bold text-[var(--text)] flex items-center gap-1">
                          <span>SYSTEM_PERSONA (AIの役割・ペルソナ定義)</span>
                        </label>
                        <span className="text-[10px] text-[var(--muted)]">Gemini AIの専門性を指定</span>
                      </div>
                      <textarea
                        className="w-full font-mono text-xs p-2.5 bg-[#0d1117] border border-[var(--border2)] rounded-md text-[var(--text)] outline-none focus:border-[var(--purple)] transition-all resize-y"
                        rows={3}
                        value={syncPersonaInput}
                        onChange={(e) => setSyncPersonaInput(e.target.value)}
                        placeholder={DEFAULT_PROMPTS.SYSTEM_PERSONA}
                      />
                      <p className="text-[10px] text-[var(--muted)]">
                        ※ RaindropやGoogleドライブ解析時の前提となる専門家の役割・視点を設定します。
                      </p>
                    </div>
                  )}

                  {/* Sub Tab 2: SYNC_PROMPT */}
                  {activePromptSubTab === "sync" && (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <label className="font-bold text-[var(--text)] flex items-center gap-1">
                          <span>SYNC_PROMPT (外部データ自動同期・要約プロンプト)</span>
                        </label>
                        <span className="text-[10px] text-[var(--muted)]">記事・PDF・画像解析用</span>
                      </div>
                      <textarea
                        className="w-full font-mono text-xs p-2.5 bg-[#0d1117] border border-[var(--border2)] rounded-md text-[var(--text)] outline-none focus:border-[var(--purple)] transition-all resize-y"
                        rows={5}
                        value={syncPromptInput}
                        onChange={(e) => setSyncPromptInput(e.target.value)}
                        placeholder={DEFAULT_PROMPTS.SYNC_PROMPT}
                      />
                      <p className="text-[10px] text-[var(--muted)]">
                        ※ 外部記事から要約（highlights）や分野キーワード（tags）を抽出する際の指示文です。
                      </p>
                    </div>
                  )}

                  {/* Sub Tab 3: WEEKLY_REPORT_PROMPT */}
                  {activePromptSubTab === "weekly" && (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <label className="font-bold text-[var(--text)] flex items-center gap-1">
                          <span>WEEKLY_REPORT_PROMPT (週次レポート・ナレッジ総括)</span>
                        </label>
                        <span className="text-[10px] text-[var(--muted)]">包括レポート生成用</span>
                      </div>
                      <textarea
                        className="w-full font-mono text-xs p-2.5 bg-[#0d1117] border border-[var(--border2)] rounded-md text-[var(--text)] outline-none focus:border-[var(--purple)] transition-all resize-y"
                        rows={7}
                        value={weeklyReportPromptInput}
                        onChange={(e) => setWeeklyReportPromptInput(e.target.value)}
                        placeholder={DEFAULT_PROMPTS.WEEKLY_REPORT_PROMPT}
                      />
                      <p className="text-[10px] text-[var(--muted)]">
                        ※ <code className="text-purple-300 font-mono">{"{notes_content}"}</code> に期間内のノート本文や要約が自動挿入されます。
                      </p>
                    </div>
                  )}

                  {/* Prompt Action Buttons: Reset & Save */}
                  <div className="flex items-center justify-between pt-2 border-t border-[var(--border2)]">
                    <button
                      type="button"
                      onClick={handleResetPrompts}
                      className="px-3 py-1.5 rounded-md border border-[var(--border2)] hover:border-red-400/40 hover:bg-red-500/10 text-orange-400 hover:text-orange-300 text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="ハードコードされた初期プロンプトに戻します"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>デフォルトに戻す</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSavePrompts}
                      className="px-4 py-1.5 rounded-md bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/50 text-purple-200 text-[11px] font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                    >
                      <Save className="w-3 h-3" />
                      <span>プロンプトを保存</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Status and feedback area */}
            {isSyncingExternal && (
              <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg text-xs text-purple-300 flex items-center gap-2.5 animate-pulse">
                <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                <span>{externalSyncStatus || "同期中..."}</span>
              </div>
            )}

            {externalSyncResult && (
              <div className={`p-3 rounded-lg text-xs border flex items-start gap-2.5 ${
                externalSyncResult.isTimeOut 
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                  : "bg-green-500/10 border-green-500/30 text-green-300"
              }`}>
                {externalSyncResult.isTimeOut ? (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-green-400" />
                )}
                <div className="flex-1">
                  <p className="font-bold">{externalSyncResult.message}</p>
                  {externalSyncResult.isTimeOut && (
                    <p className="text-[10px] text-amber-300/80 mt-1 leading-normal">
                      ※ 処理時間上限（3.5分）に達したため一時中断しました。次回実行時に残りのアイテムから安全に再開できます。
                    </p>
                  )}
                  {externalSyncResult.problematicItem && (
                    <p className="text-[10px] text-amber-300/80 mt-0.5">
                      対象: {externalSyncResult.problematicItem.title}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Primary Action Button */}
            <button
              type="button"
              disabled={isSyncingExternal}
              onClick={handleExecuteExternalSync}
              className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs rounded-lg shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncingExternal ? "animate-spin" : ""}`} />
              <span>{isSyncingExternal ? "外部データを同期中..." : "⚡ スプレッドシートへ自動取り込みを実行"}</span>
            </button>
          </div>
        )}

        {/* TAB 2: File / URL / Spreadsheet Direct Import */}
        {activeTab === "file_direct" && (
          <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto pr-1">
            <div>
              <label className="text-[11px] text-[var(--subtle)] font-bold block mb-1">1. 入力元 (URL or ファイル選択)</label>
              <div className="flex flex-col gap-1.5">
                <input
                  type="text"
                  className="w-full text-xs p-2.5 bg-[var(--bg)] border border-[var(--border2)] rounded-md text-[var(--text)] outline-none focus:border-[var(--purple)] transition-all font-mono"
                  placeholder="GoogleドキュメントのURL"
                  value={importUrl}
                  onChange={(e) => {
                    setImportUrl(e.target.value);
                    if (e.target.value) setSelectedFile(null);
                  }}
                />
                
                <div className="text-center text-[var(--muted)] text-[10px] my-1">— または ローカルファイルを選択 —</div>
                
                {selectedFile ? (
                  <div className="p-3 bg-[var(--bg)] border border-[var(--purple)] rounded-md flex items-center justify-between gap-2 animate-[fadeIn_0.1s_ease-out]">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-lg">📄</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-[var(--bright)] truncate">{selectedFile.name}</div>
                        <div className="text-[10px] text-[var(--muted)]">{(selectedFile.size / 1024).toFixed(1)} KB</div>
                      </div>
                    </div>
                    <button 
                      type="button"
                      className="text-xs text-[var(--muted)] hover:text-[var(--red)] p-1 px-2 border border-[var(--border2)] rounded hover:bg-[#ff000010] cursor-pointer transition-colors"
                      onClick={() => setSelectedFile(null)}
                    >
                      解除
                    </button>
                  </div>
                ) : (
                  <input
                    type="file"
                    className="w-full text-xs p-2 bg-[var(--bg)] border border-[var(--border2)] rounded-md text-[var(--text)] cursor-pointer"
                    accept=".pdf,.txt,.mhtml,.docx,.json"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setSelectedFile(e.target.files[0]);
                        setImportUrl("");
                      }
                    }}
                  />
                )}
                <p className="text-[10px] text-[var(--muted)] px-1">
                  対応形式: JSON (.json) / PDF / テキスト (.txt) / MHTML (.mhtml) / Word (.docx)
                </p>
              </div>
            </div>

            <div>
              <label className="text-[11px] text-[var(--subtle)] font-bold block mb-1">2. 取り込みモード</label>
              <select
                className="w-full text-xs p-2.5 bg-[var(--bg)] border border-[var(--border2)] rounded-md text-[var(--text)] outline-none focus:border-[var(--purple)]"
                value={importMode}
                onChange={(e) => setImportMode(e.target.value)}
              >
                <option value="raw">そのまま取り込む</option>
                <option value="summarize">要約して取り込む</option>
                <option value="keypoints">キーポイントを抽出</option>
              </select>
            </div>

            <div className="flex items-start gap-2 text-xs text-[var(--text)] cursor-pointer">
              <input
                id="modal-opt-title"
                type="checkbox"
                className="w-4 h-5 cursor-pointer accent-[var(--purple)]"
                checked={optimizeTitle}
                onChange={(e) => setOptimizeTitle(e.target.checked)}
              />
              <label htmlFor="modal-opt-title" className="cursor-pointer flex flex-col select-none">
                <span className="font-bold">AIでタイトルを最適化する</span>
                <span className="text-[10px] text-[var(--green)] mt-0.5 leading-normal">
                  ✦ 2件以上の取り込み時は自動バッチ一括処理に切替わり、API呼び出し回数を1回に集約して消費量を削減します。
                </span>
              </label>
            </div>

            {/* 反映方法 */}
            <div className="border-t border-[var(--border)] pt-3">
              <label className="text-[11px] text-[var(--subtle)] font-bold block mb-1.5">3. 反映方法</label>
              <div className="flex flex-col gap-1.5 bg-[var(--bg)] border border-[var(--border2)] rounded-md p-2.5">
                <label className="flex items-start gap-2 text-[11px] text-[var(--text)] cursor-pointer">
                  <input
                    type="radio"
                    name="import-overwrite-mode"
                    className="mt-0.5 cursor-pointer accent-[var(--purple)]"
                    checked={!overwriteBatch}
                    onChange={() => setOverwriteBatch(false)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[var(--blue)] font-bold">既存のノートに統合・追加（推奨）</div>
                  </div>
                </label>
                <label className="flex items-start gap-2 text-[11px] text-[var(--text)] cursor-pointer mt-0.5">
                  <input
                    type="radio"
                    name="import-overwrite-mode"
                    className="mt-0.5 cursor-pointer accent-[var(--purple)]"
                    checked={overwriteBatch}
                    onChange={() => setOverwriteBatch(true)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[var(--red)]">⚠️ 既存データを全て削除して【丸ごと上書き】</div>
                  </div>
                </label>
              </div>
            </div>

            {/* Spreadsheet Integration Portal */}
            <div className="border-t border-[var(--border)] pt-3">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[11px] text-[var(--subtle)] font-bold block">4. 個別スプレッドシートから未処理分を取得</label>
                <button
                  type="button"
                  onClick={() => setShowSheetUrlHelp(!showSheetUrlHelp)}
                  className="text-[10px] text-[var(--purple)] font-bold hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <HelpCircle className="w-3 h-3" />
                  URLについて
                </button>
              </div>

              {showSheetUrlHelp && (
                <div className="mb-3 p-2.5 bg-[var(--purple)]/10 border border-[var(--purple)]/30 rounded-md text-[10px] text-[var(--text)] leading-relaxed">
                  <p>対象のスプレッドシートをブラウザで開き、アドレスバーのURLを貼り付けてください。</p>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  className="w-full text-xs p-2 bg-[var(--bg)] border border-[var(--border2)] rounded-md text-[var(--text)] font-mono"
                  placeholder="スプレッドシートのURL"
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                />
                <input
                  type="text"
                  className="w-full text-xs p-2 bg-[var(--bg)] border border-[var(--border2)] rounded-md text-[var(--text)] font-mono"
                  placeholder="シート名 (例: シート1)"
                  value={sheetName}
                  onChange={(e) => setSheetName(e.target.value)}
                />
                <button
                  type="button"
                  className="w-full py-1.5 bg-transparent text-xs hover:bg-[var(--border)] border border-[var(--border2)] rounded-md text-[var(--text)] font-semibold cursor-pointer"
                  onClick={fetchSheetData}
                  disabled={isProcessing}
                >
                  未処理データ一覧を取得
                </button>

                {pendingSheetItems.length > 0 && (
                  <>
                    <div className="flex items-center justify-between px-1 mt-1">
                      <span className="text-[10px] text-[var(--subtle)] font-bold">未処理項目: {pendingSheetItems.length}件</span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedIndices(pendingSheetItems.map((_, i) => i))}
                          className="text-[10px] text-[var(--purple)] font-bold cursor-pointer"
                        >
                          全て選択
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedIndices([])}
                          className="text-[10px] text-gray-400 cursor-pointer"
                        >
                          解除
                        </button>
                      </div>
                    </div>
                    <div className="max-h-[120px] overflow-y-auto border border-[var(--border)] rounded-md p-1.5 bg-[var(--bg)] flex flex-col gap-1">
                      {pendingSheetItems.map((item, idx) => (
                        <label key={idx} className="flex items-start gap-2 p-1 border-b border-[var(--border2)] last:border-0 cursor-pointer text-left">
                          <input
                            type="checkbox"
                            className="mt-0.5 accent-[var(--green)] cursor-pointer"
                            checked={selectedIndices.includes(idx)}
                            onChange={() => handleCheckboxChange(idx)}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] font-semibold text-[var(--text)] truncate">{item.title}</div>
                            <div className="text-[9px] text-[var(--muted)] line-clamp-1">{item.highlights}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="w-full py-2 bg-[#238636] hover:bg-[#2ea043] text-white font-bold text-xs rounded-md cursor-pointer transition-colors"
                      onClick={importSelectedItems}
                      disabled={isProcessing}
                    >
                      選択した {selectedIndices.length} 件を取り込む
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Direct File/URL Submit */}
            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border2)]">
              <button
                type="button"
                className="text-xs text-[var(--purple)] bg-[#a371f715] border border-[#a371f744] hover:bg-[#a371f725] p-2 px-5 rounded-md cursor-pointer font-bold"
                onClick={runImport}
                disabled={isProcessing}
              >
                {processingText}
              </button>
            </div>
          </div>
        )}

        {/* Footer Close */}
        <div className="flex justify-end border-t border-[var(--border2)] pt-3">
          <button
            type="button"
            className="text-xs text-[var(--subtle)] border border-[var(--border2)] hover:bg-[var(--border)] p-2 px-4 rounded-md cursor-pointer font-medium"
            onClick={onClose}
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
