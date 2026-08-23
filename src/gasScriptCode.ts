/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// 最新のGoogle Apps Script (GAS) 統合コード
// ユーザー固有のプロンプト・環境変数・トリガー実行ロジック + WebアプリAPI (doGet/doPost) を完全統合
export const LATEST_GAS_SCRIPT = `/**
 * ====================================================================
 * Connected Notes: Google Apps Script (GAS) 統合バックエンドスクリプト
 * （スプレッドシート15列同期・N列以降追記・Raindrop/GoogleドライブMHT自動取り込み・WebアプリAPI完全対応）
 * ====================================================================
 * 
 * 【スプレッドシートの列構成（15列）】
 * A(id) B(title) C(url) D(tags) E(highlights) F(saved_at) G(processed) H(nobsidian)
 * I(all:本文原文) J(apendix:メタ情報) K(date:日付) L(timeline:年表) M(source:取得元)
 * N(edited_content:アプリ編集本文) O(updated_at:アプリ更新日時)
 * 
 * ※ A〜M列の外部取り込み元データは非破壊で保持され、アプリ内での編集や加筆はN列・O列に追記されます。
 * 
 * 【初期設定手順】
 * 1. 左メニュー「プロジェクトの設定（⚙️）」＞「スクリプト プロパティ」に以下を登録します：
 *    - GEMINI_API_KEY : Google AI Studio の APIキー
 *    - SCREENSHOT_FOLDER_ID : GoogleドライブのMHT/画像保存先フォルダID
 *    - RAINDROP_TOKEN : (任意) Raindropテストトークン
 *    - MY_EMAIL : (任意) 週次レポート送信用メールアドレス
 *    - SHEET_ID : (任意) スプレッドシートID（未設定の場合は現在のスプレッドシートを自動使用）
 * 2. エディタ上部の関数選択で『authorizeDrivePermissions』を選んで「実行」し、初回権限を承認します。
 * 
 * 【デプロイ手順（※重要）】
 * 1. 右上の「デプロイ」 ＞ 「新しいデプロイ」 をクリック。
 * 2. 種類：「ウェブアプリ」、アクセスできるユーザー：「全員」（Anyone）を選択してデプロイ。
 * 3. 発行されたURL（.../exec）をアプリの「設定⚙」に貼り付けて保存します。
 */

/**
 * =========================================================
 * 1. 初期設定・環境変数設定
 * =========================================================
 */
const props = PropertiesService.getScriptProperties();

// 必須・基本プロパティ
const GEMINI_API_KEY = props.getProperty('GEMINI_API_KEY') || "";
const SHEET_ID = props.getProperty('SHEET_ID') || "";
const RAINDROP_TOKEN = props.getProperty('RAINDROP_TOKEN') || "";
const MY_EMAIL = props.getProperty('MY_EMAIL') || Session.getEffectiveUser().getEmail() || "";
const SCREENSHOT_FOLDER_ID = props.getProperty('SCREENSHOT_FOLDER_ID') || props.getProperty('DRIVE_FOLDER_ID') || "";

// ===== プロンプト系プロパティのデフォルト値 =====
const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash';
const DEFAULT_SYSTEM_PERSONA = 'あなたは環境ビジネスの営業職です。';
const DEFAULT_SYNC_PROMPT = '具体的な数字、事実、市場への影響を重点的に抽出し、1000文字程度で要約してください。';
const DEFAULT_WEEKLY_REPORT_PROMPT =
\`以下のニュース/ナレッジ記事群を元に、統合された戦略的な週次レポートを作成してください。

【出力形式】
1. マクロ環境の変化と共通テーマ
2. 各記事の要点と市場へのインパクト
3. 顧客の潜在的課題と分析ニーズの推論
4. 提案時の「反論・リスク」と「死角」
5. 実行すべき戦略的営業アクション（3つ）
6. 深掘りすべきキーワードと次の情報取得の優先順位\`;

// デフォルト値が設定されるプロパティ
function getConfig(key) {
  const val = props.getProperty(key);
  if (val !== null && val !== "") return val;
  if (key === 'GEMINI_MODEL') return DEFAULT_GEMINI_MODEL;
  if (key === 'SYSTEM_PERSONA') return DEFAULT_SYSTEM_PERSONA;
  if (key === 'SYNC_PROMPT') return DEFAULT_SYNC_PROMPT;
  if (key === 'WEEKLY_REPORT_PROMPT') return DEFAULT_WEEKLY_REPORT_PROMPT;
  return "";
}

const GEMINI_MODEL = props.getProperty('GEMINI_MODEL') || DEFAULT_GEMINI_MODEL;
const SYSTEM_PERSONA = props.getProperty('SYSTEM_PERSONA') || DEFAULT_SYSTEM_PERSONA;
const SYNC_PROMPT = props.getProperty('SYNC_PROMPT') || DEFAULT_SYNC_PROMPT;
const WEEKLY_REPORT_PROMPT = props.getProperty('WEEKLY_REPORT_PROMPT') || DEFAULT_WEEKLY_REPORT_PROMPT;

// 処理制限時間（3.5分）
const TIME_LIMIT = 3.5 * 60 * 1000;

// 画像とみなす拡張子（Screen判定用）
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'heic', 'heif'];

// 15列の共通ヘッダー定義
const SHEET_HEADERS = [
  "id", "title", "url", "tags", "highlights", "saved_at", "processed", "nobsidian",
  "all", "apendix", "date", "timeline", "source", "edited_content", "updated_at"
];

/**
 * 対象スプレッドシート・シートの取得
 */
function getTargetSpreadsheet() {
  const sid = props.getProperty('SHEET_ID');
  if (sid && sid.trim() !== "") {
    try {
      return SpreadsheetApp.openById(sid.trim());
    } catch (e) {}
  }
  const activeSs = SpreadsheetApp.getActiveSpreadsheet();
  if (activeSs) return activeSs;
  throw new Error("スプレッドシートが見つかりません。スクリプトプロパティ SHEET_ID を設定するか、コンテナバインドスクリプトとしてご利用ください。");
}

function getSheet(targetSheetName) {
  const ss = getTargetSpreadsheet();
  const name = (targetSheetName && String(targetSheetName).trim()) ? String(targetSheetName).trim() : "Notes";
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(SHEET_HEADERS);
  } else {
    const lastCol = sheet.getLastColumn();
    if (lastCol === 0) {
      sheet.appendRow(SHEET_HEADERS);
    } else if (lastCol < SHEET_HEADERS.length) {
      for (let c = 1; c <= SHEET_HEADERS.length; c++) {
        const headerCell = sheet.getRange(1, c);
        if (headerCell.getValue() === "") {
          headerCell.setValue(SHEET_HEADERS[c - 1]);
        }
      }
    }
  }
  return sheet;
}

/**
 * ====================================================================
 * 2. Webアプリ API 受付口 (doGet / doPost)
 * ====================================================================
 * アプリ（Connected Notes）からのリクエストを処理してJSONで返します。
 */
function doGet(e) {
  return processApiRequest(e);
}

function doPost(e) {
  return processApiRequest(e);
}

function processApiRequest(e) {
  if (!e) {
    return createJsonResponse({ 
      status: "ok", 
      message: "Connected Notes Web API (GAS) は正常に稼働しています。このURLをアプリの設定画面に貼り付けてご利用ください。" 
    });
  }

  let postData = {};
  if (e.postData && e.postData.contents) {
    try {
      const parsed = JSON.parse(e.postData.contents);
      if (parsed && typeof parsed === "object") postData = parsed;
    } catch (jsonErr) {}
  }

  if (!postData.action && e.parameter && e.parameter.payload) {
    try {
      const parsedPayload = JSON.parse(e.parameter.payload);
      if (parsedPayload && typeof parsedPayload === "object") postData = parsedPayload;
    } catch (payloadErr) {}
  }

  if (!postData.action && e.parameter) {
    postData = e.parameter;
  }

  const action = postData.action || (e.parameter ? e.parameter.action : "");
  const targetSheet = postData.sheetName || (postData.options && postData.options.targetSheetName) || (e.parameter ? e.parameter.sheetName : "");

  if (!action) {
    return createJsonResponse({ 
      status: "ok", 
      message: "Connected Notes Web API (GAS) は正常に稼働しています。" 
    });
  }

  let result = {};

  try {
    if (action === "ping" || action === "test" || action === "health") {
      result = { success: true, status: "ok", message: "Connected Notes Web API (GAS) は正常に応答しています。" };
    } else if (action === "getNotes") {
      result = handleGetNotes(targetSheet);
    } else if (action === "saveNote") {
      const note = typeof postData.note === "string" ? JSON.parse(postData.note) : postData.note;
      result = saveNote(note, targetSheet);
    } else if (action === "deleteNote") {
      result = deleteNote(postData.id, targetSheet);
    } else if (action === "saveAll") {
      const notes = typeof postData.notes === "string" ? JSON.parse(postData.notes) : postData.notes;
      result = saveAll(notes, targetSheet);
    } else if (action === "syncExternalSources" || action === "syncAllExternalSources") {
      const options = postData.options || { raindrop: true, drive: true };
      result = syncExternalSources(options, targetSheet);
    } else if (action === "weeklyReport") {
      result = weeklyReport(postData.email || MY_EMAIL);
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
  } catch (err) {
    result = { success: false, error: err.message || String(err) };
  }

  return createJsonResponse(result);
}

function createJsonResponse(data) {
  const jsonOutput = ContentService.createTextOutput(JSON.stringify(data));
  jsonOutput.setMimeType(ContentService.MimeType.JSON);
  return jsonOutput;
}

/**
 * ====================================================================
 * 3. ノートの取得・保存・同期ハンドラ (15列対応)
 * ====================================================================
 */

function handleGetNotes(targetSheetName) {
  const sheet = getSheet(targetSheetName);
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  if (lastRow <= 1) {
    return { success: true, notes: [], sheetName: sheet.getName() };
  }

  const numCols = Math.max(lastCol, 15);
  const data = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();

  const notes = data.map((row) => {
    const id = row[0] ? String(row[0]) : "note_" + Utilities.getUuid();
    const title = row[1] ? String(row[1]) : "無題";
    const sourceUrl = row[2] ? String(row[2]) : "";
    const tags = row[3] ? String(row[3]) : "";
    const summary = row[4] ? String(row[4]) : "";
    const createdAt = row[5] ? (row[5] instanceof Date ? row[5].toISOString() : String(row[5])) : new Date().toISOString();
    const isProcessed = row[6] === true || String(row[6]).toLowerCase() === "true";
    const nobsidian = row[7] ? String(row[7]) : "";
    const rawContent = row[8] ? String(row[8]) : "";
    const metaInfo = row[9] ? String(row[9]) : "";
    const dateStr = row[10] ? String(row[10]) : "";
    const timeline = row[11] ? String(row[11]) : "";
    const source = row[12] ? String(row[12]) : "gas";
    const editedContent = (row.length > 13 && row[13] !== undefined && row[13] !== null) ? String(row[13]) : "";
    const updatedAt = (row.length > 14 && row[14]) ? (row[14] instanceof Date ? row[14].toISOString() : String(row[14])) : createdAt;

    // アプリ表示用本文：N列(編集後)があればN列、なければI列(原文)、それもなければE列(要約)
    const content = (editedContent && editedContent.trim() !== "") 
      ? editedContent 
      : (rawContent && rawContent.trim() !== "" ? rawContent : summary);

    return {
      id: id,
      title: title,
      content: content,
      summary: summary,
      keywords: tags,
      createdAt: createdAt,
      updatedAt: updatedAt,
      sourceUrl: sourceUrl,
      timeline: timeline,
      source: source,
      rawContent: rawContent,
      metaInfo: metaInfo,
      dateStr: dateStr,
      isProcessed: isProcessed,
      nobsidian: nobsidian,
      editedContent: editedContent
    };
  });

  return { success: true, notes: notes, sheetName: sheet.getName() };
}

function saveNote(note, targetSheetName) {
  if (!note || !note.id) throw new Error("無効なノートデータです。");

  const sheet = getSheet(targetSheetName);
  const lastRow = sheet.getLastRow();
  const now = new Date();

  const id = String(note.id);
  const title = String(note.title || "無題");
  const sourceUrl = String(note.sourceUrl || "");
  const tags = String(note.keywords || "");
  const summary = String(note.summary || "");
  const createdAt = note.createdAt ? new Date(note.createdAt) : now;
  const isProcessed = note.isProcessed !== undefined ? note.isProcessed : false;
  const nobsidian = String(note.nobsidian || "");
  const rawContent = String(note.rawContent || "");
  const metaInfo = String(note.metaInfo || "");
  const dateStr = String(note.dateStr || "");
  const timeline = String(note.timeline || "");
  const source = String(note.source || "app");
  const editedContent = String(note.content || "");
  const updatedAt = now;

  let existingRow = -1;
  let existingRawContent = rawContent;
  let existingMetaInfo = metaInfo;
  let existingDateStr = dateStr;
  let existingTimeline = timeline;
  let existingSource = source;

  if (lastRow > 1) {
    const idValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < idValues.length; i++) {
      if (String(idValues[i][0]) === id) {
        existingRow = i + 2;
        break;
      }
    }
  }

  if (existingRow > 0) {
    const existingCols = Math.max(sheet.getLastColumn(), 15);
    const existingData = sheet.getRange(existingRow, 1, 1, existingCols).getValues()[0];
    if (!existingRawContent && existingData[8]) existingRawContent = String(existingData[8]);
    if (!existingMetaInfo && existingData[9]) existingMetaInfo = String(existingData[9]);
    if (!existingDateStr && existingData[10]) existingDateStr = String(existingData[10]);
    if (!existingTimeline && existingData[11]) existingTimeline = String(existingData[11]);
    if (!existingSource && existingData[12]) existingSource = String(existingData[12]);

    const updatedRow = [
      id, title, sourceUrl, tags, summary,
      existingData[5] || createdAt,
      existingData[6] !== undefined ? existingData[6] : isProcessed,
      existingData[7] !== undefined ? existingData[7] : nobsidian,
      existingRawContent, existingMetaInfo, existingDateStr, existingTimeline, existingSource,
      editedContent, updatedAt
    ];
    sheet.getRange(existingRow, 1, 1, 15).setValues([updatedRow]);
  } else {
    const newRow = [
      id, title, sourceUrl, tags, summary,
      createdAt, isProcessed, nobsidian,
      rawContent, metaInfo, dateStr, timeline, source,
      editedContent, updatedAt
    ];
    sheet.appendRow(newRow);
  }

  return { success: true, id: id };
}

function deleteNote(id, targetSheetName) {
  if (!id) throw new Error("IDが指定されていません。");
  const sheet = getSheet(targetSheetName);
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { success: true, deleted: false };

  const idValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < idValues.length; i++) {
    if (String(idValues[i][0]) === String(id)) {
      sheet.deleteRow(i + 2);
      return { success: true, deleted: true, id: id };
    }
  }
  return { success: true, deleted: false };
}

function saveAll(notes, targetSheetName) {
  const sheet = getSheet(targetSheetName);
  const lastRow = sheet.getLastRow();
  const existingMap = new Map();

  if (lastRow > 1) {
    const numCols = Math.max(sheet.getLastColumn(), 15);
    const existingValues = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
    existingValues.forEach(row => {
      if (row[0]) existingMap.set(String(row[0]), row);
    });
  }

  sheet.clearContents();
  sheet.appendRow(SHEET_HEADERS);

  if (notes && notes.length > 0) {
    const now = new Date();
    const rows = notes.map(note => {
      const id = String(note.id);
      const existing = existingMap.get(id);

      const title = String(note.title || "無題");
      const sourceUrl = String(note.sourceUrl || "");
      const tags = String(note.keywords || "");
      const summary = String(note.summary || "");
      const createdAt = existing ? existing[5] : (note.createdAt ? new Date(note.createdAt) : now);
      const isProcessed = existing ? existing[6] : (note.isProcessed || false);
      const nobsidian = existing ? existing[7] : (note.nobsidian || "");
      const rawContent = existing && existing[8] ? String(existing[8]) : String(note.rawContent || "");
      const metaInfo = existing && existing[9] ? String(existing[9]) : String(note.metaInfo || "");
      const dateStr = existing && existing[10] ? String(existing[10]) : String(note.dateStr || "");
      const timeline = existing && existing[11] ? String(existing[11]) : String(note.timeline || "");
      const source = existing && existing[12] ? String(existing[12]) : String(note.source || "app");
      const editedContent = String(note.content || "");
      const updatedAt = note.updatedAt ? new Date(note.updatedAt) : now;

      return [
        id, title, sourceUrl, tags, summary,
        createdAt, isProcessed, nobsidian,
        rawContent, metaInfo, dateStr, timeline, source,
        editedContent, updatedAt
      ];
    });
    sheet.getRange(2, 1, rows.length, 15).setValues(rows);
  }

  return { success: true, count: notes ? notes.length : 0, sheetName: sheet.getName() };
}

/**
 * =========================================================
 * 4. メイン機能：データ収集・同期 (Raindrop / Googleドライブ)
 * =========================================================
 * 実行トリガー：定期実行（例：数時間に1回）またはWebアプリ経由
 */
function syncAllExternalSources() {
  return syncExternalSources({ raindrop: false, drive: true });
}

function syncExternalSources(options, targetSheetName) {
  const startTime = Date.now();
  console.log("データの同期を開始します...");

  const effectiveSheetName = (options && options.targetSheetName) ? options.targetSheetName : targetSheetName;
  const sheet = getSheet(effectiveSheetName);
  const lastRow = sheet.getLastRow();
  const existingIds = lastRow > 1 
    ? new Set(sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat().map(String)) 
    : new Set();

  let isTimeOut = false;
  let addedCount = 0;

  const geminiApiKey = props.getProperty('GEMINI_API_KEY') || "";
  const geminiModel = getConfig('GEMINI_MODEL');
  const raindropToken = props.getProperty('RAINDROP_TOKEN') || "";
  const folderId = props.getProperty('SCREENSHOT_FOLDER_ID') || props.getProperty('DRIVE_FOLDER_ID') || "";
  const persona = (options && options.persona) ? options.persona : getConfig('SYSTEM_PERSONA');
  const syncPrompt = (options && options.syncPrompt) ? options.syncPrompt : getConfig('SYNC_PROMPT');

  // --- ソースA: Raindropからの取得 (チェックがONかつトークンがある場合のみ実行) ---
  if (options && options.raindrop === true && raindropToken) {
    console.log("Raindropの記事を同期中...");
    const raindropItems = fetchRaindropData(raindropToken);
    
    for (const item of raindropItems) {
      if (Date.now() - startTime > TIME_LIMIT) { isTimeOut = true; break; }
      
      const id = String(item._id);
      if (existingIds.has(id)) continue;

      let rawContent = "";
      const pubDateStr = item.created ? Utilities.formatDate(new Date(item.created), "JST", "yyyy/MM/dd") : Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd");

      if (item.link.includes("go.jp")) {
        appendArticleToSheet(sheet, id, item.title, item.link, "🚨手動要", "行政サイトのため自動取得をスキップしました。", "", "", pubDateStr, "", "Rain");
        existingIds.add(id);
        addedCount++;
        continue;
      }

      try {
        const response = UrlFetchApp.fetch(item.link, { muteHttpExceptions: true, headers: { "User-Agent": "Mozilla/5.0", "Accept": "text/html" } });
        if (response.getResponseCode() === 200) {
          rawContent = cleanHtml(response.getContentText());
          const result = callGeminiForSingleArticle(rawContent.substring(0, 20000), persona, syncPrompt, geminiApiKey, geminiModel);
          appendArticleToSheet(sheet, id, item.title, item.link, result.tags, result.highlights, rawContent, "", pubDateStr, result.timeline, "Rain");
        } else {
          appendArticleToSheet(sheet, id, item.title, item.link, "🚨手動要", "アクセス拒否 (Status: " + response.getResponseCode() + ")", "", "", pubDateStr, "", "Rain");
        }
      } catch (e) {
        appendArticleToSheet(sheet, id, item.title, item.link, "🚨エラー", "解析エラー: " + e.message, "", "", pubDateStr, "", "Rain");
      }
      existingIds.add(id);
      addedCount++;
    }
  }

  // --- ソースB: Googleドライブからの取得 (未処理のMHTファイルのみを抽出) ---
  if (options && options.drive !== false && !isTimeOut && folderId) {
    console.log("Googleドライブの未処理MHTファイルを同期中...");
    const folder = DriveApp.getFolderById(folderId);
    const subFolders = folder.getFoldersByName("処理済み");
    const processedFolder = subFolders.hasNext() ? subFolders.next() : folder.createFolder("処理済み");
    
    const files = [];
    const filesIter = folder.getFiles();
    while (filesIter.hasNext()) {
      const file = filesIter.next();
      const fileNameLower = file.getName().toLowerCase();
      // MHT / MHTML ファイルのみを対象とする
      if (fileNameLower.endsWith('.mht') || fileNameLower.endsWith('.mhtml')) {
        files.push(file);
      }
    }

    console.log("未処理MHTファイル検出数: " + files.length + " 件");

    for (const file of files) {
      if (Date.now() - startTime > TIME_LIMIT) { isTimeOut = true; break; }

      const fileName = file.getName();
      try {
        const count = processMhtFile(file, sheet, existingIds, folder, processedFolder, persona, syncPrompt, geminiApiKey, geminiModel);
        file.moveTo(processedFolder);
        addedCount += (typeof count === 'number' ? count : 1);
      } catch (e) {
        console.error("MHTファイル解析エラー (" + fileName + "): " + e.message);
      }
    }
  }

  console.log(isTimeOut ? "時間制限のため処理を一時中断しました。" : "すべての同期が完了しました。追加件数: " + addedCount);
  return { success: true, addedCount: addedCount, isTimeOut: isTimeOut };
}

function getSourceLabelForOtherFile(fileName) {
  const ext = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : "";
  if (IMAGE_EXTENSIONS.indexOf(ext) !== -1) return "Screen";
  return ext || "不明";
}

/**
 * =========================================================
 * 5. AI要約・分析機能
 * =========================================================
 */

function callGeminiForSingleArticle(textContent, optPersona, optSyncPrompt, optApiKey, optModel) {
  if (!textContent || textContent.trim().length < 30) {
    return { tags: "手動要", highlights: "本文が取得できませんでした。", timeline: "" };
  }

  const pPersona = optPersona || getConfig('SYSTEM_PERSONA');
  const pSyncPrompt = optSyncPrompt || getConfig('SYNC_PROMPT');
  const apiKey = optApiKey || props.getProperty('GEMINI_API_KEY') || "";
  const model = optModel || getConfig('GEMINI_MODEL');

  if (!apiKey) {
    return { tags: "未設定", highlights: "GEMINI_API_KEY が設定されていません。", timeline: "" };
  }

  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + apiKey;

  const fullPrompt = pPersona + "\\n" +
"以下の記事本文を分析し、必ず下記のJSON形式のみで出力してください。マークダウンや余分なテキストは一切含めないでください。\\n" +
"また、JSON文字列値の中では、リテラルな改行文字を使わず、必ず \\\\n という2文字で改行を表現してください。\\n\\n" +
"【highlights フィールドへの要約指示】\\n" +
pSyncPrompt + "\\n\\n" +
"【出力JSON形式（厳守）】\\n" +
"{\\n" +
'  "tags": "分野を示す1単語のキーワード",\\n' +
'  "highlights": "上記の要約指示に従ったテキスト",\\n' +
'  "timeline": "[日付] 出来事（50文字程度）。該当なければ空文字列"\\n' +
"}\\n\\n" +
"【記事本文】\\n" +
textContent.substring(0, 20000);

  const payload = {
    contents: [{ parts: [{ text: fullPrompt }] }],
    generationConfig: { temperature: 0.1, responseMimeType: "application/json", maxOutputTokens: 2000 }
  };

  try {
    const response = UrlFetchApp.fetch(url, { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true });
    if (response.getResponseCode() !== 200) {
      return { tags: "🚨APIエラー", highlights: "Gemini APIエラー: " + response.getResponseCode(), timeline: "" };
    }
    
    let responseText = JSON.parse(response.getContentText()).candidates[0].content.parts[0].text;
    responseText = responseText.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
    
    const parsed = robustJsonParse(responseText);
    if (!parsed.hasOwnProperty('timeline')) parsed.timeline = "";
    return parsed;
  } catch (e) {
    return { tags: "🚨解析エラー", highlights: e.message, timeline: "" };
  }
}

function callGeminiVision(file, optPersona, optSyncPrompt, optApiKey, optModel) {
  const pPersona = optPersona || getConfig('SYSTEM_PERSONA');
  const pSyncPrompt = optSyncPrompt || getConfig('SYNC_PROMPT');
  const apiKey = optApiKey || props.getProperty('GEMINI_API_KEY') || "";
  const model = optModel || getConfig('GEMINI_MODEL');

  if (!apiKey) {
    return { tags: "未設定", highlights: "GEMINI_API_KEY が設定されていません。", timeline: "" };
  }

  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + apiKey;
  const base64Data = Utilities.base64Encode(file.getBlob().getBytes());

  const fullPrompt = pPersona + "\\n\\n以下の資料を読み取り、JSON形式で出力してください。リテラル改行は \\\\n を使用してください。\\n【要約指示】\\n" + pSyncPrompt + "\\n\\n【出力JSON】\\n{\\"tags\\": \\"キーワード\\", \\"highlights\\": \\"要約\\", \\"timeline\\": \\"年表\\"}";
  
  const payload = {
    contents: [{ parts: [ { text: fullPrompt }, { inline_data: { mime_type: file.getMimeType(), data: base64Data } } ] }],
    generationConfig: { temperature: 0.1, responseMimeType: "application/json" }
  };

  try {
    const response = UrlFetchApp.fetch(url, { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true });
    let text = JSON.parse(response.getContentText()).candidates[0].content.parts[0].text;
    text = text.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
    return robustJsonParse(text);
  } catch(e) {
    return { tags: "画像/PDF", highlights: "解析失敗: " + e.message, timeline: "" };
  }
}

function robustJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    try {
      return JSON.parse(sanitizeJsonText(text));
    } catch (e2) {
      throw new Error("JSONパース失敗: " + e.message);
    }
  }
}

function sanitizeJsonText(text) {
  const VALID_ESCAPES = ['"', '\\\\', '/', 'b', 'f', 'n', 'r', 't'];
  let result = '';
  let inString = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (!inString) {
      if (ch === '"') inString = true;
      result += ch;
      continue;
    }

    if (ch === '\\\\') {
      const next = text[i + 1];
      if (next !== undefined && VALID_ESCAPES.indexOf(next) !== -1) {
        result += ch + next;
        i++;
        continue;
      }
      if (next === 'u' && /^[0-9A-Fa-f]{4}$/.test(text.substr(i + 2, 4))) {
        result += text.substr(i, 6);
        i += 5;
        continue;
      }
      result += '\\\\\\\\';
      continue;
    }

    if (ch === '"') {
      inString = false;
      result += ch;
      continue;
    }

    if (ch === '\\n') { result += '\\\\n'; continue; }
    if (ch === '\\r') { result += '\\\\r'; continue; }
    if (ch === '\\t') { result += '\\\\t'; continue; }
    if (ch.charCodeAt(0) < 0x20) continue;

    result += ch;
  }

  return result;
}

/**
 * =========================================================
 * 6. 週次レポート自動生成 & メール送信
 * =========================================================
 */
function weeklyReport(customEmail) {
  console.log("週次レポート生成を開始します...");
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();

  const unprocessedItems = [];
  const rowIndices = [];

  for (let i = 1; i < data.length; i++) {
    if (data[i][6] === false || String(data[i][6]).toLowerCase() === 'false') {
      unprocessedItems.push({
        title: data[i][1],
        highlights: data[i][4]
      });
      rowIndices.push(i + 1);
    }
  }

  const recipient = customEmail || props.getProperty('MY_EMAIL') || Session.getEffectiveUser().getEmail();

  if (unprocessedItems.length === 0) {
    if (recipient) {
      GmailApp.sendEmail(recipient, "【通知】週次レポート対象記事なし", "今週、未処理の記事はありませんでした。");
    }
    return { success: true, message: "対象記事なし" };
  }

  const pPersona = getConfig('SYSTEM_PERSONA');
  const pWeeklyReport = getConfig('WEEKLY_REPORT_PROMPT');
  const apiKey = props.getProperty('GEMINI_API_KEY') || "";
  const model = getConfig('GEMINI_MODEL');

  let prompt = pPersona + "\\n" + pWeeklyReport + "\\n\\n【記事一覧】\\n";
  unprocessedItems.forEach(item => {
    prompt += "\\n■ " + item.title + "\\n" + item.highlights + "\\n";
  });

  const payload = {
    contents: [{ parts: [{ text: prompt.substring(0, 30000) }] }],
    generationConfig: { temperature: 0.3 }
  };
  
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + apiKey;
  const response = UrlFetchApp.fetch(url, { method: "post", contentType: "application/json", payload: JSON.stringify(payload) });
  const reportText = JSON.parse(response.getContentText()).candidates[0].content.parts[0].text;

  const today = Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd");
  
  if (recipient) {
    const subject = "📚 週次ナレッジレポート｜" + today + "（" + unprocessedItems.length + "本）";
    const body = "今週のナレッジ収集結果をまとめました。\\n\\n■ 収集記事数: " + unprocessedItems.length + " 本\\n\\n--------------------------------------------------\\n" + reportText + "\\n--------------------------------------------------\\n\\n※このレポートはGeminiによって自動生成されました。";
    GmailApp.sendEmail(recipient, subject, body);
  }

  rowIndices.forEach(row => sheet.getRange(row, 7).setValue(true));
  console.log("週次レポート生成とメール送信が完了しました。");
  return { success: true, report: reportText, count: unprocessedItems.length };
}

/**
 * =========================================================
 * 7. ヘルパー関数（MHT処理・テキスト整形など）
 * =========================================================
 */
function processMhtFile(file, sheet, existingIds, sourceFolder, processedFolder, optPersona, optSyncPrompt, optApiKey, optModel) {
  const mhtFileName = file.getName();
  let rawData = file.getBlob().getDataAsString().replace(/=\\r?\\n/g, "");
  let htmlContent = rawData.match(/<html[\\s\\S]*?<\\/html>/i)?.[0] || rawData;

  const formBlocks = htmlContent.split(/<form /gi);
  let addedInThisFile = 0;
  
  if (formBlocks.length > 1) {
    for (let i = 1; i < formBlocks.length; i++) {
      const block = "<form " + formBlocks[i];
      if (!block.includes('hdgLv2') && !block.includes('text Honbun') && !block.includes('val02')) continue;

      const titleMatch = block.match(/<div[^>]*class="[^"]*hdgLv2 val02[^"]*"[^>]*>([\\s\\S]*?)<\\/div>/i) ||
                         block.match(/<h[1-4][^>]*>([\\s\\S]*?)<\\/h[1-4]>/i) ||
                         block.match(/<div[^>]*class="[^"]*title[^"]*"[^>]*>([\\s\\S]*?)<\\/div>/i);
      let fullTitle = cleanMhtNoise(titleMatch ? titleMatch[1].replace(/<[^>]+>/g, ' ') : mhtFileName.replace(/\\.m?html?$/i, ''));
      
      let title = fullTitle;
      let metaInfo = "";
      const splitMatch = fullTitle.match(/(\\d{4}[\\/\\d].*)$/);
      if (splitMatch) {
        title = fullTitle.substring(0, splitMatch.index).trim();
        metaInfo = splitMatch[0].replace(/PDF有|書誌情報印刷/g, "").replace(/\\s+/g, " ").trim();
      }

      const idMatch = block.match(/keyShoshi(?:=|3D)NIRKDB\\s*([a-zA-Z0-9]+)/i);
      let articleId = "";
      if (idMatch) {
        articleId = idMatch[1].trim().toUpperCase();
      } else {
        const stableMeta = metaInfo.match(/\\d{4}[\\/\\-]\\d{2}[\\/\\-]\\d{2}/)?.[0] || metaInfo.substring(0, 10);
        const safeId = Utilities.base64EncodeWebSafe(Utilities.newBlob(title + stableMeta).getBytes());
        articleId = "MHT_" + safeId.replace(/[^a-zA-Z0-9]/g, "").substring(0, 15);
      }

      if (existingIds.has(articleId)) {
        console.log("既存データのため追加スキップ: " + articleId + " (" + title + ")");
        continue;
      }

      let pdfUrl = "";
      if (sourceFolder) {
        const pdfFiles = sourceFolder.getFilesByName(articleId + ".pdf");
        if (pdfFiles.hasNext()) {
          const pdfFile = pdfFiles.next();
          pdfUrl = pdfFile.getUrl();
          if (processedFolder) pdfFile.moveTo(processedFolder);
        }
      }

      const textMatch = block.match(/<div[^>]*class="[^"]*text Honbun[^"]*"[^>]*>([\\s\\S]*?)(?:<\\/form>|<\\/section>|$)/i);
      let rawContent = textMatch ? textMatch[1].replace(/<[^>]+>/g, '\\n') : block.replace(/<[^>]+>/g, '\\n');
      rawContent = cleanMhtNoise(rawContent);
      const safeContent = rawContent.length > 49000 ? rawContent.substring(0, 49000) + "\\n...省略" : rawContent;

      const result = callGeminiForSingleArticle(rawContent.substring(0, 10000), optPersona, optSyncPrompt, optApiKey, optModel);
      const pubDateStr = metaInfo.match(/\\d{4}[\\/\\-]\\d{2}[\\/\\-]\\d{2}/)?.[0] || Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd");

      appendArticleToSheet(sheet, articleId, title, pdfUrl, result.tags, result.highlights, safeContent, metaInfo, pubDateStr, result.timeline, mhtFileName);
      existingIds.add(articleId);
      addedInThisFile++;
      Utilities.sleep(1000);
    }
  } else {
    // 単一記事/Webページ保存形式のMHT
    const titleMatch = htmlContent.match(/<title[^>]*>([\\s\\S]*?)<\\/title>/i) || htmlContent.match(/<h1[^>]*>([\\s\\S]*?)<\\/h1>/i);
    let title = cleanMhtNoise(titleMatch ? titleMatch[1].replace(/<[^>]+>/g, ' ') : mhtFileName.replace(/\\.m?html?$/i, ''));
    let cleanText = cleanHtml(htmlContent);
    const safeId = "MHT_" + Utilities.base64EncodeWebSafe(Utilities.newBlob(mhtFileName + file.getId()).getBytes()).replace(/[^a-zA-Z0-9]/g, "").substring(0, 15);
    
    if (!existingIds.has(safeId)) {
      const result = callGeminiForSingleArticle(cleanText.substring(0, 10000), optPersona, optSyncPrompt, optApiKey, optModel);
      const pubDateStr = Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd");
      appendArticleToSheet(sheet, safeId, title, file.getUrl(), result.tags, result.highlights, cleanText.substring(0, 49000), "", pubDateStr, result.timeline, mhtFileName);
      existingIds.add(safeId);
      addedInThisFile++;
    } else {
      console.log("既存データのため追加スキップ: " + safeId + " (" + title + ")");
    }
  }
  return addedInThisFile;
}

function fetchRaindropData(token) {
  const rToken = token || props.getProperty('RAINDROP_TOKEN');
  if (!rToken) return [];
  const response = UrlFetchApp.fetch("https://api.raindrop.io/rest/v1/raindrops/0?perpage=50", { headers: { "Authorization": "Bearer " + rToken } });
  return JSON.parse(response.getContentText()).items || [];
}

function cleanHtml(html) {
  if (!html) return "";
  return html.replace(/<(style|script|nav|footer|header|aside)[^>]*>[\\s\\S]*?<\\/\\1>/gi, '')
             .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
             .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\\s+/g, ' ').trim();
}

function cleanMhtNoise(str) {
  if (!str) return "";
  return str.replace(/=\\r?\\n/g, "")
    .replace(/=([0-9A-Fa-f]{2})/g, (match, hex) => {
      const code = parseInt(hex, 16);
      if (code === 0x3D) return '=';
      if (code < 0x20 || code === 0x7F) return ' ';
      if (code < 0x80) return String.fromCharCode(code);
      return match;
    })
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/\\s+/g, " ").trim();
}

/**
 * プロンプト設定の更新用関数 (GASエディタ手動実行用)
 */
function setSystemPersona(text) {
  PropertiesService.getScriptProperties().setProperty('SYSTEM_PERSONA', text);
  Logger.log('SYSTEM_PERSONAを更新しました。');
}

function setSyncPrompt(text) {
  PropertiesService.getScriptProperties().setProperty('SYNC_PROMPT', text);
  Logger.log('SYNC_PROMPTを更新しました。');
}

function setWeeklyReportPrompt(text) {
  PropertiesService.getScriptProperties().setProperty('WEEKLY_REPORT_PROMPT', text);
  Logger.log('WEEKLY_REPORT_PROMPTを更新しました。');
}

function setGeminiModel(text) {
  PropertiesService.getScriptProperties().setProperty('GEMINI_MODEL', text);
  Logger.log('GEMINI_MODELを更新しました。');
}

function showCurrentPromptSettings() {
  const p = PropertiesService.getScriptProperties();
  Logger.log('--- SYSTEM_PERSONA ---\\n' + (p.getProperty('SYSTEM_PERSONA') || DEFAULT_SYSTEM_PERSONA));
  Logger.log('--- SYNC_PROMPT ---\\n' + (p.getProperty('SYNC_PROMPT') || DEFAULT_SYNC_PROMPT));
  Logger.log('--- WEEKLY_REPORT_PROMPT ---\\n' + (p.getProperty('WEEKLY_REPORT_PROMPT') || DEFAULT_WEEKLY_REPORT_PROMPT));
  Logger.log('--- GEMINI_MODEL ---\\n' + (p.getProperty('GEMINI_MODEL') || DEFAULT_GEMINI_MODEL));
}

function resetPromptSetting(fieldName) {
  const p = PropertiesService.getScriptProperties();
  const keys = ['SYSTEM_PERSONA', 'SYNC_PROMPT', 'WEEKLY_REPORT_PROMPT', 'GEMINI_MODEL'];
  if (fieldName === 'ALL') {
    keys.forEach(key => p.deleteProperty(key));
  } else if (keys.indexOf(fieldName) !== -1) {
    p.deleteProperty(fieldName);
  }
  Logger.log('リセットしました: ' + fieldName);
}

function updatePrompts() {
  // 手動更新用
}

/**
 * スプレッドシートへの追記 (15列対応)
 */
function appendArticleToSheet(sheet, id, title, url, tags, highlights, allContent, meta, pubDateStr, timeline, source) {
  // A(id) B(title) C(url) D(tags) E(highlights) F(saved_at) G(processed) H(nobsidian) I(all) J(apendix) K(date) L(timeline) M(source) N(edited_content) O(updated_at)
  sheet.appendRow([
    id, title, url, tags, highlights, new Date(), false, "", allContent, meta, pubDateStr, timeline, source || "", "", ""
  ]);
  SpreadsheetApp.flush();
}

/**
 * =========================================================
 * 8. Webサイト・Drive抽出・ハイライト処理
 * =========================================================
 */
function fetchDriveFile(url) {
  try {
    const docMatch = url.match(/[-\\w]{25,}/);
    if (url.includes("docs.google.com") && docMatch) {
      const id = docMatch[0];
      const doc = DocumentApp.openById(id);
      return { success: true, text: doc.getBody().getText(), title: doc.getName() };
    }
    
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) {
      throw new Error("サイトにアクセスできませんでした（Status: " + res.getResponseCode() + "）");
    }
    
    const html = res.getContentText();
    const titleMatch = html.match(/<title>([^<]*)<\\/title>/i);
    let title = titleMatch ? titleMatch[1].trim() : "取り込んだ記事";
    let text = cleanHtml(html);
    if (text.length > 20000) text = text.substring(0, 20000) + "...(以下省略)";
    
    return { success: true, text: text, title: title };
  } catch (err) {
    return { success: false, error: "取り込みに失敗しました: " + err.message };
  }
}

function fetchUnprocessedHighlights(sourceSsId, sheetName) {
  try {
    const ss = SpreadsheetApp.openById(sourceSsId);
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return { success: false, error: "指定されたシートが見つかりません" };

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return { success: true, items: [] };

    const headers = data[0].map(h => String(h).trim().toLowerCase());
    let nobsidianIdx = headers.indexOf("nobsidian");
    if (nobsidianIdx === -1 && data[0].length >= 8) nobsidianIdx = 7;

    const col = {
      title: headers.indexOf("title") !== -1 ? headers.indexOf("title") : 1,
      url: headers.indexOf("url") !== -1 ? headers.indexOf("url") : 2,
      tags: headers.indexOf("tags") !== -1 ? headers.indexOf("tags") : 3,
      highlights: headers.indexOf("highlights") !== -1 ? headers.indexOf("highlights") : 4,
      saved_at: headers.indexOf("saved_at") !== -1 ? headers.indexOf("saved_at") : 5,
      nobsidian: nobsidianIdx
    };

    let timelineColIdx = headers.indexOf("timeline");
    if (timelineColIdx === -1) timelineColIdx = headers.indexOf("timeline_data");
    if (timelineColIdx === -1 && data[0].length >= 12) timelineColIdx = 11;

    let columnIIdx = headers.indexOf("all");
    if (columnIIdx === -1) columnIIdx = headers.indexOf("memo");
    if (columnIIdx === -1 && data[0].length >= 9) columnIIdx = 8;

    const items = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      let isProcessed = false;

      if (col.nobsidian !== -1) {
        const val = row[col.nobsidian];
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

function markHighlightsProcessed(sourceSsId, sheetName, rowIndices) {
  try {
    const ss = SpreadsheetApp.openById(sourceSsId);
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return { success: false, error: "指定されたシートが見つかりません" };

    const data = sheet.getDataRange().getValues();
    const headers = data[0].map(h => String(h).trim().toLowerCase());
    
    let colIndex = headers.indexOf("nobsidian");
    if (colIndex === -1 && data[0].length >= 8) colIndex = 7;
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
    return { success: false, error: "処理済みマークの反映に失敗しました: " + err.message };
  }
}

function saveToDrive(data) {
  try {
    const notes = data.notes || [];
    const centerTitle = data.centerTitle || (notes.length > 0 ? notes[0].title : "レポート");
    const reportText = data.reportText || "";
    
    const timeZone = Session.getScriptTimeZone() || "GMT+9";
    const dateStr = Utilities.formatDate(new Date(), timeZone, "yyyyMMdd");
    
    const safeCenterTitle = centerTitle.replace(/[\\\\/:*?"<>|]/g, "_").trim();
    let folderName = data.folderName ? data.folderName.replace(/[\\\\/:*?"<>|]/g, "_").trim() : (safeCenterTitle + "_" + dateStr);

    const folder = DriveApp.createFolder(folderName);
    let savedFilesCount = 0;
    let savedPdfCount = 0;
    const downloadedPdfUrls = new Set();

    if (reportText && reportText.trim() !== "") {
      folder.createFile("00_AI生成ナレッジレポート_" + dateStr + ".txt", reportText, MimeType.PLAIN_TEXT);
      savedFilesCount++;
    }

    let combinedText = "# 全記事一覧・全文まとめ\\n作成日時: " + Utilities.formatDate(new Date(), timeZone, "yyyy-MM-dd HH:mm:ss") + "\\n\\n";

    notes.forEach((note, index) => {
      const rawTitle = note.title || ("記事_" + (index + 1));
      const noteTitle = rawTitle.replace(/[\\\\/:*?"<>|]/g, "_").trim();
      const noteContent = note.content || "";
      const sourceUrl = note.sourceUrl || "";
      const seqStr = String(index + 1).padStart(2, '0');

      let singleFileText = "タイトル: " + rawTitle + "\\n";
      if (sourceUrl) singleFileText += "URL: " + sourceUrl + "\\n";
      singleFileText += "\\n------------------------------------------------------------\\n【本文】\\n\\n" + noteContent;

      folder.createFile(seqStr + "_" + noteTitle + ".txt", singleFileText, MimeType.PLAIN_TEXT);
      savedFilesCount++;

      combinedText += "【記事 " + (index + 1) + "】 " + rawTitle + "\\n" + (sourceUrl ? 'URL: ' + sourceUrl + '\\n' : '') + noteContent + "\\n\\n------------------------------------------------------------\\n\\n";

      const textToScan = sourceUrl + "\\n" + noteContent;
      const mdRegex = /\\[([^\\]]*)\\]\\((https?:\\/\\/[^\\)\\s]+)\\)/gi;
      let mdMatch;
      while ((mdMatch = mdRegex.exec(textToScan)) !== null) {
        const cleanUrl = mdMatch[2].replace(/[\\.\\,\\;\\:]+$/, "");
        if (cleanUrl && !downloadedPdfUrls.has(cleanUrl)) {
          downloadedPdfUrls.add(cleanUrl);
          if (cleanUrl.includes("drive.google.com")) {
            const driveIdMatch = cleanUrl.match(/drive\\.google\\.com\\/file\\/d\\/([^\\/\\?#]+)/i) || cleanUrl.match(/id=([^\\&#]+)/i);
            if (driveIdMatch && driveIdMatch[1]) {
              try {
                const df = DriveApp.getFileById(driveIdMatch[1]);
                df.makeCopy(seqStr + "_" + noteTitle + "_" + df.getName(), folder);
                savedPdfCount++;
                savedFilesCount++;
              } catch (e) {}
            }
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
      message: "Google Driveに新規フォルダ「" + folder.getName() + "」を作成し、全ファイル(" + savedFilesCount + "件)を保存しました。"
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function authorizeDrivePermissions() {
  const tempFolder = DriveApp.createFolder("___Drive_Permission_Check___");
  tempFolder.setTrashed(true);
  Logger.log("✅ Google Drive permissions authorized successfully!");
  return "✅ Google Driveの新規フォルダ作成・保存権限の承認が正常に完了しました！";
}
`;
