import re

with open("src/gasScriptCode.ts", "r") as f:
    content = f.read()

old_func_1 = """    if (response.getResponseCode() === 200) {
      const resJson = JSON.parse(response.getContentText());
      const text = resJson.candidates[0].content.parts[0].text.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(text);
    }"""
new_func_1 = """    if (response.getResponseCode() === 200) {
      const resJson = JSON.parse(response.getContentText());
      const text = resJson.candidates[0].content.parts[0].text.replace(/```json/g, '').replace(/```/g, '').trim();
      const result = JSON.parse(text);
      if (result.highlights) result.highlights = String(result.highlights).replace(/\\\\n/g, '\\n');
      if (result.timeline) result.timeline = String(result.timeline).replace(/\\\\n/g, '\\n');
      if (result.tags) result.tags = String(result.tags).replace(/\\\\n/g, '\\n');
      return result;
    }"""
content = content.replace(old_func_1, new_func_1)

old_func_2 = """    const result = JSON.parse(response.getContentText());
    const text = result.candidates[0].content.parts[0].text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(text);"""
new_func_2 = """    const result = JSON.parse(response.getContentText());
    const text = result.candidates[0].content.parts[0].text.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(text);
    if (parsed.summary) parsed.summary = String(parsed.summary).replace(/\\\\n/g, '\\n');
    if (parsed.keyword) parsed.keyword = String(parsed.keyword).replace(/\\\\n/g, '\\n');
    return parsed;"""
content = content.replace(old_func_2, new_func_2)

# Also in processMhtFile_Advanced where it parses inline:
old_func_3 = """                  const result = JSON.parse(text);
                  keyword = result.keyword || "一般";
                  summary = manualHighlights ? manualHighlights + "\\n\\n【自動要約】\\n" + result.summary : (result.summary || "");"""
new_func_3 = """                  const result = JSON.parse(text);
                  keyword = result.keyword || "一般";
                  let rawSummary = result.summary || "";
                  rawSummary = String(rawSummary).replace(/\\\\n/g, '\\n');
                  summary = manualHighlights ? manualHighlights + "\\n\\n【自動要約】\\n" + rawSummary : rawSummary;"""
content = content.replace(old_func_3, new_func_3)

with open("src/gasScriptCode.ts", "w") as f:
    f.write(content)
print("Applied newline fixes.")
