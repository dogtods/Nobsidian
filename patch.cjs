const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const parseAIJSON = `
const parseAIJSON = (rawText: string) => {
  let cleanText = rawText.trim();
  const match = cleanText.match(/\`\`\`(?:json)?\\s*([\\s\\S]*?)\\s*\`\`\`/);
  if (match) {
    cleanText = match[1].trim();
  } else if (cleanText.startsWith("\`\`\`")) {
    cleanText = cleanText.replace(/^\`\`\`[a-z]*\\n?/, "").replace(/\\n?\`\`\`$/, "").trim();
  }
  
  try {
    return JSON.parse(cleanText);
  } catch (e: any) {
    try {
      const fixedStr = cleanText.replace(/"([^"\\\\]|\\\\.)*"/g, (m: string) => {
        return m.replace(/\\n/g, "\\\\n").replace(/\\r/g, "\\\\r").replace(/\\t/g, "\\\\t");
      });
      return JSON.parse(fixedStr);
    } catch (fallbackErr) {
      const extractMatch = cleanText.match(/(\\{|\\[)[\\s\\S]*(\\}|\\])/);
      if (extractMatch) {
        const fixedStr = extractMatch[0].replace(/"([^"\\\\]|\\\\.)*"/g, (m: string) => {
          return m.replace(/\\n/g, "\\\\n").replace(/\\r/g, "\\\\r").replace(/\\t/g, "\\\\t");
        });
        return JSON.parse(fixedStr);
      }
      throw e;
    }
  }
};
`;

content = content.replace("const getApiUrl = () => {", parseAIJSON + "\nconst getApiUrl = () => {");
fs.writeFileSync('src/App.tsx', content);
