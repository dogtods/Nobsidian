/**
 * 設定値
 */
const props = PropertiesService.getScriptProperties();

const RAINDROP_TOKEN = props.getProperty('RAINDROP_TOKEN');
const GEMINI_API_KEY = props.getProperty('GEMINI_API_KEY');

const NOTION_TOKEN = props.getProperty('NOTION_TOKEN');
const NOTION_DATABASE_ID = props.getProperty('NOTION_DATABASE_ID');
const MY_EMAIL = props.getProperty('MY_EMAIL');
const SHEET_ID = props.getProperty('SHEET_ID');
const SCREENSHOT_FOLDER_ID = props.getProperty('SCREENSHOT_FOLDER_ID');

/**
 * システム設定のデフォルト値
 */
const DEFAULT_CONFIG = {
  GEMINI_MODEL: 'gemini-1.5-flash',
  GEMINI_MAX_TOKENS: 8000,
  GEMINI_TEMPERATURE: 0.1,
  SYSTEM_PERSONA: "あなたは環境ビジネスの営業職です。",
  SYNC_PROMPT: "具体的な数字、事実、市場への影響、主要なナレッジを重点的に抽出し、1000文字程度で要約してください。抽象的な一般論は不要です。\nまた、この内容が属する分野を示すキーワードを1つだけ作成してください。",
  REPORT_PROMPT: "今週のナレッジを統合し、戦略的な示唆を含むレポートを作成してください。",
  VOICE_PROMPT: "環境ビジネスの戦略アドバイザー視点で、営業マンが隙間時間に「音声で聞き流すためのアナウンサー原稿」を作成してください。",
  REPORT_ITEMS: "マクロ環境の変化と共通テーマ\n各記事の要点と市場へのインパクト\n顧客の潜在的課題と分析ニーズの推論\n提案時の「反論・リスク」と「死角」\n実行すべき戦略的営業アクション（3つ）\n深掘りすべきキーワードと次の情報取得の優先順位",
  VOICE_ITEMS: "簡潔な全体要約\n耳で聞いてわかりやすい重要キーワードの解説\n明日から使える営業トークのフック",
  ENGLISH_PROMPT: "# 目的\n提供する日本語のニュース記事を、英語学習に最適な教材へと変換してください。\n変換後の英語テキストは、音声読み上げ機能（TTS）で聴くことを前提とした自然な表現にしてください。\n\n# 出力フォーマット\n以下の構成のみを出力してください。余計な挨拶や解説は不要です。\n\n---\n■ 1. ニュースの英語要約（目標：{{LEVEL}}）\n[ニュースの要約を150語程度の自然な英語で記述]\n\n■ 2. 重要ボキャブラリー（5選）\n[英単語/表現] (品詞) - [日本語の意味]\n例文: [その単語を使った短い英語の例文]\n\n■ 3. 音読・シャドーイング用一言フレーズ\n[日常会話やビジネスで応用できる、ニュースから抽出した1文]\nカタカナ発音: [日本人が発音しやすいカタカナ表記]\n---\n\n# ニュース記事（日本語）"
};

/**
 * 設定値を取得する（スクリプトプロパティ優先、なければデフォルト）
 */
function getConfig(key) {
  const val = props.getProperty(key);
  return val !== null ? val : DEFAULT_CONFIG[key];
}

// 動的な設定値の参照
const GEMINI_MODEL = getConfig('GEMINI_MODEL');
const GEMINI_MAX_TOKENS = parseInt(getConfig('GEMINI_MAX_TOKENS'));
const GEMINI_TEMPERATURE = parseFloat(getConfig('GEMINI_TEMPERATURE'));

/**
 * メイン関数：週次レポートの生成
 */
function weeklyReport() {
  try {
    console.log("データの同期を開始します...");
    syncAllExternalSources();

    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheets()[0];
    const data = sheet.getDataRange().getValues();

    const unprocessedItems = [];
    const unprocessedIndices = [];

    for (let i = 1; i < data.length; i++) {
      if (data[i][6] === false || data[i][6] === 'false') {
        unprocessedItems.push({
          title: data[i][1],
          url: data[i][2],
          highlights: data[i][4]
        });
        unprocessedIndices.push(i + 1);
      }
    }

    if (unprocessedItems.length === 0) {
      GmailApp.sendEmail(MY_EMAIL, "【通知】週次レポート対象記事なし", "今週、未処理の記事はありませんでした。");
      return;
    }

    const today = new Date();
    const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const dateRange = Utilities.formatDate(lastWeek, "JST", "MM/dd") + " - " + Utilities.formatDate(today, "JST", "MM/dd");

    console.log("Geminiによる分析を開始します...");
    const reportText = analyzeWithGemini(unprocessedItems);

    // console.log("Notionへ保存中...");
    // saveToNotion(reportText, unprocessedItems.length, dateRange);

    console.log("メールを送信中...");
    sendReportEmail(reportText, unprocessedItems.length, dateRange);

    unprocessedIndices.forEach(rowIdx => {
      sheet.getRange(rowIdx, 7).setValue('true');
    });

    console.log("週次レポート処理が完了しました。");

  } catch (e) {
    console.error("Error in weeklyReport: " + e.message);
  }
}

/**
 * RaindropとGoogleドライブのデータをスプレッドシートに同期する（選択・時間制限対応版）
 *
 * 【列構成】全ソース共通で10列に統一（★修正：列ズレ防止）
 * A(id) B(title) C(url) D(tags) E(highlights) F(saved_at) G(processed) H(予備) I(本文) J(メタ情報)
 */
function syncAllExternalSources(options) {
  const config = options || { raindrop: true, drive: false };
  const START_TIME = Date.now();
  const TIME_LIMIT = 3.5 * 60 * 1000;

  let currentProcessing = "処理の準備中";

  try {
    const props = PropertiesService.getScriptProperties();
    const sheetId = props.getProperty('SHEET_ID');
    const ss = SpreadsheetApp.openById(sheetId);
    const sheet = ss.getSheets()[0];

    const lastRow = sheet.getLastRow();
    const existingIds = lastRow > 0 ? new Set(sheet.getRange(1, 1, lastRow, 1).getValues().flat().map(String)) : new Set();

    let addedCount = 0;
    let isTimeOut = false;
    let problematicItem = null;

    // --- A. Raindropからの取得 ---
    if (config.raindrop === true) {
      console.log("Raindropの同期を開始します...");
      const raindropItems = fetchRaindropData(props.getProperty('RAINDROP_TOKEN'));

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

          try {
            if (item.link.includes("go.jp")) {
              keyword = "🚨手動要";
              summary = "サイト構造が複雑なため自動取得をスキップしました。手動での確認を推奨します。";
              let pubDateStr = item.created ? Utilities.formatDate(new Date(item.created), "JST", "yyyy/MM/dd") : Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd");
              // ★修正: 11列で書き込み（H・I・J は空文字、K列に発行日/取り込み日）
              sheet.appendRow([id, item.title, item.link, keyword, summary, item.created, 'false', '', '', '', pubDateStr]);
              SpreadsheetApp.flush();
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
              let rawHtml = response.getContentText();
              let cleanText = cleanHtml(rawHtml); // ★修正: HTMLタグを除去してトークン節約

              const persona = config.persona || getConfig('SYSTEM_PERSONA');
              const syncPrompt = config.syncPrompt || getConfig('SYNC_PROMPT');
              const prompt = persona + "\n" + syncPrompt + "\n出力はJSON形式{\n \"keyword\": \"\", \"summary\": \"\"\n}\n\n【データ】\n" + cleanText.substring(0, 20000); // 念のため上限設定
              const payload = { "contents": [{ "parts": [{ "text": prompt }] }], "generationConfig": { "responseMimeType": "application/json", "temperature": 0.1 } };

              const responseGemini = UrlFetchApp.fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, { "method": "post", "contentType": "application/json", "payload": JSON.stringify(payload), "muteHttpExceptions": true });

              if (responseGemini.getResponseCode() === 200) {
                const resJson = JSON.parse(responseGemini.getContentText());
                let text = resJson.candidates[0].content.parts[0].text.replace(/```json/g, '').replace(/```/g, '').trim();
                const result = JSON.parse(text);
                keyword = result.keyword;
                summary = manualHighlights ? manualHighlights + "\n\n【自動要約】\n" + result.summary : result.summary;

                let pubDateStr = item.created ? Utilities.formatDate(new Date(item.created), "JST", "yyyy/MM/dd") : Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd");
                // ★修正: 11列で書き込み（H・I・J は空文字、K列に発行日/取り込み日）
                sheet.appendRow([id, item.title, item.link, keyword, summary, item.created, 'false', '', '', '', pubDateStr]);
                SpreadsheetApp.flush();
                addedCount++;
              } else {
                throw new Error("Gemini API Error");
              }
            } else {
              keyword = "🚨手動要";
              summary = `アクセス拒否 (Status: ${response.getResponseCode()})`;
              let pubDateStr = item.created ? Utilities.formatDate(new Date(item.created), "JST", "yyyy/MM/dd") : Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd");
              // ★修正: 11列で書き込み
              sheet.appendRow([id, item.title, item.link, keyword, summary, item.created, 'false', '', '', '', pubDateStr]);
              SpreadsheetApp.flush();
              addedCount++;
            }
          } catch (e) {
            keyword = "🚨手動要";
            summary = `解析エラー: ${e.message}`;
            let pubDateStr = item.created ? Utilities.formatDate(new Date(item.created), "JST", "yyyy/MM/dd") : Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd");
            // ★修正: 11列で書き込み
            sheet.appendRow([id, item.title, item.link, keyword, summary, item.created, 'false', '', '', '', pubDateStr]);
            SpreadsheetApp.flush();
            addedCount++;

            isTimeOut = true;
            problematicItem = { title: item.title, url: item.link, reason: e.message };
            break;
          }
        }
      }
    }

    // --- B. Googleドライブからの取得 ---
    if (config.drive === true && isTimeOut === false) {
      console.log("Googleドライブの同期を開始します...");
      const driveFolderId = props.getProperty('SCREENSHOT_FOLDER_ID');
      const persona = config.persona || getConfig('SYSTEM_PERSONA');
      const syncPrompt = config.syncPrompt || getConfig('SYNC_PROMPT');

      if (driveFolderId) {
        const { files, processedFolder } = fetchDriveScreenshots(driveFolderId);

        // ★修正: MHTファイルを必ずPDFより先に処理（PDF紐付けの精度確保のため）
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
          if (Date.now() - START_TIME > TIME_LIMIT) { isTimeOut = true; break; }

          const fileName = file.getName();
          const fileNameLower = fileName.toLowerCase();

          try {
            if (fileNameLower.endsWith('.mht') || fileNameLower.endsWith('.mhtml')) {
              // MHTルート: 記事を分割して複数行書き込み・PDF紐付けも内部で実行
              // ★修正: エラー発生時もMHTを必ず移動する（残留→再処理ループを防止）
              let mhtResult = { addedCount: 0, isTimeOut: false };
              try {
                mhtResult = processMhtFile_Advanced(file, sheet, existingIds, persona, syncPrompt, driveFolderId, processedFolder);
              } finally {
                file.moveTo(processedFolder); // 成功・失敗に関わらず必ず移動
              }
              addedCount += mhtResult.addedCount;
              if (mhtResult.isTimeOut) { isTimeOut = true; break; }

            } else if (fileNameLower.endsWith('.pdf')) {
              // PDFルート: ファイル名から記事IDを取得
              const articleId = fileName.replace(/\.[^/.]+$/, "");

              if (existingIds.has(articleId)) {
                // MHT側で取り込み済みなら移動のみ
                console.log(`スキップ: PDF ${articleId} は既に取り込まれています。`);
                file.moveTo(processedFolder);
                continue;
              }

              // 未取り込みの単体PDFのみGemini処理
              const result = callGeminiVision(file);
              let pubDateStr = Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd");
              // ★修正: 11列で書き込み（H・I・J は空文字、K列に発行日/取り込み日）
              sheet.appendRow([articleId, articleId, file.getUrl(), result.keyword, result.summary, new Date(), 'false', '', '', '', pubDateStr]);
              SpreadsheetApp.flush();
              existingIds.add(articleId);
              addedCount++;
              file.moveTo(processedFolder);

            } else {
              // スクリーンショット等の画像（従来通り）
              const ssId = 'ss_' + file.getId();
              if (!existingIds.has(ssId)) {
                const result = callGeminiVision(file);
                let pubDateStr = Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd");
                // ★修正: 11列で書き込み（H・I・J は空文字、K列に発行日/取り込み日）
                sheet.appendRow([ssId, fileName, file.getUrl(), result.keyword, result.summary, new Date(), 'false', '', '', '', pubDateStr]);
                SpreadsheetApp.flush();
                existingIds.add(ssId);
                addedCount++;
                file.moveTo(processedFolder);
              } else {
                file.moveTo(processedFolder);
              }
            }
          } catch (e) {
            console.error(`ファイル解析エラー (${fileName}): ${e.message}`);
          }
        }
      }
    }

    return { success: true, addedCount: addedCount, isTimeOut: isTimeOut, problematicItem: problematicItem };

  } catch (e) {
    const errMsg = e.message || String(e);
    throw new Error(`処理中に致命的なクラッシュが発生しました。\n👉 原因: ${currentProcessing}\n詳細: ${errMsg}`);
  }
}

/**
 * Gemini Vision APIを呼び出してファイルの内容を要約
 */
function callGeminiVision(file) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const base64Data = Utilities.base64Encode(file.getBlob().getBytes());

  const prompt = getConfig('SYSTEM_PERSONA') + "\n" + getConfig('SYNC_PROMPT') +
                 "\n出力は必ず以下のJSON形式にしてください。\n{\n  \"keyword\": \"分野のキーワード（1単語）\",\n  \"summary\": \"ナレッジの要約（1000文字程度）\"\n}";

  const payload = {
    "contents": [{
      "parts": [
        { "text": prompt },
        { "inline_data": { "mime_type": file.getMimeType(), "data": base64Data } }
      ]
    }],
    "generationConfig": {
      "responseMimeType": "application/json",
      "maxOutputTokens": 2000
    }
  };

  const options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(payload)
  };

  const response = UrlFetchApp.fetch(url, options);
  const result = JSON.parse(response.getContentText());
  let text = result.candidates[0].content.parts[0].text;

  try {
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(text);
  } catch(e) {
    return { keyword: "画像", summary: text };
  }
}

/**
 * Raindrop APIからデータを取得する内部関数
 */
function fetchRaindropData(token) {
  if (!token) return [];
  const url = "https://api.raindrop.io/rest/v1/raindrops/0?perpage=50";
  const options = {
    "method": "get",
    "headers": { "Authorization": "Bearer " + token }
  };
  const response = UrlFetchApp.fetch(url, options);
  return JSON.parse(response.getContentText()).items || [];
}

/**
 * Raindropのテキスト情報からGemini APIを呼び出してキーワードと要約を抽出
 */
function callGeminiText(title, highlights) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const payload = {
    "contents": [{
      "parts": [
        { "text": getConfig('SYSTEM_PERSONA') + "\n以下の記事のタイトルと抜粋（ハイライト）から、内容を要約して重要なナレッジを抽出してください。\nまた、この記事の内容が属する分野やジャンルを示すキーワードを1つだけ作成してください。\n出力は必ず以下のJSON形式にしてください。\n{\n  \"keyword\": \"分野のキーワード（1単語）\",\n  \"summary\": \"重要なナレッジの要約\"\n}\n\n【タイトル】\n" + title + "\n\n【抜粋】\n" + highlights }
      ]
    }],
    "generationConfig": {
      "responseMimeType": "application/json"
    }
  };

  const options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };

  const response = UrlFetchApp.fetch(url, options);
  const responseText = response.getContentText();

  try {
    const result = JSON.parse(responseText);
    if (response.getResponseCode() !== 200) {
      throw new Error(result.error ? result.error.message : "API Error");
    }
    let text = result.candidates[0].content.parts[0].text;
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(text);
  } catch(e) {
    return { keyword: "Web記事", summary: highlights || title };
  }
}

/**
 * Driveフォルダから未処理のファイルを取得する内部関数
 */
function fetchDriveScreenshots(folderId) {
  if (!folderId) return { files: [], processedFolder: null };
  const folder = DriveApp.getFolderById(folderId);
  const filesIter = folder.getFiles();
  const subFolders = folder.getFoldersByName("処理済み");
  const processedFolder = subFolders.hasNext() ? subFolders.next() : folder.createFolder("処理済み");

  const targetFiles = [];
  while (filesIter.hasNext()) {
    targetFiles.push(filesIter.next());
  }
  return { files: targetFiles, processedFolder: processedFolder };
}

/**
 * Gemini APIで全体の分析を行う（自動・手動ハイブリッド対応版）
 */
function analyzeWithGemini(articles, maxTokens = GEMINI_MAX_TOKENS, temp = GEMINI_TEMPERATURE, checkedItems = [], customPrompt = "") {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  let promptText = getConfig('SYSTEM_PERSONA') + "\n" + getConfig('REPORT_PROMPT') + "\n\n";

  if (customPrompt && customPrompt.trim() !== "") {
    promptText += `【特別指示】\n${customPrompt}\n\n`;
  }

  promptText += `【出力形式】\n`;
  if (checkedItems && checkedItems.length > 0) {
    checkedItems.forEach((item, index) => {
      promptText += `${index + 1}. ${item}\n`;
    });
  } else {
    promptText += `1. 共通テーマ（箇条書き）\n2. 興味・関心の傾向（2〜3文）\n3. 各記事の要点（1〜2行ずつ）\n4. 来週学ぶべき領域の提案（3つ）\n`;
  }

  promptText += `\n【データ】\n${articles.map(a => `- タイトル: ${a.title}\n  内容: ${a.highlights}`).join('\n\n')}`;

  const payload = {
    "contents": [{ "parts": [{ "text": promptText }] }],
    "generationConfig": {
      "maxOutputTokens": maxTokens,
      "temperature": temp
    }
  };

  const options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(payload)
  };

  const response = UrlFetchApp.fetch(url, options);
  const result = JSON.parse(response.getContentText());
  return result.candidates[0].content.parts[0].text;
}

/**
 * Notionに保存
 */
function saveToNotion(reportText, articleCount, dateRange) {
  const url = "https://api.notion.com/v1/pages";
  const token = NOTION_TOKEN;
  const dbId = NOTION_DATABASE_ID;

  if (!token || !dbId) {
    console.error("Notion設定エラー: トークンまたはデータベースIDが未設定です。");
    return;
  }

  const payload = {
    "parent": { "database_id": dbId },
    "properties": {
      "Name": { "title": [{ "text": { "content": `📚 週次レポート｜${dateRange}` } }] },
      "記事数": { "number": articleCount },
      "日付": { "date": { "start": new Date().toISOString().split('T')[0] } }
    },
    "children": [
      {
        "object": "block",
        "type": "paragraph",
        "paragraph": { "rich_text": [{ "type": "text", "text": { "content": reportText.substring(0, 2000) } }] }
      }
    ]
  };

  const options = {
    "method": "post",
    "headers": {
      "Authorization": "Bearer " + token,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28"
    },
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };

  try {
    const res = UrlFetchApp.fetch(url, options);
    const responseCode = res.getResponseCode();
    if (responseCode !== 200) {
      const errText = res.getContentText();
      console.error(`Notion保存失敗 (Status: ${responseCode}): ${errText}`);
      throw new Error(`Notion保存エラー: ${errText}`);
    }
    console.log("Notionへの保存に成功しました。");
  } catch (e) {
    console.error("Notion通信エラー: " + e.message);
    throw e;
  }
}

/**
 * 設定画面用の設定取得
 */
function getSystemSettings() {
  const settings = {};
  for (let key in DEFAULT_CONFIG) {
    settings[key] = getConfig(key);
  }
  return JSON.stringify(settings);
}

/**
 * 設定画面からの設定保存
 */
function saveSystemSettings(settingsJson) {
  try {
    const settings = JSON.parse(settingsJson);
    for (let key in settings) {
      PropertiesService.getScriptProperties().setProperty(key, settings[key]);
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Gmailでレポートを送信
 */
function sendReportEmail(reportText, articleCount, dateRange) {
  const subject = `📚 週次ナレッジレポート｜${dateRange}（${articleCount}本）`;
  const body = `
今週のナレッジ収集結果をまとめました。

■ 収集記事数: ${articleCount} 本

--------------------------------------------------
${reportText}
--------------------------------------------------

このレポートはGeminiによって自動生成されました。
  `;

  GmailApp.sendEmail(MY_EMAIL, subject, body);
}

/**
 * HTMLから呼ばれる：音声要約テキストの生成
 */
function generateVoiceSummaryText(paramsJson) {
  try {
    const params = JSON.parse(paramsJson);
    const articles = params.articles;
    const maxTokens = params.maxTokens || 800;
    const temperature = params.temperature || 0.2;
    const checkedItems = params.checkedItems || [];
    const englishMode = params.englishMode || false;
    const customPrompt = params.customPrompt || "";

    let prompt = getConfig('SYSTEM_PERSONA') + "\n" + getConfig('VOICE_PROMPT') + "\n\n";

    if (englishMode) {
      prompt += "【重要】この要約はすべて【英語 (English)】で作成してください。日本語は一切含めないでください。\n\n";
    }

    if (customPrompt.trim() !== "") {
      prompt += `【特別指示】\n${customPrompt}\n\n`;
      prompt += "※上記の特別指示を最優先で反映してください。\n";
    }

    prompt += "【絶対厳守の出力ルール】\n";
    if (englishMode) {
      prompt += "1. No greetings or intros. Start directly with the main content.\n";
      prompt += "2. No markdown symbols (#, *, -, =) or list symbols. Use plain text only.\n";
      prompt += "3. Use smooth transitions and a professional news-anchor style with continuous paragraphs.\n";
      prompt += "4. Follow the structure of the checked items below:\n";
    } else {
      prompt += "1. 挨拶、前置き、了承の返事（「わかりました」「〜を作成しました」「まずは〜です」等）は一切書かず、いきなり本文の1行目から話し始めてください。\n";
      prompt += "2. 音声読み上げソフトが誤読するため、マークダウン記号（#、*、-、=）や、箇条書きの記号（・、数字リスト）は【絶対に使用不可】です。\n";
      prompt += "3. 接続詞を滑らかに使い、ラジオニュースのような「です・ます調」の連続したパラグラフ（段落）のみで構成してください。\n";
      prompt += "4. 以下の構成要素の順に、文章を自然に繋げて展開してください：\n";
    }
    checkedItems.forEach(item => prompt += `  [${item}]\n`);

    prompt += "\n【対象データ】\n";
    articles.forEach(a => prompt += `タイトル: ${a.title}\n要約: ${a.highlights}\n\n`);

    const summaryText = callGeminiAPI(prompt, maxTokens, temperature);

    // Notionへの保存をコメントアウト
    // saveGeneratedTextToNotion("音声要約", checkedItems, summaryText);

    return summaryText;

  } catch (error) {
    throw new Error("音声要約の生成に失敗しました: " + error.message);
  }
}

/**
 * HTMLから呼ばれる：英語学習用テキストの生成
 */
function generateEnglishLearningText(paramsJson) {
  try {
    const params = JSON.parse(paramsJson);
    const articles = params.articles;
    const maxTokens = params.maxTokens || 1500;
    const temperature = params.temperature || 0.3;
    const basePrompt = getConfig('ENGLISH_PROMPT');
    const cefrLevel = params.cefrLevel;
    
    // プロンプト内のレベル指定を置換
    let prompt = basePrompt.replace("{{LEVEL}}", cefrLevel);
    
    prompt += "\n\n【対象データ】\n";
    articles.forEach(a => prompt += `タイトル: ${a.title}\n内容: ${a.highlights}\n\n`);

    const resultText = callGeminiAPI(prompt, maxTokens, temperature);
    
    // Spreadsheetの履歴に保存
    try {
      saveVoiceSummaryToSheet("英語学習", articles, resultText);
    } catch (e) {
      console.error("Spreadsheet保存エラー:", e.message);
    }
    
    // Notionへの保存をコメントアウト
    // saveGeneratedTextToNotion("英語学習", [], resultText);
    return resultText;
  } catch (error) {
    throw new Error("英語学習テキストの生成に失敗しました: " + error.message);
  }
}

/**
 * Gemini API 汎用呼び出しヘルパー
 */
function callGeminiAPI(promptText, maxTokens, temp) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const payload = {
    "contents": [{ "parts": [{ "text": promptText }] }],
    "generationConfig": {
      "maxOutputTokens": maxTokens,
      "temperature": temp
    }
  };
  const options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };

  const response = UrlFetchApp.fetch(url, options);
  const result = JSON.parse(response.getContentText());

  if (response.getResponseCode() !== 200) {
    throw new Error(result.error ? result.error.message : "Gemini API エラー");
  }
  return result.candidates[0].content.parts[0].text;
}

/**
 * HTMLから呼ばれる：ドキュメント出力用のレポート生成関数
 */
function generateReport(paramsJson) {
  try {
    const params = JSON.parse(paramsJson);
    const targetArticles = params.articles;

    const maxTokens = params.maxTokens ? Number(params.maxTokens) : GEMINI_MAX_TOKENS;
    const temperature = params.temperature !== undefined ? Number(params.temperature) : GEMINI_TEMPERATURE;

    const checkedItems = params.checkedItems || [];
    const customPrompt = params.customPrompt || "";

    const reportText = analyzeWithGemini(targetArticles, maxTokens, temperature, checkedItems, customPrompt);

    const today = Utilities.formatDate(new Date(), "JST", "MM/dd");
    // Notionへの保存をコメントアウト
    // saveToNotion(reportText, targetArticles.length, `都度出力_${today}`);
    // saveGeneratedTextToNotion("ドキュメント出力", checkedItems, reportText);

    return "生成完了";

  } catch (error) {
    throw new Error("レポート生成に失敗しました: " + error.message);
  }
}

/**
 * 生成されたテキストを新しいNotionデータベースに保存
 */
function saveGeneratedTextToNotion(type, checkedItems, summary) {
  const dsNotionDbId = PropertiesService.getScriptProperties().getProperty('DS_NOTION_DB_ID');
  const dsNotionToken = PropertiesService.getScriptProperties().getProperty('DS_NOTION_TOKEN');

  if (!dsNotionToken || !dsNotionDbId) {
    console.error("Notion Save Error: DS_NOTION_TOKEN or DS_NOTION_DB_ID is not set in Script Properties.");
    return;
  }

  const url = "https://api.notion.com/v1/pages";

  const nowStr = Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd HH:mm");
  const titleStr = nowStr + " " + type;
  const itemsStr = (checkedItems && checkedItems.length > 0) ? checkedItems.join(", ") : "指定なし";

  const payload = {
    "parent": { "database_id": dsNotionDbId },
    "properties": {
      "Name": { "title": [ { "text": { "content": titleStr } } ] },
      "Type": { "rich_text": [ { "text": { "content": type } } ] },
      "CheckedItems": { "rich_text": [ { "text": { "content": itemsStr } } ] }
    }
  };

  const textChunks = [];
  let str = summary;
  while(str.length > 0) {
    textChunks.push({ "text": { "content": str.substring(0, 2000) } });
    str = str.substring(2000);
  }
  payload.properties["Summary"] = { "rich_text": textChunks };

  const options = {
    "method": "post",
    "headers": {
      "Authorization": "Bearer " + dsNotionToken,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json"
    },
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };

  try {
    const res = UrlFetchApp.fetch(url, options);
    if (res.getResponseCode() !== 200) {
      const errText = res.getContentText();
      let errMsg = errText;
      try {
        const errObj = JSON.parse(errText);
        errMsg = errObj.message || errText;
      } catch(e) {}
      throw new Error("Notionの設定エラーです: " + errMsg);
    }
  } catch (e) {
    console.error("Notion Save Error: " + e.message);
    throw e;
  }
}

// ============================================================
// MHTファイル処理エンジン
// ============================================================

/**
 * MHTファイルを解析し、記事ごとの分割・要約・PDF紐付け・年表データ抽出を行う
 *
 * @param {GoogleAppsScript.Drive.File} file              - 処理対象のMHTファイル
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet      - 書き込み先シート
 * @param {Set} existingIds                               - 処理済みIDの集合（重複チェック用）
 * @param {string} persona                                - Geminiへのシステム指示
 * @param {string} syncPrompt                             - Geminiへのユーザー指示
 * @param {string} driveFolderId                          - PDFが格納されているフォルダID
 * @param {GoogleAppsScript.Drive.Folder} processedFolder - 処理済み移動先フォルダ
 * @return {{addedCount: number, isTimeOut: boolean}}
 */
function processMhtFile_Advanced(file, sheet, existingIds, persona, syncPrompt, driveFolderId, processedFolder) {
  const startTime = Date.now();
  const TIME_LIMIT = 4.0 * 60 * 1000;
  let addedCount = 0;
  let isTimeOut = false;

  // 1. 生データの取得とQP（Quoted-Printable）ソフト改行を除去
  let rawData = file.getBlob().getDataAsString();
  rawData = rawData.replace(/=\r?\n/g, "");

  // 2. HTMLパートのみを抽出（後半のバイナリ画像データを切り捨て）
  let htmlContent = rawData;
  const htmlMatch = rawData.match(/<html[\s\S]*?<\/html>/i);
  if (htmlMatch) {
    htmlContent = htmlMatch[0];
  }

  // 3. 記事ブロックの分割（<form タグで区切る）
  const formBlocks = htmlContent.split(/<form /gi);
  const articles = [];
  for (let i = 1; i < formBlocks.length; i++) {
    const block = "<form " + formBlocks[i];
    if (block.includes('hdgLv2')) {
      articles.push(block);
    }
  }

  const folder = DriveApp.getFolderById(driveFolderId);

  // 4. 記事ごとのループ処理
  for (let i = 0; i < articles.length; i++) {
    if (Date.now() - startTime > TIME_LIMIT) {
      isTimeOut = true;
      break;
    }

    const articleHtml = articles[i];

    // ① タイトルとメタ情報（J列用）を先に取得（疑似ID生成に必要なため順序を変更）
    const rawTitleTag = articleHtml.match(/<div[^>]*class="[^"]*hdgLv2 val02[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    let fullTitleText = rawTitleTag ? rawTitleTag[1].replace(/<[^>]+>/g, ' ').trim() : "タイトル不明";
    fullTitleText = cleanMhtNoise(fullTitleText);

    let titleOnly = fullTitleText;
    let metaInfo = "";

    const splitMatch = fullTitleText.match(/(\d{4}[\/\d].*)$/);
    if (splitMatch) {
      titleOnly = fullTitleText.substring(0, splitMatch.index).trim();
      let rawMeta = splitMatch[0].trim();
      metaInfo = rawMeta
        .replace(/PDF有/g, "")
        .replace(/書誌情報印刷/g, "")
        .replace(/\s+/g, " ")
        .trim();
    }

    // ② ID特定と2重取得防止（ガードA・B）
    const idMatch = articleHtml.match(/keyShoshi(?:=|3D)NIRKDB\s*([a-zA-Z0-9]+)/i);
    const hasHonbun = articleHtml.includes('text Honbun');
    let articleId = "";

    if (idMatch) {
      // 正規IDがある場合はそれを使用（大文字統一）
      articleId = idMatch[1].trim().toUpperCase();
    } else {
      // ガードA: 正規IDがなく、本文エリア（text Honbun）もないブロックは
      // 一覧のスニペットと判断してスキップ（2重取得の主因を排除）
      if (!hasHonbun) {
        console.log(`スニペットスキップ（本文なし・ID不明）: ${titleOnly.substring(0, 30)}`);
        continue;
      }
      // ガードB: 本文はあるが正規IDがない記事（速報等）の疑似ID生成
      // 時刻の有無によるID不一致を防ぐため「日付」部分のみ抽出して正規化
      const dateOnlyMatch = metaInfo.match(/\d{4}[\/\-]\d{2}[\/\-]\d{2}/);
      const stableMeta = dateOnlyMatch ? dateOnlyMatch[0] : metaInfo.substring(0, 10);
      const rawIdStr = titleOnly + stableMeta;
      const safeId = Utilities.base64EncodeWebSafe(Utilities.newBlob(rawIdStr).getBytes());
      articleId = "NKN_" + safeId.replace(/[^a-zA-Z0-9]/g, "").substring(0, 15);
      console.log(`疑似ID生成: ${articleId} (${titleOnly.substring(0, 20)})`);
    }

    // ③ 重複チェック（同一ファイル内の重複も防ぐ）
    if (existingIds.has(articleId)) {
      console.log(`重複スキップ: ${articleId}`);
      continue;
    }
    existingIds.add(articleId);

    // ④ 対応するPDFファイルの検索と紐付け
    let pdfUrl = "";
    const pdfName = articleId + ".pdf";
    const pdfFiles = folder.getFilesByName(pdfName);
    if (pdfFiles.hasNext()) {
      const pdfFile = pdfFiles.next();
      pdfUrl = pdfFile.getUrl();
      pdfFile.moveTo(processedFolder);
      console.log(`PDF紐付け成功: ${pdfName}`);
    }

    // ⑤ 本文抽出（I列用）
    let rawContent = "";
    const textMatch = articleHtml.match(/<div[^>]*class="[^"]*text Honbun[^"]*"[^>]*>([\s\S]*?)(?:<\/form>|<\/section>|$)/i);
    if (textMatch) {
      rawContent = textMatch[1].replace(/<[^>]+>/g, '\n').trim();
    } else {
      rawContent = articleHtml.replace(/<[^>]+>/g, '\n').trim();
    }
    rawContent = cleanMhtNoise(rawContent);
    rawContent = rawContent.replace(/\s+PDF\s*$/i, '').replace(/\n\s*\n/g, '\n\n').trim();

    // スプレッドシートの5万文字制限対策
    const safeContent = rawContent.length > 49000
      ? rawContent.substring(0, 49000) + "\n...（文字数上限により省略）"
      : rawContent;

    // ⑥ Gemini APIによる要約および年表データ抽出
    const geminiInputContent = rawContent.substring(0, 10000);
    const geminiResultJson = callGeminiForSingleArticle(geminiInputContent, persona, syncPrompt);

    // MHTのメタ情報から日付部分を抽出
    const dateOnlyMatch = metaInfo.match(/\d{4}[\/\-]\d{2}[\/\-]\d{2}/);
    const pubDateStr = dateOnlyMatch ? dateOnlyMatch[0] : Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd");

    // ⑦ スプレッドシートへの書き込み（12列に拡張）
    sheet.appendRow([
      articleId,                   // A: id
      titleOnly,                   // B: title
      pdfUrl,                      // C: url（紐付いたPDFのURL）
      geminiResultJson.tags || geminiResultJson.keyword || "未分類", // D: tags
      geminiResultJson.highlights || geminiResultJson.summary || "", // E: highlights（要約）
      new Date(),                  // F: saved_at
      false,                       // G: processed
      "",                          // H: 予備
      safeContent,                 // I: 本文原文
      metaInfo,                    // J: 日付・紙面・文字数
      pubDateStr,                  // K: 発行日または取り込み日
      geminiResultJson.timeline || "" // L: 年表用データ（[日付] 出来事）★追加箇所
    ]);
    SpreadsheetApp.flush();

    addedCount++;
    Utilities.sleep(1000); // APIレートリミット対策
  }

  return { addedCount: addedCount, isTimeOut: isTimeOut };
}

/**
 * MHT特有のノイズ（Quoted-Printableの残骸・HTMLエンティティ等）を除去
 * ★修正: QP =XX 形式のASCII文字デコードを追加
 */
function cleanMhtNoise(str) {
  if (!str) return "";
  return str
    .replace(/=\r?\n/g, "")       // QPソフト改行の残骸を除去
    .replace(/=([0-9A-Fa-f]{2})/g, (match, hex) => { // QP =XX 形式のデコード
      const code = parseInt(hex, 16);
      if (code === 0x3D) return '=';                   // = 自身 (=3D)
      if (code < 0x20 || code === 0x7F) return ' ';   // 制御文字はスペースに置換
      if (code < 0x80) return String.fromCharCode(code); // 通常ASCIIをデコード
      return match;                                    // マルチバイト(0x80以上)はそのまま
    })
    .replace(/&nbsp;/gi, " ")     // ノーブレークスペース
    .replace(/&amp;/gi, "&")      // アンパサンド
    .replace(/&lt;/gi, "<")       // 不等号（左）
    .replace(/&gt;/gi, ">")       // 不等号（右）
    .replace(/\s+/g, " ")         // 連続空白の正規化
    .trim();
}

/**
 * JSONパース前に文字列値内のリテラル制御文字をエスケープするヘルパー
 * 「Bad control character in string literal」エラーへの対策
 */
function robustJsonParse(text) {
  // まず通常のパースを試みる
  try {
    return JSON.parse(text);
  } catch (e) {
    // 失敗した場合、JSON文字列値内のリテラル制御文字をエスケープして再試行
    try {
      let result = '';
      let inString = false;
      let escape = false;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (escape) {
          result += ch;
          escape = false;
          continue;
        }
        if (ch === '\\') {
          escape = true;
          result += ch;
          continue;
        }
        if (ch === '"') {
          inString = !inString;
          result += ch;
          continue;
        }
        if (inString) {
          if (ch === '\n') { result += '\\n'; continue; }  // リテラル改行をエスケープ
          if (ch === '\r') { result += '\\r'; continue; }  // リテラルCRをエスケープ
          if (ch === '\t') { result += '\\t'; continue; }  // リテラルタブをエスケープ
          if (ch.charCodeAt(0) < 0x20) { continue; }        // その他制御文字は除去
        }
        result += ch;
      }
      return JSON.parse(result);
    } catch (e2) {
      throw new Error(e.message); // 元のエラーメッセージを保持して再スロー
    }
  }
}

/**
 * 1記事分のGemini要約・年表抽出を実行し、JSONで返す
 */
function callGeminiForSingleArticle(textContent, persona, userPrompt) {
  // 本文が実質空の場合はGemini呼び出しをスキップ（スニペット等の空記事対策）
  if (!textContent || textContent.trim().length < 30) {
    return { tags: "手動要", highlights: "本文が取得できませんでした。", timeline: "" };
  }

  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  const modelName = typeof GEMINI_MODEL !== 'undefined' ? GEMINI_MODEL : 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  // ★修正: userPrompt を JSON スキーマの外に出し、プロンプト構造の崩壊を防止
  // （旧コードでは "highlights": "${userPrompt}" と埋め込んでいたため、
  //   userPrompt 内の改行がJSONを壊し、Geminiの出力JSONも改行入りになってパース失敗していた）
  const fullPrompt = `${persona}
以下の記事本文を分析し、必ず下記のJSON形式のみで出力してください。マークダウンや余分なテキストは一切含めないでください。
また、JSON文字列値の中では、リテラルな改行文字を使わず、必ず \\n という2文字で改行を表現してください。

【highlights フィールドへの要約指示】
${userPrompt}

【出力JSON形式（厳守）】
{
  "tags": "分野を示す1単語のキーワード",
  "highlights": "上記の要約指示に従ったテキスト",
  "timeline": "記事中の最も主要な出来事とその日付。形式：[日付] 出来事（50文字程度）。日付はYYYY/MM/DD・YYYY/MM・YYYYのいずれかに正規化。該当なければ空文字列。"
}

【記事本文】
${textContent}`;

  const payload = {
    contents: [{ parts: [{ text: fullPrompt }] }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
      maxOutputTokens: 3000  // ★修正: highlights + timeline を確実に収めるため増量
    }
  };

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);

    // レスポンスコードを確認
    if (response.getResponseCode() !== 200) {
      Logger.log("Gemini APIエラー: " + response.getResponseCode() + " / " + response.getContentText().substring(0, 200));
      return { 
        tags: "🚨手動要", 
        highlights: "Gemini APIエラー (Status: " + response.getResponseCode() + ")", 
        timeline: "" 
      };
    }

    const json = JSON.parse(response.getContentText());
    if (json.candidates && json.candidates.length > 0) {
      // マークダウン記法のJSONフェンスを除去
      let responseText = json.candidates[0].content.parts[0].text;
      responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      
      // ★修正: 制御文字を含む場合に備えた robustJsonParse を使用
      const parsed = robustJsonParse(responseText);
      
      return {
        tags: parsed.tags || parsed.keyword || "未分類",
        highlights: parsed.highlights || parsed.summary || "",
        timeline: parsed.timeline || ""
      };
    }
    Logger.log("Gemini: candidatesが空のレスポンス");
    return { tags: "手動要", highlights: "Geminiのレスポンスが空でした。", timeline: "" };

  } catch (e) {
    Logger.log("Single Article API Error: " + e.message);
    return { tags: "🚨手動要", highlights: "要約処理に失敗しました: " + e.message, timeline: "" };
  }
}

/**
 * HTMLから不要なタグ（script, style等）を除去し、テキストのみを抽出する（トークン節約用）
 */
function cleanHtml(html) {
  if (!html) return "";
  return html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
             .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
             .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
             .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
             .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
             .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')
             .replace(/<[^>]+>/g, ' ')
             .replace(/&nbsp;/gi, ' ')
             .replace(/&amp;/gi, '&')
             .replace(/&lt;/gi, '<')
             .replace(/&gt;/gi, '>')
             .replace(/\s+/g, ' ')
             .trim();
}
