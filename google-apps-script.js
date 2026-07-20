/**
 * ====================================================================
 * 本アプリ専用: Google Apps Script (GAS) 同期用スクリプト
 * ====================================================================
 * 
 * 【導入手順】
 * 1. 保存・編集用のGoogleスプレッドシートを新規作成（または既存のものを用意）します。
 * 2. 上部メニュー [拡張機能] > [Apps Script] を選択します。
 * 3. エディタに配置されているコードをすべて削除し、このコードをまるごと貼り付けます。
 * 4. 保存アイコンを押します。
 * 5. 右上部にある「デプロイ」ボタンから「新しいデプロイ」を選択します。
 *    - 種類の選択：ウェブアプリ
 *    - 説明：任意（例：「データ同期WebAPI」）
 *    - 次のユーザーとして実行：自分（dogtods@gmail.com など管理者ユーザー）
 *    - アクセスできるユーザー：「全員」（重要！認証なしでアプリからアクセスさせるために必要です）
 * 6. 「デプロイ」をクリックし、初回承認フロー（アカウントアクセス許可）を行います。
 *    （※警告が出た場合は「詳細を表示」＞「〇〇（安全ではないページ）に移動」をクリックして進めます）
 * 7. 発行された「ウェブアプリのURL」（https://script.google.com/macros/s/.../exec）をコピーします。
 * 8. 本アプリ（またはスマホ版アプリ）の「設定（Gemini AI設定）」を開き、
 *    「Google Apps Script (GAS) 同期WebアプリURL」欄にコピーしたURLを貼り付けて保存します！
 */

// スプレッドシート内の保存先シートを取得/自動生成する関数
function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error("スプレッドシートのアクティブなインスタンスが見つかりません。コンテナバインドスクリプトとして作成してください。");
  }
  let sheet = ss.getSheetByName("Notes");
  const headers = ["id", "title", "content", "summary", "keywords", "createdAt", "updatedAt", "sourceUrl", "timeline", "columnJ"];
  if (!sheet) {
    sheet = ss.insertSheet("Notes");
    // ヘッダー行を付与
    sheet.appendRow(headers);
  } else {
    // 既存のシートがある場合、必要なヘッダー列が不足していないか自動拡張
    const lastCol = sheet.getLastColumn();
    if (lastCol < headers.length) {
      for (let c = 1; c <= headers.length; c++) {
        const headerCell = sheet.getRange(1, c);
        if (headerCell.getValue() === "") {
          headerCell.setValue(headers[c - 1]);
        }
      }
    }
  }
  return sheet;
}

// ==== GETリクエスト（データ取得）のルーティング ====
function doGet(e) {
  const action = e.parameter.action;
  
  if (action === "getNotes") {
    try {
      const sheet = getSheet();
      const lastRow = sheet.getLastRow();
      if (lastRow <= 1) {
        return createJsonResponse({ notes: [] });
      }
      
      const data = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
      const notes = data.map(row => {
        let cAt = Date.now();
        if (row[5] instanceof Date) {
          cAt = row[5].getTime();
        } else {
          const num = Number(row[5]);
          if (row[5] !== "" && !isNaN(num) && num > 0) {
            cAt = num;
          }
        }

        let uAt = cAt;
        if (row[6] instanceof Date) {
          uAt = row[6].getTime();
        } else {
          const num = Number(row[6]);
          if (row[6] !== "" && !isNaN(num) && num > 0) {
            uAt = num;
          }
        }

        return {
          id: String(row[0]),
          title: String(row[1]),
          content: String(row[2]),
          summary: String(row[3]),
          keywords: String(row[4]),
          createdAt: cAt,
          updatedAt: uAt,
          sourceUrl: String(row[7]),
          timeline: row[8] ? String(row[8]) : "",
          columnJ: row[9] ? String(row[9]) : ""
        };
      });
      
      return createJsonResponse({ notes: notes });
    } catch (err) {
      return createJsonResponse({ error: err.message });
    }
  }
  
  return createJsonResponse({ error: "無効なGETアクション、またはアクションが設定されていません。" });
}

// ==== POSTリクエスト（データ登録・更新・外部連係）のルーティング ====
function doPost(e) {
  try {
    const postData = JSON.parse(e.postData.contents);
    const action = postData.action;
    let result = {};

    if (action === "saveNote") {
      result = saveNote(postData.note);
    } else if (action === "deleteNote") {
      result = deleteNote(postData.id);
    } else if (action === "saveAll") {
      result = saveAll(postData.notes);
    } else if (action === "fetchDriveFile") {
      result = fetchDriveFile(postData.url);
    } else if (action === "fetchUnprocessedHighlights") {
      result = fetchUnprocessedHighlights(postData.sourceSsId, postData.sheetName);
    } else if (action === "markHighlightsProcessed") {
      result = markHighlightsProcessed(postData.sourceSsId, postData.sheetName, postData.rowIndices);
    } else {
      result = { success: false, error: "不明なPOSTアクション: " + action };
    }

    return createJsonResponse(result);
  } catch (err) {
    return createJsonResponse({ success: false, error: err.message });
  }
}

// JSONレスポンス出力を生成するヘルパー（CORS回避用の出力）
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
                       .setMimeType(ContentService.MimeType.JSON);
}

// ---- ノートを保存（新規追加 または 上書き編集） ----
function saveNote(note) {
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow >= 2) {
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat().map(String);
    const idx = ids.indexOf(String(note.id));

    if (idx !== -1) {
      // 既存のノートが存在する場合は上書き更新
      sheet.getRange(idx + 2, 1, 1, 10).setValues([[
        note.id, 
        note.title, 
        note.content, 
        note.summary || "", 
        note.keywords || "", 
        note.createdAt, 
        note.updatedAt, 
        note.sourceUrl || "",
        note.timeline || "",
        note.columnJ || ""
      ]]);
      return { success: true, action: "updated", id: note.id };
    }
  }

  // 存在しない、または新規作成
  sheet.appendRow([
    note.id, 
    note.title, 
    note.content, 
    note.summary || "", 
    note.keywords || "", 
    note.createdAt, 
    note.updatedAt, 
    note.sourceUrl || "",
    note.timeline || "",
    note.columnJ || ""
  ]);
  return { success: true, action: "created", id: note.id };
}

// ---- ノートを削除 ----
function deleteNote(id) {
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { success: false, reason: "データが存在しません" };

  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat().map(String);
  const idx = ids.indexOf(String(id));

  if (idx !== -1) {
    sheet.deleteRow(idx + 2);
    return { success: true, id: id };
  }
  return { success: false, reason: "削除対象が見つかりません" };
}

// ---- 全ノートを一括保存（マージ済みの全件を完全上書き） ----
function saveAll(notes) {
  const sheet = getSheet();
  
  // ヘッダー行（1行目）以外を物理的に削除するのではなく、コンテンツのみをクリアする
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    const maxCols = Math.max(10, sheet.getLastColumn());
    sheet.getRange(2, 1, lastRow - 1, maxCols).clearContent();
  }

  if (notes && notes.length > 0) {
    const rows = notes.map(n => [
      n.id, 
      n.title, 
      n.content, 
      n.summary || "", 
      n.keywords || "", 
      n.createdAt, 
      n.updatedAt, 
      n.sourceUrl || "",
      n.timeline || "",
      n.columnJ || ""
    ]);
    
    // 行数が足りない場合は拡張する
    const neededRows = rows.length + 1; // 1 (header) + rows.length
    const currentMaxRows = sheet.getMaxRows();
    if (neededRows > currentMaxRows) {
      sheet.insertRowsAfter(currentMaxRows, neededRows - currentMaxRows);
    }
    
    sheet.getRange(2, 1, rows.length, 10).setValues(rows);
  }

  return { success: true, count: notes.length };
}

// ---- Google Docs または一般Webサイトのテキスト抽出 ----
function fetchDriveFile(url) {
  try {
    // Googleドキュメントの判定
    const docMatch = url.match(/[-\w]{25,}/);
    if (url.includes("docs.google.com") && docMatch) {
      const id = docMatch[0];
      const doc = DocumentApp.openById(id);
      return { success: true, text: doc.getBody().getText(), title: doc.getName() };
    }
    
    // 一般のWebサイトの判定
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) {
      throw new Error("サイトにアクセスできませんでした（Status: " + res.getResponseCode() + "）");
    }
    
    const html = res.getContentText();
    const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
    let title = titleMatch ? titleMatch[1].trim() : "取り込んだ記事";
    
    // 不要な要素の除去
    let text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "")
      .replace(/<[^>]+>/g, "\n")
      .replace(/&nbsp;/g, " ")
      .replace(/\n\s*\n/g, "\n")
      .trim();
    
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
    if (nobsidianIdx === -1 && data[0].length >= 8) {
      nobsidianIdx = 7; // H列 (8番目の列)
    }

    const col = {
      title: headers.indexOf("title"),
      url: headers.indexOf("url"),
      tags: headers.indexOf("tags"),
      highlights: headers.indexOf("highlights"),
      saved_at: headers.indexOf("saved_at"),
      nobsidian: nobsidianIdx
    };

    // 必須ヘッダー確認、どうしても見つからない場合は初期値を割り当て
    if (col.title === -1) col.title = 0;
    if (col.highlights === -1) col.highlights = 1;

    // もし "timeline" や "timeline_data" 的なヘッダー名があればそれを使う、
    // なければ列数が12列以上ある場合に固定でL列（12番目の列、インデックス11）を取得、そうでなければJ列（10番目の列、インデックス9）から取得
    let timelineColIdx = headers.indexOf("timeline");
    if (timelineColIdx === -1) timelineColIdx = headers.indexOf("timeline_data");
    if (timelineColIdx === -1 && data[0].length >= 12) {
      timelineColIdx = 11; // L列 (12番目の列)
    } else if (timelineColIdx === -1 && data[0].length >= 10) {
      timelineColIdx = 9; // J列 (10番目の列)
    }

    // I列 (9番目の列、インデックス8) 用のインデックス検出
    let columnIIdx = headers.indexOf("memo");
    if (columnIIdx === -1) columnIIdx = headers.indexOf("comment");
    if (columnIIdx === -1) columnIIdx = headers.indexOf("i");
    if (columnIIdx === -1 && data[0].length >= 9) {
      columnIIdx = 8; // I列 (9番目の列)
    }

    // nobsidian 列を使う
    let checkColIdx = col.nobsidian;

    const items = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      let isProcessed = false;

      if (checkColIdx !== -1) {
        const val = row[checkColIdx];
        const valStr = String(val).trim().toLowerCase();
        if (valStr !== "" && valStr !== "false" && valStr !== "0") {
          isProcessed = true;
        }
      }

      if (!isProcessed) {
        items.push({
          rowIndex: i + 1, // シート上の行番号（1-indexed。ヘッダー=1行目なので、インデックスiは row = i + 1）
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
    if (colIndex === -1 && data[0].length >= 8) {
      colIndex = 7; // H列 (8番目の列)
    }

    // もし「処理マーク」の列がスプレッドシートに存在しない場合、一番右に自動追加
    if (colIndex === -1) {
      colIndex = headers.length;
      sheet.getRange(1, colIndex + 1).setValue("nobsidian");
    }

    // 指定された行番号に対して true を順次書き込み
    rowIndices.forEach(function(rowIndex) {
      if (rowIndex > 1 && rowIndex <= data.length) {
        sheet.getRange(rowIndex, colIndex + 1).setValue(true);
      }
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: "処理済みマーク（チェック）の反映に失敗しました: " + err.message };
  }
}
