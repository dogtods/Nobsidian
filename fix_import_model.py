import re

with open("src/components/ImportModal.tsx", "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace(
    'const importModel = localStorage.getItem("cn_gemini_model") || "gemini-2.0-flash";',
    'let importModel = localStorage.getItem("cn_gemini_model") || "gemini-2.0-flash";\\n    if (importModel.includes("2.5")) importModel = "gemini-2.0-flash";'
)

with open("src/components/ImportModal.tsx", "w", encoding="utf-8") as f:
    f.write(content)
print("Fixed ImportModal.tsx")

with open("src/components/SettingsModal.tsx", "r", encoding="utf-8") as f:
    content = f.read()
content = content.replace('setModel(localStorage.getItem("cn_gemini_model") || "gemini-2.0-flash");', 'let m = localStorage.getItem("cn_gemini_model") || "gemini-2.0-flash"; if(m.includes("2.5")) m="gemini-2.0-flash"; setModel(m);')
with open("src/components/SettingsModal.tsx", "w", encoding="utf-8") as f:
    f.write(content)
print("Fixed SettingsModal.tsx")
