import re

with open("src/components/KnowledgeGraphModal.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Replace generateFocusReport calls
content = content.replace("generateFocusReport(popup.node!, 1)", "collectFocusNodes(popup.node!, 1)")
content = content.replace("generateFocusReport(popup.node!, 2)", "collectFocusNodes(popup.node!, 2)")
content = content.replace("generateFocusReport(popup.node!, 3)", "collectFocusNodes(popup.node!, 3)")

# 2. Add copyExternalPrompt function before generateBatchReport
copy_func = """
  const copyExternalPrompt = () => {
    if (reportSelectedNodes.size === 0) return;
    const notesContent = (Array.from(reportSelectedNodes.values()) as Array<{ title: string; content: string }>)
        .map(n => `### ${n.title}\\n${n.content}`)
        .join("\\n\\n---\\n\\n");

    const promptTemplate = localStorage.getItem("cn_prompt_report") || DEFAULT_PROMPTS.REPORT;
    const prompt = promptTemplate.replace("{notes_content}", notesContent);
    
    navigator.clipboard.writeText(prompt)
      .then(() => onSaveToast("外部AI用のプロンプトをクリップボードにコピーしました"))
      .catch(() => onSaveToast("コピーに失敗しました"));
  };

"""

content = content.replace("  const generateBatchReport = async () => {", copy_func + "  const generateBatchReport = async () => {")

# 3. Add the button to the floating panel
floating_buttons = """
          <div className="flex gap-2 w-full mt-1">
            <button
              className="flex-1 py-2 bg-[#a371f720] border border-[#a371f744] hover:bg-[#a371f730] text-[var(--purple)] text-[11px] font-bold rounded-md cursor-pointer transition-all"
              onClick={generateBatchReport}
              disabled={isGeneratingReport}
            >
              ✦ 内蔵AIでレポート作成
            </button>
            <button
              className="flex-1 py-2 bg-[#3fb95020] border border-[#3fb95044] hover:bg-[#3fb95030] text-[#7ee787] text-[11px] font-bold rounded-md cursor-pointer transition-all"
              onClick={copyExternalPrompt}
            >
              外部AI用プロンプトをコピー
            </button>
          </div>
"""

original_button = """          <button
            className="w-full py-2 bg-[#a371f720] border border-[#a371f744] hover:bg-[#a371f730] text-[var(--purple)] text-xs font-bold rounded-md cursor-pointer transition-all"
            onClick={generateBatchReport}
            disabled={isGeneratingReport}
          >
            ✦ 選択したノートの AI 合成レポートを生成
          </button>"""

content = content.replace(original_button, floating_buttons.strip('\n'))

with open("src/components/KnowledgeGraphModal.tsx", "w", encoding="utf-8") as f:
    f.write(content)
print("Updated successfully")
