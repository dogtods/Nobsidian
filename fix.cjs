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
            
            if (content.includes('gemini-2.0-flash-lite-preview-02-05";')) {
                content = content.replace(/gemini-2\.0-flash-lite-preview-02-05";/g, 'gemini-2.5-flash-lite";');
                changed = true;
            }
            // Also let's just make sure we handle gemini-2.0-flash-lite
            if (content.includes('gemini-2.0-flash-lite";')) {
                content = content.replace(/gemini-2\.0-flash-lite";/g, 'gemini-2.5-flash-lite";');
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
