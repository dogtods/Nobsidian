import re

with open("src/components/SyncManagerModal.tsx", "r") as f:
    content = f.read()

# We need to add state for workspaceSsUrl
state_addition = """  const [workspaceSheet, setWorkspaceSheet] = useState(localStorage.getItem("cn_gas_sheet_name") || "Notes");
  const [workspaceSsUrl, setWorkspaceSsUrl] = useState(localStorage.getItem("cn_gas_target_ss_url") || "");"""

content = re.sub(r'const \[workspaceSheet, setWorkspaceSheet\] = useState\(localStorage\.getItem\("cn_gas_sheet_name"\) \|\| "Notes"\);', state_addition, content)

# And in the inputs
inputs_find = """            <div className="flex gap-2 items-center pl-[42px]">
              <input
                type="text"
                value={workspaceSheet}
                onChange={(e) => setWorkspaceSheet(e.target.value)}
                placeholder="シート名 (例: ProjectA)"
                className="flex-1 bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-1.5 text-xs text-white outline-none focus:border-[var(--purple)] transition-colors"
                disabled={isAnyLoading}
              />
              <button
                type="button"
                disabled={isAnyLoading}
                onClick={() => {
                  if (!workspaceSheet.trim()) {
                    setErrorMessage("シート名を入力してください。");
                    return;
                  }
                  localStorage.setItem("cn_gas_sheet_name", workspaceSheet.trim());
                  handleAction("workspace", onForceDownload);
                }}"""

inputs_replace = """            <div className="flex flex-col gap-2 pl-[42px]">
              <input
                type="text"
                value={workspaceSsUrl}
                onChange={(e) => setWorkspaceSsUrl(e.target.value)}
                placeholder="スプレッドシートのURL (省略時は既存のシート)"
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-1.5 text-xs text-white outline-none focus:border-[var(--purple)] transition-colors"
                disabled={isAnyLoading}
              />
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  value={workspaceSheet}
                  onChange={(e) => setWorkspaceSheet(e.target.value)}
                  placeholder="シート名 (例: ProjectA)"
                  className="flex-1 bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-1.5 text-xs text-white outline-none focus:border-[var(--purple)] transition-colors"
                  disabled={isAnyLoading}
                />
                <button
                  type="button"
                  disabled={isAnyLoading}
                  onClick={() => {
                    if (!workspaceSheet.trim()) {
                      setErrorMessage("シート名を入力してください。");
                      return;
                    }
                    localStorage.setItem("cn_gas_sheet_name", workspaceSheet.trim());
                    if (workspaceSsUrl.trim()) {
                      localStorage.setItem("cn_gas_target_ss_url", workspaceSsUrl.trim());
                    } else {
                      localStorage.removeItem("cn_gas_target_ss_url");
                    }
                    // リロードして反映させるか、親の再取得を走らせる
                    handleAction("workspace", async () => {
                       await onForceDownload();
                       // Optionally reload the window to apply changes fully everywhere
                       // window.location.reload(); 
                    });
                  }}"""

if inputs_find in content:
    content = content.replace(inputs_find, inputs_replace)
    with open("src/components/SyncManagerModal.tsx", "w") as f:
        f.write(content)
    print("Updated SyncManagerModal.")
else:
    print("Failed to find inputs in SyncManagerModal.")

