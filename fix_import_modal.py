import re

with open("src/components/ImportModal.tsx", "r") as f:
    content = f.read()

# Replace the block that calls onSyncFromServer with just a success toast.
# Find:
#       if (onSyncFromServer) {
#         onSaveToast(`${rowIndices.length}件のデータをアプリ用シートへ登録しました。再読み込み中...`);
#         try {
#           // 待機してから再読み込みを行う
#           await new Promise(resolve => setTimeout(resolve, 1500));
#           await onSyncFromServer();
#           onSaveToast("再読み込みが完了しました ✦");
#         } catch (syncError: any) {
#           console.error("Sync error:", syncError);
#           onSaveToast("再読み込みに失敗しました: " + syncError.message);
#         }
#       } else {
#         onSaveToast(`${rowIndices.length}件のデータの登録が完了しました ✦`);
#       }

old_sync_block = """      if (onSyncFromServer) {
        onSaveToast(`${rowIndices.length}件のデータをアプリ用シートへ登録しました。再読み込み中...`);
        try {
          // 待機してから再読み込みを行う
          await new Promise(resolve => setTimeout(resolve, 1500));
          await onSyncFromServer();
          onSaveToast("再読み込みが完了しました ✦");
        } catch (syncError: any) {
          console.error("Sync error:", syncError);
          onSaveToast("再読み込みに失敗しました: " + syncError.message);
        }
      } else {
        onSaveToast(`${rowIndices.length}件のデータの登録が完了しました ✦`);
      }"""

new_sync_block = """      onSaveToast(`${rowIndices.length}件のデータの登録が完了しました ✦`);"""

if old_sync_block in content:
    content = content.replace(old_sync_block, new_sync_block)
    with open("src/components/ImportModal.tsx", "w") as f:
        f.write(content)
    print("Successfully replaced sync block in ImportModal.tsx")
else:
    print("Could not find the exact sync block in ImportModal.tsx")
