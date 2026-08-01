with open("src/components/KnowledgeGraphModal.tsx", "r", encoding="utf-8") as f:
    content = f.read()

import re
matches = re.findall(r'graphViewMode === "note" && \(\s*<div.*?周辺情報を収集', content, flags=re.DOTALL)
print(f"Found matches: {len(matches)}")
if matches:
    print(matches[0][:100])
