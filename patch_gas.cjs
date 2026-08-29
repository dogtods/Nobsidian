const fs = require('fs');
let code = fs.readFileSync('src/gasScriptCode.ts', 'utf8');

const fetchDriveOld = `function fetchDriveScreenshots(folderId) {
  const folder = DriveApp.getFolderById(folderId);
  const processedFolderName = "_processed";
  let processedFolder;
  const subFolders = folder.getFoldersByName(processedFolderName);

  if (subFolders.hasNext()) {
    processedFolder = subFolders.next();
  } else {
    processedFolder = folder.createFolder(processedFolderName);
  }

  const files = [];
  const fileIterator = folder.getFiles();
  while (fileIterator.hasNext()) {
    const file = fileIterator.next();
    files.push(file);
  }
  return { files, processedFolder };
}`;

const fetchDriveNew = `function fetchDriveScreenshots(folderId, processedFolderId) {
  const folder = DriveApp.getFolderById(folderId);
  let processedFolder;
  if (processedFolderId) {
    try {
      processedFolder = DriveApp.getFolderById(processedFolderId);
    } catch (e) { processedFolder = null; }
  }
  
  if (!processedFolder) {
    const processedFolderName = "_processed";
    const subFolders = folder.getFoldersByName(processedFolderName);
    if (subFolders.hasNext()) {
      processedFolder = subFolders.next();
    } else {
      processedFolder = folder.createFolder(processedFolderName);
    }
  }

  const files = [];
  const fileIterator = folder.getFiles();
  while (fileIterator.hasNext()) {
    const file = fileIterator.next();
    files.push(file);
  }
  return { files, processedFolder };
}`;

code = code.split(fetchDriveOld).join(fetchDriveNew);

const varOld = `let driveFolderId = props.getProperty('SCREENSHOT_FOLDER_ID') || "";`;
const varNew = `function extractFolderId(input) {
      if (!input) return "";
      const match = input.match(/folders\\/([a-zA-Z0-9-_]+)/);
      return match ? match[1] : input.trim();
    }
    let driveFolderId = extractFolderId(config.driveSourceFolder) || props.getProperty('SCREENSHOT_FOLDER_ID') || "";
    let driveProcessedFolderId = extractFolderId(config.driveProcessedFolder) || "";`;

code = code.split(varOld).join(varNew);

const callOld = `const { files, processedFolder } = fetchDriveScreenshots(driveFolderId);`;
const callNew = `const { files, processedFolder } = fetchDriveScreenshots(driveFolderId, driveProcessedFolderId);`;

code = code.split(callOld).join(callNew);

fs.writeFileSync('src/gasScriptCode.ts', code);
