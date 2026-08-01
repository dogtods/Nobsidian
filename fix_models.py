import os
import re

def fix_models():
    for root, dirs, files in os.walk('src'):
        for file in files:
            if file.endswith(('.ts', '.tsx')):
                path = os.path.join(root, file)
                with open(path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                # Replace 2.5 with 2.0-flash to be safe, except where we shouldn't
                # Wait, I'll just remove the options from SettingsModal and ensure defaults are 2.0-flash
                if "gemini-2.5-flash" in content:
                    content = content.replace('<option value="gemini-2.5-flash">Gemini 2.5 Flash</option>', '')
                    content = content.replace('<option value="gemini-2.5-pro">Gemini 2.5 Pro</option>', '')
                    with open(path, 'w', encoding='utf-8') as f:
                        f.write(content)
                        print(f"Fixed models in {path}")

fix_models()
