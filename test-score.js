const activeNote = { id: '1', title: 'AI導入の検討', content: '当社でも生成AIの導入を進めるべきである。ChatGPTのようなものが有効。' };
const notes = [
  { id: '1', title: 'AI導入の検討', content: '当社でも生成AIの導入を進めるべきである。ChatGPTのようなものが有効。' },
  { id: '2', title: 'ChatGPT', content: 'ChatGPTはOpenAIが開発した大規模言語モデルベースの対話AI。' },
  { id: '3', title: '社員食堂のメニュー', content: '来月からカレーが値上げされる。' },
  { id: '4', title: '生成AIの業務活用ガイド', content: '社内での生成AI活用についてのガイドライン。' },
  { id: '5', title: 'リモートワーク規定', content: '週3日までのリモートワークを許可する。' },
];

const getTokens = (text) => {
  const t = text.replace(/\s+/g, "").toLowerCase();
  const tokens = new Set();
  for (let i = 0; i < t.length - 1; i++) {
    tokens.add(t.substring(i, i + 2));
  }
  return tokens;
};

const activeTokens = getTokens(activeNote.title + activeNote.content);

const scoredNotes = notes
  .filter(n => n.id !== activeNote.id)
  .map(n => {
    const isMentioned = activeNote.content.toLowerCase().includes(n.title.toLowerCase());
    
    let score = 0;
    if (isMentioned) {
      score += 10000;
    }
    
    const nTokens = getTokens(n.title + n.content);
    let matchCount = 0;
    for (const tk of nTokens) {
      if (activeTokens.has(tk)) matchCount++;
    }
    score += matchCount / (activeTokens.size + nTokens.size - matchCount || 1);
    
    return { note: n, score, isMentioned };
  })
  .sort((a, b) => b.score - a.score);

console.log(scoredNotes.map(n => ({ title: n.note.title, score: n.score })));
