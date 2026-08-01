import re

with open("src/App.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# Make the catch block handle HTTP Error 404 better
content = content.replace(
    'if (e.message === "Failed to fetch" || e.name === "TypeError") {',
    'if (e.message.includes("404")) throw new Error("APIエンドポイントが見つかりません(404)。GASのURL、またはAIモデルの設定を確認してください。");\n      if (e.message === "Failed to fetch" || e.name === "TypeError") {'
)

with open("src/App.tsx", "w", encoding="utf-8") as f:
    f.write(content)
print("Updated App.tsx catch block")
