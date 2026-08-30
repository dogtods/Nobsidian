with open("google-apps-script.js", "r") as f:
    js_code = f.read()

escaped_code = js_code.replace("\\", "\\\\").replace("`", "\\`").replace("$", "\\$")

out = "export const RAW_IMPORT_GAS_SCRIPT = `" + escaped_code + "`;\n\n"
out += "export const SYNC_AND_SAVE_GAS_SCRIPT = `" + escaped_code + "`;\n"

with open("src/gasScriptCode.ts", "w") as f:
    f.write(out)
print("Updated src/gasScriptCode.ts")
