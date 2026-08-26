import re

with open("src/gasScriptCode.ts", "r") as f:
    content = f.read()

content = re.sub(r'const resJson = JSON\.parse\(response\.getContentText\(\)\);\s*const text = resJson\.candidates\[0\]\.content\.parts\[0\]\.text\.replace\(/```json/g, \'\'\)\.replace\(/```/g, \'\'\)\.trim\(\);\s*return JSON\.parse\(text\);',
"""const resJson = JSON.parse(response.getContentText());
      const text = resJson.candidates[0].content.parts[0].text.replace(/```json/g, '').replace(/```/g, '').trim();
      const result = JSON.parse(text);
      if (result.highlights) result.highlights = String(result.highlights).replace(/\\\\n/g, '\\n');
      if (result.timeline) result.timeline = String(result.timeline).replace(/\\\\n/g, '\\n');
      if (result.tags) result.tags = String(result.tags).replace(/\\\\n/g, '\\n');
      return result;""", content)

content = re.sub(r'const result = JSON\.parse\(response\.getContentText\(\)\);\s*const text = result\.candidates\[0\]\.content\.parts\[0\]\.text\.replace\(/```json/g, \'\'\)\.replace\(/```/g, \'\'\)\.trim\(\);\s*return JSON\.parse\(text\);',
"""const result = JSON.parse(response.getContentText());
    const text = result.candidates[0].content.parts[0].text.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(text);
    if (parsed.summary) parsed.summary = String(parsed.summary).replace(/\\\\n/g, '\\n');
    if (parsed.keyword) parsed.keyword = String(parsed.keyword).replace(/\\\\n/g, '\\n');
    return parsed;""", content)

content = re.sub(r'const result = JSON\.parse\(text\);\s*keyword = result\.keyword \|\| "一般";\s*summary = manualHighlights \? manualHighlights \+ "\\\\n\\\\n【自動要約】\\\\n" \+ result\.summary : \(result\.summary \|\| ""\);',
"""const result = JSON.parse(text);
                  keyword = result.keyword || "一般";
                  let rawSummary = result.summary || "";
                  rawSummary = String(rawSummary).replace(/\\\\n/g, '\\n');
                  summary = manualHighlights ? manualHighlights + "\\n\\n【自動要約】\\n" + rawSummary : rawSummary;""", content)

with open("src/gasScriptCode.ts", "w") as f:
    f.write(content)
print("Done fixing all replacements.")
