import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import {
  FunctionDeclaration,
  GoogleGenAI,
  LiveServerMessage,
  Modality,
  Type,
} from '@google/genai';
import { AuthManager } from './serverAuth.js';
import { createApiRouter, getGeminiClient } from './serverApi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';
const authManager = new AuthManager({
  baseDir: path.resolve(__dirname, '.data'),
});

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use('/api', createApiRouter(authManager));

const server = http.createServer(app);

/**
 * Gemini Live API (gemini-3.8-live) WebSocket bridge for real-time voice ordering.
 * Accepts 16kHz PCM audio + menu setup message, streams 24kHz PCM voice + live cart tool calls back.
 */
const wss = new WebSocketServer({ server, path: '/api/live-order' });

const addToCartDeclaration: FunctionDeclaration = {
  name: 'add_to_cart',
  description: 'Add an available dish from the restaurant menu to the customer table cart.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      menuItemId: {
        type: Type.STRING,
        description: 'Exact menuItemId from the provided available menu list.',
      },
      quantity: {
        type: Type.INTEGER,
        description: 'Quantity to add (1 to 15).',
      },
    },
    required: ['menuItemId', 'quantity'],
  },
};

const removeFromCartDeclaration: FunctionDeclaration = {
  name: 'remove_from_cart',
  description: 'Remove a dish from the customer table cart.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      menuItemId: {
        type: Type.STRING,
        description: 'Exact menuItemId to remove from cart.',
      },
    },
    required: ['menuItemId'],
  },
};

const placeOrderDeclaration: FunctionDeclaration = {
  name: 'place_order',
  description: 'Confirm and submit the current cart as a live order to the kitchen.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      notes: {
        type: Type.STRING,
        description: 'Optional kitchen instructions (e.g., less spicy, no onion).',
      },
    },
  },
};

wss.on('connection', (clientWs: WebSocket) => {
  let liveSession: Awaited<ReturnType<GoogleGenAI['live']['connect']>> | null = null;
  let closed = false;

  const sendSafe = (payload: Record<string, unknown>) => {
    if (!closed && clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify(payload));
    }
  };

  clientWs.on('message', async (rawData) => {
    try {
      const msg = JSON.parse(rawData.toString()) as {
        type?: string;
        restaurantName?: string;
        tableNumber?: number;
        menuItems?: Array<{
          id: string;
          name: string;
          price: number;
          available: boolean;
          veg: boolean;
          category: string;
        }>;
        audio?: string;
        text?: string;
      };

      if (msg.type === 'init' && !liveSession) {
        const ai = getGeminiClient();
        const menuList = (msg.menuItems ?? [])
          .map(
            (m) =>
              `- [${m.available ? 'AVAILABLE' : 'SOLD OUT'}] id="${m.id}" | ${m.name} (${m.veg ? 'Veg' : 'Non-Veg'}, ${m.category}) | Rs ${m.price}`
          )
          .join('\n');

        const systemInstruction = `You are the friendly real-time voice dining steward for "${msg.restaurantName || 'TablePulse Restaurant'}" serving Table ${msg.tableNumber || 1}.
You fluently understand and respond in English, Hindi, and Hinglish (match the customer's language).
Menu right now:
${menuList}

Rules:
1. Keep spoken responses warm, natural, and concise (1-2 short sentences).
2. Whenever the guest asks for a dish that is AVAILABLE, immediately call add_to_cart with the exact menuItemId and quantity.
3. If a dish is SOLD OUT, politely apologize and suggest an available alternative from the menu.
4. When the guest says they are done / confirm / place order, call place_order with any dietary notes.
5. Never invent items or prices not listed above.`;

        liveSession = await ai.live.connect({
          model: 'gemini-3.8-live',
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            tools: [
              {
                functionDeclarations: [
                  addToCartDeclaration,
                  removeFromCartDeclaration,
                  placeOrderDeclaration,
                ],
              },
            ],
            systemInstruction,
          },
          callbacks: {
            onopen: () => {
              sendSafe({ type: 'ready' });
            },
            onmessage: (message: LiveServerMessage) => {
              const content = message.serverContent;
              if (content?.inputTranscription?.text) {
                sendSafe({
                  type: 'inputTranscript',
                  text: content.inputTranscription.text,
                });
              }
              if (content?.outputTranscription?.text) {
                sendSafe({
                  type: 'outputTranscript',
                  text: content.outputTranscription.text,
                });
              }
              for (const part of content?.modelTurn?.parts ?? []) {
                if (part.inlineData?.data) {
                  sendSafe({ type: 'audio', audio: part.inlineData.data });
                }
              }
              if (content?.interrupted) {
                sendSafe({ type: 'interrupted' });
              }
              if (message.toolCall?.functionCalls?.length) {
                const responses = [];
                for (const call of message.toolCall.functionCalls) {
                  sendSafe({
                    type: 'toolCall',
                    name: call.name,
                    args: call.args ?? {},
                  });
                  responses.push({
                    id: call.id,
                    name: call.name,
                    response: { result: 'ok' },
                  });
                }
                liveSession?.sendToolResponse({ functionResponses: responses });
              }
            },
            onerror: (err: unknown) => {
              const errMsg = err instanceof Error ? err.message : 'Live session error';
              sendSafe({ type: 'error', message: errMsg });
            },
            onclose: () => {
              sendSafe({ type: 'closed' });
            },
          },
        });
        return;
      }

      if (msg.audio && liveSession) {
        liveSession.sendRealtimeInput({
          audio: { data: msg.audio, mimeType: 'audio/pcm;rate=16000' },
        });
      } else if (msg.text && liveSession) {
        liveSession.sendRealtimeInput({ text: msg.text });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'WebSocket processing error';
      sendSafe({ type: 'error', message });
    }
  });

  clientWs.on('close', () => {
    closed = true;
    try {
      liveSession?.close();
    } catch {
      // ignore close errors
    }
    liveSession = null;
  });
});

async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`TablePulse server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start TablePulse server:', err);
  process.exit(1);
});
