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
      const apiKey = clientApiKey || process.env.GEMINI_API_KEY_CUSTOM || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(400).json({ error: "APIキーが設定されていません。AI設定より有効化してください。" });
      }

      const ai = new GoogleGenAI({ apiKey });

      const interaction = await ai.interactions.create({
        model: 'gemini-3.1-flash-tts-preview',
        input: text.substring(0, 4900),
        response_modalities: ['AUDIO'],
        generation_config: {
          speech_config: {
            language: "ja-jp",
            voice: "kore"
          }
        }
      });

      let audioData = null;
      let mimeType = 'audio/mp3';
      for (const step of interaction.steps) {
        if (step.type === 'model_output') {
          const audioContent = step.content?.find(c => c.type === 'audio');
          if (audioContent && audioContent.data) {
            audioData = audioContent.data;
            if (audioContent.mime_type) {
              mimeType = audioContent.mime_type;
            }
          }
        }
      }

      if (!audioData) {
        throw new Error('Gemini TTS failed to return audio data.');
      }

      res.json({ audioContent: audioData, mimeType });
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
