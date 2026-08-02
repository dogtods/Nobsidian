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
            
            if (content.includes('model.includes("2.5")')) {
                content = content.replace(
                    /if \(model\.includes\("2\.5"\)\) model = "gemini-2\.0-flash";/g,
                    'if (model.includes("2.5")) model = "gemini-2.0-flash";\n      if (model === "gemini-flash-lite-latest") model = "gemini-2.0-flash-lite-preview-02-05";'
                );
                changed = true;
            }
            if (content.includes('importModel.includes("2.5")')) {
                content = content.replace(
                    /if \(importModel\.includes\("2\.5"\)\) importModel = "gemini-2\.0-flash";/g,
                    'if (importModel.includes("2.5")) importModel = "gemini-2.0-flash";\n      if (importModel === "gemini-flash-lite-latest") importModel = "gemini-2.0-flash-lite-preview-02-05";'
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
