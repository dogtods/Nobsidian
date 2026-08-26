import re

with open("src/gasScriptCode.ts", "r") as f:
    content = f.read()

find_str = """function getSheet(targetSheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error("スプレッドシートのアクティブなインスタンスが見つかりません。コンテナバインドスクリプトとして作成してください。");
  }"""

replace_str = """function getSheet(targetSheetName, targetSsUrl) {
  let ss = null;
  if (targetSsUrl && String(targetSsUrl).trim() !== "") {
    try {
      ss = SpreadsheetApp.openByUrl(String(targetSsUrl).trim());
    } catch(e) {
      const match = String(targetSsUrl).match(/[-\\w]{25,}/);
      if (match) {
        ss = SpreadsheetApp.openById(match[0]);
      } else {
        throw new Error("指定されたスプレッドシートを開けません。URLを確認してください。");
      }
    }
  } else {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  }
  if (!ss) {
    throw new Error("スプレッドシートが見つかりません。URLが正しいか確認してください。");
  }"""

content = content.replace(find_str, replace_str)

with open("src/gasScriptCode.ts", "w") as f:
    f.write(content)
print("Updated getSheet in gasScriptCode.ts")
