import re

with open("src/App.tsx", "r") as f:
    content = f.read()

# Update apiPost
find_post = """    const targetSheetName = localStorage.getItem("cn_gas_sheet_name");
    if (targetSheetName && targetSheetName.trim() !== "") {
      if (!body.sheetName) {
        body.sheetName = targetSheetName.trim();
      }
    }"""

replace_post = """    const targetSheetName = localStorage.getItem("cn_gas_sheet_name");
    if (targetSheetName && targetSheetName.trim() !== "") {
      if (!body.sheetName) {
        body.sheetName = targetSheetName.trim();
      }
    }
    const targetSsUrl = localStorage.getItem("cn_gas_target_ss_url");
    if (targetSsUrl && targetSsUrl.trim() !== "") {
      if (!body.targetSsUrl) {
        body.targetSsUrl = targetSsUrl.trim();
      }
    }"""

content = content.replace(find_post, replace_post)

# Update apiGet
find_get = """    const sheetName = localStorage.getItem("cn_gas_sheet_name");
    if (sheetName && sheetName.trim() !== "") {
      params.sheetName = sheetName.trim();
    }"""

replace_get = """    const sheetName = localStorage.getItem("cn_gas_sheet_name");
    if (sheetName && sheetName.trim() !== "") {
      params.sheetName = sheetName.trim();
    }
    const targetSsUrl = localStorage.getItem("cn_gas_target_ss_url");
    if (targetSsUrl && targetSsUrl.trim() !== "") {
      params.targetSsUrl = targetSsUrl.trim();
    }"""

content = content.replace(find_get, replace_get)

with open("src/App.tsx", "w") as f:
    f.write(content)
print("Updated App.tsx.")
