const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// Update buildAnalysisPrompt
content = content.replace(
  /const buildAnalysisPrompt = \(activeNote: Note, options: { allTitles\?: boolean; taskBacklink\?: boolean; taskAnalysis\?: boolean } = {}\): string => {/,
  "const buildAnalysisPrompt = (activeNote: Note, options: { allTitles?: boolean; taskBacklink?: boolean; taskAnalysis?: boolean; taskStructure?: boolean } = {}): string => {"
);
content = content.replace(
  /const { allTitles = false, taskBacklink = true, taskAnalysis = true } = options;/,
  "const { allTitles = false, taskBacklink = true, taskAnalysis = true, taskStructure = false } = options;"
);
content = content.replace(
  /if \(taskBacklink\) {/,
  `if (taskStructure) {
      jsonFields.push(\`    "visual_structure": "該当ノートの比較・時系列・因果関係を示すMermaidコードと簡単な説明文。該当情報がなければ空文字"\`);
      instructions.push(\`- visual_structureには、「比較できるもの」「時系列で変化したもの」「因果関係があるもの」をMermaid記法の図として出力してください（目的は要約の網羅性ではなく、理解コストの削減）。\`);
      instructions.push(\`- グラフのテーマは %%{init: {'theme': 'dark', 'themeVariables': { 'primaryColor': '#000000', 'primaryTextColor': '#ffffff', 'primaryBorderColor': '#ffffff', 'lineColor': '#ffffff', 'textColor': '#ffffff', 'background': '#000000', 'mainBkg': '#000000', 'nodeBorder': '#ffffff', 'clusterBkg': '#000000', 'edgeLabelBackground':'#000000', 'fontSize': '16px' }}}%% のように指定し、グラフの直下に簡単な説明文（100文字程度）をセットで含めてください。\`);
      instructions.push(\`- グラフ種別の最適な選択と構文ルール: 量の比較には xychart-beta または pie。xychart-beta の y-axis は必ず「数値」とし、title, x-axis, y-axis, bar ごとに改行を入れること。スケジュールの比較には gantt。時系列の変化には timeline。因果関係には flowchart TD。\`);
      instructions.push(\`- flowchartのノード内テキストは、枠からはみ出さないよう極力短く（1行あたり10文字以内目安）し、必要に応じて<br>で改行してください。\`);
    }
    
    if (taskBacklink) {`
);

// Update buildBulkAnalysisPrompt
content = content.replace(
  /const buildBulkAnalysisPrompt = \(targetNotesList: Note\[\], options: { allTitles\?: boolean; taskBacklink\?: boolean; taskAnalysis\?: boolean } = {}\): string => {/,
  "const buildBulkAnalysisPrompt = (targetNotesList: Note[], options: { allTitles?: boolean; taskBacklink?: boolean; taskAnalysis?: boolean; taskStructure?: boolean } = {}): string => {"
);
content = content.replace(
  /const { allTitles = false, taskBacklink = true, taskAnalysis = true } = options;/,
  "const { allTitles = false, taskBacklink = true, taskAnalysis = true, taskStructure = false } = options;"
);

// We need to inject the taskStructure logic for bulk too. We can do it by finding the second `if (taskBacklink) {` which is in buildBulkAnalysisPrompt.
// Actually, it's safer to just run a replace using the exact match for buildBulkAnalysisPrompt.
const bulkRegex = /if \(taskAnalysis\) {[\s\S]*?}\s+if \(taskBacklink\) {/;
const bulkReplacement = `if (taskAnalysis) {
      jsonFields.push(\`    "keywords": ["キーワード1", "キーワード2"]\`);
      jsonFields.push(\`    "new_keywords": ["新規キーワード1", "新規キーワード2"]\`);
      instructions.push(\`- keywordsは固有名詞・概念・テーマを3〜5個抽出\`);
      instructions.push(\`- new_keywordsは既存ノートにない新しいキーワード\`);
      
      if (optSummary) {
        jsonFields.push(\`    "summary": "このメモの要点を2〜3文で要約"\`);
      }
    }
    
    if (taskStructure) {
      jsonFields.push(\`    "visual_structure": "該当ノートの比較・時系列・因果関係を示すMermaidコードと簡単な説明文。該当情報がなければ空文字"\`);
      instructions.push(\`- visual_structureには、「比較できるもの」「時系列で変化したもの」「因果関係があるもの」をMermaid記法の図として出力してください（目的は要約の網羅性ではなく、理解コストの削減）。\`);
      instructions.push(\`- グラフのテーマは %%{init: {'theme': 'dark', 'themeVariables': { 'primaryColor': '#000000', 'primaryTextColor': '#ffffff', 'primaryBorderColor': '#ffffff', 'lineColor': '#ffffff', 'textColor': '#ffffff', 'background': '#000000', 'mainBkg': '#000000', 'nodeBorder': '#ffffff', 'clusterBkg': '#000000', 'edgeLabelBackground':'#000000', 'fontSize': '16px' }}}%% のように指定し、グラフの直下に簡単な説明文（100文字程度）をセットで含めてください。\`);
      instructions.push(\`- グラフ種別の最適な選択と構文ルール: 量の比較には xychart-beta または pie。xychart-beta の y-axis は必ず「数値」とし、title, x-axis, y-axis, bar ごとに改行を入れること。スケジュールの比較には gantt。時系列の変化には timeline。因果関係には flowchart TD。\`);
      instructions.push(\`- flowchartのノード内テキストは、枠からはみ出さないよう極力短く（1行あたり10文字以内目安）し、必要に応じて<br>で改行してください。\`);
    }
    
    if (taskBacklink) {`;

content = content.replace(bulkRegex, bulkReplacement);

// Update handleExternalAiExport
content = content.replace(
  /const handleExternalAiExport = async \(options: { includeAll: boolean; taskBacklink: boolean; taskAnalysis: boolean }\) => {/,
  "const handleExternalAiExport = async (options: { includeAll: boolean; taskBacklink: boolean; taskAnalysis: boolean; taskStructure: boolean }) => {"
);
content = content.replace(
  /taskAnalysis: options\.taskAnalysis\n\s*\}\);/g,
  "taskAnalysis: options.taskAnalysis,\n        taskStructure: options.taskStructure\n      });"
);

// Update handleApplyExternalJSON to append visual_structure to content
content = content.replace(
  /if \(linkStr\) \{\s*const existingLinks = current\.content\.match\(\/\\\[\\\[\(\.\*\?\)\\\]\\\]\/g\) \|\| \[\];\s*const newLinks = linkStr\.split\('\\n'\)\.filter\(l => \!existingLinks\.includes\(l\)\);\s*if \(newLinks\.length > 0\) \{\s*newContent = current\.content \+ "\\n\\n" \+ newLinks\.join\('\\n'\);\s*\}\s*\}/,
  `if (linkStr) {
              const existingLinks = current.content.match(/\\[\\[(.*?)\\]\\]/g) || [];
              const newLinks = linkStr.split('\\n').filter(l => !existingLinks.includes(l));
              if (newLinks.length > 0) {
                newContent = current.content + "\\n\\n" + newLinks.join('\\n');
              }
            }
            if (resultItem.visual_structure) {
              newContent = newContent + "\\n\\n" + resultItem.visual_structure;
            }`
);


fs.writeFileSync('src/App.tsx', content);
