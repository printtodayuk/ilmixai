import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { createServer as createHttpServer } from "http";
import { WebSocketServer } from "ws";
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;
  
  const httpServer = createHttpServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: "/live" });

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || "",
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  // Example map of connected sessions
  const sessions = new Map();

  app.use(express.json());

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Handle Gemini Live WebSocket
  wss.on("connection", async (clientWs) => {
    let session: any = null;
    let connected = false;
    let accumulatedInstruction = "You are a helpful IT support AI agent. The user is reporting a problem. Acknowledge the problem, collect details, and tell them you will create a ticket.";

    clientWs.on("message", async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        
        if (msg.type === 'init') {
          if (msg.instructions) {
            accumulatedInstruction = msg.instructions;
          }
          
          session = await ai.live.connect({
            model: "gemini-3.1-flash-live-preview",
            callbacks: {
              onmessage: (message: any) => {
                const audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                if (audio) {
                   clientWs.send(JSON.stringify({ audio }));
                }
                if (message.serverContent?.interrupted) {
                   clientWs.send(JSON.stringify({ interrupted: true }));
                }
                const transcription = message.serverContent?.modelTurn?.parts[0]?.text;
                if (transcription) {
                   clientWs.send(JSON.stringify({ transcriptText: transcription }));
                }
              },
              onclose: () => {
                clientWs.send(JSON.stringify({ closed: true }));
              }
            },
            config: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } },
              },
              systemInstruction: accumulatedInstruction,
            },
          });
          connected = true;
          // if there's an initial greeting, we could trigger it, but Live API might naturally greet if instructed.
          clientWs.send(JSON.stringify({ connected: true }));
        }

        if (msg.audio && connected && session) {
          await session.sendRealtimeInput({
            audio: { data: msg.audio, mimeType: "audio/pcm;rate=16000" },
          });
        }
      } catch (err) {
        console.error("WS error:", err);
      }
    });
    
    clientWs.on("close", () => {
       if (session && typeof session.close === 'function') {
         session.close();
       }
    });
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

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
