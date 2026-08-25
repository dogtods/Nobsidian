import re

with open("src/gasScriptCode.ts", "r") as f:
    content = f.read()

# Fix 1: srcData[rIdx] -> srcData[rIdx - 1]
content = content.replace("const row = srcData[rIdx];", "const row = srcData[rIdx - 1];")

# Fix 2: rIdx + 1 -> rIdx in getRange
content = content.replace("srcSheet.getRange(rIdx + 1, nColIdx + 1).setValue(\"IMPORTED\");", "srcSheet.getRange(rIdx, nColIdx + 1).setValue(\"IMPORTED\");")

with open("src/gasScriptCode.ts", "w") as f:
    f.write(content)
