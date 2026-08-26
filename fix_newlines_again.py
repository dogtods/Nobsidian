import re

with open("src/gasScriptCode.ts", "r") as f:
    content = f.read()

# Fix 1
bad1 = r"""                  let rawSummary = result.summary || "";
                  rawSummary = String(rawSummary).replace(/\n/g, '
');
                  summary = manualHighlights ? manualHighlights + "

【自動要約】
" + rawSummary : rawSummary;"""

good1 = r"""                  let rawSummary = result.summary || "";
                  rawSummary = String(rawSummary).replace(/\\\\n/g, '\\n');
                  summary = manualHighlights ? manualHighlights + "\\n\\n【自動要約】\\n" + rawSummary : rawSummary;"""

content = content.replace(bad1, good1)

bad2 = r"""      const result = JSON.parse(text);
      if (result.highlights) result.highlights = String(result.highlights).replace(/\n/g, '
');
      if (result.timeline) result.timeline = String(result.timeline).replace(/\n/g, '
');
      if (result.tags) result.tags = String(result.tags).replace(/\n/g, '
');
      return result;"""

good2 = r"""      const result = JSON.parse(text);
      if (result.highlights) result.highlights = String(result.highlights).replace(/\\\\n/g, '\\n');
      if (result.timeline) result.timeline = String(result.timeline).replace(/\\\\n/g, '\\n');
      if (result.tags) result.tags = String(result.tags).replace(/\\\\n/g, '\\n');
      return result;"""

content = content.replace(bad2, good2)

bad3 = r"""    const parsed = JSON.parse(text);
    if (parsed.summary) parsed.summary = String(parsed.summary).replace(/\n/g, '
');
    if (parsed.keyword) parsed.keyword = String(parsed.keyword).replace(/\n/g, '
');
    return parsed;"""

good3 = r"""    const parsed = JSON.parse(text);
    if (parsed.summary) parsed.summary = String(parsed.summary).replace(/\\\\n/g, '\\n');
    if (parsed.keyword) parsed.keyword = String(parsed.keyword).replace(/\\\\n/g, '\\n');
    return parsed;"""

content = content.replace(bad3, good3)

with open("src/gasScriptCode.ts", "w") as f:
    f.write(content)
print("Done repairing.")
