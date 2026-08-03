const fs = require('fs');
let content = fs.readFileSync('src/components/SettingsModal.tsx', 'utf8');
content = content.replace('<option value="gemini-flash-lite-latest">Gemini Flash Lite (Latest)</option>', '<option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</option>\n            <option value="gemini-2.0-flash-lite">Gemini 2.0 Flash Lite</option>');
content = content.replace('<option value="gemini-2.0-flash">Gemini 2.0 Flash</option>', '<option value="gemini-2.5-flash">Gemini 2.5 Flash</option>\n            <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>');
fs.writeFileSync('src/components/SettingsModal.tsx', content);
