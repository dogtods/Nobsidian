import re

with open("src/components/KnowledgeGraphModal.tsx", "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace(
    'if (!res.ok) throw new Error("API Request failure");',
    'if (!res.ok) throw new Error(`HTTP Error ${res.status}: ${res.status === 404 ? "API Endpoint not found. Please check your model settings." : ""}`);'
)

with open("src/components/KnowledgeGraphModal.tsx", "w", encoding="utf-8") as f:
    f.write(content)
print("Fixed KG")
