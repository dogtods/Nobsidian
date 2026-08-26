import re

with open("src/gasScriptCode.ts", "r") as f:
    content = f.read()

old_logic = """    const srcData = srcSheet.getDataRange().getValues();
    const headers = srcData[0].map(h => String(h).trim().toLowerCase());
    
    // Header for target
    if (targetSheet.getLastRow() === 0) {
      targetSheet.appendRow(["id", "title", "url", "tags", "highlights", "saved_at", "processed", "nobsidian", "all", "apendix", "date", "timeline", "source", "edited_content", "updated_at"]);
    }
    
    let addedCount = 0;
    
    for (const rIdx of rowIndices) {
      const row = srcData[rIdx - 1];
      if (!row) continue;
      
      // A列からM列（またはそれ以上）をそのままコピペ
      const newRow = [];
      for (let i = 0; i < 15; i++) { 
        newRow.push(row[i] !== undefined ? row[i] : "");
      }
      
      targetSheet.appendRow(newRow);"""

new_logic = """    const srcData = srcSheet.getDataRange().getValues();
    const headers = srcData[0].map(h => String(h).trim().toLowerCase());
    
    // Header for target
    if (targetSheet.getLastRow() === 0) {
      targetSheet.appendRow(["id", "title", "url", "tags", "highlights", "saved_at", "processed", "nobsidian", "all", "apendix", "date", "timeline", "source", "edited_content", "updated_at"]);
    }
    
    // 今日の日付からロット名を生成 (例: 20260826)
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const baseLotName = `${yyyy}${mm}${dd}`;
    
    // targetSheetの既存データを調べて、同じ日付のロット番号の最大値を探す (date列: index 10)
    let maxLotNum = 0;
    if (targetSheet.getLastRow() > 1) {
      const targetData = targetSheet.getRange(2, 11, targetSheet.getLastRow() - 1, 1).getValues();
      for (const row of targetData) {
        const dVal = String(row[0]).trim();
        if (dVal === baseLotName) {
          if (maxLotNum < 1) maxLotNum = 1;
        } else if (dVal.startsWith(baseLotName + "-")) {
          const numStr = dVal.split("-")[1];
          const num = parseInt(numStr, 10);
          if (!isNaN(num) && num >= maxLotNum) {
            maxLotNum = num + 1; // 既にある最大値の次
          }
        }
      }
    }
    const currentLotName = maxLotNum === 0 ? baseLotName : `${baseLotName}-${maxLotNum}`;
    
    let addedCount = 0;
    
    for (const rIdx of rowIndices) {
      const row = srcData[rIdx - 1];
      if (!row) continue;
      
      const newRow = [];
      for (let i = 0; i < 15; i++) { 
        newRow.push(row[i] !== undefined ? row[i] : "");
      }
      
      // date列 (index 10) を今回のロット名で上書きする
      newRow[10] = currentLotName;
      
      targetSheet.appendRow(newRow);"""

# Relaxing whitespace matching
import textwrap
content = re.sub(
    r'const srcData = srcSheet\.getDataRange\(\)\.getValues\(\);[\s\S]*?targetSheet\.appendRow\(newRow\);',
    new_logic,
    content
)

with open("src/gasScriptCode.ts", "w") as f:
    f.write(content)
print("Successfully added lot name logic to GAS.")
