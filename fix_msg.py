import re

with open("src/components/KnowledgeGraphModal.tsx", "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("🔍 周辺ノードをレポート対象に収集", "🔍 周辺情報を収集（外部AI等用）")

with open("src/components/KnowledgeGraphModal.tsx", "w", encoding="utf-8") as f:
    f.write(content)
