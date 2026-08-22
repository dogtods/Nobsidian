import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

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
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(req.body)
      });
      
      const text = await fetchRes.text();
      try {
        const data = JSON.parse(text);
        res.json(data);
      } catch (e) {
        let errorMsg = `GASからの応答がJSONではありませんでした (HTTP ${fetchRes.status})`;
        if (fetchRes.status === 404) {
          errorMsg = "GAS Webアプリが見つかりません(404)。GASエディタで『新しいデプロイ』を作成し、発行された最新URL（末尾が /exec）を設定してください。";
        } else if (text.includes("accounts.google.com") || text.includes("ServiceLogin") || text.includes("Google Accounts")) {
          errorMsg = "Googleログイン画面にリダイレクトされました。GASのデプロイ設定で「アクセスできるユーザー」を『全員（Anyone）』に変更してください。";
        }
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
        method: "GET"
      });
      
      const text = await fetchRes.text();
      try {
        const data = JSON.parse(text);
        res.json(data);
      } catch (e) {
        let errorMsg = `GASからの応答がJSONではありませんでした (HTTP ${fetchRes.status})`;
        if (fetchRes.status === 404) {
          errorMsg = "GAS Webアプリが見つかりません(404)。GASエディタで『新しいデプロイ』を作成し、発行された最新URL（末尾が /exec）を設定してください。";
        } else if (text.includes("accounts.google.com") || text.includes("ServiceLogin") || text.includes("Google Accounts")) {
          errorMsg = "Googleログイン画面にリダイレクトされました。GASのデプロイ設定で「アクセスできるユーザー」を『全員（Anyone）』に変更してください。";
        }
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
