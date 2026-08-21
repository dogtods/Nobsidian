/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// 最新のGoogle Apps Script (GAS) コード
// スプレッドシート同期（シート名切り替え対応） & Google Drive一括保存対応
export const LATEST_GAS_SCRIPT = `/**
 * ====================================================================
 * 本アプリ専用: Google Apps Script (GAS) 同期 & Google Drive保存用スクリプト
 * ====================================================================
 * 
 * 【重要：今回の追加機能（Google Drive保存）に必要な初回権限設定手順】
 * 1. エディタ上部の関数選択ドロップダウン（\`doGet\` や \`doPost\` などが表示されている場所）から
 *    『authorizeDrivePermissions』を選択します。
 * 2. 「実行」ボタンをクリックします。
 * 3. 「承認が必要です」ポップアップが表示されたら「権限を確認」をクリックし、
 *    お使いのGoogleアカウントを選択 ＞ 「詳細を表示」 ＞ 「（安全ではないページ）に移動」 ＞ 「許可」 をクリックします。
 * 
 * 【デプロイ手順（コード更新後）】
 * 1. コードを保存（Ctrl+S または ⌘+S）します。
 * 2. 右上の「デプロイ」 ＞ 「新しいデプロイ」 をクリックします。（※重要：既存のデプロイを更新するのではなく『新しいデプロイ』を作成してください）
 * 3. 以下の設定を確認します：
 *    - 種類：ウェブアプリ
 *    - 次のユーザーとして実行：自分
 *    - アクセスできるユーザー：「全員」（Anyone）※認証不要にするため必須
 * 4. 「デプロイ」をクリックし、発行された新しい「ウェブアプリのURL」（.../exec）をコピーします。
 * 5. 本アプリの「設定⚙（Gemini AI設定）」を開き、GAS URL欄に貼り付けて保存します！
 */

// スプレッドシート内の保存先シートを取得/自動生成する関数（シート名の指定対応）
function getSheet(targetSheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error("スプレッドシートのアクティブなインスタンスが見つかりません。コンテナバインドスクリプトとして作成してください。");
  }
  const name = (targetSheetName && String(targetSheetName).trim()) ? String(targetSheetName).trim() : "Notes";
  let sheet = ss.getSheetByName(name);
  const headers = ["id", "title", "content", "summary", "keywords", "createdAt", "updatedAt", "sourceUrl", "timeline", "columnJ"];
  if (!sheet) {
    sheet = ss.insertSheet(name);
    // ヘッダー行を付与
    sheet.appendRow(headers);
  } else {
    // 既存のシートがある場合、必要なヘッダー列が不足していないか自動拡張
    const lastCol = sheet.getLastColumn();
    if (lastCol === 0) {
      sheet.appendRow(headers);
    } else if (lastCol < headers.length) {
      for (let c = 1; c <= headers.length; c++) {
        const headerCell = sheet.getRange(1, c);
        if (headerCell.getValue() === "") {
          headerCell.setValue(headers[c - 1]);
        }
      }
    }
  }
  return sheet;
}

// ==== 統合リクエスト処理関数（GET/POST両対応、FormData・JSON・クエリパラメータ対応） ====
function processApiRequest(e) {
  // GASエディタ画面から直接「実行」ボタンを押した場合の親切メッセージ
  if (!e) {
    return createJsonResponse({ 
      status: "ok", 
      message: "Connected Notes Web API (GAS) は正常に稼働しています。このURLをアプリの設定画面に貼り付けてご利用ください。（※GASエディタからの直接実行ではなく、ブラウザやアプリからのアクセスで正常動作します）" 
    });
  }

  // 1. リクエストデータ（JSON / FormData / クエリパラメータ）の統合抽出
  let postData = {};
  
  // A. postData.contents (JSON形式のPOSTボディ)
  if (e.postData && e.postData.contents) {
    try {
      const parsed = JSON.parse(e.postData.contents);
      if (parsed && typeof parsed === "object") {
        postData = parsed;
      }
    } catch (jsonErr) {
      // JSONパース不可の場合はそのまま保持
    }
  }

  // B. parameter.payload (FormData または URLSearchParams で送られたJSON文字列)
  if (!postData.action && e.parameter && e.parameter.payload) {
    try {
      const parsedPayload = JSON.parse(e.parameter.payload);
      if (parsedPayload && typeof parsedPayload === "object") {
        postData = parsedPayload;
      }
    } catch (payloadErr) {
      // パース不可の場合はスルー
    }
  }

  // C. parameter (クエリパラメータまたはフォーム値)
  if (!postData.action && e.parameter) {
    postData = e.parameter;
  }

  const action = postData.action || (e.parameter ? e.parameter.action : "");
  const targetSheet = postData.sheetName || (e.parameter ? e.parameter.sheetName : "");

  // action未指定の場合（単なるURLアクセス）
  if (!action) {
    return createJsonResponse({ 
      status: "ok", 
      message: "Connected Notes Web API (GAS) は正常に稼働しています。アプリからデータ同期を行ってください。" 
    });
  }

  let result = {};

  // 2. 各アクションの振り分け実行
  if (action === "getNotes") {
    try {
      const sheet = getSheet(targetSheet);
      const lastRow = sheet.getLastRow();
      if (lastRow <= 1) {
        return createJsonResponse({ notes: [], sheetName: sheet.getName() });
      }
      
      const data = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
      const notes = data.map((row, idx) => {
        let cAt = Date.now();
        if (row[5] instanceof Date) {
          cAt = row[5].getTime();
        } else {
          const num = Number(row[5]);
          if (row[5] !== "" && !isNaN(num) && num > 0) {
            cAt = num;
          }
        }

        let uAt = cAt;
        if (row[6] instanceof Date) {
          uAt = row[6].getTime();
        } else {
          const num = Number(row[6]);
          if (row[6] !== "" && !isNaN(num) && num > 0) {
            uAt = num;
          }
        }

        return {
          id: String(row[0] || ("note_" + (Date.now() + idx))),
          title: String(row[1] || ""),
          content: String(row[2] || ""),
          summary: String(row[3] || ""),
          keywords: String(row[4] || ""),
          createdAt: cAt,
          updatedAt: uAt,
          sourceUrl: String(row[7] || ""),
          timeline: row[8] ? String(row[8]) : "",
          columnJ: row[9] ? String(row[9]) : ""
        };
      }).filter(n => n.title.trim() !== "" || n.content.trim() !== "");
      
      return createJsonResponse({ notes: notes, sheetName: sheet.getName() });
    } catch (err) {
      return createJsonResponse({ error: err.message });
    }
  } else if (action === "saveNote") {
    const note = typeof postData.note === "string" ? JSON.parse(postData.note) : postData.note;
    result = saveNote(note, targetSheet);
  } else if (action === "deleteNote") {
    result = deleteNote(postData.id, targetSheet);
  } else if (action === "saveAll") {
    const notes = typeof postData.notes === "string" ? JSON.parse(postData.notes) : postData.notes;
    result = saveAll(notes, targetSheet);
  } else if (action === "fetchDriveFile") {
    result = fetchDriveFile(postData.url);
  } else if (action === "fetchUnprocessedHighlights") {
    result = fetchUnprocessedHighlights(postData.sourceSsId, postData.sheetName);
  } else if (action === "markHighlightsProcessed") {
    const rowIndices = typeof postData.rowIndices === "string" ? JSON.parse(postData.rowIndices) : postData.rowIndices;
    result = markHighlightsProcessed(postData.sourceSsId, postData.sheetName, rowIndices);
  } else if (action === "saveToDrive" || action === "exportToDrive") {
    result = saveToDrive(postData);
  } else {
    result = { success: false, error: "不明なアクション: " + action };
  }

  return createJsonResponse(result);
}

// ==== CORS Preflight (OPTIONS) リクエスト対応 ====
function doOptions(e) {
  return ContentService.createTextOutput("")
    .setMimeType(ContentService.MimeType.TEXT);
}

// ==== GETリクエスト（データ取得・リダイレクト救済） ====
function doGet(e) {
  try {
    return processApiRequest(e);
  } catch (err) {
    return createJsonResponse({ success: false, error: err.message });
  }
}

// ==== POSTリクエスト（データ登録・更新・外部連係） ====
function doPost(e) {
  try {
    return processApiRequest(e);
  } catch (err) {
    return createJsonResponse({ success: false, error: err.message });
  }
}

// JSONレスポンス出力を生成するヘルパー（CORS回避用の出力）
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
                       .setMimeType(ContentService.MimeType.JSON);
}

// ---- ノートを保存（新規追加 または 上書き編集） ----
function saveNote(note, targetSheetName) {
  const sheet = getSheet(targetSheetName);
  const lastRow = sheet.getLastRow();

  if (lastRow >= 2) {
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat().map(String);
    const idx = ids.indexOf(String(note.id));

    if (idx !== -1) {
      // 既存のノートが存在する場合は上書き更新
      sheet.getRange(idx + 2, 1, 1, 10).setValues([[
        note.id, 
        note.title, 
        note.content, 
        note.summary || "", 
        note.keywords || "", 
        note.createdAt, 
        note.updatedAt, 
        note.sourceUrl || "",
        note.timeline || "",
        note.columnJ || ""
      ]]);
      return { success: true, action: "updated", id: note.id, sheetName: sheet.getName() };
    }
  }

  // 存在しない、または新規作成
  sheet.appendRow([
    note.id, 
    note.title, 
    note.content, 
    note.summary || "", 
    note.keywords || "", 
    note.createdAt, 
    note.updatedAt, 
    note.sourceUrl || "",
    note.timeline || "",
    note.columnJ || ""
  ]);
  return { success: true, action: "created", id: note.id, sheetName: sheet.getName() };
}

// ---- ノートを削除 ----
function deleteNote(id, targetSheetName) {
  const sheet = getSheet(targetSheetName);
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { success: false, reason: "データが存在しません" };

  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat().map(String);
  const idx = ids.indexOf(String(id));

  if (idx !== -1) {
    sheet.deleteRow(idx + 2);
    return { success: true, id: id, sheetName: sheet.getName() };
  }
  return { success: false, reason: "削除対象が見つかりません" };
}

// ---- 全ノートを一括保存（マージ済みの全件を完全上書き） ----
function saveAll(notes, targetSheetName) {
  const sheet = getSheet(targetSheetName);
  
  // ヘッダー行（1行目）以外を物理的に削除するのではなく、コンテンツのみをクリアする
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    const maxCols = Math.max(10, sheet.getLastColumn());
    sheet.getRange(2, 1, lastRow - 1, maxCols).clearContent();
  }

  if (notes && notes.length > 0) {
    const rows = notes.map(n => [
      n.id, 
      n.title, 
      n.content, 
      n.summary || "", 
      n.keywords || "", 
      n.createdAt, 
      n.updatedAt, 
      n.sourceUrl || "",
      n.timeline || "",
      n.columnJ || ""
    ]);
    
    // 行数が足りない場合は拡張する
    const neededRows = rows.length + 1; // 1 (header) + rows.length
    const currentMaxRows = sheet.getMaxRows();
    if (neededRows > currentMaxRows) {
      sheet.insertRowsAfter(currentMaxRows, neededRows - currentMaxRows);
    }
    
    sheet.getRange(2, 1, rows.length, 10).setValues(rows);
  }

  return { success: true, count: notes ? notes.length : 0, sheetName: sheet.getName() };
}

// ---- Google Docs または一般Webサイトのテキスト抽出 ----
function fetchDriveFile(url) {
  try {
    // Googleドキュメントの判定
    const docMatch = url.match(/[-\\w]{25,}/);
    if (url.includes("docs.google.com") && docMatch) {
      const id = docMatch[0];
      const doc = DocumentApp.openById(id);
      return { success: true, text: doc.getBody().getText(), title: doc.getName() };
    }
    
    // 一般のWebサイトの判定
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) {
      throw new Error("サイトにアクセスできませんでした（Status: " + res.getResponseCode() + "）");
    }
    
    const html = res.getContentText();
    const titleMatch = html.match(/<title>([^<]*)<\\/title>/i);
    let title = titleMatch ? titleMatch[1].trim() : "取り込んだ記事";
    
    // 不要な要素の除去
    let text = html
      .replace(/<script[\\s\\S]*?<\\/script>/gi, "")
      .replace(/<style[\\s\\S]*?<\\/style>/gi, "")
      .replace(/<nav[\\s\\S]*?<\\/nav>/gi, "")
      .replace(/<footer[\\s\\S]*?<\\/footer>/gi, "")
      .replace(/<[^>]+>/g, "\\n")
      .replace(/&nbsp;/g, " ")
      .replace(/\\n\\s*\\n/g, "\\n")
      .trim();
    
    if (text.length > 20000) text = text.substring(0, 20000) + "...(以下省略)";
    
    return { success: true, text: text, title: title };
  } catch (err) {
    return { success: false, error: "取り込みに失敗しました: " + err.message };
  }
}

// ---- 外部ハイライトデータ（未処理）の抽出 ----
function fetchUnprocessedHighlights(sourceSsId, sheetName) {
  try {
    const ss = SpreadsheetApp.openById(sourceSsId);
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return { success: false, error: "指定されたシートが見つかりません" };

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return { success: true, items: [] };

    const headers = data[0].map(h => String(h).trim().toLowerCase());
    let nobsidianIdx = headers.indexOf("nobsidian");
    if (nobsidianIdx === -1 && data[0].length >= 8) {
      nobsidianIdx = 7; // H列 (8番目の列)
    }

    const col = {
      title: headers.indexOf("title"),
      url: headers.indexOf("url"),
      tags: headers.indexOf("tags"),
      highlights: headers.indexOf("highlights"),
      saved_at: headers.indexOf("saved_at"),
      nobsidian: nobsidianIdx
    };

    // 必須ヘッダー確認、どうしても見つからない場合は初期値を割り当て
    if (col.title === -1) col.title = 0;
    if (col.highlights === -1) col.highlights = 1;

    let timelineColIdx = headers.indexOf("timeline");
    if (timelineColIdx === -1) timelineColIdx = headers.indexOf("timeline_data");
    if (timelineColIdx === -1 && data[0].length >= 12) {
      timelineColIdx = 11; // L列 (12番目の列)
    } else if (timelineColIdx === -1 && data[0].length >= 10) {
      timelineColIdx = 9; // J列 (10番目の列)
    }

    let columnIIdx = headers.indexOf("memo");
    if (columnIIdx === -1) columnIIdx = headers.indexOf("comment");
    if (columnIIdx === -1) columnIIdx = headers.indexOf("i");
    if (columnIIdx === -1 && data[0].length >= 9) {
      columnIIdx = 8; // I列 (9番目の列)
    }

    let checkColIdx = col.nobsidian;

    const items = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      let isProcessed = false;

      if (checkColIdx !== -1) {
        const val = row[checkColIdx];
        const valStr = String(val).trim().toLowerCase();
        if (valStr !== "" && valStr !== "false" && valStr !== "0") {
          isProcessed = true;
        }
      }

      if (!isProcessed) {
        items.push({
          rowIndex: i + 1,
          title: col.title !== -1 ? String(row[col.title]) : "無題",
          url: col.url !== -1 ? String(row[col.url]) : "",
          tags: col.tags !== -1 ? String(row[col.tags]) : "",
          highlights: col.highlights !== -1 ? String(row[col.highlights]) : "",
          saved_at: col.saved_at !== -1 ? String(row[col.saved_at]) : "",
          timeline: timelineColIdx !== -1 ? String(row[timelineColIdx]) : "",
          columnI: columnIIdx !== -1 ? String(row[columnIIdx]) : ""
        });
      }
    }

    return { success: true, items: items };
  } catch (err) {
    return { success: false, error: "未処理ハイライト抽出失敗: " + err.message };
  }
}

// ---- 取り込みしたハイライトデータに「処理済みマーク(true)」を書き込む ----
function markHighlightsProcessed(sourceSsId, sheetName, rowIndices) {
  try {
    const ss = SpreadsheetApp.openById(sourceSsId);
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return { success: false, error: "指定されたシートが見つかりません" };

    const data = sheet.getDataRange().getValues();
    const headers = data[0].map(h => String(h).trim().toLowerCase());
    
    let colIndex = headers.indexOf("nobsidian");
    if (colIndex === -1 && data[0].length >= 8) {
      colIndex = 7; // H列 (8番目の列)
    }

    if (colIndex === -1) {
      colIndex = headers.length;
      sheet.getRange(1, colIndex + 1).setValue("nobsidian");
    }

    rowIndices.forEach(function(rowIndex) {
      if (rowIndex > 1 && rowIndex <= data.length) {
        sheet.getRange(rowIndex, colIndex + 1).setValue(true);
      }
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: "処理済みマーク（チェック）の反映に失敗しました: " + err.message };
  }
}

// ---- 選択した記事全文・まとめテキスト・リンク先PDFをGoogle Driveの新規フォルダにまとめて保存 ----
function saveToDrive(data) {
  try {
    const notes = data.notes || [];
    const centerTitle = data.centerTitle || (notes.length > 0 ? notes[0].title : "ネットワーク図レポート");
    const reportText = data.reportText || "";
    
    const timeZone = Session.getScriptTimeZone() || "GMT+9";
    const dateStr = Utilities.formatDate(new Date(), timeZone, "yyyyMMdd");
    
    const safeCenterTitle = centerTitle.replace(/[\\\\/:*?"<>|]/g, "_").trim();
    let folderName = data.folderName;
    if (!folderName || folderName.trim() === "") {
      folderName = safeCenterTitle + "_" + dateStr;
    } else {
      folderName = folderName.replace(/[\\\\/:*?"<>|]/g, "_").trim();
    }

    const folder = DriveApp.createFolder(folderName);

    let savedFilesCount = 0;
    let savedPdfCount = 0;
    const downloadedPdfUrls = new Set();

    if (reportText && reportText.trim() !== "") {
      const reportFileName = "00_AI生成ナレッジレポート_" + dateStr + ".txt";
      folder.createFile(reportFileName, reportText, MimeType.PLAIN_TEXT);
      savedFilesCount++;
    }

    let combinedText = "# ネットワーク図収集記事一覧・全文まとめ\\n";
    combinedText += "作成日時: " + Utilities.formatDate(new Date(), timeZone, "yyyy-MM-dd HH:mm:ss") + "\\n";
    combinedText += "中心記事: " + centerTitle + "\\n";
    combinedText += "収録記事数: " + notes.length + "件\\n\\n";
    combinedText += "============================================================\\n\\n";

    notes.forEach((note, index) => {
      const rawTitle = note.title || ("記事_" + (index + 1));
      const noteTitle = rawTitle.replace(/[\\\\/:*?"<>|]/g, "_").trim();
      const noteContent = note.content || "";
      const sourceUrl = note.sourceUrl || "";
      const folderPath = note.folder || "";

      let singleFileText = "タイトル: " + rawTitle + "\\n";
      if (folderPath) singleFileText += "フォルダ: " + folderPath + "\\n";
      if (sourceUrl) singleFileText += "URL: " + sourceUrl + "\\n";
      singleFileText += "\\n------------------------------------------------------------\\n【本文】\\n\\n" + noteContent;

      const seqStr = String(index + 1).padStart(2, '0');
      folder.createFile(seqStr + "_" + noteTitle + ".txt", singleFileText, MimeType.PLAIN_TEXT);
      savedFilesCount++;

      combinedText += "【記事 " + (index + 1) + "】 " + rawTitle + "\\n";
      if (folderPath) combinedText += "フォルダ: " + folderPath + "\\n";
      if (sourceUrl) combinedText += "URL: " + sourceUrl + "\\n";
      combinedText += "\\n" + noteContent + "\\n\\n";
      combinedText += "------------------------------------------------------------\\n\\n";

      const textToScan = (sourceUrl + "\\n" + noteContent);
      const extractedLinkItems = [];
      const seenUrls = new Set();

      const mdRegex = /\\[([^\\]]*)\\]\\((https?:\\/\\/[^\\)\\s]+)\\)/gi;
      let mdMatch;
      while ((mdMatch = mdRegex.exec(textToScan)) !== null) {
        const label = mdMatch[1] ? mdMatch[1].trim() : "";
        let urlInParen = mdMatch[2] ? mdMatch[2].trim() : "";
        urlInParen = urlInParen.replace(/[\\.\\,\\;\\:]+$/, "");

        if (urlInParen && !seenUrls.has(urlInParen)) {
          seenUrls.add(urlInParen);
          extractedLinkItems.push({
            url: urlInParen,
            label: label,
            isExplicit: /リンク先/i.test(label) || /リンク先/i.test(textToScan)
          });
        }
      }

      const rawUrlRegex = /(https?:\\/\\/[^\\s<>"'\\(\\)\\]\\[]+)/gi;
      let rawMatch;
      while ((rawMatch = rawUrlRegex.exec(textToScan)) !== null) {
        let cleanRawUrl = rawMatch[0].replace(/[\\.\\,\\;\\:\\)]+$/, "").trim();
        if (cleanRawUrl && !seenUrls.has(cleanRawUrl)) {
          seenUrls.add(cleanRawUrl);
          extractedLinkItems.push({
            url: cleanRawUrl,
            label: "資料",
            isExplicit: /リンク先/i.test(textToScan)
          });
        }
      }

      for (let k = 0; k < extractedLinkItems.length; k++) {
        const item = extractedLinkItems[k];
        const cleanUrl = item.url;
        if (downloadedPdfUrls.has(cleanUrl)) continue;

        const driveIdMatch = cleanUrl.match(/drive\\.google\\.com\\/file\\/d\\/([^\\/\\?#]+)/i) ||
                             cleanUrl.match(/drive\\.google\\.com\\/open\\?id=([^\\&#]+)/i) ||
                             cleanUrl.match(/drive\\.google\\.com\\/uc\\?.*id=([^\\&#]+)/i);

        if (driveIdMatch && driveIdMatch[1]) {
          const fileId = driveIdMatch[1];
          downloadedPdfUrls.add(cleanUrl);

          try {
            const driveFile = DriveApp.getFileById(fileId);
            const originalName = driveFile.getName() || "Document.pdf";
            
            let destName = originalName;
            if (!/\\.[a-zA-Z0-9]+$/.test(destName)) {
              destName = seqStr + "_" + noteTitle + "_" + originalName + ".pdf";
            } else {
              destName = seqStr + "_" + noteTitle + "_" + originalName;
            }
            destName = destName.replace(/[\\\\/:*?"<>|]/g, "_");

            driveFile.makeCopy(destName, folder);
            savedPdfCount++;
            savedFilesCount++;
            Logger.log("✅ Google Driveファイルを直接コピー保存しました: " + destName);
            continue;
          } catch (driveErr) {
            Logger.log("⚠️ DriveAppによる直接コピー不可、UrlFetchへフォールバックします: " + driveErr.message);
          }
        }

        const isPdfTarget = /\\.pdf($|\\?|#)/i.test(cleanUrl) || 
                            /\\/pdf\\//i.test(cleanUrl) || 
                            item.isExplicit;

        if (isPdfTarget) {
          downloadedPdfUrls.add(cleanUrl);

          try {
            const response = UrlFetchApp.fetch(cleanUrl, {
              muteHttpExceptions: true,
              followRedirects: true,
              headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
            });

            if (response.getResponseCode() === 200) {
              const blob = response.getBlob();
              const bytes = blob.getBytes();
              const contentType = (response.getHeaders()["Content-Type"] || blob.getContentType() || "").toLowerCase();

              const isRealPdf = contentType.includes("application/pdf") ||
                                (bytes && bytes.length >= 4 && 
                                 bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46);

              if (isRealPdf) {
                let fileName = "";
                const urlParts = cleanUrl.split('/');
                const lastPart = urlParts[urlParts.length - 1].split('?')[0].split('#')[0];

                if (lastPart && lastPart.toLowerCase().endsWith(".pdf")) {
                  try { fileName = decodeURIComponent(lastPart); } catch (e) { fileName = lastPart; }
                } else {
                  const safeLabel = (item.label || "資料").replace(/[\\\\/:*?"<>|]/g, "_");
                  fileName = seqStr + "_" + noteTitle + "_" + safeLabel + "_" + (savedPdfCount + 1) + ".pdf";
                }

                if (!fileName.toLowerCase().endsWith(".pdf")) {
                  fileName += ".pdf";
                }
                fileName = fileName.replace(/[\\\\/:*?"<>|]/g, "_");

                blob.setName(fileName);
                folder.createFile(blob);
                savedPdfCount++;
                savedFilesCount++;
                Logger.log("✅ Web上のPDFバイナリを正常保存しました: " + fileName);
              }
            }
          } catch (fetchErr) {
            Logger.log("⚠️ PDF取得中にエラー発生: " + cleanUrl + " - " + fetchErr.message);
          }
        }
      }
    });

    folder.createFile("00_全記事全文まとめ.txt", combinedText, MimeType.PLAIN_TEXT);
    savedFilesCount++;

    return {
      success: true,
      status: "success",
      folderName: folder.getName(),
      folderUrl: folder.getUrl(),
      fileCount: savedFilesCount,
      pdfCount: savedPdfCount,
      message: "Google Driveに新規フォルダ「" + folder.getName() + "」を作成し、記事全文(" + notes.length + "件)およびPDF(" + savedPdfCount + "件)を保存しました。"
    };
  } catch (err) {
    return {
      success: false,
      status: "error",
      error: err.message,
      message: "Google Driveへの保存中にエラーが発生しました: " + err.message
    };
  }
}

// ==== Google Drive操作の初回権限承認用関数 ====
function authorizeDrivePermissions() {
  const root = DriveApp.getRootFolder();
  const tempFolder = DriveApp.createFolder("___Drive_Permission_Check___");
  tempFolder.setTrashed(true);
  
  Logger.log("✅ Google Drive (DriveApp) permissions authorized successfully!");
  return "✅ Google Driveの新規フォルダ作成・保存権限の承認が正常に完了しました！";
}
`;
