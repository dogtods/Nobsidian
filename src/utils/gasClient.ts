/**
 * Google Apps Script Web App (GAS) API Client
 * Compatible with both Full-Stack environments (Node / Cloud Run with /api/proxy)
 * and Static Deployments (GitHub Pages, Vercel, Netlify, Cloudflare Pages).
 */

export function sanitizeGasUrl(rawUrl: string): string {
  if (!rawUrl) return "";
  return rawUrl
    .replace(/^[\s\u3000"'`]+|[\s\u3000"'`]+$/g, "")
    .replace(/[\r\n\t]/g, "")
    .trim();
}

/**
 * Validates GAS URL format before sending requests
 */
export function validateGasUrl(url: string): void {
  const clean = sanitizeGasUrl(url);
  if (!clean) {
    throw new Error("GAS WebアプリURLが設定されていません。設定画面からURLを入力してください。");
  }
  if (clean.endsWith("/dev")) {
    throw new Error(
      "GASのURL末尾が『/dev』（テスト版）になっています。\n/dev は開発者本人のみ有効で外部通信が制限されます。\nGASエディタの「デプロイ ＞ デプロイの管理」から『/exec』で終わる本番URLを取得して設定してください。"
    );
  }
}

/**
 * Parse GAS response text safely with detailed diagnosis of Google login or HTML errors
 */
export function parseGasResponseOrThrow(text: string, httpStatus?: number): any {
  if (!text || text.trim() === "") {
    throw new Error("GASから空の応答が返されました。");
  }
  try {
    return JSON.parse(text);
  } catch (parseErr) {
    const trimmed = text.trim();
    const lower = trimmed.toLowerCase();

    // 1. Google ログイン・認証画面（HTML）の網羅的検知
    const isGoogleLogin =
      trimmed.includes("ppConfig") ||
      trimmed.includes("accounts.google.com") ||
      trimmed.includes("ServiceLogin") ||
      trimmed.includes("Google Accounts") ||
      trimmed.includes("identifierId") ||
      trimmed.includes("ログイン - Google") ||
      trimmed.includes("Sign in - Google") ||
      (lower.includes("<!doctype html") && (lower.includes("google") || lower.includes("sign-in") || lower.includes("gaia")));

    if (isGoogleLogin) {
      throw new Error(
        "Googleアカウントのログイン認証画面（HTML）が返されました。\n\n" +
        "【原因】\n" +
        "GAS Webアプリのアクセス権限が「全員」になっていないため、Googleがログイン認証を要求しています。\n\n" +
        "【解決手順】\n" +
        "1. スプレッドシートの「拡張機能 ＞ Apps Script」を開く\n" +
        "2. 画面右上の「デプロイ ＞ デプロイの管理」を開く\n" +
        "3. 右側の「鉛筆マーク（編集）」をクリック\n" +
        "4. 【バージョン】で『新バージョン』を選択\n" +
        "5. 【アクセスできるユーザー】を必ず『全員（Anyone）』に変更\n" +
        "6. 「デプロイ」ボタンを押して完了してください。"
      );
    }

    // 2. 404 Not Found
    if (httpStatus === 404 || lower.includes("page cannot") || lower.includes("404 not found") || lower.includes("the page cannot be found")) {
      throw new Error(
        "GAS Webアプリが見つかりません（404 Not Found）。\n\n" +
        "【解決手順】\n" +
        "1. GASエディタのデプロイ設定で【アクセスできるユーザー】が『全員（Anyone）』になっているか確認してください。\n" +
        "2. 「新しいデプロイ」を作成し、新しく発行された /exec URLを設定画面に貼り付けてください。"
      );
    }

    // 3. GASスクリプト実行時エラー（HTML画面）
    if (lower.includes("script error") || trimmed.includes("Google Apps Script")) {
      throw new Error(
        "GAS側でスクリプト実行エラーが発生しました。スプレッドシートのコードにエラーがないか確認してください。\n" +
        trimmed.substring(0, 200)
      );
    }

    throw new Error(`GASからの応答がJSON形式ではありませんでした: ${trimmed.substring(0, 120)}`);
  }
}

/**
 * Execute a GET request to GAS Web App.
 * Automatically tries backend proxy first, falling back to direct browser CORS fetch on static hosts.
 */
export async function fetchGasGet(url: string, params?: Record<string, string>): Promise<any> {
  const cleanUrl = sanitizeGasUrl(url);
  validateGasUrl(cleanUrl);

  let fullUrl = cleanUrl;
  if (params) {
    const urlObj = new URL(cleanUrl);
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== "") {
        urlObj.searchParams.set(key, val);
      }
    });
    fullUrl = urlObj.toString();
  }

  let proxyErrorMessage: string | null = null;

  // 1. Try Backend Proxy if available
  try {
    const proxyRes = await fetch(`/api/proxy?url=${encodeURIComponent(fullUrl)}`, {
      method: "GET",
    });

    const contentType = proxyRes.headers.get("content-type") || "";
    const text = await proxyRes.text();

    if (proxyRes.ok && !contentType.includes("text/html")) {
      try {
        return JSON.parse(text);
      } catch (jsonErr) {
        // Fall through
      }
    } else {
      try {
        const errJson = JSON.parse(text);
        if (errJson.error) {
          proxyErrorMessage = errJson.error;
        }
      } catch (_) {}
    }
  } catch (proxyErr) {
    // Proxy failed or unavailable (e.g. GitHub Pages static hosting), proceed to direct fetch
  }

  // 2. Direct Browser Fetch to GAS (CORS enabled by GAS /exec redirect)
  let directFetchError: any = null;
  try {
    const directRes = await fetch(fullUrl, {
      method: "GET",
      mode: "cors",
      redirect: "follow",
    });

    const text = await directRes.text();
    return parseGasResponseOrThrow(text, directRes.status);
  } catch (directErr: any) {
    directFetchError = directErr;
  }

  // 3. GET failed (e.g. redirected to Google login in iframe or blocked by browser CORS):
  // Automatically fallback to POST method since GAS doPost handles the same processApiRequest
  // and is much more stable against Google sign-in redirects in iframe environments.
  try {
    const fallbackPayload = params || {};
    return await fetchGasPost(url, fallbackPayload);
  } catch (postFallbackErr) {
    if (proxyErrorMessage) {
      throw new Error(proxyErrorMessage);
    }
    if (directFetchError && directFetchError.message && (directFetchError.message.includes("Googleアカウント") || directFetchError.message.includes("404"))) {
      throw directFetchError;
    }
    if (directFetchError && (directFetchError.message === "Failed to fetch" || directFetchError.name === "TypeError")) {
      throw new Error(
        "GAS Webアプリへの通信がブロックされました。\n\n【考えられる原因】\n1. GASの『アクセスできるユーザー』が『全員 (Anyone)』になっていない\n2. URLの末尾が /exec ではなく /dev になっている"
      );
    }
    throw directFetchError || postFallbackErr;
  }
}

/**
 * Execute a POST request to GAS Web App.
 * Uses `Content-Type: text/plain` on direct browser fetch to bypass CORS preflight (OPTIONS)
 * which GAS does not support.
 */
export async function fetchGasPost(url: string, payload: any): Promise<any> {
  const cleanUrl = sanitizeGasUrl(url);
  validateGasUrl(cleanUrl);

  // Query parameter fallback for action / sheetName
  const targetAction = payload?.action || "";
  const targetSheet = payload?.sheetName || payload?.options?.targetSheetName || "";
  let fullUrl = cleanUrl;
  if (targetAction || targetSheet) {
    const urlObj = new URL(cleanUrl);
    if (targetAction) urlObj.searchParams.set("action", targetAction);
    if (targetSheet) urlObj.searchParams.set("sheetName", targetSheet);
    fullUrl = urlObj.toString();
  }

  const payloadString = typeof payload === "string" ? payload : JSON.stringify(payload);
  let proxyErrorMessage: string | null = null;

  // 1. Try Backend Proxy
  try {
    const proxyRes = await fetch(`/api/proxy?url=${encodeURIComponent(fullUrl)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payloadString,
    });

    const contentType = proxyRes.headers.get("content-type") || "";
    const text = await proxyRes.text();

    if (proxyRes.ok && !contentType.includes("text/html")) {
      try {
        return JSON.parse(text);
      } catch (e) {
        // Fall through
      }
    } else {
      try {
        const errJson = JSON.parse(text);
        if (errJson.error) {
          proxyErrorMessage = errJson.error;
        }
      } catch (_) {}
    }
  } catch (proxyErr) {
    // Fall through to direct fetch
  }

  // 2. Direct Browser Fetch (text/plain avoids OPTIONS preflight check)
  try {
    const directRes = await fetch(fullUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: payloadString,
      mode: "cors",
      redirect: "follow",
    });

    const text = await directRes.text();
    return parseGasResponseOrThrow(text, directRes.status);
  } catch (directErr: any) {
    if (proxyErrorMessage) {
      throw new Error(proxyErrorMessage);
    }
    if (directErr.message && (directErr.message.includes("Googleアカウント") || directErr.message.includes("404"))) {
      throw directErr;
    }
    if (directErr.message === "Failed to fetch" || directErr.name === "TypeError") {
      throw new Error(
        "GAS Webアプリへの通信がブロックされました。\n\n【考えられる原因】\n1. GASの『アクセスできるユーザー』が『全員 (Anyone)』になっていない\n2. URLの末尾が /exec ではなく /dev になっている"
      );
    }
    throw directErr;
  }
}
