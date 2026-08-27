import re

with open("src/components/SyncManagerModal.tsx", "r") as f:
    content = f.read()

find_str = """                    // リロードして反映させるか、親の再取得を走らせる
                    handleAction("workspace", async () => {
                       await onForceDownload();
                       // Optionally reload the window to apply changes fully everywhere
                       // window.location.reload();
                     });
                  }}"""

replace_str = """                    // ローカルの古いデータを完全に消去する
                    // （古いデータが残っていると、次の読み込み時に新しいシートへ自動マージ・アップロードされてしまうのを防ぐため）
                    localStorage.removeItem("cn_notes");
                    localStorage.removeItem("cn_active_id");

                    // 完全にクリーンな状態で再読み込みし、初回起動処理（自動ダウンロード）を走らせる
                    window.location.reload();
                  }}"""

content = content.replace(find_str, replace_str)

with open("src/components/SyncManagerModal.tsx", "w") as f:
    f.write(content)

print("Updated SyncManagerModal.tsx")
