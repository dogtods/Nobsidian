import re

with open("src/components/KnowledgeGraphModal.tsx", "r", encoding="utf-8") as f:
    content = f.read()

new_func = """
  const runGraphAiAnalysis = async () => {
    const apiKey = localStorage.getItem("cn_gemini_key");
    if (!apiKey) return onSaveToast("APIキーを設定してください ⚙");

    const folderMap = new Map<string, Note[]>();
    notes.forEach(note => {
      const folder = getFolderFromKeywords(note.keywords);
      if (!folderMap.has(folder)) folderMap.set(folder, []);
      folderMap.get(folder)!.push(note);
    });

    const folders = Array.from(folderMap.keys()).filter(f => f !== "未分類");
    if (folders.length < 2) return onSaveToast("解析には最低2つ以上のフォルダが必要です");

    onSaveToast("🤖 フォルダ構造をAI解析中...");

    const folderContexts = folders.map(f => {
      const folderNotes = folderMap.get(f) || [];
      const titles = folderNotes.map(n => n.title).join(", ");
      return `【${f}】含まれるノート: ${titles}`;
    }).join("\\n");

    const prompt = `以下のフォルダ一覧とそれに含まれるノートのタイトルを見て、フォルダ間の関係性（どちらが上位概念か、関連性が深いかなど）を分析してください。\\n\\n${folderContexts}\\n\\n出力は以下のJSON配列形式のみとしてください。それ以外のテキストは一切含めないでください。\\n[\\n  { "source": "フォルダA", "target": "フォルダB", "reason": "関係性の理由" }\\n]`;

    try {
      const model = localStorage.getItem("cn_gemini_model") || "gemini-2.0-flash";
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 2000, responseMimeType: "application/json" }
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
      const relations = JSON.parse(rawText) as FolderRelation[];
      
      saveFolderRelationsLocally(relations, Date.now());
      onSaveToast(`✅ ${relations.length}件のフォルダ関係性をAIが検出しました`);
    } catch (e: any) {
      onSaveToast("AI解析エラー: " + (e.message || "パースに失敗しました"));
      console.error(e);
    }
  };
"""

start_idx = content.find("  const handleZoomReset = () => {")
if start_idx != -1:
    content = content[:start_idx] + new_func + content[start_idx:]
    with open("src/components/KnowledgeGraphModal.tsx", "w", encoding="utf-8") as f:
        f.write(content)
    print("Injected runGraphAiAnalysis")
else:
    print("Could not find handleZoomReset")

