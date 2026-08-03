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
            
            if (content.includes('throw new Error("Gemini API call failed.");')) {
                content = content.replace(
                    /if \(\!res\.ok\) throw new Error\("Gemini API call failed\."\);/g,
                    'if (!res.ok) { const errText = await res.text(); throw new Error(`Gemini API call failed: ${res.status} ${errText}`); }'
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
