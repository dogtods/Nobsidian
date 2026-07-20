import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));

  // API routes FIRST
  app.post("/api/tts", async (req, res) => {
    try {
      const { text, apiKey: clientApiKey } = req.body;
      const apiKey = clientApiKey || process.env.GOOGLE_CLOUD_TTS_API_KEY;
      if (!apiKey) {
        return res.status(400).json({ error: "APIキーが設定されていません。AI設定よりGoogle Cloud TTS APIキーを設定してください。" });
      }

      const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { text: text.substring(0, 4900) }, // TTS limit is 5000 chars
          voice: { languageCode: "ja-JP", name: "ja-JP-Neural2-B" },
          audioConfig: { audioEncoding: "MP3" }
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Google TTS API error: ${errorData}`);
      }

      const data = await response.json();
      res.json({ audioContent: data.audioContent, mimeType: "audio/mp3" });
    } catch (error: any) {
      console.error("TTS Error:", error);
      res.status(500).json({ error: error.message });
    }
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
