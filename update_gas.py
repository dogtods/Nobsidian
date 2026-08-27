import re

with open("src/gasScriptCode.ts", "r") as f:
    content = f.read()

# Update driveFolderId logic in BOTH RAW_IMPORT_GAS_SCRIPT and SYNC_AND_SAVE_GAS_SCRIPT
# find: 
#     const driveFolderId = props.getProperty('SCREENSHOT_FOLDER_ID') || "";
#     const persona = getConfig('SYSTEM_PERSONA');
#     const syncPrompt = getConfig('SYNC_PROMPT');
# 
#     // --- A. Raindropからの同期 ---
#     if (config.raindrop === true && raindropToken) {
# ...
#     // --- B. Googleドライブからの同期 (MHT / PDF / 画像) ---
#     if (config.drive === true && !isTimeOut && driveFolderId) {
#       console.log("Googleドライブ同期を開始します...");
#       const { files, processedFolder } = fetchDriveScreenshots(driveFolderId);

find_logic = """    const geminiModel = getConfig('GEMINI_MODEL');
    const raindropToken = props.getProperty('RAINDROP_TOKEN') || "";
    const driveFolderId = props.getProperty('SCREENSHOT_FOLDER_ID') || "";
    const persona = getConfig('SYSTEM_PERSONA');"""

replace_logic = """    const geminiModel = getConfig('GEMINI_MODEL');
    const raindropToken = props.getProperty('RAINDROP_TOKEN') || "";
    let driveFolderId = props.getProperty('SCREENSHOT_FOLDER_ID') || "";
    let driveFolderName = "Connected Notes 取り込み";
    const persona = getConfig('SYSTEM_PERSONA');"""

content = content.replace(find_logic, replace_logic)

find_drive = """    // --- B. Googleドライブからの同期 (MHT / PDF / 画像) ---
    if (config.drive === true && !isTimeOut && driveFolderId) {
      console.log("Googleドライブ同期を開始します...");
      const { files, processedFolder } = fetchDriveScreenshots(driveFolderId);"""

replace_drive = """    // --- B. Googleドライブからの同期 (MHT / PDF / 画像) ---
    if (config.drive === true && !isTimeOut) {
      let targetDriveFolder;
      if (driveFolderId) {
        try {
          targetDriveFolder = DriveApp.getFolderById(driveFolderId);
          driveFolderName = targetDriveFolder.getName();
        } catch (e) { driveFolderId = ""; }
      }
      if (!driveFolderId) {
        const folders = DriveApp.getFoldersByName(driveFolderName);
        if (folders.hasNext()) {
          targetDriveFolder = folders.next();
        } else {
          targetDriveFolder = DriveApp.createFolder(driveFolderName);
        }
        driveFolderId = targetDriveFolder.getId();
        props.setProperty('SCREENSHOT_FOLDER_ID', driveFolderId);
      }
      
      console.log("Googleドライブ同期を開始します...");
      const { files, processedFolder } = fetchDriveScreenshots(driveFolderId);"""

content = content.replace(find_drive, replace_drive)

with open("src/gasScriptCode.ts", "w") as f:
    f.write(content)

print("Updated gasScriptCode.ts")
