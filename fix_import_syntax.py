import re

with open("src/components/ImportModal.tsx", "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace(
    'let importModel = localStorage.getItem("cn_gemini_model") || "gemini-2.0-flash";\\n    if (importModel.includes("2.5")) importModel = "gemini-2.0-flash";',
    'let importModel = localStorage.getItem("cn_gemini_model") || "gemini-2.0-flash";\n    if (importModel.includes("2.5")) importModel = "gemini-2.0-flash";'
)

with open("src/components/ImportModal.tsx", "w", encoding="utf-8") as f:
    f.write(content)
print("Fixed ImportModal.tsx syntax")
