import re

with open("src/gasScriptCode.ts", "r") as f:
    content = f.read()

# Replace any remaining template literals that might break ESBuild parsing for GAS code.
content = re.sub(r'`\$\{yyyy\}\$\{mm\}\$\{dd\}`', 'yyyy + mm + dd', content)
content = re.sub(r'`\$\{baseLotName\}-\$\{maxLotNum\}`', 'baseLotName + "-" + maxLotNum', content)

with open("src/gasScriptCode.ts", "w") as f:
    f.write(content)
print("Successfully fixed syntax error in GAS with regex.")
