/**
 * ====================================================================
 * Connected Notes: Google Apps Script (GAS) 統合バックエンドスクリプト
 * （スプレッドシート15列同期・N列以降追記・Raindrop/GoogleドライブMHT自動取り込み対応）
 * ====================================================================
 *
 * 【今回(第2版)の修正内容 — ご指摘①〜⑤への対応】
 *
 * ① responseSchema が固定されていた
 *    → 「自由回答モード(free)」を新設し、デフォルトはこちら。
 *      responseMimeType / responseSchema を一切指定せず、
 *      syncPromptに書かれたフォーマット指示（見出し・箇条書き・
 *      wikilink形式など）をGeminiにそのまま生成させる。
 *      「厳格なJSONで構造化したい」という用途のために
 *      「JSON厳格モード(json)」も残しているが、両者は完全に分離し、
 *      混ぜて使わない。切り替えは config.outputMode または
 *      スクリプトプロパティ OUTPUT_MODE で行う（デフォルト: free）。
 *
 * ② SYNC_PROMPTの後ろにJSON化の追加指示を足していた
 *    → 自由回答モードでは persona + syncPrompt + データ をそのまま渡すだけ。
 *      余計な「出力はJSON形式で」等の指示を一切追加しない。
 *
 * ③ config.syncPromptが本来のSYNC_PROMPTを差し替えている可能性
 *    → これは元々の設計通りの正しい優先順位（フロントから渡された
 *      config.syncPromptがあればそれを最優先、なければ
 *      スクリプトプロパティ→デフォルト値の順）。今回、その挙動を
 *      コメントで明示し、ログにも出力するようにした。
 *      つまり「設定画面で指定したプロンプトが必ず使われる」設計は
 *      維持しつつ、①②の問題によってその中身が無視されていた状態を解消した。
 *
 * ④ 本文が10,000〜15,000文字で切られている
 *    → ハードコードをやめ、スクリプトプロパティ MAX_INPUT_CHARS
 *      (デフォルト15000)で一元管理。必要なら値を変更するだけで
 *      全経路(Raindrop/MHT/PDF)に反映される。
 *
 * ⑤ 400文字以下だとGemini自体が呼ばれない
 *    → これは元々SYNC_PROMPT自身に書かれている「400字以下ならそのまま
 *      貼り付ける」というルールをコード側で先取りして節約していたもの。
 *      ただし「常にGeminiに判断させたい」場合のために
 *      SKIP_GEMINI_FOR_SHORT_ARTICLES (デフォルトtrue)で
 *      オン/オフを切り替えられるようにした。falseにすれば、
 *      短い記事でも必ずGeminiが呼ばれ、syncPromptの指示通りに
 *      「そのまま貼り付ける」かどうかもGeminiの判断に委ねられる。
 *
 * 【スプレッドシートの列構成（15列）】
 * A(id) B(title) C(url) D(tags) E(highlights) F(saved_at) G(processed) H(nobsidian)
 * I(all:本文原文) J(apendix:メタ情報) K(date:日付) L(timeline:年表) M(source:取得元)
 * N(edited_content:アプリ編集本文) O(updated_at:アプリ更新日時)
 *
 * ※ A〜M列の外部取り込み元データは非破壊で保持され、アプリ内での編集や加筆はN列・O列に追記されます。
 *
 * 【初回権限設定手順】
 * 1. エディタ上部の関数選択ドロップダウンから『authorizeDrivePermissions』を選択して「実行」をクリック。
 * 2. 権限の承認ポップアップが表示されたら「許可」します。
 *
 * 【デプロイ手順】
 * 1. 右上の「デプロイ」 ＞ 「新しいデプロイ」 をクリック。
 * 2. 種類：「ウェブアプリ」、アクセスできるユーザー：「全員」（Anyone）を選択してデプロイ。
 * 3. 発行されたURL（.../exec）をアプリの「設定⚙」に貼り付けて保存します。
 *
 * 【設定できるスクリプトプロパティ（任意）】
 *  - GEMINI_API_KEY, RAINDROP_TOKEN, GEMINI_MODEL, GEMINI_TEMPERATURE
 *  - OUTPUT_MODE : "free"（既定・プロンプト優先） or "json"（構造化厳格）
 *  - MAX_INPUT_CHARS : Geminiに渡す本文の最大文字数（既定 15000）
 *  - SKIP_GEMINI_FOR_SHORT_ARTICLES : "true"/"false"（既定 true）
 *  - SHORT_ARTICLE_THRESHOLD : 何文字以下を「短い記事」とみなすか（既定 400）
 */

// スクリプトプロパティの参照
const props = PropertiesService.getScriptProperties();

// システム設定のデフォルト値
const DEFAULT_CONFIG = {
  GEMINI_MODEL: 'gemini-1.5-flash',
  GEMINI_MAX_TOKENS: 8000,
  GEMINI_TEMPERATURE: 0.1,

  // ★出力モードの既定値。"free"=プロンプトの指示通りの自由なテキスト生成。
  //   "json"=UNIFIED_RESPONSE_SCHEMAで厳格に構造化する。
  OUTPUT_MODE: 'free',
  MAX_INPUT_CHARS: 15000,
  SKIP_GEMINI_FOR_SHORT_ARTICLES: 'true',
  SHORT_ARTICLE_THRESHOLD: 400,

  SYSTEM_PERSONA: 'あなたは環境ビジネス・技術情報の専門アナリストです。',

  SYNC_PROMPT: `# 役割
あなたは客観的かつ論理的な「ビジネスリサーチ・アナリスト」です。
提供された記事から、事実と構造を正確に抽出してください。

# 厳守事項
- 資料外の知識で補完しない。不明な点は「資料内に記述なし」と明記すること。
- 事実（客観）と解釈・示唆（主観）は、指定されたセクションで完全に分離すること。

---

# 出力構成

### 【記事タイトルまたはテーマ】

【カテゴリ・タグ】
※この記事の分野や分類を表すタグ・カテゴリ情報をカンマ区切りで記載してください（例：環境技術, 政策・規制）。

【要約】
※記事の内容をわかりやすく要約して200文字程度にしてください。

【具体的数値・事実】
※数値・固有名詞・日付を最優先した箇条書き。資料にある事実のみ（3〜5点）。

【市場・実務への影響】
※この記事がどのような社会的・経済的文脈にあり、市場や実務にどう影響するか（2〜3文）。

- ただし、読み込んだ記事の文字数が400文字以下の場合、上記の要約、具体的数値・事実、市場・実務への影響などは行わず、記事をそのまま貼り付けてください。

【キーワード】
※記事中の専門用語・業界用語を抽出し、必ず以下の「ウィキリンク形式」で出力してください。3〜5単語。

- [[用語]]: 意味や定義

【年表】
※本文中の日付や年号、出来事の記述があれば「[YYYY年M月] 出来事」の形式で箇条書き（改行区切り）で抽出してください。該当なしなら記載不要です。`
};

function getConfig(key) {
  const val = props.getProperty(key);
  return val !== null && val !== "" ? val : DEFAULT_CONFIG[key];
}

function getBoolConfig(key) {
  return String(getConfig(key)).toLowerCase() === 'true';
}

function getNumConfig(key) {
  const n = Number(getConfig(key));
  return isNaN(n) ? Number(DEFAULT_CONFIG[key]) : n;
}

// 15列の共通ヘッダー定義
const SHEET_HEADERS = [
  "id", "title", "url", "tags", "highlights", "saved_at", "processed", "nobsidian",
  "all", "apendix", "date", "timeline", "source", "edited_content", "updated_at"
];

// ====================================================================
// ★モードA：自由回答モード (free) — デフォルト
//   syncPromptに書かれた指示だけをGeminiに渡し、フォーマットを一切強制しない。
// ====================================================================

// テキスト記事（Raindrop記事・MHT記事）向け：自由回答モード
function callGeminiFree(content, persona, syncPrompt, apiKey, model) {
  if (!apiKey) {
    return content.substring(0, 500);
  }

  // ★syncPromptの後ろに何も足さない。persona + syncPrompt + データ、それだけ。
  const prompt = persona + "\n" + syncPrompt + "\n\n【データ】\n" + content;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: getNumConfig('GEMINI_TEMPERATURE')
      // ★responseMimeType / responseSchema はあえて指定しない
    }
  };

  try {
    const response = UrlFetchApp.fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true }
    );
    const responseCode = response.getResponseCode();
    if (responseCode === 200) {
      const resJson = JSON.parse(response.getContentText());
      return (resJson.candidates && resJson.candidates[0].content.parts[0].text) || "";
    } else {
      console.error(`Gemini(free/text) HTTP Error [${responseCode}]: ${response.getContentText()}`);
    }
  } catch (e) {
    console.error("Gemini(free/text) Execution Error: " + e.stack);
  }
  return "";
}

// PDF・画像向け：自由回答モード
function callGeminiFreeFile(file, apiKey, model, persona, syncPrompt) {
  if (!apiKey) {
    return "ファイル名: " + file.getName();
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const base64Data = Utilities.base64Encode(file.getBlob().getBytes());
  const prompt = persona + "\n" + syncPrompt +
    "\n\n【データ】\n(添付されたファイルの内容を読み取り、記載されているテキスト・図表の情報をもとに分析してください。ファイル名: " + file.getName() + ")";

  const payload = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: file.getMimeType(), data: base64Data } }
      ]
    }],
    generationConfig: {
      temperature: getNumConfig('GEMINI_TEMPERATURE'),
      maxOutputTokens: 2000
      // ★responseMimeType / responseSchema はあえて指定しない
    }
  };

  try {
    const response = UrlFetchApp.fetch(url, {
      method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true
    });
    if (response.getResponseCode() === 200) {
      const result = JSON.parse(response.getContentText());
      return (result.candidates && result.candidates[0].content.parts[0].text) || "";
    } else {
      console.error(`Gemini(free/vision) HTTP Error [${response.getResponseCode()}]: ${response.getContentText()}`);
    }
  } catch (e) {
    console.error("Gemini(free/vision) Execution Error: " + e.message);
  }
  return "解析完了: " + file.getName();
}

// 自由回答テキストから、スプレッドシートのD列(tags)・L列(timeline)用の情報だけを
// 正規表現で軽く拾う。syncPromptを差し替えても致命的に壊れないよう、
// 見つからない場合は素直にフォールバックする。
function buildSheetFieldsFromFreeText(rawText, fallbackContent) {
  const text = (rawText && rawText.trim()) ? rawText : (fallbackContent || "");

  // 【カテゴリ・タグ】セクションからタグ・カテゴリを取得する
  const categoryMatch = text.match(/【\s*カテゴリ[・\/]タグ\s*】\s*\n?([^\n【]+)/);
  let tags = categoryMatch ? categoryMatch[1].trim() : "";
  if (!tags) {
    // フォールバック: [[用語]] から取得
    const keywordMatches = [...text.matchAll(/\[\[([^\]]+)\]\]:\s*([^\n]+)/g)];
    tags = keywordMatches.length > 0
      ? keywordMatches.map(m => m[1].trim()).join(", ")
      : "未分類";
  }

  // 【年表】セクションを確実に抽出する
  const timelineSectionMatch = text.match(/【\s*年表\s*】\s*\n?([\s\S]*?)(?:\n【|$)/);
  let timeline = timelineSectionMatch ? timelineSectionMatch[1].trim() : "";
  if (!timeline) {
    const lines = text.split(/\n/);
    const dateLines = lines.filter(l => /(?:\d{4}年|\d{4}年度|\d{4}\/\d{1,2}|\d{4}年\d{1,2}月)/.test(l));
    if (dateLines.length > 0) {
      timeline = dateLines.slice(0, 5).map(l => l.replace(/^[#\-\*•]\s*/, '')).join("\n");
    }
  }

  return {
    tags: tags,
    highlights: text,
    timeline: timeline
  };
}

// ====================================================================
// ★モードB：JSON厳格モード (json) — 明示的に構造化データが欲しい場合のみ使用
// ====================================================================

const UNIFIED_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING", description: "記事タイトルまたはテーマ。判別できない場合は空文字。" },
    is_verbatim: { type: "BOOLEAN", description: "本文が400文字以下、または要約が不適切なほど短い場合はtrue。" },
    summary: { type: "STRING", description: "200文字程度の要約。is_verbatimがtrueなら空文字でよい。" },
    key_facts: { type: "ARRAY", items: { type: "STRING" }, description: "数値・固有名詞・日付を優先した事実の箇条書き（3〜5点）。" },
    market_impact: { type: "STRING", description: "市場・実務への影響（2〜3文）。is_verbatimがtrueなら空文字でよい。" },
    keywords: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { term: { type: "STRING" }, definition: { type: "STRING" } },
        required: ["term", "definition"]
      },
      description: "専門用語・業界用語（3〜5件）。用語と意味・定義のペア。"
    },
    timeline: { type: "STRING", description: "[YYYY年M月] 出来事 の形式、改行区切り。該当なしなら空文字。" }
  },
  required: ["title", "is_verbatim", "summary", "key_facts", "market_impact", "keywords", "timeline"]
};

function buildAnalysisPromptForJsonMode(persona, syncPrompt, content) {
  return persona + "\n" + syncPrompt +
    "\n\n【出力形式についての補足（JSON厳格モード時のみ）】\n" +
    "上記の「出力構成」の内容を、与えられたJSONスキーマの各フィールド" +
    "（title / is_verbatim / summary / key_facts / market_impact / keywords / timeline）に" +
    "過不足なく対応させて出力してください。\n\n" +
    "【データ】\n" + content;
}

function normalizeGeminiResult(parsed) {
  return {
    title: parsed.title || "",
    is_verbatim: !!parsed.is_verbatim,
    summary: parsed.summary || "",
    key_facts: Array.isArray(parsed.key_facts) ? parsed.key_facts : [],
    market_impact: parsed.market_impact || "",
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
    timeline: parsed.timeline || ""
  };
}

function callGeminiAnalyzeText(content, persona, syncPrompt, apiKey, model) {
  if (!apiKey) {
    return { title: "", is_verbatim: isShortArticle(content), summary: content.substring(0, 300), key_facts: [], market_impact: "", keywords: [], timeline: "" };
  }
  const prompt = buildAnalysisPromptForJsonMode(persona, syncPrompt, content);
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.1, responseMimeType: "application/json", responseSchema: UNIFIED_RESPONSE_SCHEMA }
  };
  try {
    const response = UrlFetchApp.fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true }
    );
    if (response.getResponseCode() === 200) {
      const resJson = JSON.parse(response.getContentText());
      const rawText = resJson.candidates[0].content.parts[0].text;
      return normalizeGeminiResult(JSON.parse(rawText));
    } else {
      console.error(`Gemini(json/text) HTTP Error [${response.getResponseCode()}]: ${response.getContentText()}`);
    }
  } catch (e) {
    console.error("Gemini(json/text) Execution Error: " + e.stack);
  }
  return { title: "", is_verbatim: false, summary: content.substring(0, 300), key_facts: [], market_impact: "", keywords: [], timeline: "" };
}

function callGeminiAnalyzeFile(file, apiKey, model, persona, syncPrompt) {
  if (!apiKey) {
    return { title: "", is_verbatim: true, summary: "ファイル名: " + file.getName(), key_facts: [], market_impact: "", keywords: [], timeline: "" };
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const base64Data = Utilities.base64Encode(file.getBlob().getBytes());
  const prompt = buildAnalysisPromptForJsonMode(
    persona, syncPrompt,
    "(添付されたファイルの内容を読み取り、記載されているテキスト・図表の情報をもとに分析してください。ファイル名: " + file.getName() + ")"
  );
  const payload = {
    contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: file.getMimeType(), data: base64Data } }] }],
    generationConfig: { temperature: 0.1, responseMimeType: "application/json", responseSchema: UNIFIED_RESPONSE_SCHEMA, maxOutputTokens: 2000 }
  };
  try {
    const response = UrlFetchApp.fetch(url, { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true });
    if (response.getResponseCode() === 200) {
      const result = JSON.parse(response.getContentText());
      const text = result.candidates[0].content.parts[0].text;
      return normalizeGeminiResult(JSON.parse(text));
    } else {
      console.error(`Gemini(json/vision) HTTP Error [${response.getResponseCode()}]: ${response.getContentText()}`);
    }
  } catch (e) {
    console.error("Gemini(json/vision) Execution Error: " + e.message);
  }
  return { title: "", is_verbatim: true, summary: "解析完了: " + file.getName(), key_facts: [], market_impact: "", keywords: [], timeline: "" };
}

function buildSheetFieldsFromGeminiResult(parsed, rawContent) {
  const isVerbatim = parsed.is_verbatim || isShortArticle(rawContent);

  let tagsWikilinks = "未分類";
  if (parsed.keywords && parsed.keywords.length > 0) {
    tagsWikilinks = parsed.keywords.map(k => `[[${k.term}]]: ${k.definition}`).join(" / ");
  }

  let highlightsText = "";
  if (isVerbatim) {
    highlightsText = (rawContent && rawContent.trim()) ? rawContent : (parsed.summary || "");
  } else {
    const parts = [];
    if (parsed.summary) parts.push("【要約】\n" + parsed.summary);
    if (parsed.key_facts && parsed.key_facts.length > 0) parts.push("【具体的数値・事実】\n・" + parsed.key_facts.join("\n・"));
    if (parsed.market_impact) parts.push("【市場・実務への影響】\n" + parsed.market_impact);
    highlightsText = parts.join("\n\n");
  }

  return { tags: tagsWikilinks, highlights: highlightsText, timeline: parsed.timeline || "" };
}

// ====================================================================
// ★共通ディスパッチャ：outputMode に応じてモードA/Bを振り分ける
//   （この関数だけを呼び出し元は使う。モードの混在はここで防ぐ）
// ====================================================================

function analyzeText(content, persona, syncPrompt, apiKey, model, outputMode) {
  if (outputMode === 'json') {
    const parsed = callGeminiAnalyzeText(content, persona, syncPrompt, apiKey, model);
    return buildSheetFieldsFromGeminiResult(parsed, content);
  }
  const rawText = callGeminiFree(content, persona, syncPrompt, apiKey, model);
  return buildSheetFieldsFromFreeText(rawText, content);
}

function analyzeFile(file, apiKey, model, persona, syncPrompt, outputMode) {
  if (outputMode === 'json') {
    const parsed = callGeminiAnalyzeFile(file, apiKey, model, persona, syncPrompt);
    return buildSheetFieldsFromGeminiResult(parsed, "");
  }
  const rawText = callGeminiFreeFile(file, apiKey, model, persona, syncPrompt);
  return buildSheetFieldsFromFreeText(rawText, "");
}

// 400文字以下かどうかの判定（この関数自体はモードに関わらず共通利用）
function isShortArticle(text, threshold) {
  const t = typeof threshold === 'number' ? threshold : getNumConfig('SHORT_ARTICLE_THRESHOLD');
  return !!text && text.length > 0 && text.length <= t;
}

// スプレッドシート内の保存先シートを取得/自動生成する関数
function getSheet(targetSheetName, targetSsUrl) {
  let ss = null;
  if (targetSsUrl && String(targetSsUrl).trim() !== "") {
    try {
      ss = SpreadsheetApp.openByUrl(String(targetSsUrl).trim());
    } catch(e) {
      const match = String(targetSsUrl).match(/[-w]{25,}/);
      if (match) {
        ss = SpreadsheetApp.openById(match[0]);
      } else {
        throw new Error("指定されたスプレッドシートを開けません。URLを確認してください。");
      }
    }
  } else {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  }
  if (!ss) {
    throw new Error("スプレッドシートが見つかりません。URLが正しいか確認してください。");
  }
  const name = (targetSheetName && String(targetSheetName).trim()) ? String(targetSheetName).trim() : "Notes";
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(SHEET_HEADERS);
  } else {
    const lastCol = sheet.getLastColumn();
    if (lastCol === 0) {
      sheet.appendRow(SHEET_HEADERS);
    } else if (lastCol < SHEET_HEADERS.length) {
      for (let c = 1; c <= SHEET_HEADERS.length; c++) {
        const headerCell = sheet.getRange(1, c);
        if (headerCell.getValue() === "") {
          headerCell.setValue(SHEET_HEADERS[c - 1]);
        }
      }
    }
  }
  return sheet;
}

// ==== 統合リクエスト処理関数（GET/POST両対応、FormData・JSON・クエリパラメータ対応） ====
function processApiRequest(e) {
  if (!e) {
    return createJsonResponse({
      status: "ok",
      message: "Connected Notes Web API (GAS) は正常に稼働しています。このURLをアプリの設定画面に貼り付けてご利用ください。"
    });
  }

  let postData = {};
  if (e.postData && e.postData.contents) {
    try {
      const parsed = JSON.parse(e.postData.contents);
      if (parsed && typeof parsed === "object") postData = parsed;
    } catch (jsonErr) {}
  }

  if (!postData.action && e.parameter && e.parameter.payload) {
    try {
      const parsedPayload = JSON.parse(e.parameter.payload);
      if (parsedPayload && typeof parsedPayload === "object") postData = parsedPayload;
    } catch (payloadErr) {}
  }

  if (!postData.action && e.parameter) {
    postData = e.parameter;
  }

  const action = postData.action || (e.parameter ? e.parameter.action : "");
  const targetSheet = postData.sheetName || (e.parameter ? e.parameter.sheetName : "");
  const targetSsUrl = postData.targetSsUrl || (e.parameter ? e.parameter.targetSsUrl : "");

  if (!action) {
    return createJsonResponse({
      status: "ok",
      message: "Connected Notes Web API (GAS) は正常に稼働しています。"
    });
  }

  let result = {};

  try {
    if (action === "getNotes") {
      result = handleGetNotes(targetSheet, targetSsUrl);
    } else if (action === "saveNote") {
      const note = typeof postData.note === "string" ? JSON.parse(postData.note) : postData.note;
      result = saveNote(note, targetSheet, targetSsUrl);
    } else if (action === "deleteNote") {
      result = deleteNote(postData.id, targetSheet, targetSsUrl);
    } else if (action === "saveAll") {
      const notes = typeof postData.notes === "string" ? JSON.parse(postData.notes) : postData.notes;
      result = saveAll(notes, targetSheet, targetSsUrl);
    } else if (action === "syncExternalSources" || action === "syncAllExternalSources") {
      const options = postData.options || { raindrop: true, drive: true };
      result = syncExternalSources(options, targetSheet, targetSsUrl);
    } else if (action === "fetchDriveFile") {
      result = fetchDriveFile(postData.url);
    } else if (action === "importRawRowsToApp") {
      const rowIndices = typeof postData.rowIndices === "string" ? JSON.parse(postData.rowIndices) : postData.rowIndices;
      result = importRawRowsToApp(postData.sourceSsId, postData.sheetName, postData.targetSsId, postData.targetSheetName, rowIndices);
    } else if (action === "fetchUnprocessedHighlights") {
      result = fetchUnprocessedHighlights(postData.sourceSsId, postData.sheetName);
    } else if (action === "markHighlightsProcessed") {
      const rowIndices = typeof postData.rowIndices === "string" ? JSON.parse(postData.rowIndices) : postData.rowIndices;
      result = markHighlightsProcessed(postData.sourceSsId, postData.sheetName, rowIndices);
    } else if (action === "saveToDrive" || action === "exportToDrive") {
      result = saveToDrive(postData);
    } else {
      result = { success: false, error: "不明なアクション: " + action };
    }
  } catch (err) {
    result = { success: false, error: err.message || String(err) };
  }

  return createJsonResponse(result);
}

function doGet(e) {
  try {
    return processApiRequest(e);
  } catch (err) {
    return createJsonResponse({ success: false, error: err.message });
  }
}

function doPost(e) {
  try {
    return processApiRequest(e);
  } catch (err) {
    return createJsonResponse({ success: false, error: err.message });
  }
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
                       .setMimeType(ContentService.MimeType.JSON);
}

// ---- ノート一覧取得 (A〜M列保持 + N列編集本文 + O列更新日時) ----
function handleGetNotes(targetSheetName, targetSsUrl) {
  const sheet = getSheet(targetSheetName, targetSsUrl);
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return { notes: [], sheetName: sheet.getName() };
  }

  const numCols = Math.max(15, sheet.getLastColumn());
  const data = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();

  const notes = data.map((row, idx) => {
    let cAt = Date.now();
    if (row[5] instanceof Date) {
      cAt = row[5].getTime();
    } else if (row[5] !== "" && !isNaN(Number(row[5])) && Number(row[5]) > 0) {
      cAt = Number(row[5]);
    } else if (row[5]) {
      const parsed = Date.parse(row[5]);
      if (!isNaN(parsed)) cAt = parsed;
    }

    let uAt = cAt;
    if (row[14] instanceof Date) {
      uAt = row[14].getTime();
    } else if (row[14] !== "" && !isNaN(Number(row[14])) && Number(row[14]) > 0) {
      uAt = Number(row[14]);
    } else if (row[14]) {
      const parsed = Date.parse(row[14]);
      if (!isNaN(parsed)) uAt = parsed;
    }

    const id = String(row[0] || ("note_" + (Date.now() + idx)));
    const title = String(row[1] || "");
    const sourceUrl = String(row[2] || "");
    const tags = String(row[3] || "");
    const highlights = String(row[4] || "");
    const rawAll = String(row[8] || "");
    const metaInfo = String(row[9] || "");
    const dateStr = String(row[10] || "");
    const timeline = String(row[11] || "");
    const source = String(row[12] || "");
    const editedContent = String(row[13] || "");

    let content = editedContent;
    if (!content.trim()) {
      if (rawAll.trim()) {
        content = rawAll;
      } else if (highlights.trim()) {
        content = `# ${title}\n\n${highlights}`;
        if (dateStr) content += `\n\n---\n**日付:** ${dateStr}`;
        if (sourceUrl) content += `\n**リンク:** [${sourceUrl}](${sourceUrl})`;
      }
    }

    return {
      id: id,
      title: title,
      content: content,
      summary: highlights,
      keywords: tags,
      createdAt: cAt,
      updatedAt: uAt,
      sourceUrl: sourceUrl,
      timeline: timeline,
      columnJ: metaInfo,
      rawContent: rawAll,
      metaInfo: metaInfo,
      dateStr: dateStr,
      source: source,
      processed: row[6],
      nobsidian: row[7]
    };
  }).filter(n => n.title.trim() !== "" || n.content.trim() !== "");

  return { notes: notes, sheetName: sheet.getName() };
}

// ---- ノート単体保存（A〜M列を非破壊保持し、N列・O列にアプリデータを書き込み） ----
function saveNote(note, targetSheetName, targetSsUrl) {
  const sheet = getSheet(targetSheetName, targetSsUrl);
  const lastRow = sheet.getLastRow();

  if (lastRow >= 2) {
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat().map(String);
    const idx = ids.indexOf(String(note.id));

    if (idx !== -1) {
      const rowNum = idx + 2;
      const currentCols = Math.max(15, sheet.getLastColumn());
      const currentRow = sheet.getRange(rowNum, 1, 1, currentCols).getValues()[0];

      const updatedRow = [
        note.id,
        note.title || currentRow[1] || "",
        note.sourceUrl || currentRow[2] || "",
        note.keywords || currentRow[3] || "",
        note.summary || currentRow[4] || "",
        currentRow[5] || note.createdAt || new Date(),
        'true',
        currentRow[7] || "",
        currentRow[8] || note.rawContent || "",
        note.columnJ || note.metaInfo || currentRow[9] || "",
        note.dateStr || currentRow[10] || "",
        note.timeline !== undefined ? note.timeline : (currentRow[11] || ""),
        note.source || currentRow[12] || "app",
        note.content || "",
        note.updatedAt || Date.now()
      ];

      sheet.getRange(rowNum, 1, 1, 15).setValues([updatedRow]);
      return { success: true, action: "updated", id: note.id, sheetName: sheet.getName() };
    }
  }

  sheet.appendRow([
    note.id,
    note.title,
    note.sourceUrl || "",
    note.keywords || "",
    note.summary || "",
    note.createdAt || new Date(),
    'true',
    '',
    note.rawContent || "",
    note.columnJ || note.metaInfo || "",
    note.dateStr || "",
    note.timeline || "",
    note.source || "app",
    note.content || "",
    note.updatedAt || Date.now()
  ]);

  return { success: true, action: "created", id: note.id, sheetName: sheet.getName() };
}

// ---- ノート削除 ----
function deleteNote(id, targetSheetName, targetSsUrl) {
  const sheet = getSheet(targetSheetName, targetSsUrl);
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { success: false, reason: "データが存在しません" };

  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat().map(String);
  const idx = ids.indexOf(String(id));

  if (idx !== -1) {
    sheet.deleteRow(idx + 2);
    return { success: true, id: id, sheetName: sheet.getName() };
  }
  return { success: false, reason: "削除対象が見つかりません" };
}

// ---- 全ノート一括保存（A〜M列を非破壊保持しつつN・O列を更新） ----
function saveAll(notes, targetSheetName, targetSsUrl) {
  const sheet = getSheet(targetSheetName, targetSsUrl);
  const lastRow = sheet.getLastRow();

  const existingMap = {};
  if (lastRow >= 2) {
    const numCols = Math.max(15, sheet.getLastColumn());
    const data = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
    data.forEach((row, i) => {
      const id = String(row[0]);
      if (id) existingMap[id] = row;
    });
  }

  if (notes && notes.length > 0) {
    const rows = notes.map(n => {
      const existing = existingMap[String(n.id)];
      if (existing) {
        return [
          n.id,
          n.title || existing[1] || "",
          n.sourceUrl || existing[2] || "",
          n.keywords || existing[3] || "",
          n.summary || existing[4] || "",
          existing[5] || n.createdAt || new Date(),
          'true',
          existing[7] || "",
          existing[8] || n.rawContent || "",
          n.columnJ || n.metaInfo || existing[9] || "",
          n.dateStr || existing[10] || "",
          n.timeline !== undefined ? n.timeline : (existing[11] || ""),
          n.source || existing[12] || "app",
          n.content || "",
          n.updatedAt || Date.now()
        ];
      } else {
        return [
          n.id,
          n.title,
          n.sourceUrl || "",
          n.keywords || "",
          n.summary || "",
          n.createdAt || new Date(),
          'true',
          '',
          n.rawContent || "",
          n.columnJ || n.metaInfo || "",
          n.dateStr || "",
          n.timeline || "",
          n.source || "app",
          n.content || "",
          n.updatedAt || Date.now()
        ];
      }
    });

    const neededRows = rows.length + 1;
    const currentMaxRows = sheet.getMaxRows();
    if (neededRows > currentMaxRows) {
      sheet.insertRowsAfter(currentMaxRows, neededRows - currentMaxRows);
    }

    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, Math.max(15, sheet.getLastColumn())).clearContent();
    }
    sheet.getRange(2, 1, rows.length, 15).setValues(rows);
  }

  return { success: true, count: notes ? notes.length : 0, sheetName: sheet.getName() };
}

// ====================================================================
// 外部データ同期エンジン (Raindrop & Google Drive MHT / PDF / 画像)
// ====================================================================

function syncExternalSources(options, targetSheetName, targetSsUrl) {
  const config = options || { raindrop: true, drive: true };
  const START_TIME = Date.now();
  const TIME_LIMIT = 3.5 * 60 * 1000;

  let currentProcessing = "同期処理の準備中";
  let addedCount = 0;
  let isTimeOut = false;
  let problematicItem = null;

  try {
    const sheet = getSheet(targetSheetName, targetSsUrl);
    const lastRow = sheet.getLastRow();
    const existingIds = lastRow > 1
      ? new Set(sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat().map(String))
      : new Set();

    const geminiApiKey = props.getProperty('GEMINI_API_KEY') || "";
    const geminiModel = getConfig('GEMINI_MODEL');
    const raindropToken = props.getProperty('RAINDROP_TOKEN') || "";

    // ★③: フロントのconfigを最優先。なければスクリプトプロパティ→デフォルトの順（既存の優先順位を維持・明示）
    const persona = config.persona || getConfig('SYSTEM_PERSONA');
    const syncPrompt = config.syncPrompt || getConfig('SYNC_PROMPT');
    const outputMode = config.outputMode || getConfig('OUTPUT_MODE'); // "free" or "json"
    const maxInputChars = config.maxInputChars ? Number(config.maxInputChars) : getNumConfig('MAX_INPUT_CHARS');
    const shortArticleThreshold = config.shortArticleThreshold !== undefined
      ? Number(config.shortArticleThreshold) : getNumConfig('SHORT_ARTICLE_THRESHOLD');
    const skipGeminiForShort = config.skipGeminiForShortArticles !== undefined
      ? !!config.skipGeminiForShortArticles : getBoolConfig('SKIP_GEMINI_FOR_SHORT_ARTICLES');

    console.log(`syncExternalSources: outputMode=${outputMode}, maxInputChars=${maxInputChars}, ` +
      `skipGeminiForShort=${skipGeminiForShort}(threshold=${shortArticleThreshold}), ` +
      `syncPromptSource=${config.syncPrompt ? "config(フロント指定)" : "スクリプトプロパティ/デフォルト"}`);

    function extractFolderId(input) {
      if (!input || typeof input !== 'string') return "";
      const trimmedInput = input.trim();
      const urlMatch = trimmedInput.match(/\/folders\/([a-zA-Z0-9_-]+)/);
      if (urlMatch) {
        return urlMatch[1];
      }
      const isValidId = /^[a-zA-Z0-9_-]+$/.test(trimmedInput);
      if (isValidId) {
        return trimmedInput;
      }
      return "";
    }
    let driveFolderId = extractFolderId(config.driveSourceFolder) || props.getProperty('SCREENSHOT_FOLDER_ID') || "";
    if (!driveFolderId) {
      const folders = DriveApp.getFoldersByName("Connected Notes 取り込み");
      if (folders.hasNext()) {
        driveFolderId = folders.next().getId();
      } else {
        const newFolder = DriveApp.createFolder("Connected Notes 取り込み");
        driveFolderId = newFolder.getId();
      }
    }
    let driveProcessedFolderId = extractFolderId(config.driveProcessedFolder) || "";
    let driveFolderName = "Connected Notes 取り込み";

    // --- A. Raindropからの同期 ---
    if (config.raindrop === true && raindropToken) {
      console.log("Raindrop同期を開始します...");
      const raindropItems = fetchRaindropData(raindropToken);

      for (const item of raindropItems) {
        currentProcessing = `Raindrop記事: [${item.title}] (${item.link})`;

        if (Date.now() - START_TIME > TIME_LIMIT) {
          isTimeOut = true;
          problematicItem = { title: item.title, url: item.link, reason: "時間制限に到達" };
          break;
        }

        const id = String(item._id);
        if (!existingIds.has(id)) {
          let manualHighlights = item.highlights && item.highlights.length > 0 ? item.highlights.map(h => h.text).join(" / ") : "";
          let summary = "";
          let keyword = "未分類";
          let pubDateStr = item.created ? Utilities.formatDate(new Date(item.created), "JST", "yyyy/MM/dd") : Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd");
          let cleanText = "";
          let timelineForRow = "";

          try {
            if (item.link.includes("go.jp")) {
              keyword = "🚨手動要";
              summary = "サイト構造が複雑なため自動取得をスキップしました。手動での確認を推奨します。";
              sheet.appendRow([id, item.title, item.link, keyword, summary, item.created || new Date(), 'false', '', '', '', pubDateStr, '', 'raindrop', '', '']);
              SpreadsheetApp.flush();
              existingIds.add(id);
              addedCount++;
              continue;
            }

            const fetchOptions = {
              muteHttpExceptions: true,
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "text/html"
              }
            };
            const response = UrlFetchApp.fetch(item.link, fetchOptions);

            if (response.getResponseCode() === 200) {
              const rawHtml = response.getContentText();
              cleanText = cleanHtml(rawHtml);

              if (geminiApiKey) {
                // ★⑤: スキップするかどうかは設定次第。スキップする場合のみコード側で完結させる。
                if (skipGeminiForShort && isShortArticle(cleanText, shortArticleThreshold)) {
                  keyword = "未分類";
                  summary = manualHighlights ? manualHighlights + "\n\n" + cleanText : cleanText;
                  timelineForRow = "";
                } else {
                  // ★④: 文字数上限は設定値(maxInputChars)で一元管理
                  const fields = analyzeText(cleanText.substring(0, maxInputChars), persona, syncPrompt, geminiApiKey, geminiModel, outputMode);
                  keyword = fields.tags;
                  summary = manualHighlights ? manualHighlights + "\n\n【AI分析】\n" + fields.highlights : fields.highlights;
                  timelineForRow = fields.timeline;
                }
              }
            } else {
              keyword = "🚨手動要";
              summary = `アクセス拒否 (Status: ${response.getResponseCode()})`;
            }

            const safeContent = cleanText.length > 49000 ? cleanText.substring(0, 49000) + "..." : cleanText;
            sheet.appendRow([id, item.title, item.link, keyword, summary, item.created || new Date(), 'false', '', safeContent, '', pubDateStr, timelineForRow, 'raindrop', '', '']);
            SpreadsheetApp.flush();
            existingIds.add(id);
            addedCount++;

          } catch (e) {
            keyword = "🚨手動要";
            summary = `解析エラー: ${e.message}`;
            sheet.appendRow([id, item.title, item.link, keyword, summary, item.created || new Date(), 'false', '', '', '', pubDateStr, '', 'raindrop', '', '']);
            SpreadsheetApp.flush();
            existingIds.add(id);
            addedCount++;
            isTimeOut = true;
            problematicItem = { title: item.title, url: item.link, reason: e.message };
            break;
          }
        }
      }
    }

    // --- B. Googleドライブからの同期 (MHT / PDF / 画像) ---
    if (config.drive === true && !isTimeOut) {
      let targetDriveFolder;
      if (driveFolderId) {
        try {
          targetDriveFolder = DriveApp.getFolderById(driveFolderId);
          driveFolderName = targetDriveFolder.getName();
        } catch (e) { driveFolderId = ""; }
      }
      if (!driveFolderId) {
        const folders = DriveApp.getFoldersByName(driveFolderName);
        if (folders.hasNext()) {
          targetDriveFolder = folders.next();
        } else {
          targetDriveFolder = DriveApp.createFolder(driveFolderName);
        }
        driveFolderId = targetDriveFolder.getId();
        props.setProperty('SCREENSHOT_FOLDER_ID', driveFolderId);
      }

      console.log("Googleドライブ同期を開始します...");
      const { files, processedFolder } = fetchDriveScreenshots(driveFolderId, driveProcessedFolderId);

      files.sort((a, b) => {
        const aName = a.getName().toLowerCase();
        const bName = b.getName().toLowerCase();
        const aIsMht = aName.endsWith('.mht') || aName.endsWith('.mhtml');
        const bIsMht = bName.endsWith('.mht') || bName.endsWith('.mhtml');
        if (aIsMht && !bIsMht) return -1;
        if (!aIsMht && bIsMht) return 1;
        return 0;
      });

      for (const file of files) {
        if (Date.now() - START_TIME > TIME_LIMIT) {
          isTimeOut = true;
          break;
        }

        const fileName = file.getName();
        const fileNameLower = fileName.toLowerCase();

        try {
          if (fileNameLower.endsWith('.mht') || fileNameLower.endsWith('.mhtml')) {
            let mhtResult = { addedCount: 0, isTimeOut: false };
            try {
              mhtResult = processMhtFile_Advanced(
                file, sheet, existingIds, persona, syncPrompt, driveFolderId, processedFolder,
                geminiApiKey, geminiModel, outputMode, maxInputChars, shortArticleThreshold, skipGeminiForShort
              );
            } finally {
              file.moveTo(processedFolder);
            }
            addedCount += mhtResult.addedCount;
            if (mhtResult.isTimeOut) { isTimeOut = true; break; }

          } else if (fileNameLower.endsWith('.pdf')) {
            const articleId = fileName.replace(/\.[^/.]+$/, "");
            if (existingIds.has(articleId)) {
              file.moveTo(processedFolder);
              continue;
            }

            const fields = analyzeFile(file, geminiApiKey, geminiModel, persona, syncPrompt, outputMode);
            const pubDateStr = Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd");
            sheet.appendRow([articleId, articleId, file.getUrl(), fields.tags, fields.highlights, new Date(), 'false', '', '', '', pubDateStr, fields.timeline, file.getName(), '', '']);
            SpreadsheetApp.flush();
            existingIds.add(articleId);
            addedCount++;
            file.moveTo(processedFolder);

          } else {
            const ssId = 'ss_' + file.getId();
            if (!existingIds.has(ssId)) {
              const fields = analyzeFile(file, geminiApiKey, geminiModel, persona, syncPrompt, outputMode);
              const pubDateStr = Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd");
              sheet.appendRow([ssId, fileName, file.getUrl(), fields.tags, fields.highlights, new Date(), 'false', '', '', '', pubDateStr, fields.timeline, file.getName(), '', '']);
              SpreadsheetApp.flush();
              existingIds.add(ssId);
              addedCount++;
            }
            file.moveTo(processedFolder);
          }
        } catch (e) {
          console.error(`ファイル解析エラー (${fileName}): ${e.message}`);
        }
      }
    }

    return {
      success: true,
      addedCount: addedCount,
      isTimeOut: isTimeOut,
      problematicItem: problematicItem,
      sheetName: sheet.getName(),
      outputMode: outputMode
    };

  } catch (e) {
    throw new Error(`外部同期中にエラーが発生しました: ${e.message}`);
  }
}

// MHTファイル高度解析エンジン
function processMhtFile_Advanced(
  file, sheet, existingIds, persona, syncPrompt, driveFolderId, processedFolder,
  geminiApiKey, geminiModel, outputMode, maxInputChars, shortArticleThreshold, skipGeminiForShort
) {
  const startTime = Date.now();
  const TIME_LIMIT = 3.5 * 60 * 1000;
  let addedCount = 0;
  let isTimeOut = false;

  let rawData = file.getBlob().getDataAsString();
  rawData = rawData.replace(/=\r?\n/g, "");

  let htmlContent = rawData;
  const htmlMatch = rawData.match(/<html[\s\S]*?<\/html>/i);
  if (htmlMatch) htmlContent = htmlMatch[0];

  const formBlocks = htmlContent.split(/<form /gi);
  const articles = [];
  for (let i = 1; i < formBlocks.length; i++) {
    const block = "<form " + formBlocks[i];
    if (block.includes('hdgLv2')) articles.push(block);
  }

  const folder = DriveApp.getFolderById(driveFolderId);

  for (let i = 0; i < articles.length; i++) {
    if (Date.now() - startTime > TIME_LIMIT) {
      isTimeOut = true;
      break;
    }

    const articleHtml = articles[i];
    const rawTitleTag = articleHtml.match(/<div[^>]*class="[^"]*hdgLv2 val02[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    let fullTitleText = rawTitleTag ? rawTitleTag[1].replace(/<[^>]+>/g, ' ').trim() : "タイトル不明";
    fullTitleText = cleanMhtNoise(fullTitleText);

    let titleOnly = fullTitleText;
    let metaInfo = "";

    const splitMatch = fullTitleText.match(/(\d{4}[\/\d].*)$/);
    if (splitMatch) {
      titleOnly = fullTitleText.substring(0, splitMatch.index).trim();
      metaInfo = splitMatch[0].trim().replace(/PDF有/g, "").replace(/書誌情報印刷/g, "").replace(/\s+/g, " ").trim();
    }

    const idMatch = articleHtml.match(/keyShoshi(?:=|3D)NIRKDB\s*([a-zA-Z0-9]+)/i);
    const hasHonbun = articleHtml.includes('text Honbun');
    let articleId = "";

    if (idMatch) {
      articleId = idMatch[1].trim().toUpperCase();
    } else {
      if (!hasHonbun) continue;
      const dateOnlyMatch = metaInfo.match(/\d{4}[\/\-]\d{2}[\/\-]\d{2}/);
      const stableMeta = dateOnlyMatch ? dateOnlyMatch[0] : metaInfo.substring(0, 10);
      const rawIdStr = titleOnly + stableMeta;
      const safeId = Utilities.base64EncodeWebSafe(Utilities.newBlob(rawIdStr).getBytes());
      articleId = "NKN_" + safeId.replace(/[^a-zA-Z0-9]/g, "").substring(0, 15);
    }

    if (existingIds.has(articleId)) continue;
    existingIds.add(articleId);

    let pdfUrl = "";
    const pdfName = articleId + ".pdf";
    const pdfFiles = folder.getFilesByName(pdfName);
    if (pdfFiles.hasNext()) {
      const pdfFile = pdfFiles.next();
      pdfUrl = pdfFile.getUrl();
      pdfFile.moveTo(processedFolder);
    }

    let rawContent = "";
    const textMatch = articleHtml.match(/<div[^>]*class="[^"]*text Honbun[^"]*"[^>]*>([\s\S]*?)(?:<\/form>|<\/section>|$)/i);
    if (textMatch) {
      rawContent = textMatch[1].replace(/<[^>]+>/g, '\n').trim();
    } else {
      rawContent = articleHtml.replace(/<[^>]+>/g, '\n').trim();
    }
    rawContent = cleanMhtNoise(rawContent);
    rawContent = rawContent.replace(/\s+PDF\s*$/i, '').replace(/\n\s*\n/g, '\n\n').trim();

    const safeContent = rawContent.length > 49000
      ? rawContent.substring(0, 49000) + "\n...（文字数上限により省略）"
      : rawContent;

    let tagsForRow, highlightsForRow, timelineForRow;
    if (skipGeminiForShort && isShortArticle(rawContent, shortArticleThreshold)) {
      tagsForRow = "未分類";
      highlightsForRow = rawContent;
      timelineForRow = "";
    } else {
      const geminiInputContent = rawContent.substring(0, maxInputChars);
      const fields = analyzeText(geminiInputContent, persona, syncPrompt, geminiApiKey, geminiModel, outputMode);
      tagsForRow = fields.tags;
      highlightsForRow = fields.highlights;
      timelineForRow = fields.timeline;
    }

    const dateOnlyMatch = metaInfo.match(/\d{4}[\/\-]\d{2}[\/\-]\d{2}/);
    const pubDateStr = dateOnlyMatch ? dateOnlyMatch[0] : Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd");

    sheet.appendRow([
      articleId,
      titleOnly,
      pdfUrl,
      tagsForRow,
      highlightsForRow,
      new Date(),
      'false',
      '',
      safeContent,
      metaInfo,
      pubDateStr,
      timelineForRow,
      file.getName(),
      '',
      ''
    ]);
    SpreadsheetApp.flush();

    addedCount++;
    Utilities.sleep(500);
  }

  return { addedCount: addedCount, isTimeOut: isTimeOut };
}

function fetchRaindropData(token) {
  if (!token) return [];
  const url = "https://api.raindrop.io/rest/v1/raindrops/0?perpage=50";
  const options = {
    method: "get",
    headers: { "Authorization": "Bearer " + token }
  };
  const response = UrlFetchApp.fetch(url, options);
  return JSON.parse(response.getContentText()).items || [];
}

function fetchDriveScreenshots(folderId, processedFolderId) {
  const folder = DriveApp.getFolderById(folderId);
  let processedFolder;
  if (processedFolderId) {
    try {
      processedFolder = DriveApp.getFolderById(processedFolderId);
    } catch (e) { processedFolder = null; }
  }

  if (!processedFolder) {
    const processedFolderName = "_processed";
    const subFolders = folder.getFoldersByName(processedFolderName);
    if (subFolders.hasNext()) {
      processedFolder = subFolders.next();
    } else {
      processedFolder = folder.createFolder(processedFolderName);
    }
  }

  const files = [];
  const fileIterator = folder.getFiles();
  while (fileIterator.hasNext()) {
    const file = fileIterator.next();
    files.push(file);
  }
  return { files, processedFolder };
}

function cleanHtml(html) {
  if (!html) return "";
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanMhtNoise(str) {
  if (!str) return "";
  return str
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-Fa-f]{2})/g, (match, hex) => {
      const code = parseInt(hex, 16);
      if (code === 0x3D) return '=';
      if (code < 0x20 || code === 0x7F) return ' ';
      if (code < 0x80) return String.fromCharCode(code);
      return match;
    })
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"');
}

// ---- Google Docs または一般Webサイトのテキスト抽出 ----
function fetchDriveFile(url) {
  try {
    const docMatch = url.match(/[-\w]{25,}/);
    if (url.includes("docs.google.com") && docMatch) {
      const id = docMatch[0];
      const doc = DocumentApp.openById(id);
      return { success: true, text: doc.getBody().getText(), title: doc.getName() };
    }

    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) {
      throw new Error("サイトにアクセスできませんでした（Status: " + res.getResponseCode() + "）");
    }

    const html = res.getContentText();
    const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
    let title = titleMatch ? titleMatch[1].trim() : "取り込んだ記事";
    let text = cleanHtml(html);
    if (text.length > 20000) text = text.substring(0, 20000) + "...(以下省略)";

    return { success: true, text: text, title: title };
  } catch (err) {
    return { success: false, error: "取り込みに失敗しました: " + err.message };
  }
}

// ---- 外部ハイライトデータ（未処理）の抽出 ----
function fetchUnprocessedHighlights(sourceSsId, sheetName) {
  try {
    const ss = SpreadsheetApp.openById(sourceSsId);
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return { success: false, error: "指定されたシートが見つかりません" };

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return { success: true, items: [] };

    const headers = data[0].map(h => String(h).trim().toLowerCase());
    let nobsidianIdx = headers.indexOf("nobsidian");
    if (nobsidianIdx === -1 && data[0].length >= 8) nobsidianIdx = 7;

    const col = {
      title: headers.indexOf("title") !== -1 ? headers.indexOf("title") : 1,
      url: headers.indexOf("url") !== -1 ? headers.indexOf("url") : 2,
      tags: headers.indexOf("tags") !== -1 ? headers.indexOf("tags") : 3,
      highlights: headers.indexOf("highlights") !== -1 ? headers.indexOf("highlights") : 4,
      saved_at: headers.indexOf("saved_at") !== -1 ? headers.indexOf("saved_at") : 5,
      nobsidian: nobsidianIdx
    };

    let timelineColIdx = headers.indexOf("timeline");
    if (timelineColIdx === -1) timelineColIdx = headers.indexOf("timeline_data");
    if (timelineColIdx === -1 && data[0].length >= 12) timelineColIdx = 11;

    let columnIIdx = headers.indexOf("all");
    if (columnIIdx === -1) columnIIdx = headers.indexOf("memo");
    if (columnIIdx === -1 && data[0].length >= 9) columnIIdx = 8;

    const items = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      let isProcessed = false;

      if (col.nobsidian !== -1) {
        const val = row[col.nobsidian];
        const valStr = String(val).trim().toLowerCase();
        if (valStr !== "" && valStr !== "false" && valStr !== "0") {
          isProcessed = true;
        }
      }

      if (!isProcessed) {
        items.push({
          rowIndex: i + 1,
          title: col.title !== -1 ? String(row[col.title]) : "無題",
          url: col.url !== -1 ? String(row[col.url]) : "",
          tags: col.tags !== -1 ? String(row[col.tags]) : "",
          highlights: col.highlights !== -1 ? String(row[col.highlights]) : "",
          saved_at: col.saved_at !== -1 ? String(row[col.saved_at]) : "",
          timeline: timelineColIdx !== -1 ? String(row[timelineColIdx]) : "",
          columnI: columnIIdx !== -1 ? String(row[columnIIdx]) : ""
        });
      }
    }

    return { success: true, items: items };
  } catch (err) {
    return { success: false, error: "未処理ハイライト抽出失敗: " + err.message };
  }
}

// ---- 取り込みしたハイライトデータに「処理済みマーク(true)」を書き込む ----
function markHighlightsProcessed(sourceSsId, sheetName, rowIndices) {
  try {
    const ss = SpreadsheetApp.openById(sourceSsId);
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return { success: false, error: "指定されたシートが見つかりません" };

    const data = sheet.getDataRange().getValues();
    const headers = data[0].map(h => String(h).trim().toLowerCase());

    let colIndex = headers.indexOf("nobsidian");
    if (colIndex === -1 && data[0].length >= 8) colIndex = 7;
    if (colIndex === -1) {
      colIndex = headers.length;
      sheet.getRange(1, colIndex + 1).setValue("nobsidian");
    }

    rowIndices.forEach(function(rowIndex) {
      if (rowIndex > 1 && rowIndex <= data.length) {
        sheet.getRange(rowIndex, colIndex + 1).setValue(true);
      }
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: "処理済みマークの反映に失敗しました: " + err.message };
  }
}

// ---- Google Drive への一括エクスポート ----
function saveToDrive(data) {
  try {
    const notes = data.notes || [];
    const centerTitle = data.centerTitle || (notes.length > 0 ? notes[0].title : "レポート");
    const reportText = data.reportText || "";

    const timeZone = Session.getScriptTimeZone() || "GMT+9";
    const dateStr = Utilities.formatDate(new Date(), timeZone, "yyyyMMdd");

    const safeCenterTitle = centerTitle.replace(/[\\/:*?"<>|]/g, "_").trim();
    let folderName = data.folderName ? data.folderName.replace(/[\\/:*?"<>|]/g, "_").trim() : `${safeCenterTitle}_${dateStr}`;

    const folder = DriveApp.createFolder(folderName);
    let savedFilesCount = 0;
    let savedPdfCount = 0;
    const downloadedPdfUrls = new Set();

    if (reportText && reportText.trim() !== "") {
      folder.createFile(`00_AI生成ナレッジレポート_${dateStr}.txt`, reportText, MimeType.PLAIN_TEXT);
      savedFilesCount++;
    }

    let combinedText = `# 全記事一覧・全文まとめ\n作成日時: ${Utilities.formatDate(new Date(), timeZone, "yyyy-MM-dd HH:mm:ss")}\n\n`;

    notes.forEach((note, index) => {
      const rawTitle = note.title || `記事_${index + 1}`;
      const noteTitle = rawTitle.replace(/[\\/:*?"<>|]/g, "_").trim();
      const noteContent = note.content || "";
      const sourceUrl = note.sourceUrl || "";
      const seqStr = String(index + 1).padStart(2, '0');

      let singleFileText = `タイトル: ${rawTitle}\n`;
      if (sourceUrl) singleFileText += `URL: ${sourceUrl}\n`;
      singleFileText += `\n------------------------------------------------------------\n【本文】\n\n${noteContent}`;

      folder.createFile(`${seqStr}_${noteTitle}.txt`, singleFileText, MimeType.PLAIN_TEXT);
      savedFilesCount++;

      combinedText += `【記事 ${index + 1}】 ${rawTitle}\n${sourceUrl ? 'URL: ' + sourceUrl + '\n' : ''}\n${noteContent}\n\n------------------------------------------------------------\n\n`;

      const textToScan = sourceUrl + "\n" + noteContent;
      const mdRegex = /\[([^\]]*)\]\((https?:\/\/[^\)\s]+)\)/gi;
      let mdMatch;
      while ((mdMatch = mdRegex.exec(textToScan)) !== null) {
        const cleanUrl = mdMatch[2].replace(/[\.\,\;\:]+$/, "");
        if (cleanUrl && !downloadedPdfUrls.has(cleanUrl)) {
          downloadedPdfUrls.add(cleanUrl);
          if (cleanUrl.includes("drive.google.com")) {
            const driveIdMatch = cleanUrl.match(/drive\.google\.com\/file\/d\/([^\/\?#]+)/i) || cleanUrl.match(/id=([^\&#]+)/i);
            if (driveIdMatch && driveIdMatch[1]) {
              try {
                const df = DriveApp.getFileById(driveIdMatch[1]);
                df.makeCopy(`${seqStr}_${noteTitle}_${df.getName()}`, folder);
                savedPdfCount++;
                savedFilesCount++;
              } catch (e) {}
            }
          }
        }
      }
    });

    folder.createFile(`00_全記事全文まとめ.txt`, combinedText, MimeType.PLAIN_TEXT);
    savedFilesCount++;

    return {
      success: true,
      status: "success",
      folderName: folder.getName(),
      folderUrl: folder.getUrl(),
      fileCount: savedFilesCount,
      pdfCount: savedPdfCount,
      message: `Google Driveに新規フォルダ「${folder.getName()}」を作成し、全ファイル(${savedFilesCount}件)を保存しました。`
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ==== Google Drive操作の初回権限承認用関数 ====
function authorizeDrivePermissions() {
  const tempFolder = DriveApp.createFolder("___Drive_Permission_Check___");
  tempFolder.setTrashed(true);
  Logger.log("✅ Google Drive (DriveApp) permissions authorized successfully!");
  return "✅ Google Driveの新規フォルダ作成・保存権限の承認が正常に完了しました！";
}

function importRawRowsToApp(sourceSsId, sheetName, targetSsId, targetSheetName, rowIndices) {
  try {
    const srcSs = SpreadsheetApp.openById(sourceSsId);
    const srcSheet = srcSs.getSheetByName(sheetName);
    if (!srcSheet) return { success: false, error: "取込元のシートが見つかりません" };

    let targetSs;
    if (targetSsId && targetSsId.trim() !== "") {
      try { targetSs = SpreadsheetApp.openById(targetSsId.trim()); } catch(e) { return { success: false, error: "取込先スプレッドシートを開けません" }; }
    } else { targetSs = SpreadsheetApp.getActiveSpreadsheet(); }

    const tSheetName = (targetSheetName && String(targetSheetName).trim()) ? String(targetSheetName).trim() : "Notes";
    let targetSheet = targetSs.getSheetByName(tSheetName);
    if (!targetSheet) targetSheet = targetSs.insertSheet(tSheetName);

        const srcData = srcSheet.getDataRange().getValues();
    const headers = srcData[0].map(h => String(h).trim().toLowerCase());

    if (targetSheet.getLastRow() === 0) {
      targetSheet.appendRow(["id", "title", "url", "tags", "highlights", "saved_at", "processed", "nobsidian", "all", "apendix", "date", "timeline", "source", "edited_content", "updated_at"]);
    }

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const baseLotName = yyyy + mm + dd;

    let maxLotNum = 0;
    if (targetSheet.getLastRow() > 1) {
      const targetData = targetSheet.getRange(2, 11, targetSheet.getLastRow() - 1, 1).getValues();
      for (const row of targetData) {
        const dVal = String(row[0]).trim();
        if (dVal === baseLotName) {
          if (maxLotNum < 1) maxLotNum = 1;
        } else if (dVal.startsWith(baseLotName + "-")) {
          const numStr = dVal.split("-")[1];
          const num = parseInt(numStr, 10);
          if (!isNaN(num) && num >= maxLotNum) {
            maxLotNum = num + 1;
          }
        }
      }
    }
    const currentLotName = maxLotNum === 0 ? baseLotName : baseLotName + "-" + maxLotNum;

    let addedCount = 0;

    for (const rIdx of rowIndices) {
      const row = srcData[rIdx - 1];
      if (!row) continue;

      const newRow = [];
      for (let i = 0; i < 15; i++) {
        newRow.push(row[i] !== undefined ? row[i] : "");
      }

      newRow[10] = currentLotName;
      newRow[13] = "";
      newRow[14] = "";

      targetSheet.appendRow(newRow);

      let nColIdx = headers.indexOf("nobsidian");
      if (nColIdx === -1) nColIdx = 7;
      srcSheet.getRange(rIdx, nColIdx + 1).setValue("IMPORTED");

      addedCount++;
    }

    return { success: true, count: addedCount };
  } catch (err) {
    return { success: false, error: err.message };
  }
}