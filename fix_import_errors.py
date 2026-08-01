import re

with open("src/components/ImportModal.tsx", "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace(
    "if (!r.ok) {",
    "if (!r.ok) { throw new Error(`HTTP Error ${r.status}: ${r.status === 404 ? 'API Endpoint not found. Please check your model settings.' : ''}`);"
)

with open("src/components/ImportModal.tsx", "w", encoding="utf-8") as f:
    f.write(content)
print("Fixed ImportModal.tsx errors")
