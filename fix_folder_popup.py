import re

with open("src/components/KnowledgeGraphModal.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# Make sure the UI button is unconditionally rendered in the popup
old_ui = """              {graphViewMode === "note" && (
                <div className="flex flex-col gap-1.5 w-full bg-[#161b22] border border-[var(--border2)] rounded p-1.5 mt-1">
                  <span className="text-[9px] text-[var(--muted)] text-center font-bold">🔍 周辺ノードをレポート対象に収集</span>
                  <div className="flex gap-1 w-full">
                    <button
                      className="flex-1 py-1.5 bg-[var(--green)] hover:opacity-80 text-white text-[10px] rounded cursor-pointer font-bold transition-opacity"
                      onClick={() => collectFocusNodes(popup.node!, 1)}
                    >
                      1階層先
                    </button>
                    <button
                      className="flex-1 py-1.5 bg-[var(--green)] hover:opacity-80 text-white text-[10px] rounded cursor-pointer font-bold transition-opacity"
                      onClick={() => collectFocusNodes(popup.node!, 2)}
                    >
                      2階層先
                    </button>
                    <button
                      className="flex-1 py-1.5 bg-[var(--green)] hover:opacity-80 text-white text-[10px] rounded cursor-pointer font-bold transition-opacity"
                      onClick={() => collectFocusNodes(popup.node!, 3)}
                    >
                      3階層先
                    </button>
                  </div>
                </div>
              )}"""

new_ui = """              <div className="flex flex-col gap-1.5 w-full bg-[#161b22] border border-[var(--border2)] rounded p-1.5 mt-1">
                <span className="text-[9px] text-[var(--muted)] text-center font-bold">🔍 周辺情報を収集（外部AI等用）</span>
                <div className="flex gap-1 w-full">
                  <button
                    className="flex-1 py-1.5 bg-[var(--green)] hover:opacity-80 text-white text-[10px] rounded cursor-pointer font-bold transition-opacity"
                    onClick={() => collectFocusNodes(popup.node!, 1)}
                  >
                    1階層先
                  </button>
                  <button
                    className="flex-1 py-1.5 bg-[var(--green)] hover:opacity-80 text-white text-[10px] rounded cursor-pointer font-bold transition-opacity"
                    onClick={() => collectFocusNodes(popup.node!, 2)}
                  >
                    2階層先
                  </button>
                  <button
                    className="flex-1 py-1.5 bg-[var(--green)] hover:opacity-80 text-white text-[10px] rounded cursor-pointer font-bold transition-opacity"
                    onClick={() => collectFocusNodes(popup.node!, 3)}
                  >
                    3階層先
                  </button>
                </div>
              </div>"""

if old_ui in content:
    content = content.replace(old_ui, new_ui)
else:
    print("WARNING: old_ui not found. Possibly already updated.")

with open("src/components/KnowledgeGraphModal.tsx", "w", encoding="utf-8") as f:
    f.write(content)
print("Updated popup layout!")
