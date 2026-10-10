import fs from "fs";

const appTsx = fs.readFileSync("src/App.tsx", "utf8");
const fnMatch = appTsx.match(/const cleanTextForSpeech = \([\s\S]*?\n\};\n/)[0];

fs.writeFileSync("temp_test.ts", fnMatch + `
const sample1 = \`### 次世代半導体の量産計画と市場影響

【要約】
主要半導体メーカー各社は、2025年に向けた2ナノメートル世代の微細化プロセスの量産投資を加速させています。これにより、AI向け高効率プロセッサの供給能力が飛躍的に向上する見通しです。

【具体的数値・事実】
・総投資額は2兆5000億円に達する見込み
・従来比で電力効率が30％向上、演算速度は15％向上
・2025年秋より量産ラインの稼働開始を予定

【市場・実務への影響】
データセンター事業者の投資サイクルに直接影響を与え、サプライチェーン全体の再構築が促されます。

【キーワード】
- [[先端半導体]]: 微細化プロセスの最先端技術
- [[サプライチェーン]]: 部材供給網の強靭化
\`;

const res1 = cleanTextForSpeech(sample1, "次世代半導体の量産計画と市場影響");
console.log("LENGTH:", res1.length);
console.log("OUTPUT:\n" + res1);
`);
