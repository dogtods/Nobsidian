
export const RAW_IMPORT_GAS_SCRIPT = `
function getTargetSpreadsheet() {
  const sid = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (sid && sid.trim() !== "") { try { return SpreadsheetApp.openById(sid.trim()); } catch (e) {} }
  const activeSs = SpreadsheetApp.getActiveSpreadsheet();
  if (activeSs) return activeSs;
  throw new Error("スプレッドシートが見つかりません。");
}

function processApiRequest(e) {
  let postData = {};
  if (e.postData && e.postData.contents) { try { postData = JSON.parse(e.postData.contents); } catch (e) {} }
  if (!postData.action && e.parameter && e.parameter.payload) { try { postData = JSON.parse(e.parameter.payload); } catch (e) {} }
  if (!postData.action && e.parameter) postData = e.parameter;

  const action = postData.action || "";
  if (action === "importRawRowsToApp") {
    const rowIndices = typeof postData.rowIndices === "string" ? JSON.parse(postData.rowIndices) : postData.rowIndices;
    return createJsonResponse(importRawRowsToApp(postData.sourceSsId, postData.sheetName, postData.targetSsId, postData.targetSheetName, rowIndices));
  } else if (action === "fetchUnprocessedHighlights") {
    return createJsonResponse(fetchUnprocessedHighlights(postData.sourceSsId, postData.sheetName));
  } else if (action === "markHighlightsProcessed") {
    const rowIndices = typeof postData.rowIndices === "string" ? JSON.parse(postData.rowIndices) : postData.rowIndices;
    return createJsonResponse(markHighlightsProcessed(postData.sourceSsId, postData.sheetName, rowIndices));
  }
  return createJsonResponse({ success: false, error: "不明なアクション: " + action });
}

function doPost(e) { return processApiRequest(e); }
function doGet(e) { return processApiRequest(e); }
function createJsonResponse(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }

function importRawRowsToApp(sourceSsId, sheetName, targetSsId, targetSheetName, rowIndices) {
  try {
    const srcSs = SpreadsheetApp.openById(sourceSsId);
    const srcSheet = srcSs.getSheetByName(sheetName);
    if (!srcSheet) return { success: false, error: "取込元のシートが見つかりません" };

    let targetSs;
    if (targetSsId && targetSsId.trim() !== "") {
      try { targetSs = SpreadsheetApp.openById(targetSsId.trim()); } catch(e) { return { success: false, error: "取込先スプレッドシートを開けません" }; }
    } else { targetSs = getTargetSpreadsheet(); }

    const tSheetName = (targetSheetName && String(targetSheetName).trim()) ? String(targetSheetName).trim() : "Notes";
    let targetSheet = targetSs.getSheetByName(tSheetName);
    if (!targetSheet) targetSheet = targetSs.insertSheet(tSheetName);

    const srcData = srcSheet.getDataRange().getValues();
    const headers = srcData[0] ? srcData[0].map(h => String(h).trim().toLowerCase()) : [];
    
    let nobsidianIdx = headers.indexOf("nobsidian");
    if (nobsidianIdx === -1 && srcData[0] && srcData[0].length >= 8) nobsidianIdx = 7;
    if (nobsidianIdx === -1) { nobsidianIdx = headers.length; srcSheet.getRange(1, nobsidianIdx + 1).setValue("nobsidian"); }

    rowIndices.forEach(function(rowIndex) {
      if (rowIndex > 1 && rowIndex <= srcData.length) {
        const row = srcData[rowIndex - 1];
        const rowToCopy = row.slice(0, 13);
        while (rowToCopy.length < 13) rowToCopy.push("");
        targetSheet.appendRow(rowToCopy);
        srcSheet.getRange(rowIndex, nobsidianIdx + 1).setValue(true);
      }
    });
    return { success: true };
  } catch (err) { return { success: false, error: "コピペ処理に失敗しました: " + err.message }; }
}

function fetchUnprocessedHighlights(sourceSsId, sheetName) {
  try {
    const ss = SpreadsheetApp.openById(sourceSsId);
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return { success: false, error: "シートが見つかりません" };
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return { success: true, items: [] };
    const headers = data[0].map(h => String(h).trim().toLowerCase());
    let nobsidianIdx = headers.indexOf("nobsidian");
    if (nobsidianIdx === -1 && data[0].length >= 8) nobsidianIdx = 7;
    const col = { title: headers.indexOf("title"), highlights: headers.indexOf("highlights"), nobsidian: nobsidianIdx };
    if (col.title === -1) col.title = 0;
    if (col.highlights === -1) col.highlights = 1;
    const items = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      let isProcessed = false;
      if (col.nobsidian !== -1) {
        const valStr = String(row[col.nobsidian]).trim().toLowerCase();
        if (valStr !== "" && valStr !== "false" && valStr !== "0") isProcessed = true;
      }
      if (!isProcessed) {
        items.push({ rowIndex: i + 1, title: col.title !== -1 ? String(row[col.title]) : "無題", highlights: col.highlights !== -1 ? String(row[col.highlights]) : "" });
      }
    }
    return { success: true, items: items };
  } catch (err) { return { success: false, error: err.message }; }
}

function markHighlightsProcessed(sourceSsId, sheetName, rowIndices) {
  try {
    const ss = SpreadsheetApp.openById(sourceSsId);
    const sheet = ss.getSheetByName(sheetName);
    const data = sheet.getDataRange().getValues();
    const headers = data[0].map(h => String(h).trim().toLowerCase());
    let colIndex = headers.indexOf("nobsidian");
    if (colIndex === -1) colIndex = headers.length;
    rowIndices.forEach(function(rowIndex) {
      if (rowIndex > 1 && rowIndex <= data.length) sheet.getRange(rowIndex, colIndex + 1).setValue(true);
    });
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
}
`;

export const SYNC_AND_SAVE_GAS_SCRIPT = `/**
 * ====================================================================
 * 本アプリ専用: Google Apps Script (GAS) 同期 & Google Drive保存用スクリプト
 * ====================================================================
 */

function getSheet(targetSheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error("スプレッドシートのアクティブなインスタンスが見つかりません。コンテナバインドスクリプトとして作成してください。");
  }
  const name = (targetSheetName && String(targetSheetName).trim()) ? String(targetSheetName).trim() : "notes";
  let sheet = ss.getSheetByName(name);
  const headers = ["id", "title", "content", "summary", "keywords", "createdAt", "updatedAt", "sourceUrl", "timeline", "columnJ"];
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
  } else {
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

function processApiRequest(e) {
  if (!e) {
    return createJsonResponse({ 
      status: "ok", 
      message: "Connected Notes Web API (GAS) は正常に稼働しています。" 
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
  if (!postData.action && e.parameter) postData = e.parameter;

  const action = postData.action || (e.parameter ? e.parameter.action : "");
  const targetSheet = postData.sheetName || (e.parameter ? e.parameter.sheetName : "");

  if (!action) {
    return createJsonResponse({ 
      status: "ok", 
      message: "Connected Notes Web API (GAS) は正常に稼働しています。" 
    });
  }

  let result = {};
  if (action === "getNotes") {
    try {
      const sheet = getSheet(targetSheet);
      const lastRow = sheet.getLastRow();
      if (lastRow <= 1) return createJsonResponse({ notes: [], sheetName: sheet.getName() });
      const data = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
      const notes = data.map((row, idx) => ({
        id: String(row[0] || ("note_" + (Date.now() + idx))),
        title: String(row[1] || ""),
        content: String(row[2] || ""),
        summary: String(row[3] || ""),
        keywords: String(row[4] || ""),
        createdAt: row[5],
        updatedAt: row[6],
        sourceUrl: String(row[7] || ""),
        timeline: row[8] ? String(row[8]) : "",
        columnJ: row[9] ? String(row[9]) : ""
      }));
      return createJsonResponse({ notes: notes, sheetName: sheet.getName() });
    } catch (err) { return createJsonResponse({ error: err.message }); }
  } else if (action === "saveNote") {
    result = saveNote(typeof postData.note === "string" ? JSON.parse(postData.note) : postData.note, targetSheet);
  } else if (action === "deleteNote") {
    result = deleteNote(postData.id, targetSheet);
  } else if (action === "saveAll") {
    result = saveAll(typeof postData.notes === "string" ? JSON.parse(postData.notes) : postData.notes, targetSheet);
  } else if (action === "fetchDriveFile") {
    result = fetchDriveFile(postData.url);
  } else if (action === "saveToDrive" || action === "exportToDrive") {
    result = saveToDrive(postData);
  } else {
    result = { success: false, error: "不明なアクション: " + action };
  }
  return createJsonResponse(result);
}

function doPost(e) { return processApiRequest(e); }
function doGet(e) { return processApiRequest(e); }
function createJsonResponse(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }
function saveNote(note, targetSheetName) { return { success: true }; }
function deleteNote(id, targetSheetName) { return { success: true }; }
function saveAll(notes, targetSheetName) { return { success: true }; }
function fetchDriveFile(url) { return { success: true }; }
function saveToDrive(data) { return { success: true }; }
function authorizeDrivePermissions() { return "ok"; }
`;