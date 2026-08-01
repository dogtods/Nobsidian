import re

with open("src/components/KnowledgeGraphModal.tsx", "r", encoding="utf-8") as f:
    content = f.read()

start_idx = content.find("  const collectFocusNodes = (centerNode: GraphNode, depth: number = 1) => {")
end_idx = content.find("  const copyExternalPrompt = () => {")

new_func = """  const collectFocusNodes = (centerNode: GraphNode, depth: number = 1) => {
    const adjacentIds = new Set<string>();
    adjacentIds.add(centerNode.id);

    // Collect linked siblings up to specified depth
    const { links } = buildGraphData();
    let currentLevelIds = new Set<string>([centerNode.id]);

    for (let i = 0; i < depth; i++) {
      const nextLevelIds = new Set<string>();
      links.forEach(l => {
        const srcId = typeof l.source === "object" ? l.source.id : l.source;
        const tgtId = typeof l.target === "object" ? l.target.id : l.target;
        
        if (currentLevelIds.has(srcId) && !adjacentIds.has(tgtId as string)) {
          adjacentIds.add(tgtId as string);
          nextLevelIds.add(tgtId as string);
        }
        if (currentLevelIds.has(tgtId) && !adjacentIds.has(srcId as string)) {
          adjacentIds.add(srcId as string);
          nextLevelIds.add(srcId as string);
        }
      });
      currentLevelIds = nextLevelIds;
    }

    let targetNotes: Note[] = [];
    if (graphViewMode === "folder") {
      targetNotes = notes.filter(n => adjacentIds.has(getFolderFromKeywords(n.keywords)));
    } else {
      targetNotes = notes.filter(n => adjacentIds.has(n.id));
    }

    if (targetNotes.length === 0) return onSaveToast("接続先の対象ノートがありません");

    const newMap = new Map(reportSelectedNodes);
    const optimizeEnabled = localStorage.getItem("cn_optimize_api_tokens") !== "false";

    targetNotes.forEach(n => {
      let content = "";
      if (graphViewMode === "folder") {
        if (optimizeEnabled) {
          const folder = getFolderFromKeywords(n.keywords);
          const linksList = extractWikiLinks(n.content);
          const linkPart = linksList.length > 0 ? `\\n[接続リンク先] ${linksList.join(", ")}` : "";
          const summaryPart = n.summary ? `要約: ${n.summary}` : `本文（抜粋）: ${n.content.substring(0, 450)}...`;
          content = `[フォルダ/タグ] ${folder}\\n${n.keywords ? `[キーワード] ${n.keywords}` : ""}${linkPart}\\n${summaryPart}`;
        } else {
          content = n.content ? n.content.substring(0, 450) + "..." : "";
        }
      } else {
        content = n.content || "";
      }
      newMap.set(n.id, { title: n.title, content });
    });
    setReportSelectedNodes(newMap);
    setPopup(prev => ({ ...prev, show: false })); // dismiss popup
    onSaveToast(`${targetNotes.length}件のノートをレポート対象に追加しました`);
  };

"""

with open("src/components/KnowledgeGraphModal.tsx", "w", encoding="utf-8") as f:
    f.write(content[:start_idx] + new_func + content[end_idx:])
print("Updated!")
