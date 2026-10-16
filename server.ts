import express from "express";
import path from "path";
import fs from "fs";
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

  // Same-origin PDF.js Worker to guarantee zero-CORS worker loading
  app.get("/api/pdf.worker.mjs", (req, res) => {
    try {
      const workerPath = path.join(process.cwd(), "node_modules/pdfjs-dist/build/pdf.worker.min.mjs");
      if (fs.existsSync(workerPath)) {
        res.setHeader("Content-Type", "application/javascript; charset=UTF-8");
        return res.sendFile(workerPath);
      }
      res.status(404).send("Worker not found");
    } catch (e: any) {
      res.status(500).send(e.message);
    }
  });

  // Binary PDF Proxy with Google Drive confirmation handling, anti-bot bypass, and HTML PDF extractor
  app.get("/api/proxy-pdf", async (req, res) => {
    try {
      let targetUrl = req.query.url as string;
      if (!targetUrl) return res.status(400).json({ error: "URLパラメータが指定されていません" });

      targetUrl = targetUrl.trim();

      // Convert arXiv abstract or html view to direct PDF
      if (targetUrl.includes("arxiv.org/abs/") || targetUrl.includes("arxiv.org/html/")) {
        targetUrl = targetUrl.replace(/arxiv\.org\/(?:abs|html)\//, "arxiv.org/pdf/") + ".pdf";
      }

      // Format Google Drive URLs ONLY when domain is drive.google.com or docs.google.com
      const isDrive = targetUrl.includes("drive.google.com") || targetUrl.includes("docs.google.com");
      let driveFileId: string | null = null;
      if (isDrive) {
        const driveMatch = targetUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || targetUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        if (driveMatch) {
          driveFileId = driveMatch[1];
          targetUrl = `https://drive.usercontent.google.com/download?id=${driveFileId}&export=download&authuser=0`;
        }
      }

      const fetchHeaders = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/pdf, application/octet-stream, text/html, */*"
      };

      let fetchRes = await fetch(targetUrl, {
        headers: fetchHeaders,
        redirect: "follow"
      });

      // Anti-bot fallback: If 403 Forbidden / 401 / 404, retry with clean curl user-agent
      if (!fetchRes.ok && (fetchRes.status === 403 || fetchRes.status === 401 || fetchRes.status === 404)) {
        try {
          const curlRes = await fetch(targetUrl, {
            headers: {
              "User-Agent": "curl/7.88.1",
              "Accept": "*/*"
            },
            redirect: "follow"
          });
          if (curlRes.ok) {
            fetchRes = curlRes;
          }
        } catch (_) {}
      }

      // Secondary Google Drive fallback if usercontent failed
      if (!fetchRes.ok && isDrive && driveFileId) {
        const ucUrl = `https://drive.google.com/uc?export=download&id=${driveFileId}&confirm=t`;
        try {
          const ucRes = await fetch(ucUrl, {
            headers: fetchHeaders,
            redirect: "follow"
          });
          if (ucRes.ok) {
            fetchRes = ucRes;
          }
        } catch (_) {}
      }

      if (!fetchRes.ok) {
        return res.status(fetchRes.status).json({
          error: `PDF取得失敗: HTTP ${fetchRes.status} (${fetchRes.statusText})`,
          status: fetchRes.status,
          targetUrl
        });
      }

      const finalBaseUrl = fetchRes.url || targetUrl;
      let buffer = await fetchRes.arrayBuffer();
      let nodeBuf = Buffer.from(buffer);

      // Check for Google Drive virus-scan / download-anyway confirmation page
      if (nodeBuf.subarray(0, 5).toString() !== "%PDF-") {
        const text = nodeBuf.toString("utf-8");
        // Look for Google Drive confirmation URL
        const confirmMatch = text.match(/href="(\/uc\?export=download[^"]+)"/) ||
                             text.match(/action="(\/uc\?export=download[^"]+)"/) ||
                             text.match(/href="(https:\/\/[^"]*drive\.usercontent\.google\.com[^"]+)"/);

        if (confirmMatch) {
          const nextUrl = confirmMatch[1].startsWith("http")
            ? confirmMatch[1].replace(/&amp;/g, "&")
            : `https://drive.google.com${confirmMatch[1].replace(/&amp;/g, "&")}`;

          let confirmRes = await fetch(nextUrl, {
            headers: fetchHeaders,
            redirect: "follow"
          });

          if (confirmRes.ok) {
            buffer = await confirmRes.arrayBuffer();
            nodeBuf = Buffer.from(buffer);
          }
        }
      }

      // Check if it's a valid PDF (starts with %PDF- or contains %PDF- in header)
      const isPdf = nodeBuf.subarray(0, 5).toString() === "%PDF-" ||
                    nodeBuf.subarray(0, 1024).includes(Buffer.from("%PDF-"));

      if (!isPdf) {
        const htmlText = nodeBuf.toString("utf-8");
        const detectedPdfLinks: { title: string; url: string }[] = [];
        const seenUrls = new Set<string>();

        const addCandidate = (rawUrl: string, titleHint?: string) => {
          if (!rawUrl) return;
          try {
            const cleanUrl = rawUrl.trim().replace(/&amp;/g, "&");
            // Resolve relative URLs with the final redirected page URL!
            const absoluteUrl = new URL(cleanUrl, finalBaseUrl).href;
            if (seenUrls.has(absoluteUrl)) return;
            seenUrls.add(absoluteUrl);

            let label = (titleHint || "").trim().replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
            if (!label || label.length < 2) {
              const filename = absoluteUrl.split("/").pop()?.split("?")[0] || "document.pdf";
              label = `PDFドキュメント (${filename})`;
            }
            if (label.length > 50) label = label.slice(0, 50) + "…";
            detectedPdfLinks.push({ title: label, url: absoluteUrl });
          } catch (_) {}
        };

        // 1. Google Scholar / Highwire / DublinCore meta tags
        const metaRegex = /<meta\s+[^>]*name=["'](?:citation_pdf_url|dc\.identifier\.pdf|dc\.identifier\.url)["'][^>]*content=["']([^"']+)["']/gi;
        let m: RegExpExecArray | null;
        while ((m = metaRegex.exec(htmlText)) !== null) {
          addCandidate(m[1], "論文・記事 本文PDF (citation)");
        }

        // 2. Link rel="alternate" type="application/pdf"
        const linkRelRegex = /<link\s+[^>]*type=["']application\/pdf["'][^>]*href=["']([^"']+)["']/gi;
        while ((m = linkRelRegex.exec(htmlText)) !== null) {
          addCandidate(m[1], "公式PDFリンク (alternate)");
        }

        // 3. Anchor tags pointing to .pdf or download pdf
        const aRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
        while ((m = aRegex.exec(htmlText)) !== null) {
          const href = m[1];
          const innerText = m[2];
          const isPdfUrl = /\.pdf(?:[?#]|$)/i.test(href) ||
                           /\/pdf\//i.test(href) ||
                           /download.*pdf/i.test(href) ||
                           /pdf.*download/i.test(href) ||
                           /export=download/i.test(href);
          const hasPdfText = /pdf|本文|ダウンロード|全文|論文/i.test(innerText);

          if (isPdfUrl || (hasPdfText && (href.startsWith("http") || href.startsWith("/")))) {
            addCandidate(href, innerText || "PDFダウンロード");
          }
        }

        // 4. iframe / embed / object tags
        const embedRegex = /<(?:iframe|embed|object)\s+[^>]*(?:src|data)=["']([^"']+\.pdf[^"']*)["']/gi;
        while ((m = embedRegex.exec(htmlText)) !== null) {
          addCandidate(m[1], "埋め込みPDFドキュメント");
        }

        return res.status(200).json({
          isHtml: true,
          targetUrl: finalBaseUrl,
          detectedPdfLinks: detectedPdfLinks.slice(0, 8),
          message: "指定されたリンク先はWebページでした。以下の候補リンクからPDFを選択してください。"
        });
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Length", nodeBuf.length);
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.send(nodeBuf);
    } catch (e: any) {
      res.status(500).json({ error: `PDFプロキシエラー: ${e.message}` });
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
