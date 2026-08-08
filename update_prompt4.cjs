const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /    const promptText = \`あなたは記事の内容を視覚的に理解しやすくするための構造抽出アシスタントです。[\s\S]*?\`;/;

const newPrompt = `    const promptText = \`あなたは記事の内容を視覚的に理解しやすくするための構造抽出アシスタントです。
以下の記事から、「比較できるもの」「時系列で変化したもの」「因果関係があるもの」を抽出し、それぞれをMermaid記法の図として出力してください。
目的は「要約の網羅性」ではなく「理解コストの削減」です。数値や時期の変化など、比較・構造・因果関係を持つ情報は、文章ではなく図として表現してください。
該当する情報がない項目は、その図の出力ごと省略してください（人が「その観点の情報はなかった」と一目でわかることも、理解コストの削減に寄与します）。

記事本文:
\${active.columnJ || active.content}

出力は「Mermaidのコードブロック(\\\`\\\`\\\`mermaid ... \\\`\\\`\\\`)」と「その直後に配置する簡単な説明文（100文字程度）」のセットで出力してください。
該当する図が複数ある場合は、この「図＋説明文」のセットを続けて出力してください。

【描画環境の制約とMermaid構文ルール】
出力されたMermaidコードは背景が黒色のビューアで表示されます。そのため、以下のルールを必ず守ってください。

1. すべてのコードブロックの先頭(グラフ種別の行より前)に、次のinit行を必ず挿入すること。
%%{init: {'theme': 'dark', 'themeVariables': { 'primaryColor': '#000000', 'primaryTextColor': '#ffffff', 'primaryBorderColor': '#ffffff', 'lineColor': '#ffffff', 'textColor': '#ffffff', 'background': '#000000', 'mainBkg': '#000000', 'nodeBorder': '#ffffff', 'clusterBkg': '#000000', 'edgeLabelBackground':'#000000' }}}%%

2. 色指定(style, fillなど)は原則使用しませんが、上記のinit行はグラフテーマの指定なので例外として扱います。ノードごとの個別色分けは禁止です。

3. テキストが枠からはみ出さないための厳守事項:
- flowchartのノード内テキストは、絶対に枠からはみ出さないよう極力短く（1行あたり10文字以内目安）し、必要に応じて<br>で改行してください。
- 詳しい説明はノード内に書かず、図の下の説明文（100文字程度）に記載して補足してください。
- timelineの各項目テキストも同様に短く区切り、必要に応じて<br>で改行してください。
- ノードIDと表示テキストを分離し、表示テキストのみを簡潔にしてください。

4. xychart-beta を使う場合は、必ずtitle, x-axis, y-axis, bar などの要素ごとに改行を入れてください。1行に繋げて書くと構文エラーになります。
正例:
xychart-beta
  title "グラフ名"
  x-axis ["A", "B"]
  y-axis "単位"
  bar [10, 20]

5. 積み上げ棒グラフなど複数系列を色で区別する場面では、色の濃淡ではなく系列名を凡例(legend)やラベルとして明示し、白黒でも判別できるようにすること。xychart-betaはハッチング柄に対応していないため、系列ごとに棒グラフを分けて並べる、または系列名を直接ラベル表示するなどの代替手段で対応すること。

- 比較データがある場合は xychart-beta または pie を使う
- 時系列の変化がある場合は timeline を使う
- 因果関係がある場合は flowchart TD を使う
- ノードIDは半角英数字のみとする
- 各図の直前に、どの図かわかる一行コメント(例: %% causal_flow %%)を入れる
\`;`;

content = content.replace(regex, newPrompt);
fs.writeFileSync('src/App.tsx', content);
