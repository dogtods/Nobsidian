import re

with open("src/gasScriptCode.ts", "r") as f:
    content = f.read()

# Replace template literals with string concatenation since GAS may have issues with it depending on environment/parsing context
old_logic1 = "const baseLotName = `${yyyy}${mm}${dd}`;"
new_logic1 = 'const baseLotName = yyyy + mm + dd;'

old_logic2 = "const currentLotName = maxLotNum === 0 ? baseLotName : `${baseLotName}-${maxLotNum}`;"
new_logic2 = 'const currentLotName = maxLotNum === 0 ? baseLotName : baseLotName + "-" + maxLotNum;'

content = content.replace(old_logic1, new_logic1)
content = content.replace(old_logic2, new_logic2)

with open("src/gasScriptCode.ts", "w") as f:
    f.write(content)
print("Successfully fixed syntax error in GAS.")
