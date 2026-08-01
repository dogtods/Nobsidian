import re

with open("src/components/KnowledgeGraphModal.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# Let's restore handleToggleReportNode which was partially deleted.
# The original handleToggleReportNode was roughly like:
original_toggle_snippet = """
    } else {
      if (optimizeEnabled) {
        const originalNote = notes.find(n => n.id === id);
        if (originalNote) {
          const folder = getFolderFromKeywords(originalNote.keywords);
          const links = extractWikiLinks(originalNote.content);
          const linkPart = links.length > 0 ? `\\n[接続リンク先] ${links.join(", ")}` : "";
          const summaryPart = originalNote.summary ? `要約: ${originalNote.summary}` : `本文（抜粋）: ${originalNote.content.substring(0, 450)}...`;
          content = `[フォルダ/タグ] ${folder}\\n${originalNote.keywords ? `[キーワード] ${originalNote.keywords}` : ""}${linkPart}\\n${summaryPart}`;
        } else {
          content = node.content ? node.content.substring(0, 450) + "..." : "";
        }
      } else {
        content = node.content || "";
      }
    }

    const newMap = new Map(reportSelectedNodes);
    if (newMap.has(id)) {
      newMap.delete(id);
    } else {
      newMap.set(id, { title, content });
    }
    setReportSelectedNodes(newMap);
    setPopup(prev => ({ ...prev, show: false })); // dismiss popup
  };
"""

# Let's clean up the corrupted part
start_idx = content.find("        } else {\n          return `## ${n.title}\\n${n.content}`;\n        }\n      }).join(\"\\n\\n\");\n    } else {\n      if (optimizeEnabled) {\n        const originalNote = notes.find(n => n.id === id);\n        if (originalNote) {")

if start_idx != -1:
    end_idx = content.find("  const generateBatchReport = async () => {", start_idx)
    
    # We will replace from start_idx up to end_idx with the proper restored version
    # Wait, the start string is inside handleToggleReportNode
    prefix = content[:start_idx + len("        } else {\n          return `## ${n.title}\\n${n.content}`;\n        }\n      }).join(\"\\n\\n\");\n    } else {\n      if (optimizeEnabled) {\n        const originalNote = notes.find(n => n.id === id);\n        if (originalNote) {")]
    suffix = content[end_idx:]

    new_middle = """
          const folder = getFolderFromKeywords(originalNote.keywords);
          const links = extractWikiLinks(originalNote.content);
          const linkPart = links.length > 0 ? `\\n[接続リンク先] ${links.join(", ")}` : "";
          const summaryPart = originalNote.summary ? `要約: ${originalNote.summary}` : `本文（抜粋）: ${originalNote.content.substring(0, 450)}...`;
          content = `[フォルダ/タグ] ${folder}\\n${originalNote.keywords ? `[キーワード] ${originalNote.keywords}` : ""}${linkPart}\\n${summaryPart}`;
        } else {
          content = node.content ? node.content.substring(0, 450) + "..." : "";
        }
      } else {
        content = node.content || "";
      }
    }

    const newMap = new Map(reportSelectedNodes);
    if (newMap.has(id)) {
      newMap.delete(id);
    } else {
      newMap.set(id, { title, content });
    }
    setReportSelectedNodes(newMap);
    setPopup(prev => ({ ...prev, show: false })); // dismiss popup
  };

  const collectFocusNodes = (centerNode: GraphNode, depth: number = 1) => {
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

    const targetNotes = notes.filter(n => adjacentIds.has(n.id));
    if (targetNotes.length === 0) return onSaveToast("接続先の対象ノートがありません");

    const newMap = new Map(reportSelectedNodes);
    targetNotes.forEach(n => {
      newMap.set(n.id, { title: n.title, content: n.content });
    });
    setReportSelectedNodes(newMap);
    setPopup(prev => ({ ...prev, show: false })); // dismiss popup
    onSaveToast(`${targetNotes.length}件のノートをレポート対象に追加しました`);
  };

"""
    with open("src/components/KnowledgeGraphModal.tsx", "w", encoding="utf-8") as fw:
        fw.write(prefix + new_middle + suffix)
    print("Fixed!")
else:
    print("Could not find start idx")
