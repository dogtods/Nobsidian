const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /    const promptText = \`あなたは記事の内容を視覚的に理解しやすくするための構造抽出アシスタントです。[\s\S]*?\}\n\`;/;

const newPrompt = `    const promptText = \`あなたは記事の内容を視覚的に理解しやすくするための構造抽出アシスタントです。
以下の記事から、「比較できるもの」「時系列で変化したもの」「因果関係があるもの」を抽出し、それぞれをMermaid記法の図として出力してください。
目的は「要約の網羅性」ではなく「理解コストの削減」です。数値や時期の変化など、比較・構造・因果関係を持つ情報は、文章ではなく図として表現してください。
該当する情報がない項目は、その図のコードブロックごと出力しないでください（人が「その観点の情報はなかった」と一目でわかることも、理解コストの削減に寄与します）。

記事本文:
\${active.columnJ || active.content}

出力は必ずMermaidのコードブロック(\\\`\\\`\\\`mermaid ... \\\`\\\`\\\`)のみで出力してください。前後に説明文や見出しは付けないでください。
該当する図が複数ある場合は、複数のmermaidコードブロックを続けて出力してください。

- 比較データがある場合は xychart-beta または pie を使う
- 時系列の変化がある場合は timeline を使う
- 因果関係がある場合は flowchart TD を使う
- ノードIDは半角英数字のみとする
- 色指定(style, fillなど)は使用しない
- 各図の直前に、どの図かわかる一行コメント(例: %% causal_flow %%)を入れる
\`;`;

content = content.replace(regex, newPrompt);
fs.writeFileSync('src/App.tsx', content);
