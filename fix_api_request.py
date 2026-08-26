import re

with open("src/gasScriptCode.ts", "r") as f:
    content = f.read()

find_str_1 = """  const action = postData.action || (e.parameter ? e.parameter.action : "");
  const targetSheet = postData.sheetName || (e.parameter ? e.parameter.sheetName : "");"""

replace_str_1 = """  const action = postData.action || (e.parameter ? e.parameter.action : "");
  const targetSheet = postData.sheetName || (e.parameter ? e.parameter.sheetName : "");
  const targetSsUrl = postData.targetSsUrl || (e.parameter ? e.parameter.targetSsUrl : "");"""

content = content.replace(find_str_1, replace_str_1)

# Now, we need to pass targetSsUrl to all the handler functions.
# handleGetNotes(targetSheet) -> handleGetNotes(targetSheet, targetSsUrl)
content = content.replace("handleGetNotes(targetSheet)", "handleGetNotes(targetSheet, targetSsUrl)")
# saveNote(note, targetSheet) -> saveNote(note, targetSheet, targetSsUrl)
content = content.replace("saveNote(note, targetSheet)", "saveNote(note, targetSheet, targetSsUrl)")
# deleteNote(postData.id, targetSheet) -> deleteNote(postData.id, targetSheet, targetSsUrl)
content = content.replace("deleteNote(postData.id, targetSheet)", "deleteNote(postData.id, targetSheet, targetSsUrl)")
# saveAll(notes, targetSheet) -> saveAll(notes, targetSheet, targetSsUrl)
content = content.replace("saveAll(notes, targetSheet)", "saveAll(notes, targetSheet, targetSsUrl)")
# syncExternalSources(options, targetSheet) -> syncExternalSources(options, targetSheet, targetSsUrl)
content = content.replace("syncExternalSources(options, targetSheet)", "syncExternalSources(options, targetSheet, targetSsUrl)")

# Also update the function definitions to accept targetSsUrl and pass it to getSheet.
content = content.replace("function handleGetNotes(targetSheetName) {", "function handleGetNotes(targetSheetName, targetSsUrl) {")
content = content.replace("function saveNote(note, targetSheetName) {", "function saveNote(note, targetSheetName, targetSsUrl) {")
content = content.replace("function deleteNote(id, targetSheetName) {", "function deleteNote(id, targetSheetName, targetSsUrl) {")
content = content.replace("function saveAll(notes, targetSheetName) {", "function saveAll(notes, targetSheetName, targetSsUrl) {")
content = content.replace("function syncExternalSources(options, targetSheetName) {", "function syncExternalSources(options, targetSheetName, targetSsUrl) {")

content = content.replace("const sheet = getSheet(targetSheetName);", "const sheet = getSheet(targetSheetName, targetSsUrl);")

with open("src/gasScriptCode.ts", "w") as f:
    f.write(content)
print("Updated API request handling in gasScriptCode.ts")
