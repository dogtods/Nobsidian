import re

with open("src/gasScriptCode.ts", "r") as f:
    content = f.read()

old_func = """                  const result = JSON.parse(text);
                  keyword = result.keyword || "一般";
                  summary = manualHighlights ? manualHighlights + "\\n\\n【自動要約】\\n" + result.summary : (result.summary || "");"""
                  
new_func = """                  const result = JSON.parse(text);
                  keyword = result.keyword || "一般";
                  let rawSummary = result.summary || "";
                  rawSummary = String(rawSummary).replace(/\\\\n/g, '\\n');
                  summary = manualHighlights ? manualHighlights + "\\n\\n【自動要約】\\n" + rawSummary : rawSummary;"""

content = content.replace(old_func, new_func)

with open("src/gasScriptCode.ts", "w") as f:
    f.write(content)
print("Applied third replacement.")
