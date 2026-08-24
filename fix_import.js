const fs = require('fs');

const code = fs.readFileSync('google-apps-script.js', 'utf8');

const oldFuncRegex = /function importRawRowsToApp[\s\S]*?return { success: false, error: err\.message };\n  }\n}/;

const newFunc = `function importRawRowsToApp(sourceSsId, sheetName, targetSsId, targetSheetName, rowIndices) {
  try {
    const srcSs = SpreadsheetApp.openById(sourceSsId);
    const srcSheet = srcSs.getSheetByName(sheetName);
    if (!srcSheet) return { success: false, error: "取込元のシートが見つかりません" };

    let targetSs;
    if (targetSsId && targetSsId.trim() !== "") {
      try { targetSs = SpreadsheetApp.openById(targetSsId.trim()); } catch(e) { return { success: false, error: "取込先スプレッドシートを開けません" }; }
    } else { targetSs = SpreadsheetApp.getActiveSpreadsheet(); }

    const tSheetName = (targetSheetName && String(targetSheetName).trim()) ? String(targetSheetName).trim() : "Notes";
    let targetSheet = targetSs.getSheetByName(tSheetName);
    if (!targetSheet) targetSheet = targetSs.insertSheet(tSheetName);

    const srcData = srcSheet.getDataRange().getValues();
    const headers = srcData[0].map(h => String(h).trim().toLowerCase());
    
    // Header for target
    if (targetSheet.getLastRow() === 0) {
      targetSheet.appendRow(["id", "title", "url", "tags", "highlights", "saved_at", "processed", "nobsidian", "all", "apendix", "date", "timeline", "source", "edited_content", "updated_at"]);
    }
    
    let addedCount = 0;
    
    for (const rIdx of rowIndices) {
      const row = srcData[rIdx];
      if (!row) continue;
      
      const newRow = [...row];
      while (newRow.length < 15) newRow.push("");
      
      if (!newRow[0]) newRow[0] = "import_" + Date.now() + "_" + Math.floor(Math.random()*10000);
      if (!newRow[5]) newRow[5] = Date.now();
      
      targetSheet.appendRow(newRow.slice(0, 15));
      
      // Mark as processed in source
      let nColIdx = headers.indexOf("nobsidian");
      if (nColIdx === -1) nColIdx = 7; // column H
      srcSheet.getRange(rIdx + 1, nColIdx + 1).setValue("IMPORTED");
      
      addedCount++;
    }
    
    return { success: true, count: addedCount };
  } catch (err) {
    return { success: false, error: err.message };
  }
}`;

const newCode = code.replace(oldFuncRegex, newFunc);
fs.writeFileSync('google-apps-script.js', newCode);
