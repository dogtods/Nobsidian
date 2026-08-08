const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /        if \(!parsed\.keywords && !parsed\.summary && !parsed\.related_notes\) \{\n          throw new Error\("必要なプロパティ\(keywords, summary, related_notes\)が見つかりません"\);\n        \}/;

const newFunc = `        if (parsed.chart !== undefined || parsed.timeline_shift !== undefined || parsed.causal_flow !== undefined) {
          const active = getActiveNote();
          if (active) {
            const updated = { ...active, visualStructure: {
              chart: parsed.chart || null,
              timeline_shift: parsed.timeline_shift || null,
              causal_flow: parsed.causal_flow || null,
            }, updatedAt: Date.now() };
            const newList = notes.map(n => n.id === active.id ? updated : n);
            setNotes(newList);
            triggerLocalSave(newList, active.id);
            scheduleDelayedSave(updated);
            toast("外部AIからの図解構造を適用しました ✦");
            setIsExternalPasteOpen(false);
            setExternalPasteText("");
            return;
          }
        }

        if (!parsed.keywords && !parsed.summary && !parsed.related_notes) {
          throw new Error("必要なプロパティ(keywords, summary, related_notes 等)が見つかりません");
        }`;

content = content.replace(regex, newFunc);
fs.writeFileSync('src/App.tsx', content);
