
const fs = require('fs');
let code = fs.readFileSync('src/gasScriptCode.ts', 'utf8');
let syncScript = fs.readFileSync('ngoogle-apps-script.gs', 'utf8');

// Escape backticks in the script for the template literal
syncScript = syncScript.replace(/`/g, '\\`');
syncScript = syncScript.replace(/\$/g, '\\$'); // Also escape $ for template literals

// Replace the AI_SYNC_GAS_SCRIPT definition
const start = code.indexOf('export const AI_SYNC_GAS_SCRIPT =');
const newCode = code.substring(0, start) + 'export const AI_SYNC_GAS_SCRIPT = `' + syncScript + '`;';

fs.writeFileSync('src/gasScriptCode.ts', newCode);
console.log('Successfully updated AI_SYNC_GAS_SCRIPT');
