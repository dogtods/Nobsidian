import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

function diagnoseGasError(text: string, status: number): string {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

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
    return (
      "Googleアカウントのログイン認証画面（HTML）が返されました。\n\n" +
      "【原因】\n" +
      "GAS Webアプリのアクセス権限が「全員」になっていないため、Googleがログインを要求しています。\n\n" +
      "【解決手順】\n" +
      "1. スプレッドシートの「拡張機能 ＞ Apps Script」を開く\n" +
      "2. 右上の「デプロイ ＞ デプロイの管理」を開く\n" +
      "3. 鉛筆マーク（編集）をクリックし：\n" +
      "   ・【バージョン】: 『新バージョン』\n" +
      "   ・【アクセスできるユーザー】: 『全員（Anyone）』に変更\n" +
      "4. 「デプロイ」を押して完了してください。"
    );
  }

  if (status === 404 || lower.includes("page cannot") || lower.includes("404 not found") || lower.includes("the page cannot be found")) {
    return "GAS Webアプリが見つかりません(404)。デプロイ設定で「アクセスできるユーザー」が『全員（Anyone）』になっているか確認し、『新しいデプロイ』を作成してください。";
  }

  if (lower.includes("script error") || trimmed.includes("Google Apps Script")) {
    return `GAS側でスクリプト実行エラーが発生しました: ${trimmed.substring(0, 200)}`;
  }

  return `GASからの応答がJSON形式ではありませんでした (HTTP ${status}): ${trimmed.substring(0, 100)}`;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));

  // Proxy routes to bypass iframe CORS for GAS
  app.post("/api/proxy", async (req, res) => {
    try {
      const targetUrl = req.query.url as string;
      if (!targetUrl) return res.status(400).json({ error: "URLパラメータが指定されていません" });

      const fetchRes = await fetch(targetUrl, {
        method: "POST",
        headers: { 
          "Content-Type": "text/plain",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json, text/plain, */*"
        },
        body: JSON.stringify(req.body),
        redirect: "follow"
      });
      
      const text = await fetchRes.text();
      try {
        const data = JSON.parse(text);
        res.json(data);
      } catch (e) {
        const errorMsg = diagnoseGasError(text, fetchRes.status);
        res.status(fetchRes.status >= 400 ? fetchRes.status : 500).json({
          error: errorMsg,
          rawStatus: fetchRes.status,
          rawResponse: text.substring(0, 300)
        });
      }
    } catch (e: any) {
      res.status(500).json({ error: `プロキシ通信エラー: ${e.message}` });
    }
  });

  app.get("/api/proxy", async (req, res) => {
    try {
      const targetUrl = req.query.url as string;
      if (!targetUrl) return res.status(400).json({ error: "URLパラメータが指定されていません" });
      
      const fetchRes = await fetch(targetUrl, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json, text/plain, */*"
        },
        redirect: "follow"
      });
      
      const text = await fetchRes.text();
      try {
        const data = JSON.parse(text);
        res.json(data);
      } catch (e) {
        const errorMsg = diagnoseGasError(text, fetchRes.status);
        res.status(fetchRes.status >= 400 ? fetchRes.status : 500).json({
          error: errorMsg,
          rawStatus: fetchRes.status,
          rawResponse: text.substring(0, 300)
        });
      }
    } catch (e: any) {
      res.status(500).json({ error: `プロキシ通信エラー: ${e.message}` });
    }
  });

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
