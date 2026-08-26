import re

with open("src/gasScriptCode.ts", "r") as f:
    content = f.read()

# Replace 'drive_pdf' with file.getName()
content = content.replace("'drive_pdf'", "file.getName()")
# Replace 'drive_image' with file.getName()
content = content.replace("'drive_image'", "file.getName()")

with open("src/gasScriptCode.ts", "w") as f:
    f.write(content)
print("Successfully replaced other file names.")
