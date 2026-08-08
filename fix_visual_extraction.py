import re

with open('src/App.tsx', 'r') as f:
    content = f.read()

pattern = re.compile(r'  const runVisualExtraction = async \(\) => \{.*?    setIsExtractingStructure\(false\);\n    \}\n  \};\n', re.DOTALL)

new_func = """  const runVisualExtraction = async () => {
    const active = getActiveNote();
    if (!active) return toast("ノートを選択してください");
    if (active.content.trim().length < 15) return toast("内容が短すぎます");
    
    setIsExtractingStructure(true);
    
    const promptText = `あなたは記事の内容を視覚的に理解しやすくするための構造抽出アシスタントです。
以下の記事から、「比較できるもの(chart)」「時系列で変化したもの(timeline_shift)」「因果関係があるもの(causal_flow)」を抽出してください。
目的は「要約の網羅性」ではなく「理解コストの削減」です。数値や時期の変化など、比較・構造・因果関係を持つ情報は、文章ではなく図示可能なデータ構造として抽出してください。
該当する情報がない項目は、無理に情報を埋めず null を設定してください（人が図を見て「情報がない」と一目でわかることも、理解コストの削減に寄与します）。

記事本文:
${active.columnJ || active.content}

出力は必ず以下のJSON形式のみを出力してください。マークダウンのコードブロック (\`\`\`json) で囲まないでください。
{
  "chart": {
    "title": "グラフのタイトル",
    "labels": ["ラベル1", "ラベル2"],
    "series": [{ "name": "系列名", "data": [100, 200] }],
    "type": "bar"
  },
  "timeline_shift": {
    "events": [
      { "date": "時期・日時", "description": "起こった事象や変化" }
    ]
  },
  "causal_flow": {
    "nodes": [
      { "id": "node1", "label": "要素の短いラベル" }
    ],
    "edges": [
      { "source": "node1", "target": "node2", "label": "関係性の短い説明" }
    ]
  }
}
`;

    try {
      await navigator.clipboard.writeText(promptText);
      toast("外部AI用のプロンプトをコピーしました📋 ChatGPT等に貼り付けて実行し、得られたJSONを「結果を適用」から貼り付けてください");
    } catch (e: any) {
      console.error(e);
      toast("コピーに失敗しました: " + e.message);
    } finally {
      setIsExtractingStructure(false);
    }
  };
"""

new_content = pattern.sub(new_func, content)

with open('src/App.tsx', 'w') as f:
    f.write(new_content)
