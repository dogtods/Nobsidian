const fs = require('fs');
const path = require('path');

function processDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            processDir(fullPath);
        } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let changed = false;
            
            // Remove the 2.5 fallback
            if (content.includes('if (model.includes("2.5")) model = "gemini-2.0-flash";')) {
                content = content.replace(/      if \(model\.includes\("2\.5"\)\) model = "gemini-2\.0-flash";\n/g, '');
                changed = true;
            }
            if (content.includes('if (importModel.includes("2.5")) importModel = "gemini-2.0-flash";')) {
                content = content.replace(/    if \(importModel\.includes\("2\.5"\)\) importModel = "gemini-2\.0-flash";\n/g, '');
                changed = true;
            }
            
            // Map gemini-flash-lite-latest to gemini-2.0-flash-lite
            const mapStrModel = `      if (model === "gemini-flash-lite-latest") model = "gemini-2.0-flash-lite";\n`;
            if (content.includes('let model = localStorage.getItem("cn_gemini_model")') && !content.includes('model = "gemini-2.0-flash-lite"')) {
                content = content.replace(
                    /let model = localStorage\.getItem\("cn_gemini_model"\) \|\| "gemini-2\.0-flash";/g,
                    'let model = localStorage.getItem("cn_gemini_model") || "gemini-2.0-flash";\n' + mapStrModel
                );
                changed = true;
            }
            
            const mapStrImport = `      if (importModel === "gemini-flash-lite-latest") importModel = "gemini-2.0-flash-lite";\n`;
            if (content.includes('let importModel = localStorage.getItem("cn_gemini_model")') && !content.includes('importModel = "gemini-2.0-flash-lite"')) {
                content = content.replace(
                    /let importModel = localStorage\.getItem\("cn_gemini_model"\) \|\| "gemini-2\.0-flash";/g,
                    'let importModel = localStorage.getItem("cn_gemini_model") || "gemini-2.0-flash";\n' + mapStrImport
                );
                changed = true;
            }

            if (changed) {
                fs.writeFileSync(fullPath, content);
                console.log("Updated " + fullPath);
            }
        }
    }
}

processDir('src');
