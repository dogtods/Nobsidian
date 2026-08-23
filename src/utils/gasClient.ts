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
 * Execute a GET request to GAS Web App.
 * Automatically tries backend proxy first, falling back to direct browser CORS fetch on static hosts.
 */
export async function fetchGasGet(url: string, params?: Record<string, string>): Promise<any> {
  const cleanUrl = sanitizeGasUrl(url);
  if (!cleanUrl) throw new Error("GAS WebアプリURLが設定されていません。");

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

  // 1. Try Backend Proxy if available
  try {
    const proxyRes = await fetch(`/api/proxy?url=${encodeURIComponent(fullUrl)}`, {
      method: "GET",
    });

    // Check if proxy returned 404 (static host like GitHub Pages where /api/proxy does not exist)
    const contentType = proxyRes.headers.get("content-type") || "";
    if (proxyRes.ok && !contentType.includes("text/html")) {
      const text = await proxyRes.text();
      try {
        const json = JSON.parse(text);
        return json;
      } catch (jsonErr) {
        // If not json, fall through
      }
    }
  } catch (proxyErr) {
    // Proxy failed or unavailable (e.g. GitHub Pages static hosting), proceed to direct fetch
  }

  // 2. Direct Browser Fetch to GAS (CORS enabled by GAS /exec redirect)
  try {
    const directRes = await fetch(fullUrl, {
      method: "GET",
      mode: "cors",
      redirect: "follow",
    });

    const text = await directRes.text();
    try {
      const json = JSON.parse(text);
      return json;
    } catch (parseErr) {
      if (text.toLowerCase().includes("page cannot") || text.includes("404")) {
        throw new Error(
          "GAS側で『404: The page cannot be found』が返されました。GASエディタのデプロイ設定で【アクセスできるユーザー】が『全員（Anyone）』になっているか確認し、【新しいデプロイ】を発行してください。"
        );
      }
      if (text.includes("accounts.google.com") || text.includes("ServiceLogin")) {
        throw new Error(
          "Googleログイン画面にリダイレクトされました。GASエディタで『新しいデプロイ ＞ アクセスできるユーザー』を『全員（Anyone）』に変更してください。"
        );
      }
      throw new Error(`GASからの応答がJSON形式ではありませんでした: ${text.substring(0, 120)}`);
    }
  } catch (directErr: any) {
    if (directErr.message && directErr.message.includes("404")) throw directErr;
    if (directErr.message === "Failed to fetch" || directErr.name === "TypeError") {
      throw new Error(
        "GAS Webアプリへの通信がブロックされました。\n\n【考えられる原因】\n1. GASの『アクセスできるユーザー』が『全員 (Anyone)』になっていない\n2. URLの末尾が /exec ではなく /dev になっている"
      );
    }
    throw directErr;
  }
}

/**
 * Execute a POST request to GAS Web App.
 * Uses `Content-Type: text/plain` on direct browser fetch to bypass CORS preflight (OPTIONS)
 * which GAS does not support.
 */
export async function fetchGasPost(url: string, payload: any): Promise<any> {
  const cleanUrl = sanitizeGasUrl(url);
  if (!cleanUrl) throw new Error("GAS WebアプリURLが設定されていません。");

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

  // 1. Try Backend Proxy
  try {
    const proxyRes = await fetch(`/api/proxy?url=${encodeURIComponent(fullUrl)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payloadString,
    });

    const contentType = proxyRes.headers.get("content-type") || "";
    if (proxyRes.ok && !contentType.includes("text/html")) {
      const text = await proxyRes.text();
      try {
        const json = JSON.parse(text);
        return json;
      } catch (e) {
        // Fall through
      }
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
    try {
      const json = JSON.parse(text);
      return json;
    } catch (parseErr) {
      if (text.toLowerCase().includes("page cannot") || text.includes("404")) {
        throw new Error(
          "GAS側で『404: The page cannot be found』が返されました。GASエディタのデプロイ設定で【アクセスできるユーザー】が『全員（Anyone）』になっているか確認し、【新しいデプロイ】を発行してください。"
        );
      }
      if (text.includes("accounts.google.com") || text.includes("ServiceLogin")) {
        throw new Error(
          "Googleログイン画面にリダイレクトされました。GASエディタで『新しいデプロイ ＞ アクセスできるユーザー』を『全員（Anyone）』に変更してください。"
        );
      }
      throw new Error(`GASからの応答がJSON形式ではありませんでした: ${text.substring(0, 120)}`);
    }
  } catch (directErr: any) {
    if (directErr.message && directErr.message.includes("404")) throw directErr;
    if (directErr.message === "Failed to fetch" || directErr.name === "TypeError") {
      throw new Error(
        "GAS Webアプリへの通信がブロックされました。\n\n【考えられる原因】\n1. GASの『アクセスできるユーザー』が『全員 (Anyone)』になっていない\n2. URLの末尾が /exec ではなく /dev になっている"
      );
    }
    throw directErr;
  }
}
