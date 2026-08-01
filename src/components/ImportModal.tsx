/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Note } from "../types";
import { formatDateStr } from "../utils/graphDataParser";

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateNoteExt: (title: string, content: string, folder: string, sourceUrl: string, timestamp?: number) => void;
  onSaveToast: (msg: string) => void;
  apiPost: (body: any) => Promise<any>;
  onNotesUpdateBatch: (newNotes: Note[], overwrite?: boolean) => void;
}

export default function ImportModal({ isOpen, onClose, onCreateNoteExt, onSaveToast, apiPost, onNotesUpdateBatch }: ImportModalProps) {
  const [importUrl, setImportUrl] = useState("");
  const [importMode, setImportMode] = useState("raw");
  const [optimizeTitle, setOptimizeTitle] = useState(true);
  const [sheetUrl, setSheetUrl] = useState("https://docs.google.com/spreadsheets/d/1adkx60akE6nOZI2DUq_ne1MO2kERBzRiLc1fFxz0pnM/edit?usp=sharing");
  const [sheetName, setSheetName] = useState("シート1");
  const [overwriteBatch, setOverwriteBatch] = useState(false); // Default to false (Integration / Merge)
  
  // Sheet state
  const [pendingSheetItems, setPendingSheetItems] = useState<any[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  
  // Local files
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
    }
  }, [isOpen]);

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
      // Auto-select all indices
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
    let importModel = localStorage.getItem("cn_gemini_model") || "gemini-2.0-flash";
    if (importModel.includes("2.5")) importModel = "gemini-2.0-flash";

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
            const parsed = JSON.parse(rawText);
            Object.keys(parsed).forEach(k => {
              const numKey = parseInt(k, 10);
              if (!isNaN(numKey) && parsed[k]) {
                batchTitlesMap[numKey] = String(parsed[numKey]).replace(/^#\s*/, "").replace(/[\"\'「」]/g, "");
              }
            });
            onSaveToast("タイトルのバッチ一括最適化が完了しました！");
          } else {
            console.warn("Batch title optimization API returned error status, falling back to individual mode");
          }
        } catch (batchErr) {
          console.error("Batch Title Optimization failed, fallback activated", batchErr);
        }
      }

      for (let i = 0; i < selectedItems.length; i++) {
        const item = selectedItems[i];
        
        let dateStr = "";
        let dateObj: Date | null = null;
        if (item.saved_at) {
          const d = new Date(item.saved_at);
          if (!isNaN(d.getTime())) {
            dateStr = d.toLocaleString("ja-JP");
            dateObj = d;
          } else {
            dateStr = item.saved_at;
          }
        }

        let content = `# ${item.title}\n\n${item.highlights}`;
        if (dateStr) content += `\n\n---\n**保存日時:** ${dateStr}`;
        if (item.url) content += `\n**リンク先:** [${item.url}](${item.url})`;

        let title = item.title;

        if (optimizeTitle && apiKey) {
          if (selectedItems.length > 1) {
            if (batchTitlesMap[i]) {
              title = batchTitlesMap[i];
            }
          } else {
            // Single item, individual fallback API call
            onSaveToast(`AI処理中... (${i + 1}/${selectedItems.length})`);
            try {
              const prompt = `以下のテキストの内容を最もよく表す、短くて魅力的な日本語のタイトル（20文字以内）を1つだけ提案してください。出力はタイトルのみとし、装飾や説明は不要です。\n\n内容:\n${content.substring(0, 2000)}`;
              const r = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${importModel}:generateContent?key=${apiKey}`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.5, maxOutputTokens: 60 }
                  })
                }
              );
              if (r.ok) {
                const rd = await r.json();
                const at = rd.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
                if (at) title = at.replace(/^#\s*/, "").replace(/[\"\'「」]/g, "");
              }
            } catch (e) {
              console.error("Title AI error", e);
            }
          }
        }

        // Reassemble with updated title
        content = `# ${title}\n\n${item.highlights}`;
        
        if (dateStr) content += `\n\n---\n**保存日時:** ${dateStr}`;
        if (item.url) content += `\n**リンク先:** [${item.url}](${item.url})`;

        const folderName = item.category || formatDateStr(Date.now()).replace(/-/g, "");
        const folderTag = `[folder:${folderName}]`;

        const timestampToken = dateObj ? dateObj.getTime() : Date.now();

        const note: Note = {
          id: Math.random().toString(36).substring(2, 10) + Date.now().toString(36),
          title: title,
          content: content,
          summary: "",
          keywords: item.tags ? `${item.tags}, ${folderTag}` : folderTag,
          sourceUrl: item.url || "",
          createdAt: timestampToken,
          updatedAt: Date.now(),
          timeline: item.timeline || "",
          columnJ: item.columnI || ""
        };

        newNotes.push(note);
      }

      onSaveToast("クラウドへ保存中...");
      onNotesUpdateBatch(newNotes);
      await apiPost({ action: "markHighlightsProcessed", sourceSsId, sheetName, rowIndices });

      onSaveToast(`${newNotes.length}件のノートを取り込みました ✦`);
      onClose();
    } catch (err: any) {
      onSaveToast("エラー: " + err.message);
    } finally {
      setIsProcessing(false);
      setProcessingText("実行");
    }
  };

  const runImport = async () => {
    if (!importUrl && !selectedFile) {
      return onSaveToast("URLまたはファイルを選択してください");
    }

    setIsProcessing(true);
    setProcessingText("処理中...");
    onSaveToast("抽出中...");

    let text = "";
    let title = "取り込んだノート";

    try {
      const apiKey = localStorage.getItem("cn_gemini_key");
      let importModel = localStorage.getItem("cn_gemini_model") || "gemini-2.0-flash";
    if (importModel.includes("2.5")) importModel = "gemini-2.0-flash";
      const importTemp = parseFloat(localStorage.getItem("cn_gemini_temp") || "0.1");

      const fetchAiTitle = async (content: string, currentTitle: string) => {
        if (!apiKey || !optimizeTitle) return currentTitle;
        try {
          const prompt = `以下のテキストの内容を最もよく表す、短くて魅力的な日本語のタイトル（20文字以内）を1つだけ提案してください。出力はタイトルのみとし、装飾や説明は不要です。\n\n内容:\n${content.substring(0, 2000)}`;
          const r = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${importModel}:generateContent?key=${apiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.5, maxOutputTokens: 60 }
              })
            }
          );
          if (!r.ok) return currentTitle;
          const rd = await r.json();
          const at = rd.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || currentTitle;
          return at.replace(/^#\s*/, "").replace(/[\"\'「」]/g, "");
        } catch (e) {
          return currentTitle;
        }
      };

      // --- Google Document Import ---
      if (importUrl) {
        const urlRes = await apiPost({ action: "fetchDriveFile", url: importUrl });
        if (urlRes.error) throw new Error(urlRes.error);
        
        text = urlRes.text;
        if (urlRes.title) title = urlRes.title;
        
        if (optimizeTitle && apiKey) {
          onSaveToast("タイトルをAIが考えています...");
          title = await fetchAiTitle(text, title);
        }

        let formattedContent = `# ${title}\n\n${text}`;
        if (importUrl) {
          formattedContent += `\n\n---\n**リンク先:** [${importUrl}](${importUrl})`;
        }
        onCreateNoteExt(title, formattedContent, formatDateStr(Date.now()).replace(/-/g, ""), importUrl);
        
        onSaveToast("取り込みが完了しました ✦");
        onClose();
        return;
      }

      // --- Local File parser ---
      if (selectedFile) {
        const fileNameLower = selectedFile.name.toLowerCase();
        title = selectedFile.name.replace(/\.[^/.]+$/, "");

        if (fileNameLower.endsWith(".json")) {
          onSaveToast("JSONデータを解析中...");
          const jsonText = await selectedFile.text();
          let parsedData: any;
          try {
            parsedData = JSON.parse(jsonText);
          } catch (e: any) {
            throw new Error(`JSON解析エラー: ${e.message}。ファイル構造を確認してください。`);
          }

          let importedNotes: Note[] = [];

          // 形式の柔軟な正規化
          if (parsedData) {
            if (Array.isArray(parsedData.notes)) {
              importedNotes = parsedData.notes;
            } else if (Array.isArray(parsedData)) {
              importedNotes = parsedData;
            } else if (typeof parsedData === "object") {
              // 単一のノート、または他のラップキー
              const keys = Object.keys(parsedData);
              const arrayKey = keys.find(k => Array.isArray(parsedData[k]));
              if (arrayKey) {
                importedNotes = parsedData[arrayKey];
              } else {
                importedNotes = [parsedData];
              }
            }
          }

          if (importedNotes.length === 0) {
            throw new Error("有効なJSONデータ（ノートの配列またはオブジェクト）が見つかりませんでした。");
          }

          // Note 形式として不備があるものは補完・正規化
          const validNotes: Note[] = importedNotes.map((n: any) => {
            const id = n.id || n.ID || Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
            const title = n.title || n.Title || n.name || "インポートされたノート";
            const content = n.content || n.Content || n.body || n.text || n.highlights || "";
            const summary = n.summary || n.Summary || "";
            let keywords = n.keywords || n.Keywords || "";
            const sourceUrl = n.sourceUrl || n.SourceUrl || n.url || n.URL || "";
            const createdAt = n.createdAt || n.CreatedAt || n.created_at || Date.now();
            const updatedAt = n.updatedAt || n.UpdatedAt || n.updated_at || Date.now();

            // フォルダ・分類情報の維持:
            // インポートされたJSON内にある folder / Folder / category / Category / folderName などのキーを検知し、
            // keywords に [folder:FolderName] 形式で含まれていない場合は追加します。
            const folderVal = n.folder || n.Folder || n.category || n.Category || n.folderName || "";
            if (folderVal && typeof folderVal === "string" && !keywords.includes("[folder:")) {
              const cleanFolder = folderVal.trim();
              if (cleanFolder) {
                keywords = keywords ? `${keywords}, [folder:${cleanFolder}]` : `[folder:${cleanFolder}]`;
              }
            }

            return {
              id: String(id),
              title: String(title),
              content: String(content),
              summary: String(summary),
              keywords: String(keywords),
              sourceUrl: String(sourceUrl),
              createdAt: typeof createdAt === "number" ? createdAt : new Date(createdAt).getTime() || Date.now(),
              updatedAt: typeof updatedAt === "number" ? updatedAt : new Date(updatedAt).getTime() || Date.now(),
            };
          }).filter(n => n.content.trim().length > 0 || n.title.trim().length > 0);

          if (validNotes.length === 0) {
            throw new Error("有効なテキスト内容、またはタイトルを含むノートが見つかりませんでした。");
          }

          onSaveToast(`${validNotes.length}件のデータをインポート中...`);
          onNotesUpdateBatch(validNotes, overwriteBatch);
          onSaveToast(`${validNotes.length}件のノートを処理しました ✦`);
          onClose();
          return;
        }

        if (fileNameLower.endsWith(".txt")) {
          text = await selectedFile.text();
        } else if (fileNameLower.endsWith(".mhtml")) {
          const raw = await selectedFile.text();
          text = raw
            .replace(/<style[\s\S]*?<\/style>/gi, "")
            .replace(/<script[\s\S]*?<\/script>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/&nbsp;/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        } else if (fileNameLower.endsWith(".docx") && apiKey) {
          onSaveToast("AIがWordファイルを解析中...");
          const docxB64 = await new Promise<string>((res, rej) => {
            const fr = new FileReader();
            fr.onload = () => res((fr.result as string).split(",")[1]);
            fr.onerror = rej;
            fr.readAsDataURL(selectedFile);
          });
          const docxMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
          const docxPr = importMode === "raw" ? "このWordファイルに含まれるすべてのテキストをそのまま抽出してください。"
            : importMode === "summarize" ? "このWordファイルの内容を分かりやすく要約してください。"
              : "このWordファイルから重要なキーポイントを箇条書きで抽出してください。";

          const maxTok = Math.max(parseInt(localStorage.getItem("cn_gemini_tokens") || "2000", 10), 2000);
          const r = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${importModel}:generateContent?key=${apiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ parts: [{ text: docxPr }, { inlineData: { mimeType: docxMime, data: docxB64 } }] }],
                generationConfig: { temperature: importTemp, maxOutputTokens: maxTok }
              })
            }
          );
          if (!r.ok) { throw new Error(`HTTP Error ${r.status}: ${r.status === 404 ? 'API Endpoint not found. Please check your model settings.' : ''}`);
            const de = await r.json();
            throw new Error(de.error?.message || "Wordファイルの解析に失敗しました");
          }
          const rd = await r.json();
          const docxText = rd.candidates?.[0]?.content?.parts?.[0]?.text || "";
          if (!docxText.trim()) throw new Error("Wordファイルからテキストを抽出できませんでした");

          if (optimizeTitle) {
            onSaveToast("タイトルを最適化中...");
            title = await fetchAiTitle(docxText, title);
          }

          const suffix = importMode === "summarize" ? " (要約)" : importMode === "keypoints" ? " (抽出)" : "";
          const finalTitle = title + suffix;
          const formatted = `# ${finalTitle}\n\n${docxText}`;

          onCreateNoteExt(finalTitle, formatted, formatDateStr(Date.now()).replace(/-/g, ""), "");
          onSaveToast("取り込みが完了しました ✦");
          onClose();
          return;

        } else if (fileNameLower.endsWith(".pdf")) {
          if (apiKey) {
            onSaveToast("AIがPDFを解析中...");
            const pdfB64 = await new Promise<string>((res, rej) => {
              const fr = new FileReader();
              fr.onload = () => res((fr.result as string).split(",")[1]);
              fr.onerror = rej;
              fr.readAsDataURL(selectedFile);
            });
            const pdfPr = importMode === "raw" ? "このPDFに含まれるすべてのテキストをそのまま抽出してください。要約や追加のコメントは一切不要です。"
              : importMode === "summarize" ? "このPDFの内容を分かりやすく要約してください。"
                : "このPDFから重要なキーポイントを箇条書きで抽出してください。";

            const maxTok = Math.max(parseInt(localStorage.getItem("cn_gemini_tokens") || "2000", 10), 2000);
            const r = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${importModel}:generateContent?key=${apiKey}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  contents: [{ parts: [{ text: pdfPr }, { inlineData: { mimeType: "application/pdf", data: pdfB64 } }] }],
                  generationConfig: { temperature: importTemp, maxOutputTokens: maxTok }
                })
              }
            );
            if (!r.ok) { throw new Error(`HTTP Error ${r.status}: ${r.status === 404 ? 'API Endpoint not found. Please check your model settings.' : ''}`);
              const pe = await r.json();
              throw new Error(pe.error?.message || "PDF解析に失敗しました");
            }
            const rd = await r.json();
            const pdfAiText = rd.candidates?.[0]?.content?.parts?.[0]?.text || "";
            if (!pdfAiText.trim()) throw new Error("AIでテキストを抽出できませんでした");

            if (optimizeTitle) {
              onSaveToast("タイトルを最適化中...");
              title = await fetchAiTitle(pdfAiText, title);
            }

            const suffix = importMode === "summarize" ? " (要約)" : importMode === "keypoints" ? " (抽出)" : "";
            const finalTitle = title + suffix;
            const formatted = `# ${finalTitle}\n\n${pdfAiText}`;

            onCreateNoteExt(finalTitle, formatted, formatDateStr(Date.now()).replace(/-/g, ""), "");
            onSaveToast("取り込みが完了しました ✦");
            onClose();
            return;
          } else {
            // Fallback pdf.js local renderer parsing
            onSaveToast("PDFページをローカル解析中...");
            const arrBuf = await selectedFile.arrayBuffer();
            const pdfjs = (window as any).pdfjsLib;
            if (!pdfjs) throw new Error("PDFレンダラーが見つかりません。");
            const pdfDoc = await pdfjs.getDocument({ data: arrBuf }).promise;
            for (let i = 1; i <= pdfDoc.numPages; i++) {
              const pg = await pdfDoc.getPage(i);
              const pgContent = await pg.getTextContent();
              text += pgContent.items.map((item: any) => item.str).join(" ") + "\n";
            }
            if (!text.trim()) {
              throw new Error("スキャンされたPDF等からテキストが抽出できませんでした。Gemini APIキーを設定すると、AIによる画像文字認識(OCR)が使用可能です。");
            }
          }
        }

        // Post-file extract pipeline for raw txt, pdf (without AI core)
        if (!text.trim()) throw new Error("テキストが見つかりません");

        if (importMode === "raw") {
          if (optimizeTitle) {
            onSaveToast("タイトルを最適化中...");
            title = await fetchAiTitle(text, title);
          }
          const formatted = `# ${title}\n\n${text}`;
          onCreateNoteExt(title, formatted, formatDateStr(Date.now()).replace(/-/g, ""), "");
          onSaveToast("取り込みました");
        } else {
          onSaveToast("AI処理中...");
          if (!apiKey) throw new Error("AI処理にはAPIキーの設定が必要です。");
          const aiMaxTok = parseInt(localStorage.getItem("cn_gemini_tokens") || "1024", 10);
          
          const promptTemplate = importMode === "summarize"
            ? (localStorage.getItem("cn_prompt_import_summarize") || "以下の文章を分かりやすく要約してください。\n\n{content}")
            : (localStorage.getItem("cn_prompt_import_keypoints") || "以下の文章から重要なキーポイントを箇条書きで抽出してください。\n\n{content}");
          
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
          if (!r.ok) { throw new Error(`HTTP Error ${r.status}: ${r.status === 404 ? 'API Endpoint not found. Please check your model settings.' : ''}`);
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
          const formatted = `# ${finalTitle}\n\n${processedText}\n\n---\n<details><summary>元のテキストを展開する</summary>\n\n${text}\n</details>`;

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
      <div className="bg-[var(--surface)] border border-[var(--border2)] rounded-xl p-6 w-[380px] max-w-full my-auto shadow-2xl flex flex-col gap-4 animate-[fadeIn_0.15s_ease-out]">
        <div>
          <div className="text-base font-bold text-[var(--bright)] flex items-center gap-2">
            <span>📥</span> ノートの取り込み
          </div>
          <p className="text-xs text-[var(--subtle)] mt-1 leading-relaxed">
            各種ファイルやGoogleドキュメントからテキストを抽出してノートを作成します。
          </p>
        </div>

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
                if (e.target.value) setSelectedFile(null); // Clear file
              }}
            />
            <p className="text-[10px] text-[var(--muted)] px-1 leading-relaxed">
              ⚠️ Googleドキュメントのテキストをそのまま読み込む場合は、共有リンクのURLを貼り付けてください。
            </p>
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
                    setImportUrl(""); // Clear URL
                  }
                }}
              />
            )}
            <p className="text-[10px] text-[var(--muted)] px-1">
              対応形式: JSON (.json) / PDF / テキスト (.txt) / MHTML (.mhtml) / Word (.docx)
            </p>
            {selectedFile && selectedFile.name.toLowerCase().endsWith(".json") && (
              <div className="mt-1.5 p-2 bg-[#1f242c] border border-[var(--border2)] rounded text-[10px] text-[var(--subtle)] leading-relaxed">
                💡 <strong>JSONデータの推奨フォーマット:</strong><br />
                <code>[ &#123; "title": "ノート名", "content": "本文..." &#125; ]</code> の配列、または <code>&#123; "notes": [ ... ] &#125;</code> の形式を自動解析します。<br />
                本文キーは <code>content</code> / <code>body</code> / <code>text</code> / <code>highlights</code>、タイトルは <code>title</code> / <code>name</code> を検知します。
              </div>
            )}
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
              ✦ 2件以上の取り込み時は自動バッチ一括処理に切替わり、API呼び出し回数を1回に集約して消費量を極限まで削減します。
            </span>
          </label>
        </div>

        {/* インポート時の統合・上書き挙動の設定 */}
        <div className="border-t border-[var(--border)] pt-3.5">
          <label className="text-[11px] text-[var(--subtle)] font-bold block mb-1.5">3. インポートデータの反映方法</label>
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
                <div className="font-semibold text-[var(--blue)] font-bold">既存のノートに統合・追加（推奨・デフォルト）</div>
                <div className="text-[9px] text-[var(--muted)] leading-normal">現在の全メモはそのまま安全に残し、新しくインポートしたデータを統合します（確認ダイアログを経由せず即座に反映します）。</div>
              </div>
            </label>
            <label className="flex items-start gap-2 text-[11px] text-[var(--text)] cursor-pointer mt-0.5 opacity-80 hover:opacity-100 transition-opacity">
              <input
                type="radio"
                name="import-overwrite-mode"
                className="mt-0.5 cursor-pointer accent-[var(--purple)]"
                checked={overwriteBatch}
                onChange={() => setOverwriteBatch(true)}
              />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[var(--red)]">⚠️ 既存データを全て削除して【丸ごと上書き】</div>
                <div className="text-[9px] text-[var(--muted)] leading-normal">現在のすべてのノートを削除し、インポートデータのみに全差し替えします（実行前に確認画面が表示されます）。</div>
              </div>
            </label>
          </div>
        </div>

        {/* Spreadsheet Integration Portal */}
        <div className="border-t border-[var(--border)] pt-4">
          <label className="text-[11px] text-[var(--subtle)] font-bold block mb-2">3. スプレッドシートから連携して取り込み</label>
          <div className="flex flex-col gap-2">
            <input
              type="text"
              className="w-full text-xs p-2.5 bg-[var(--bg)] border border-[var(--border2)] rounded-md text-[var(--text)] outline-none focus:border-[var(--purple)] font-mono"
              placeholder="スプレッドシートのURLを貼り付け"
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
            />
            <input
              type="text"
              className="w-full text-xs p-2.5 bg-[var(--bg)] border border-[var(--border2)] rounded-md text-[var(--text)] outline-none focus:border-[var(--purple)] font-mono"
              placeholder="シート名 (highlights)"
              value={sheetName}
              onChange={(e) => setSheetName(e.target.value)}
            />
            <button
              className="w-full py-2 bg-transparent text-xs hover:bg-[var(--border)] border border-[var(--border2)] rounded-md text-[var(--text)] font-semibold cursor-pointer transition-colors"
              onClick={fetchSheetData}
              disabled={isProcessing}
            >
              未処理のデータ一覧を取得
            </button>

            {pendingSheetItems.length > 0 && (
              <>
                <div className="flex items-center justify-between px-1 mt-1">
                  <span className="text-[10px] text-[var(--subtle)] font-bold">取得済みの未処理項目: {pendingSheetItems.length}件</span>
                  <div className="flex gap-2.5">
                    <button
                      type="button"
                      onClick={() => setSelectedIndices(pendingSheetItems.map((_, i) => i))}
                      className="text-[10px] text-[var(--purple)] hover:opacity-80 transition-opacity font-bold cursor-pointer bg-none border-none p-0"
                    >
                      全て選択
                    </button>
                    <span className="text-[10px] text-gray-600">|</span>
                    <button
                      type="button"
                      onClick={() => setSelectedIndices([])}
                      className="text-[10px] text-gray-400 hover:text-gray-300 transition-colors cursor-pointer bg-none border-none p-0"
                    >
                      全て解除
                    </button>
                  </div>
                </div>
                <div className="max-h-[140px] overflow-y-auto border border-[var(--border)] rounded-md p-2 bg-[var(--bg)] flex flex-col gap-1">
                  {pendingSheetItems.map((item, idx) => (
                    <label
                      key={idx}
                      className="flex items-start gap-2 p-1.5 border-b border-[var(--border2)] last:border-0 cursor-pointer text-left"
                    >
                      <input
                        type="checkbox"
                        className="mt-1 accent-[var(--green)] cursor-pointer"
                        checked={selectedIndices.includes(idx)}
                        onChange={() => handleCheckboxChange(idx)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-semibold text-[var(--text)] truncate">{item.title}</div>
                        <div className="text-[9px] text-[var(--muted)] line-clamp-2 leading-relaxed">{item.highlights}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </>
            )}

            {selectedIndices.length > 0 && (
              <button
                className="w-full py-2.5 bg-[#2386361a] hover:bg-[#23863633] border border-[#23863644] text-[#7ee787] font-bold text-xs rounded-md cursor-pointer transition-all"
                onClick={importSelectedItems}
                disabled={isProcessing}
              >
                選択した {selectedIndices.length} 件を取り込む
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-2 justify-end border-t border-[var(--border2)] pt-4 mt-1">
          <button
            className="text-xs text-[var(--subtle)] border border-[var(--border2)] hover:bg-[var(--border)] p-2 px-4 rounded-md cursor-pointer font-medium transition-colors"
            onClick={onClose}
          >
            閉じる
          </button>
          <button
            className="text-xs text-[var(--purple)] bg-[#a371f715] border border-[#a371f744] hover:bg-[#a371f725] p-2 px-5 rounded-md cursor-pointer font-bold transition-all"
            onClick={runImport}
            disabled={isProcessing}
          >
            {processingText}
          </button>
        </div>
      </div>
    </div>
  );
}
