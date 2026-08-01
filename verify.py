import re
with open("src/components/KnowledgeGraphModal.tsx", "r", encoding="utf-8") as f:
    text = f.read()

assert "外部AI用プロンプトをコピー" in text
assert "1階層先" in text

# Also let's just make sure graphViewMode conditional is really gone
matches = re.findall(r'graphViewMode === "note" && \(\s*<div.*?周辺情報', text, flags=re.DOTALL)
assert len(matches) == 0

print("Verification passed!")
