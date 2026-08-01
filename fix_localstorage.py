import os

def fix():
    for root, dirs, files in os.walk('src'):
        for file in files:
            if file.endswith(('.ts', '.tsx')):
                path = os.path.join(root, file)
                with open(path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                # We need to replace:
                # const model = localStorage.getItem("cn_gemini_model") || "gemini-2.0-flash";
                # with something that falls back if it's an invalid model like 2.5
                old_str1 = 'const model = localStorage.getItem("cn_gemini_model") || "gemini-2.0-flash";'
                new_str1 = 'let model = localStorage.getItem("cn_gemini_model") || "gemini-2.0-flash";\n      if (model.includes("2.5")) model = "gemini-2.0-flash";'
                
                if old_str1 in content:
                    content = content.replace(old_str1, new_str1)
                    with open(path, 'w', encoding='utf-8') as f:
                        f.write(content)
                        print(f"Fixed model read in {path}")

fix()
