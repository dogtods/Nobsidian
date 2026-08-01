import re

with open("src/components/KnowledgeGraphModal.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# Replace any lingering graphViewMode conditions that might hide the buttons
old_ui_2 = """              {graphViewMode === "note" && (
                <div className="flex flex-col gap-1.5 w-full bg-[#161b22] border border-[var(--border2)] rounded p-1.5 mt-1">
                  <span className="text-[9px] text-[var(--muted)] text-center font-bold">🔍 周辺ノードをレポート対象に収集</span>"""

new_ui_2 = """              <div className="flex flex-col gap-1.5 w-full bg-[#161b22] border border-[var(--border2)] rounded p-1.5 mt-1">
                <span className="text-[9px] text-[var(--muted)] text-center font-bold">🔍 周辺情報を収集（外部AI等用）</span>"""

if old_ui_2 in content:
    content = content.replace(old_ui_2, new_ui_2)
    
old_close = """                  </div>
                </div>
              )}"""

new_close = """                  </div>
                </div>"""
                
# Since there was an unexpected error, I will just apply the final python script to fix the ui bug where the popup is conditionally hidden on the folder view.
