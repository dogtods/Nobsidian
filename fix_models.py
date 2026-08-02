import os
import glob

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    changed = False
    if 'model.includes("2.5")' in content:
        content = content.replace(
            'if (model.includes("2.5")) model = "gemini-2.0-flash";',
            'if (model.includes("2.5")) model = "gemini-2.0-flash";\n      if (model === "gemini-flash-lite-latest") model = "gemini-2.0-flash-lite-preview-02-05";'
        )
        changed = True
    if 'importModel.includes("2.5")' in content:
        content = content.replace(
            'if (importModel.includes("2.5")) importModel = "gemini-2.0-flash";',
            'if (importModel.includes("2.5")) importModel = "gemini-2.0-flash";\n      if (importModel === "gemini-flash-lite-latest") importModel = "gemini-2.0-flash-lite-preview-02-05";'
        )
        changed = True
        
    if changed:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {filepath}")

for root, _, files in os.walk('src'):
    for file in files:
        if file.endswith('.tsx') or file.endswith('.ts'):
            process_file(os.path.join(root, file))
