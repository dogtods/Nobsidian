import re

with open("src/components/KnowledgeGraphModal.tsx", "r", encoding="utf-8") as f:
    content = f.read()

download_func = """  const downloadExternalPrompt = () => {
    if (reportSelectedNodes.size === 0) return;
    const notesContent = (Array.from(reportSelectedNodes.values()) as Array<{ title: string; content: string }>)
        .map(n => `### ${n.title}\\n${n.content}`)
        .join("\\n\\n---\\n\\n");
    const promptTemplate = localStorage.getItem("cn_prompt_report") || DEFAULT_PROMPTS.REPORT;
    const prompt = promptTemplate.replace("{notes_content}", notesContent);
    
    const blob = new Blob([prompt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prompt-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    onSaveToast("プロンプトをテキストファイルとしてダウンロードしました");
  };

"""

content = content.replace("  const generateBatchReport = async () => {", download_func + "  const generateBatchReport = async () => {")


ui_replacement = """          <div className="flex gap-2 w-full mt-1">
            <button
              className="flex-1 py-2 bg-[#a371f720] border border-[#a371f744] hover:bg-[#a371f730] text-[var(--purple)] text-[11px] font-bold rounded-md cursor-pointer transition-all"
              onClick={generateBatchReport}
              disabled={isGeneratingReport}
            >
              ✦ 内蔵AI
            </button>
            <button
              className="flex-1 py-2 bg-[#3fb95020] border border-[#3fb95044] hover:bg-[#3fb95030] text-[#7ee787] text-[11px] font-bold rounded-md cursor-pointer transition-all"
              onClick={copyExternalPrompt}
            >
              📋 コピー
            </button>
            <button
              className="flex-1 py-2 bg-[#1cb5b520] border border-[#1cb5b544] hover:bg-[#1cb5b530] text-[#7ee787] text-[11px] font-bold rounded-md cursor-pointer transition-all"
              onClick={downloadExternalPrompt}
            >
              💾 ダウンロード
            </button>
          </div>"""

content = re.sub(
    r'<div className="flex gap-2 w-full mt-1">.*?</div>',
    ui_replacement,
    content,
    flags=re.DOTALL
)

with open("src/components/KnowledgeGraphModal.tsx", "w", encoding="utf-8") as f:
    f.write(content)
print("Updated KnowledgeGraphModal.tsx")
