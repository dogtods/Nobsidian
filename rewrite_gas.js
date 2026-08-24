const fs = require('fs');
const code = fs.readFileSync('google-apps-script.js', 'utf8');
const escapedCode = code.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
const tsContent = `export const RAW_IMPORT_GAS_SCRIPT = \`${escapedCode}\`;\n\nexport const SYNC_AND_SAVE_GAS_SCRIPT = \`${escapedCode}\`;\n`;
fs.writeFileSync('src/gasScriptCode.ts', tsContent);
