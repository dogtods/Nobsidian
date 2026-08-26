import re

with open("src/gasScriptCode.ts", "r") as f:
    content = f.read()

old_str = """      geminiResultJson.timeline || "",
      'mht',
      '',
      ''
    ]);"""

new_str = """      geminiResultJson.timeline || "",
      file.getName(),
      '',
      ''
    ]);"""

if old_str in content:
    content = content.replace(old_str, new_str)
    with open("src/gasScriptCode.ts", "w") as f:
        f.write(content)
    print("Successfully updated mht filename insertion.")
else:
    print("Could not find exact block, trying regex.")
    content = re.sub(
        r'geminiResultJson\.timeline \|\| "",\s*\'mht\',\s*\'\',\s*\'\'\s*\]\);',
        r'geminiResultJson.timeline || "",\n      file.getName(),\n      \'\',\n      \'\'\n    ]);',
        content
    )
    with open("src/gasScriptCode.ts", "w") as f:
        f.write(content)
    print("Updated via regex.")
