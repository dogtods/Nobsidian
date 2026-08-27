import re

with open("src/components/ImportModal.tsx", "r") as f:
    content = f.read()

content = content.replace(
    "`Googleドライブに対象の未処理MHTデータはありませんでした（新規追加 0件）。`",
    "`Googleドライブ（フォルダ名: Connected Notes 取り込み）に対象の未処理データはありませんでした。`"
)
content = content.replace(
    "💡 Googleドライブ内の未処理MHTファイルのみを検出し、スプレッドシートへ追記します（処理済みファイルは「処理済み」フォルダに退避されるため二重取り込みされません）。",
    "💡 Googleドライブのルートに自動作成される「Connected Notes 取り込み」フォルダ内の未処理MHT・PDFファイルを検出し、スプレッドシートへ追記します（処理済みファイルは「_processed」フォルダに退避されるため二重取り込みされません）。"
)
content = content.replace(
    "`MHTデータの自動取り込み完了: ${added} 件追加 (シート: ${targetExtSheet})` : `未処理のMHTファイルはありませんでした`",
    "`外部データの自動取り込み完了: ${added} 件追加 (シート: ${targetExtSheet})` : `「Connected Notes 取り込み」フォルダに未処理ファイルはありませんでした`"
)

with open("src/components/ImportModal.tsx", "w") as f:
    f.write(content)
print("Updated ImportModal.tsx")
