import re

with open("src/App.tsx", "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace(
    "if (!res.ok) throw new Error(`HTTP Error ${res.status}`);",
    "if (!res.ok) throw new Error(`HTTP Error ${res.status}: ${res.status === 404 ? 'API Endpoint not found. Please check your URL or Model settings.' : ''}`);"
)

with open("src/App.tsx", "w", encoding="utf-8") as f:
    f.write(content)
print("Fixed App.tsx")
