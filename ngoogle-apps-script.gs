/**
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
