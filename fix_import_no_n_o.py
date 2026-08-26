import re

with open("src/gasScriptCode.ts", "r") as f:
    content = f.read()

# We need to find the importRawRowsToApp loop and force N and O to be empty.
# Right now it has:
#       // date列 (index 10) を今回のロット名で上書きする
#       newRow[10] = currentLotName;
#       
#       targetSheet.appendRow(newRow);

old_str = """      // date列 (index 10) を今回のロット名で上書きする
      newRow[10] = currentLotName;
      
      targetSheet.appendRow(newRow);"""

new_str = """      // date列 (index 10) を今回のロット名で上書きする
      newRow[10] = currentLotName;
      
      // N列(edited_content)とO列(updated_at)はインポート時は必ず空にする
      newRow[13] = "";
      newRow[14] = "";
      
      targetSheet.appendRow(newRow);"""

if old_str in content:
    content = content.replace(old_str, new_str)
    with open("src/gasScriptCode.ts", "w") as f:
        f.write(content)
    print("Successfully cleared N and O on import.")
else:
    print("Could not find the exact block.")
