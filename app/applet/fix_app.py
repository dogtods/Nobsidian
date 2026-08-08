import sys
import os

filepath = os.path.join(os.getcwd(), 'src/App.tsx')

with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_content = r"""
  const handleApplyExternalJSON = () => {
    if (!externalPasteText.trim()) {
      toast("JSONが入力されていません");
      return;
    }
    
    try {
      const isArray = externalPasteText.includes('[') && externalPasteText.indexOf('[') < externalPasteText.indexOf('{');
      
      const jsonStr = externalPasteText.substring(
        isArray ? externalPasteText.indexOf('[') : externalPasteText.indexOf('{'),
        (isArray ? externalPasteText.lastIndexOf(']') : externalPasteText.lastIndexOf('}')) + 1
      );
      
      if (!jsonStr) throw new Error("JSONが見つかりません");
      
      const parsed = parseAIJSON(jsonStr);
      
      if (Array.isArray(parsed)) {
        let updatedCount = 0;
        let newNotesList = [...notes];
        
        parsed.forEach((resultItem: any) => {
          if (!resultItem.id) return;
          const targetIndex = newNotesList.findIndex(n => n.id === resultItem.id);
          if (targetIndex !== -1) {
            const current = newNotesList[targetIndex];
            
            let linkStr = "";
            if (resultItem.related_notes && Array.isArray(resultItem.related_notes)) {
              linkStr = resultItem.related_notes
                .map((title: string) => `[[${title.replace(/^-\s*/, "").replace(/ \(フォルダ:.*$/, "").replace(/ \(★本文中で直接言及されています.*\)/, "").trim()}]]`)
                .join("\n");
            }
            
            let newContent = current.content;
            if (linkStr) {
              const existingLinks = current.content.match(/\[\[(.*?)\]\]/g) || [];
              const newLinks = linkStr.split('\n').filter(l => !existingLinks.includes(l));
              if (newLinks.length > 0) {
                newContent = current.content + "\n\n" + newLinks.join('\n');
              }
            }
            if (resultItem.visual_structure) {
              const trimmed = resultItem.visual_structure.trim();
              const wrapped = (trimmed.includes('```mermaid')) 
                ? resultItem.visual_structure 
                : "```mermaid\n" + trimmed + "\n```";
              newContent = newContent + "\n\n" + wrapped;
            }
            
            let newKeywords = current.keywords;
            if (resultItem.keywords && Array.isArray(resultItem.keywords)) {
              const folder = getFolder(current);
              const kwsStr = resultItem.keywords.join(", ");
              newKeywords = folder !== "未分類" ? `${kwsStr}, [folder:${folder}]` : kwsStr;
            }
            
            newNotesList[targetIndex] = {
              ...current,
              content: newContent,
              summary: resultItem.summary || current.summary,
              keywords: newKeywords,
              updatedAt: Date.now()
            };
            updatedCount++;
          }
        });
        
        if (updatedCount > 0) {
          setNotes(newNotesList);
          const active = getActiveNote();
          if (active) {
            triggerLocalSave(newNotesList, active.id);
          } else if (newNotesList.length > 0) {
            triggerLocalSave(newNotesList, newNotesList[0].id);
          }
          toast(`${updatedCount}件のノートを一括更新しました ✦`);
        } else {
          toast("更新対象のノートが見つかりませんでした");
        }
        
        setIsExternalPasteOpen(false);
        setExternalPasteText("");
        
      } else {
        if (!parsed.keywords && !parsed.summary && !parsed.related_notes) {
          throw new Error("必要なプロパティ(keywords, summary, related_notes 等)が見つかりません");
        }
        
        setAiResults(parsed);
        setAiPanelOpen(true);
        setIsExternalPasteOpen(false);
        setExternalPasteText("");
        toast("外部AIの結果を読み込みました ✦");
      }
    } catch (e: any) {
      toast("JSONの解析に失敗しました: " + e.message);
    }
  };

  const copyAIPromptForExternal = () => {
    const active = getActiveNote();
    if (!active) return toast("ノートを選択してください");
    if (active.content.trim().length < 15) return toast("内容が短すぎます");
    setExternalExportTarget({ type: 'single' });
  };

  const copyAIPromptForFolder = (folderName: string) => {
    const folderNotes = notes.filter(n => getFolder(n) === folderName);
    if (folderNotes.length === 0) return toast("ノートがありません");
    setExternalExportTarget({ type: 'folder', folderName });
  };

  const handleExternalAiExport = async (options: { includeAll: boolean; taskBacklink: boolean; taskAnalysis: boolean; taskStructure: boolean }) => {
    const target = externalExportTarget;
    setExternalExportTarget(null);
    if (!target) return;

    if (target.type === 'single') {
      const active = getActiveNote();
      if (!active) return;
      
      const prompt = buildAnalysisPrompt(active, {
        allTitles: options.includeAll,
        taskBacklink: options.taskBacklink,
        taskAnalysis: options.taskAnalysis,
        taskStructure: options.taskStructure
      });
      
      const blob = new Blob([prompt], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Prompt_AI_Analysis_${active.title.replace(/[\\/:*?"<>|]/g, "_").substring(0, 30)}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      try {
        await navigator.clipboard.writeText(prompt);
        toast("プロンプトをコピーし、テキストファイルとしてもダウンロードしました ✦");
      } catch (e: any) {
        let copied = false;
        try {
          const textArea = document.createElement("textarea");
          textArea.value = prompt;
          textArea.style.position = "fixed";
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          copied = document.execCommand('copy');
          document.body.removeChild(textArea);
        } catch (err) {}

        if (copied) {
          toast("プロンプトをコピーし、テキストファイルとしてもダウンロードしました ✦");
        } else {
          toast("プロンプトをテキストファイルとしてダウンロードしました ✦（ファイルを開いてAIに添付してください）");
        }
      }
    } else if (target.type === 'folder') {
      const folderNotes = notes.filter(n => getFolder(n) === target.folderName && n.content.trim().length >= 15);
      if (folderNotes.length === 0) return toast("出力できるノートがありません（内容が短すぎます）");

      const prompt = buildBulkAnalysisPrompt(folderNotes, {
        allTitles: options.includeAll,
        taskBacklink: options.taskBacklink,
        taskAnalysis: options.taskAnalysis,
        taskStructure: options.taskStructure
      });

      const blob = new Blob([prompt], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeFolderName = target.folderName.replace(/[\\/:*?"<>|]/g, "_");
      a.download = `Bulk_Prompt_${safeFolderName}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      try {
        await navigator.clipboard.writeText(prompt);
        toast(`フォルダ「${target.folderName}」用の一括プロンプトをコピー・ダウンロードしました ✦`);
      } catch (e: any) {
        let copied = false;
        try {
          const textArea = document.createElement("textarea");
          textArea.value = prompt;
          textArea.style.position = "fixed";
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          copied = document.execCommand('copy');
          document.body.removeChild(textArea);
        } catch (err) {}
        
        if (copied) {
          toast(`フォルダ「${target.folderName}」用の一括プロンプトをコピー・ダウンロードしました ✦`);
        } else {
          toast(`フォルダ「${target.folderName}」用の一括プロンプトをダウンロードしました ✦`);
        }
      }
    }
  };

  const handleAppendFromClipboard = async () => {
    const active = getActiveNote();
    if (!active) return toast("ノートを選択してください");

    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        return toast("クリップボードが空、またはテキストではありません");
      }

      const updated = {
        ...active,
        content: active.content.trim() + "\n\n" + (() => {
          const trimmed = text.trim();
          const mermaidKeywords = ['graph', 'flowchart', 'sequenceDiagram', 'classDiagram', 'stateDiagram', 'erDiagram', 'journey', 'gantt', 'pie', 'quadrantChart', 'xychart-beta', 'timeline'];
          const lines = trimmed.split('\n');
          const firstLine = lines[0].toLowerCase();
          const secondLine = lines.length > 1 ? lines[1].toLowerCase() : "";
          const isMermaid = mermaidKeywords.some(kw => firstLine.includes(kw) || secondLine.includes(kw)) || trimmed.startsWith('%%{init');
          
          if (isMermaid && !trimmed.includes('```mermaid')) {
            return "```mermaid\n" + trimmed + "\n```\n";
          }
          return text;
        })(),
        updatedAt: Date.now()
      };
      const newList = notes.map(n => n.id === active.id ? updated : n);
      setNotes(newList);
      triggerLocalSave(newList, active.id);
      toast("クリップボードの内容を末尾に追記しました ✦");
    } catch (e: any) {
      console.error(e);
      toast("貼り付けに失敗しました。ブラウザのクリップボード読み取り許可が必要です。");
    }
  };
"""

new_lines = lines[:1650] + [new_content + "\n"] + lines[1965:]

with open(filepath, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)
