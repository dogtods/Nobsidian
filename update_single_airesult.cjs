const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const targetStr = `                    {/* Related links */}
                    {aiResults.related_notes && aiResults.related_notes.length > 0 && (
                      <div className="mt-1">
                        <div className="text-[10px] font-bold text-[var(--purple)] tracking-wider uppercase mb-2">✦ 関連する既存ノート</div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                          {aiResults.related_notes.map((t: string) => {
                            const existsObj = notes.find(n => n.title.toLowerCase() === t.toLowerCase());
                            return (
                              <button
                                key={t}
                                className="text-left p-1.5 border border-[var(--border)] hover:border-[var(--border2)] rounded bg-[var(--surface)] text-[var(--blue)] hover:text-white text-[11px] transition-colors truncate flex items-center gap-1.5"
                                onClick={() => {
                                  if (existsObj) {
                                    setActiveId(existsObj.id);
                                    setAiPanelOpen(false);
                                  }
                                }}
                                disabled={!existsObj}
                              >
                                <span>{existsObj ? "◈" : "◇"}</span>
                                <span className="truncate flex-1">{t}</span>
                              </button>
                            );
                          })}
                        </div>
                        <button
                          className="mt-3 text-[11px] text-[var(--blue)] border border-[#58a6ff33] rounded p-1.5 px-3 hover:bg-[#58a6ff1a] cursor-pointer font-semibold transition-all flex items-center gap-1"
                          onClick={insertRelatedNotesLinks}
                        >
                          <Plus className="w-3.5 h-3.5" /> 関連ノートへのリンクを本文末尾に追記
                        </button>
                      </div>
                    )}`;

const replacement = targetStr + `

                    {aiResults.visual_structure && (
                      <div className="mt-4 pt-4 border-t border-[var(--border2)]">
                        <div className="text-[10px] font-bold text-[var(--purple)] tracking-wider uppercase mb-2">✦ 抽出された図解 (Mermaid)</div>
                        <pre className="text-[10px] text-[var(--subtle)] whitespace-pre-wrap font-mono p-2 bg-[#0d1117] rounded border border-[var(--border2)] max-h-32 overflow-y-auto mb-2">
                          {aiResults.visual_structure}
                        </pre>
                        <button
                          className="text-[11px] text-[var(--blue)] border border-[#58a6ff33] rounded p-1.5 px-3 hover:bg-[#58a6ff1a] cursor-pointer font-semibold transition-all flex items-center gap-1"
                          onClick={() => {
                            const active = getActiveNote();
                            if (active) {
                              const updated = {
                                ...active,
                                content: active.content + "\\n\\n" + aiResults.visual_structure,
                                updatedAt: Date.now()
                              };
                              const newList = notes.map(n => n.id === active.id ? updated : n);
                              setNotes(newList);
                              triggerLocalSave(newList, active.id);
                              toast("図解（Mermaid）を本文末尾に追記しました ✦");
                            }
                          }}
                        >
                          <Plus className="w-3.5 h-3.5" /> 本文末尾に図解を追記
                        </button>
                      </div>
                    )}`;

if (content.includes(targetStr)) {
  content = content.replace(targetStr, replacement);
  fs.writeFileSync('src/App.tsx', content);
  console.log("Replaced");
} else {
  console.log("Not found targetStr");
}
