/**
 * ====================================================================
 * Connected Notes: Google Apps Script (GAS) 統合バックエンドスクリプト
 * （スプレッドシート15列同期・N列以降追記・Raindrop/GoogleドライブMHT自動取り込み対応）
 * ====================================================================
 *
 * 【主要機能・修正内容】
 * ① Gemini APIキー & モデルの完全連携:
 *    - アプリ画面からの動的APIキー・モデル指定、およびスクリプトプロパティの双方に対応。
 *    - gemini-2.5-flash / gemini-2.0-flash / gemini-1.5-flash への自動フォールバックとレート制限(429)再試行を搭載。
 * ② D列（カテゴリ/タグ）の高精度自動抽出:
 *    - 【カテゴリ】や【カテゴリ・タグ】、【分野】、プロンプト指示文言の混入を完全除去し、1〜2語の明瞭なカテゴリ（太陽光発電、環境、半導体等）を正確に抽出。
 * ③ E列（AI要約・数値事実・市場影響・キーワード）の完全格納:
 *    - Geminiが生成した高品質な要約・事実・影響・キーワード分析をE列へ非破壊格納。
 * ④ L列（年表）の厳密な日付フィルタ:
 *    - 実際の西暦・和暦の日付を含む時系列行（[YYYY/MM/DD] 出来事）のみを抽出。日付のない記事で本文が誤ってL列に混入する不具合を完全根絶。
 * ⑤ MHTファイル内PDFリンクの二重取り込み防止（完全解消）:
 *    - MHT内の記事と紐付いたPDF（N番号、記事ID、西暦開始ファイル名、タイトル一致）を即座に「処理済みフォルダ」へ退避し、
 *      その後のファイルループで再度Gemini解析・スプレッドシートへの重複登録が行われることを100%防止。
 *
 * 【スプレッドシートの列構成（15列）】
 * A(id) B(title) C(url) D(tags) E(highlights) F(saved_at) G(processed) H(nobsidian)
 * I(all:本文原文) J(apendix:メタ情報) K(date:日付) L(timeline:年表) M(source:取得元)
 * N(edited_content:アプリ編集本文) O(updated_at:アプリ更新日時)
 *
 * ※ A〜M列の外部取り込み元データは非破壊で保持され、アプリ内での編集や加筆はN列・O列に追記されます。
 *
 * 【デプロイ手順】
 * 1. 右上の「デプロイ」 ＞ 「新しいデプロイ」 をクリック。
 * 2. 種類：「ウェブアプリ」、アクセスできるユーザー：「全員」（Anyone）を選択してデプロイ。
 * 3. 発行されたURL（.../exec）をアプリの「設定⚙」に貼り付けて保存します。
 */

// スクリプトプロパティの参照
const props = PropertiesService.getScriptProperties();

// システム設定のデフォルト値
const DEFAULT_CONFIG = {
  GEMINI_MODEL: 'gemini-2.5-flash',
  GEMINI_MAX_TOKENS: 8000,
  GEMINI_TEMPERATURE: 0.1,

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
※この記事の分野や分類を表すカテゴリ名を一言で簡潔に記載してください（例：太陽光発電、半導体、EV充電、金融政策 など短く1〜2語）。

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


必ず以下のフォーマットをそのまま含めて出力してください。

【カテゴリ】
（ここに「環境」「大気」「水質」「公募」などの単語を1つだけ出力）

【年表】
[YYYY/MM/DD] （本文中に日付がある場合のみ、日付と出来事を出力。日付がない場合は空行にすること）
※記事中の時系列情報や年表データを必ず「[西暦/月/日] 出来事」の形式（例：[2029/03/31] キオクシアの営業利益が約12倍に達するとの市場予想。）で箇条書き（改行区切り）で抽出してください。
※日付の後の出来事テキストは、内容がひと目でわかるよう「50~100文字程度」で簡潔にまとめてください。該当なしなら記載不要です。`
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
// ====================================================================

// テキスト記事（Raindrop記事・MHT記事）向け：自由回答モード（マルチモデル・フォールバック対応）
function callGeminiFree(content, persona, syncPrompt, apiKey, model) {
  if (!apiKey) {
    Logger.log("[Gemini] APIキーが未設定です。AI解析をスキップします。");
    return "";
  }

  const prompt = (persona ? persona + "\n\n" : "") + syncPrompt + "\n\n【データ】\n" + content;
  const targetModel = model || getConfig('GEMINI_MODEL') || "gemini-2.5-flash";
  const candidateModels = [targetModel, "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
  const uniqueModels = Array.from(new Set(candidateModels));

  for (const m of uniqueModels) {
    try {
      const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: getNumConfig('GEMINI_TEMPERATURE')
        }
      };

      const response = UrlFetchApp.fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`,
        { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true }
      );
      const responseCode = response.getResponseCode();
      if (responseCode === 200) {
        const resJson = JSON.parse(response.getContentText());
        const generatedText = (resJson.candidates && resJson.candidates[0].content && resJson.candidates[0].content.parts[0].text) || "";
        if (generatedText) {
          return generatedText;
        }
      } else if (responseCode === 429) {
        Logger.log(`[Gemini] Model ${m} rate limit (429). Retrying after 2s...`);
        Utilities.sleep(2000);
        const retryRes = UrlFetchApp.fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`,
          { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true }
        );
        if (retryRes.getResponseCode() === 200) {
          const resJson = JSON.parse(retryRes.getContentText());
          return (resJson.candidates && resJson.candidates[0].content && resJson.candidates[0].content.parts[0].text) || "";
        }
      } else {
        Logger.log(`[Gemini] Model ${m} HTTP ${responseCode}: ${response.getContentText()}`);
      }
    } catch (e) {
      Logger.log(`[Gemini] Error calling model ${m}: ${e.message}`);
    }
  }

  return "";
}

// PDF・画像向け：自由回答モード（マルチモデル・フォールバック対応）
function callGeminiFreeFile(file, apiKey, model, persona, syncPrompt) {
  if (!apiKey) {
    Logger.log("[Gemini] APIキーが未設定です。ファイル解析をスキップします。");
    return "";
  }

  const base64Data = Utilities.base64Encode(file.getBlob().getBytes());
  const prompt = (persona ? persona + "\n\n" : "") + syncPrompt +
    "\n\n【データ】\n(添付されたファイルの内容を読み取り、記載されているテキスト・図表の情報をもとに分析してください。ファイル名: " + file.getName() + ")";

  const targetModel = model || getConfig('GEMINI_MODEL') || "gemini-2.5-flash";
  const candidateModels = [targetModel, "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
  const uniqueModels = Array.from(new Set(candidateModels));

  for (const m of uniqueModels) {
    try {
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
        }
      };

      const response = UrlFetchApp.fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`,
        { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true }
      );
      const responseCode = response.getResponseCode();
      if (responseCode === 200) {
        const resJson = JSON.parse(response.getContentText());
        const generatedText = (resJson.candidates && resJson.candidates[0].content && resJson.candidates[0].content.parts[0].text) || "";
        if (generatedText) {
          return generatedText;
        }
      } else if (responseCode === 429) {
        Utilities.sleep(2000);
        const retryRes = UrlFetchApp.fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`,
          { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true }
        );
        if (retryRes.getResponseCode() === 200) {
          const resJson = JSON.parse(retryRes.getContentText());
          return (resJson.candidates && resJson.candidates[0].content && resJson.candidates[0].content.parts[0].text) || "";
        }
      } else {
        Logger.log(`[Gemini Vision] Model ${m} HTTP ${responseCode}: ${response.getContentText()}`);
      }
    } catch (e) {
      Logger.log(`[Gemini Vision] Error calling model ${m}: ${e.message}`);
    }
  }

  return "";
}

// ----------------------------------------------------
// テキスト整形用ヘルパー関数
// ----------------------------------------------------
function summarizeText(str, maxLen) {
  if (!str) return "";
  const len = maxLen || 100;
  let cleanStr = str.replace(/^[:：\s\-\]\]]+/, '').replace(/^\[YYYY\/MM\/DD\]\s*/i, '').trim();
  if (cleanStr.length <= len) return cleanStr;

  const sub = cleanStr.substring(0, len);
  const lastPeriod = sub.lastIndexOf('。');
  if (lastPeriod > 20) {
    return sub.substring(0, lastPeriod + 1);
  }

  const lastComma = Math.max(sub.lastIndexOf('、'), sub.lastIndexOf(' '));
  if (lastComma > 20) {
    return sub.substring(0, lastComma) + '。';
  }

  return sub + '。';
}

// カテゴリ（D列）の安全・高精度抽出関数
function extractCategoryFromText(text) {
  if (!text) return "一般";

  // 1. 【カテゴリ】や【カテゴリ・タグ】等のセクションから行単位で探索
  const sectionRegex = /(?:【\s*(?:カテゴリ(?:[・\/]タグ)?|タグ|分野|分類)\s*】|(?:カテゴリ|分野|分類|タグ)\s*[:：])\s*([\s\S]*?)(?=\n\s*【|\n\s*###|\n\s*---|$)/i;
  const match = text.match(sectionRegex);
  if (match && match[1]) {
    const lines = match[1].split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      let clean = line
        .replace(/[（\(].*?出力[）\)]/g, '')
        .replace(/[（\(].*?[）\)]/g, '')
        .replace(/^[#\-\*•:\s]+/, '')
        .replace(/^\[\[|\]\]$/g, '')
        .replace(/^#/, '')
        .trim();

      // 指示文やプレースホルダー行は除外して次行を検証
      if (!clean || clean.includes("ここに") || clean.includes("単語を1つ") || clean.includes("例：") || clean.includes("簡潔に記載") || clean.length > 25) {
        continue;
      }

      const firstWord = clean.split(/[,、\/\s・]/)[0].trim();
      if (firstWord && firstWord.length <= 20) {
        return firstWord;
      }
    }
  }

  // 2. ウィキリンク形式 [[用語]] からの抽出
  const wikiMatch = text.match(/\[\[([^\]]+)\]\]/);
  if (wikiMatch && wikiMatch[1]) {
    const term = wikiMatch[1].split(/[:：]/)[0].trim();
    if (term && term.length <= 20) return term;
  }

  // 3. ハッシュタグ #用語 からの抽出
  const hashMatch = text.match(/#([^\s#\[\]【】]+)/);
  if (hashMatch && hashMatch[1]) {
    const tag = hashMatch[1].trim();
    if (tag && tag.length <= 20) return tag;
  }

  return "一般";
}

// 年表（L列）の厳密な日付抽出関数
function extractTimelineFromText(text) {
  if (!text) return "";

  // パターンA: 【年表】【時系列】ブロックの抽出
  const timelineSectionMatch = text.match(/(?:【\s*(?:年表|時系列|経緯|スケジュール|歴史)\s*】|(?:年表|時系列|経緯)\s*[:：])\s*\n?([\s\S]*?)(?:\n【|$)/i);
  let timelineBlock = timelineSectionMatch ? timelineSectionMatch[1].trim() : "";

  if (timelineBlock) {
    const lines = timelineBlock.split(/\r?\n/).map(line => {
      let cleanLine = line.replace(/\[\s*(?:YYYY[/\-]MM[/\-]DD|YYYY[/\-]MM|YYYY)\s*\]/gi, '').trim();
      const hasDate = /(?:\d{4}年|\d{4}年度|\d{4}[\/\-]\d{1,2}|令和\d+年|\d{1,2}月\d{1,2}日|\[\d{4}[/.-])/.test(line);

      if (!hasDate || cleanLine.includes("該当なし") || cleanLine.includes("出来事テキスト") || cleanLine.includes("空行にすること")) {
        return null;
      }

      const bracketMatch = cleanLine.match(/^(\[\d{4}[^\]]*\])\s*(.*)/);
      if (bracketMatch) {
        const datePart = bracketMatch[1];
        let textPart = summarizeText(bracketMatch[2].trim(), 100);
        return `${datePart} ${textPart}`;
      }

      return summarizeText(cleanLine, 100);
    }).filter(Boolean);

    if (lines.length > 0) {
      return lines.join("\n");
    }
  }

  // パターンB: ブロックがない場合、テキスト全体から明確な日付行のみを抽出（日付なしなら空文字）
  const allLines = text.split(/\r?\n/);
  const dateLines = allLines.filter(l => /(?:\d{4}年\d{1,2}月|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}|\[\d{4}[\/\-]\d{1,2})/.test(l));
  
  if (dateLines.length > 0) {
    const extracted = [];
    for (const l of dateLines) {
      let clean = l.replace(/^[#\-\*•]\s*/, '').trim();
      if (clean.includes("出力構成") || clean.includes("プロンプト") || clean.includes("厳守事項")) continue;

      const ymd = clean.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
      const ym = clean.match(/(\d{4})年(\d{1,2})月/);
      const slashYmd = clean.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);

      let datePrefix = "";
      let eventText = clean;

      if (ymd) {
        datePrefix = `[${ymd[1]}/${String(ymd[2]).padStart(2, '0')}/${String(ymd[3]).padStart(2, '0')}]`;
        eventText = clean.replace(/(\d{4})年(\d{1,2})月(\d{1,2})日/, '').trim();
      } else if (slashYmd) {
        datePrefix = `[${slashYmd[1]}/${String(slashYmd[2]).padStart(2, '0')}/${String(slashYmd[3]).padStart(2, '0')}]`;
        eventText = clean.replace(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/, '').trim();
      } else if (ym) {
        datePrefix = `[${ym[1]}/${String(ym[2]).padStart(2, '0')}]`;
        eventText = clean.replace(/(\d{4})年(\d{1,2})月/, '').trim();
      }

      eventText = summarizeText(eventText, 100);
      if (eventText) {
        extracted.push(datePrefix ? `${datePrefix} ${eventText}` : eventText);
      }
    }
    return extracted.slice(0, 5).join("\n");
  }

  // ★重要：日付が一切存在しない場合は本文を詰め込まず、完全に空文字を返す
  return "";
}

// 解析テキストからスプレッドシート用フィールド（D列・E列・L列）を構築
function buildSheetFieldsFromFreeText(rawText, fallbackContent) {
  const text = (rawText && rawText.trim()) ? rawText : (fallbackContent || "");

  // 1. D列: カテゴリ/タグ
  const tags = extractCategoryFromText(text);

  // 2. E列: highlights（要約・具体的数値事実・市場影響・キーワード）
  let highlights = "";
  if (rawText && rawText.trim()) {
    // 【カテゴリ】ブロックと【年表】ブロックを排除し、本文要約・事実・影響・キーワードをそのまま格納
    let cleanHighlights = rawText
      .replace(/【\s*(?:カテゴリ(?:[・\/]タグ)?|タグ|分野|分類)\s*】[\s\S]*?(?=\n【|$)/gi, '')
      .replace(/(?:【\s*(?:年表|時系列|経緯|スケジュール|歴史)\s*】|(?:年表|時系列|経緯)\s*[:：])[\s\S]*?(?=\n【|$)/gi, '')
      .trim();

    highlights = cleanHighlights || rawText.substring(0, 1000);
  } else {
    highlights = (fallbackContent || "").replace(/\s+/g, ' ').substring(0, 350) + "...";
  }

  // 3. L列: timeline（年表）
  const timeline = extractTimelineFromText(text);

  return {
    tags: tags,
    highlights: highlights,
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
  return (persona ? persona + "\n\n" : "") + syncPrompt +
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
  const targetModel = model || getConfig('GEMINI_MODEL') || "gemini-2.5-flash";
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.1, responseMimeType: "application/json", responseSchema: UNIFIED_RESPONSE_SCHEMA }
  };
  try {
    const response = UrlFetchApp.fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}`,
      { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true }
    );
    if (response.getResponseCode() === 200) {
      const resJson = JSON.parse(response.getContentText());
      const rawText = resJson.candidates[0].content.parts[0].text;
      return normalizeGeminiResult(JSON.parse(rawText));
    }
  } catch (e) {
    console.error("Gemini(json/text) Error: " + e.message);
  }
  return { title: "", is_verbatim: false, summary: content.substring(0, 300), key_facts: [], market_impact: "", keywords: [], timeline: "" };
}

function callGeminiAnalyzeFile(file, apiKey, model, persona, syncPrompt) {
  if (!apiKey) {
    return { title: "", is_verbatim: true, summary: "ファイル名: " + file.getName(), key_facts: [], market_impact: "", keywords: [], timeline: "" };
  }
  const targetModel = model || getConfig('GEMINI_MODEL') || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}`;
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
    }
  } catch (e) {
    console.error("Gemini(json/vision) Error: " + e.message);
  }
  return { title: "", is_verbatim: true, summary: "解析完了: " + file.getName(), key_facts: [], market_impact: "", keywords: [], timeline: "" };
}

function buildSheetFieldsFromGeminiResult(parsed, rawContent) {
  const isVerbatim = parsed.is_verbatim || isShortArticle(rawContent);

  let tagsWikilinks = "一般";
  if (parsed.keywords && parsed.keywords.length > 0) {
    tagsWikilinks = parsed.keywords[0].term || "一般";
  }

  let highlightsText = "";
  if (isVerbatim) {
    highlightsText = (rawContent && rawContent.trim()) ? rawContent : (parsed.summary || "");
  } else {
    const parts = [];
    if (parsed.summary) parts.push("【要約】\n" + parsed.summary);
    if (parsed.key_facts && parsed.key_facts.length > 0) parts.push("【具体的数値・事実】\n・" + parsed.key_facts.join("\n・"));
    if (parsed.market_impact) parts.push("【市場・実務への影響】\n" + parsed.market_impact);
    if (parsed.keywords && parsed.keywords.length > 0) {
      parts.push("【キーワード】\n" + parsed.keywords.map(k => `- [[${k.term}]]: ${k.definition}`).join("\n"));
    }
    highlightsText = parts.join("\n\n");
  }

  return { tags: tagsWikilinks, highlights: highlightsText, timeline: parsed.timeline || "" };
}

// 共通ディスパッチャ
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

function isShortArticle(text, threshold) {
  const t = typeof threshold === 'number' ? threshold : getNumConfig('SHORT_ARTICLE_THRESHOLD');
  return !!text && text.length > 0 && text.length <= t;
}

// 保存先シート取得/自動生成
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

// ==== 統合リクエスト処理関数 ====
function processApiRequest(e) {
  if (!e) {
    return createJsonResponse({
      status: "ok",
      message: "Connected Notes Web API (GAS) は正常に稼働しています。"
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

// ---- ノート一覧取得 ----
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

// ---- ノート単体保存 ----
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
        note.sourceUrl !== undefined ? note.sourceUrl : (currentRow[2] || ""),
        note.keywords || currentRow[3] || "",
        note.summary || currentRow[4] || "",
        currentRow[5] || (note.createdAt ? new Date(note.createdAt) : new Date()),
        note.processed !== undefined ? note.processed : (currentRow[6] || 'false'),
        note.nobsidian !== undefined ? note.nobsidian : (currentRow[7] || ''),
        currentRow[8] || note.rawContent || "",
        currentRow[9] || note.metaInfo || note.columnJ || "",
        currentRow[10] || note.dateStr || "",
        note.timeline !== undefined ? note.timeline : (currentRow[11] || ""),
        currentRow[12] || note.source || "web_app",
        note.content || "",
        new Date()
      ];

      sheet.getRange(rowNum, 1, 1, 15).setValues([updatedRow]);
      return { success: true, action: "updated", id: note.id };
    }
  }

  const newRow = [
    note.id,
    note.title || "",
    note.sourceUrl || "",
    note.keywords || "",
    note.summary || "",
    note.createdAt ? new Date(note.createdAt) : new Date(),
    note.processed || 'false',
    note.nobsidian || '',
    note.rawContent || "",
    note.metaInfo || note.columnJ || "",
    note.dateStr || "",
    note.timeline || "",
    note.source || "web_app",
    note.content || "",
    new Date()
  ];
  sheet.appendRow(newRow);
  return { success: true, action: "created", id: note.id };
}

// ---- ノート削除 ----
function deleteNote(id, targetSheetName, targetSsUrl) {
  const sheet = getSheet(targetSheetName, targetSsUrl);
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { success: false, error: "データが空です" };

  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat().map(String);
  const idx = ids.indexOf(String(id));
  if (idx === -1) return { success: false, error: "該当IDのメモが見つかりません: " + id };

  sheet.deleteRow(idx + 2);
  return { success: true, deletedId: id };
}

// ---- 一括保存 ----
function saveAll(notes, targetSheetName, targetSsUrl) {
  const sheet = getSheet(targetSheetName, targetSsUrl);
  const lastRow = sheet.getLastRow();

  const existingMap = new Map();
  if (lastRow > 1) {
    const numCols = Math.max(15, sheet.getLastColumn());
    const data = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
    data.forEach(r => {
      if (r[0]) existingMap.set(String(r[0]), r);
    });
  }

  if (notes && notes.length > 0) {
    const rows = notes.map(n => {
      const exist = existingMap.get(String(n.id));
      if (exist) {
        return [
          n.id,
          n.title || exist[1] || "",
          n.sourceUrl !== undefined ? n.sourceUrl : (exist[2] || ""),
          n.keywords || exist[3] || "",
          n.summary || exist[4] || "",
          exist[5] || (n.createdAt ? new Date(n.createdAt) : new Date()),
          n.processed !== undefined ? n.processed : (exist[6] || 'false'),
          n.nobsidian !== undefined ? n.nobsidian : (exist[7] || ''),
          exist[8] || n.rawContent || "",
          exist[9] || n.metaInfo || n.columnJ || "",
          exist[10] || n.dateStr || "",
          n.timeline !== undefined ? n.timeline : (exist[11] || ""),
          exist[12] || n.source || "web_app",
          n.content || "",
          new Date()
        ];
      }
      return [
        n.id,
        n.title || "",
        n.sourceUrl || "",
        n.keywords || "",
        n.summary || "",
        n.createdAt ? new Date(n.createdAt) : new Date(),
        n.processed || 'false',
        n.nobsidian || '',
        n.rawContent || "",
        n.metaInfo || n.columnJ || "",
        n.dateStr || "",
        n.timeline || "",
        n.source || "web_app",
        n.content || "",
        new Date()
      ];
    });

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
  let processedFileCount = 0;
  let isTimeOut = false;
  let problematicItem = null;

  try {
    const sheet = getSheet(targetSheetName, targetSsUrl);
    const lastRow = sheet.getLastRow();

    // 既存スプレッドシートデータのインデックス作成（重複防止）
    const existingIds = new Set();
    const existingTitles = new Set();
    const existingUrls = new Set();
    const processedFileIds = new Set();
    const processedFileNames = new Set();

    if (lastRow > 1) {
      const numCols = Math.max(15, sheet.getLastColumn());
      const data = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
      for (const r of data) {
        if (r[0]) existingIds.add(String(r[0]).trim());
        if (r[1]) existingTitles.add(String(r[1]).trim().toLowerCase());
        if (r[2]) existingUrls.add(String(r[2]).trim());
      }
    }

    // APIキーの取得（フロント指定を最優先、次にスクリプトプロパティ）
    const geminiApiKey = config.geminiApiKey || props.getProperty('GEMINI_API_KEY') || "";
    const geminiModel = config.geminiModel || getConfig('GEMINI_MODEL') || "gemini-2.5-flash";
    const raindropToken = config.raindropToken || props.getProperty('RAINDROP_TOKEN') || "";

    const persona = config.persona || getConfig('SYSTEM_PERSONA');
    const syncPrompt = config.syncPrompt || getConfig('SYNC_PROMPT');
    const outputMode = config.outputMode || getConfig('OUTPUT_MODE');
    const maxInputChars = config.maxInputChars ? Number(config.maxInputChars) : getNumConfig('MAX_INPUT_CHARS');
    const shortArticleThreshold = config.shortArticleThreshold !== undefined
      ? Number(config.shortArticleThreshold) : getNumConfig('SHORT_ARTICLE_THRESHOLD');
    const skipGeminiForShort = config.skipGeminiForShortArticles !== undefined
      ? !!config.skipGeminiForShortArticles : getBoolConfig('SKIP_GEMINI_FOR_SHORT_ARTICLES');

    console.log(`syncExternalSources 開始: model=${geminiModel}, hasApiKey=${!!geminiApiKey}, outputMode=${outputMode}`);

    function extractFolderId(input) {
      if (!input || typeof input !== 'string') return "";
      const trimmedInput = input.trim();
      const urlMatch = trimmedInput.match(/\/folders\/([a-zA-Z0-9_-]+)/);
      if (urlMatch) return urlMatch[1];
      const isValidId = /^[a-zA-Z0-9_-]+$/.test(trimmedInput);
      if (isValidId) return trimmedInput;
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
              headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
            };
            const response = UrlFetchApp.fetch(item.link, fetchOptions);

            if (response.getResponseCode() === 200) {
              const html = response.getContentText();
              cleanText = html
                .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
                .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
                .replace(/<[^>]+>/g, " ")
                .replace(/\s+/g, " ")
                .trim();

              if (skipGeminiForShort && isShortArticle(cleanText, shortArticleThreshold)) {
                keyword = "未分類";
                summary = cleanText;
                timelineForRow = "";
              } else {
                const geminiInput = cleanText.substring(0, maxInputChars);
                const fields = analyzeText(geminiInput, persona, syncPrompt, geminiApiKey, geminiModel, outputMode);
                keyword = fields.tags;
                summary = fields.highlights;
                timelineForRow = fields.timeline;
              }
            } else {
              summary = "【記事本文の取得に失敗 (HTTP " + response.getResponseCode() + ")】" + (item.excerpt || "");
            }
          } catch (e) {
            summary = "【取得エラー】" + e.message + " / " + (item.excerpt || "");
          }

          if (manualHighlights) {
            summary = (summary ? summary + "\n\n" : "") + "【手動ハイライト】\n" + manualHighlights;
          }

          const safeContent = cleanText.length > 49000
            ? cleanText.substring(0, 49000) + "\n...（文字数上限により省略）"
            : cleanText;

          sheet.appendRow([
            id,
            item.title,
            item.link,
            keyword,
            summary,
            item.created || new Date(),
            'false',
            '',
            safeContent,
            item.excerpt || "",
            pubDateStr,
            timelineForRow,
            'raindrop',
            '',
            ''
          ]);
          SpreadsheetApp.flush();
          existingIds.add(id);
          addedCount++;
          Utilities.sleep(500);
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

      // MHTファイルを先頭にソートして、PDFより先にMHT記事の解析とPDF紐付けを行う
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

        const fileId = file.getId();
        const fileName = file.getName();
        const fileNameLower = fileName.toLowerCase();
        const fileBaseName = fileName.replace(/\.[^/.]+$/, "").trim();

        // ★MHT処理等で既に紐付け・処理済みのファイルを完全にスキップ
        if (processedFileIds.has(fileId) || processedFileNames.has(fileNameLower) || existingUrls.has(file.getUrl())) {
          console.log(`ファイル [${fileName}] は既にMHT紐付け/登録済みのためスキップします。`);
          try { file.moveTo(processedFolder); } catch (e) {}
          continue;
        }

        // 親フォルダ確認（既に処理済みフォルダに移動されている場合）
        try {
          const parents = file.getParents();
          let inSourceFolder = false;
          while (parents.hasNext()) {
            if (parents.next().getId() === driveFolderId) {
              inSourceFolder = true;
              break;
            }
          }
          if (!inSourceFolder) {
            console.log(`ファイル [${fileName}] はすでに移動されているため処理をスキップします。`);
            continue;
          }
        } catch (e) {
          console.warn(`[${fileName}] の親フォルダ確認エラー: ${e.message}`);
        }

        processedFileCount++;

        try {
          if (fileNameLower.endsWith('.mht') || fileNameLower.endsWith('.mhtml')) {
            let mhtResult = { addedCount: 0, isTimeOut: false };
            try {
              mhtResult = processMhtFile_Advanced(
                file, sheet, existingIds, existingUrls, existingTitles, processedFileIds, processedFileNames,
                persona, syncPrompt, driveFolderId, processedFolder,
                geminiApiKey, geminiModel, outputMode, maxInputChars, shortArticleThreshold, skipGeminiForShort
              );
            } finally {
              processedFileIds.add(file.getId());
              processedFileNames.add(fileNameLower);
              file.moveTo(processedFolder);
            }
            addedCount += mhtResult.addedCount;
            if (mhtResult.isTimeOut) { isTimeOut = true; break; }

          } else if (fileNameLower.endsWith('.pdf')) {
            // PDFファイル単体処理: 既存ID・タイトルと重複している場合はスキップ
            if (existingIds.has(fileBaseName) || existingTitles.has(fileBaseName.toLowerCase())) {
              console.log(`PDF [${fileName}] は既存データと重複のためスキップします。`);
              processedFileIds.add(file.getId());
              processedFileNames.add(fileNameLower);
              file.moveTo(processedFolder);
              continue;
            }

            const fields = analyzeFile(file, geminiApiKey, geminiModel, persona, syncPrompt, outputMode);
            const pubDateStr = Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd");
            sheet.appendRow([
              fileBaseName,
              fileBaseName,
              file.getUrl(),
              fields.tags,
              fields.highlights,
              new Date(),
              'false',
              '',
              '',
              '',
              pubDateStr,
              fields.timeline,
              fileName,
              '',
              ''
            ]);
            SpreadsheetApp.flush();
            existingIds.add(fileBaseName);
            existingTitles.add(fileBaseName.toLowerCase());
            existingUrls.add(file.getUrl());
            processedFileIds.add(file.getId());
            processedFileNames.add(fileNameLower);
            addedCount++;
            file.moveTo(processedFolder);

          } else {
            // 画像・スクリーンショット処理
            const ssId = 'ss_' + file.getId();
            if (!existingIds.has(ssId)) {
              const fields = analyzeFile(file, geminiApiKey, geminiModel, persona, syncPrompt, outputMode);
              const pubDateStr = Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd");
              sheet.appendRow([
                ssId,
                fileName,
                file.getUrl(),
                fields.tags,
                fields.highlights,
                new Date(),
                'false',
                '',
                '',
                '',
                pubDateStr,
                fields.timeline,
                fileName,
                '',
                ''
              ]);
              SpreadsheetApp.flush();
              existingIds.add(ssId);
              existingUrls.add(file.getUrl());
              processedFileIds.add(file.getId());
              processedFileNames.add(fileNameLower);
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
      processedCount: processedFileCount,
      isTimeOut: isTimeOut,
      problematicItem: problematicItem,
      sheetName: sheet.getName(),
      outputMode: outputMode
    };

  } catch (e) {
    throw new Error(`外部同期中にエラーが発生しました: ${e.message}`);
  }
}

// --------------------------------------------------------------------
// MHTファイル内のPDF探索・紐付けヘルパー（N番号・記事ID・西暦・タイトル照合対応）
// --------------------------------------------------------------------
function findAndLinkMatchingPdf(articleHtml, articleId, titleOnly, metaInfo, folder, processedFolder, processedFileIds, processedFileNames, existingUrls) {
  let pdfUrl = "";

  // 1. Quoted-Printableデコード
  const decodedHtml = articleHtml.replace(/=\r?\n/g, '').replace(/=3D/g, '=');

  // 2. パターンA: HTML内の「N + 10〜16桁数字」（例: N202410150001.pdf）
  const nMatches = decodedHtml.match(/\b(N\d{10,16})\b/gi);
  if (nMatches && nMatches.length > 0) {
    const uniqueCandidates = Array.from(new Set(nMatches));
    for (const candidate of uniqueCandidates) {
      const targetPdfName = candidate + ".pdf";
      try {
        const pdfFiles = folder.getFilesByName(targetPdfName);
        if (pdfFiles.hasNext()) {
          const pdfFile = pdfFiles.next();
          pdfUrl = pdfFile.getUrl();
          processedFileIds.add(pdfFile.getId());
          processedFileNames.add(pdfFile.getName().toLowerCase());
          existingUrls.add(pdfUrl);
          try { pdfFile.moveTo(processedFolder); } catch(e) {}
          return pdfUrl;
        }
      } catch(e) {}
    }
  }

  // 3. パターンB: 記事ID.pdf での検索
  if (articleId) {
    const defaultPdfName = articleId + ".pdf";
    try {
      const fallbackFiles = folder.getFilesByName(defaultPdfName);
      if (fallbackFiles.hasNext()) {
        const pdfFile = fallbackFiles.next();
        pdfUrl = pdfFile.getUrl();
        processedFileIds.add(pdfFile.getId());
        processedFileNames.add(pdfFile.getName().toLowerCase());
        existingUrls.add(pdfUrl);
        try { pdfFile.moveTo(processedFolder); } catch(e) {}
        return pdfUrl;
      }
    } catch(e) {}
  }

  // 4. パターンC: 西暦（4桁）およびタイトルキーワードによる照合
  const cleanTitle = titleOnly.replace(/[\\/:*?"<>|\s　]/g, "");
  const titleKeywords = cleanTitle.length > 3 ? cleanTitle.substring(0, 10) : cleanTitle;
  const yearMatch = (metaInfo + " " + titleOnly).match(/\b(\d{4})\b/);

  try {
    const pdfFiles = folder.getFilesByType(MimeType.PDF);
    while (pdfFiles.hasNext()) {
      const pdfFile = pdfFiles.next();
      const pdfId = pdfFile.getId();
      const pdfName = pdfFile.getName();
      const pdfNameLower = pdfName.toLowerCase();
      const pdfBaseName = pdfName.replace(/\.[^/.]+$/, "");

      if (processedFileIds.has(pdfId) || processedFileNames.has(pdfNameLower)) {
        continue;
      }

      let isMatch = false;

      // 西暦から始まるPDFファイル名の場合の照合（例: 20241015_xxx.pdf, 2024-10-15_xxx.pdf）
      if (yearMatch && pdfBaseName.startsWith(yearMatch[1])) {
        if (titleKeywords && (pdfBaseName.includes(titleKeywords) || cleanTitle.includes(pdfBaseName.substring(4).replace(/^[\-_]/, '')))) {
          isMatch = true;
        }
      }

      // タイトル部分一致での照合
      if (!isMatch && cleanTitle.length >= 4 && titleKeywords.length >= 4) {
        if (pdfBaseName.replace(/[\\/:*?"<>|\s　]/g, "").includes(titleKeywords) || cleanTitle.includes(pdfBaseName.replace(/[\\/:*?"<>|\s　]/g, "").substring(0, 8))) {
          isMatch = true;
        }
      }

      if (isMatch) {
        pdfUrl = pdfFile.getUrl();
        processedFileIds.add(pdfId);
        processedFileNames.add(pdfNameLower);
        existingUrls.add(pdfUrl);
        try { pdfFile.moveTo(processedFolder); } catch(e) {}
        return pdfUrl;
      }
    }
  } catch(e) {}

  return "";
}

// MHTファイル高度解析エンジン
function processMhtFile_Advanced(
  file, sheet, existingIds, existingUrls, existingTitles, processedFileIds, processedFileNames,
  persona, syncPrompt, driveFolderId, processedFolder,
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

    // --- PDFファイル名の抽出と紐付け ---
    const pdfUrl = findAndLinkMatchingPdf(
      articleHtml, articleId, titleOnly, metaInfo, folder, processedFolder,
      processedFileIds, processedFileNames, existingUrls
    );

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
    const pubDateStr = dateOnlyMatch ? dateOnlyMatch[0] : Utilities.formatDate(file.getDateCreated(), "JST", "yyyy/MM/dd");

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
    headers: { "Authorization": "Bearer " + token },
    muteHttpExceptions: true
  };
  try {
    const response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() === 200) {
      const json = JSON.parse(response.getContentText());
      return json.items || [];
    }
  } catch (e) {
    console.error("Raindrop API取得エラー: " + e.message);
  }
  return [];
}

function fetchDriveScreenshots(folderId, processedFolderId) {
  const folder = DriveApp.getFolderById(folderId);
  let processedFolder;
  if (processedFolderId) {
    try {
      processedFolder = DriveApp.getFolderById(processedFolderId);
    } catch(e) {
      processedFolder = null;
    }
  }
  if (!processedFolder) {
    const subFolders = folder.getFoldersByName("_processed");
    if (subFolders.hasNext()) {
      processedFolder = subFolders.next();
    } else {
      processedFolder = folder.createFolder("_processed");
    }
  }

  const files = [];
  const fileIterator = folder.getFiles();
  while (fileIterator.hasNext()) {
    const file = fileIterator.next();
    const mime = file.getMimeType();
    const name = file.getName().toLowerCase();
    if (mime.startsWith('image/') || mime === MimeType.PDF || name.endsWith('.mht') || name.endsWith('.mhtml') || name.endsWith('.pdf')) {
      files.push(file);
    }
  }
  return { files: files, processedFolder: processedFolder };
}

function cleanMhtNoise(text) {
  if (!text) return "";
  return text
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/[\r\t]/g, ' ')
    .trim();
}

function fetchDriveFile(url) {
  try {
    const match = url.match(/[-\w]{25,}/);
    if (!match) return { success: false, error: "無効なGoogle Drive URLです" };
    const file = DriveApp.getFileById(match[0]);
    const blob = file.getBlob();
    return {
      success: true,
      dataUrl: "data:" + blob.getContentType() + ";base64," + Utilities.base64Encode(blob.getBytes()),
      mimeType: blob.getContentType(),
      name: file.getName()
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function fetchUnprocessedHighlights(sourceSsId, sheetName) {
  try {
    const ss = SpreadsheetApp.openById(sourceSsId);
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return { success: false, error: "指定されたシートが見つかりません" };

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return { success: true, count: 0, items: [] };

    const headers = data[0].map(h => String(h).trim().toLowerCase());
    let nColIdx = headers.indexOf("nobsidian");
    if (nColIdx === -1) nColIdx = 7;

    const rows = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const status = String(row[nColIdx] || "").trim().toUpperCase();
      if (status !== "IMPORTED" && status !== "TRUE" && status !== "PROCESSED") {
        rows.push({
          rowIndex: i + 1,
          id: row[0],
          title: row[1],
          url: row[2],
          tags: row[3],
          highlights: row[4],
          saved_at: row[5],
          processed: row[6],
          nobsidian: row[7],
          all: row[8],
          apendix: row[9],
          date: row[10],
          timeline: row[11],
          source: row[12]
        });
      }
    }
    return { success: true, count: rows.length, items: rows };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function markHighlightsProcessed(sourceSsId, sheetName, rowIndices) {
  try {
    const ss = SpreadsheetApp.openById(sourceSsId);
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return { success: false, error: "指定されたシートが見つかりません" };

    const data = sheet.getDataRange().getValues();
    const headers = data[0].map(h => String(h).trim().toLowerCase());
    let nColIdx = headers.indexOf("nobsidian");
    if (nColIdx === -1) nColIdx = 7;

    for (const rIdx of rowIndices) {
      if (rIdx >= 2 && rIdx <= data.length) {
        sheet.getRange(rIdx, nColIdx + 1).setValue("IMPORTED");
      }
    }
    return { success: true, count: rowIndices.length };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function saveToDrive(params) {
  try {
    const rawFolderName = params.folderName || "ConnectedNotes_Export";
    const notes = typeof params.notes === "string" ? JSON.parse(params.notes) : (params.notes || []);

    let folder;
    const existingFolders = DriveApp.getFoldersByName(rawFolderName);
    if (existingFolders.hasNext()) {
      folder = existingFolders.next();
    } else {
      folder = DriveApp.createFolder(rawFolderName);
    }

    let savedFilesCount = 0;
    let savedPdfCount = 0;
    let combinedText = `=== Connected Notes まとめ (${rawFolderName}) ===\n出力日時: ${Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd HH:mm:ss")}\n記事総数: ${notes.length}件\n\n`;

    const downloadedPdfUrls = new Set();

    notes.forEach((note, index) => {
      const seqStr = String(index + 1).padStart(3, '0');
      const rawTitle = note.title || `記事_${index + 1}`;
      const noteTitle = rawTitle.replace(/[\\/:*?"<>|]/g, "_").substring(0, 40);
      const noteContent = note.content || note.rawContent || note.summary || "";
      const sourceUrl = note.sourceUrl || "";

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
      targetSheet.appendRow([
        "id", "title", "url", "tags", "highlights", "saved_at", 
        "processed", "nobsidian", "all", "apendix", "date", 
        "timeline", "source", "folder_name", "edited_content", "updated_at"
      ]);
    }

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const baseLotName = yyyy + mm + dd;

    let maxLotNum = 0;
    if (targetSheet.getLastRow() > 1) {
      const targetData = targetSheet.getRange(2, 14, targetSheet.getLastRow() - 1, 1).getValues();
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
      for (let i = 0; i < 16; i++) {
        newRow.push(row[i] !== undefined ? row[i] : "");
      }

      newRow[13] = currentLotName;
      if (row[14] === undefined) newRow[14] = "";
      if (row[15] === undefined) newRow[15] = "";

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
