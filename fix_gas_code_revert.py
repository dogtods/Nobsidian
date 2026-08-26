import re

with open("src/gasScriptCode.ts", "r") as f:
    content = f.read()

old_logic = """    let tSheetName = (targetSheetName && String(targetSheetName).trim()) ? String(targetSheetName).trim() : "Notes";
    let targetSheet = targetSs.getSheetByName(tSheetName);
    
    // シートが存在し、かつすでにデータが入っている場合（別のロットとして扱う）は連番を付与する
    if (targetSheet && targetSheet.getLastRow() > 0) {
      let counter = 1;
      let newSheetName = tSheetName + "-" + counter;
      while (targetSs.getSheetByName(newSheetName) && targetSs.getSheetByName(newSheetName).getLastRow() > 0) {
        counter++;
        newSheetName = tSheetName + "-" + counter;
      }
      tSheetName = newSheetName;
      targetSheet = targetSs.getSheetByName(tSheetName);
    }
    
    if (!targetSheet) targetSheet = targetSs.insertSheet(tSheetName);"""

new_logic = """    const tSheetName = (targetSheetName && String(targetSheetName).trim()) ? String(targetSheetName).trim() : "Notes";
    let targetSheet = targetSs.getSheetByName(tSheetName);
    if (!targetSheet) targetSheet = targetSs.insertSheet(tSheetName);"""

if old_logic in content:
    content = content.replace(old_logic, new_logic)
    with open("src/gasScriptCode.ts", "w") as f:
        f.write(content)
    print("Successfully reverted GAS logic.")
else:
    print("Could not find the target logic in GAS script.")
