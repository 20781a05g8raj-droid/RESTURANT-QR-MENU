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
import { AuthManager } from './serverAuth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';
const authManager = new AuthManager({
  baseDir: path.resolve(__dirname, '.data'),
});

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion: 'v1beta',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function formatGeminiError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const raw = error.message || fallback;
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } };
    if (parsed?.error?.message) return parsed.error.message;
  } catch {
    // plain text error
  }
  return raw.length > 180 ? `${raw.slice(0, 180)}...` : raw;
}

const app = express();
app.use(express.json({ limit: '2mb' }));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// ---- Portal Authentication & Per-Restaurant Credentials ----
app.get('/api/auth/status', (_req, res) => {
  res.json(authManager.getStatus());
});

app.post('/api/auth/setup-admin', (req, res) => {
  const { email, password } = (req.body ?? {}) as { email?: string; password?: string };
  const result = authManager.claimFirstRunAdmin(String(email ?? ''), String(password ?? ''));
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({ token: result.token, session: result.session });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = (req.body ?? {}) as { username?: string; password?: string };
  const result = authManager.login(String(username ?? ''), String(password ?? ''));
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({ token: result.token, session: result.session });
});

app.get('/api/auth/me', (req, res) => {
  const session = authManager.verifyAuthHeader(req.headers.authorization);
  if (!session) {
    res.status(401).json({ error: 'Not authenticated.' });
    return;
  }
  res.json({ session });
});

app.get('/api/auth/restaurant-accounts', (req, res) => {
  const session = authManager.verifyAuthHeader(req.headers.authorization);
  if (!session || session.role !== 'super_admin') {
    res.status(403).json({ error: 'App Owner access required.' });
    return;
  }
  res.json({ accounts: authManager.listRestaurantAccounts() });
});

app.post('/api/auth/restaurant-accounts', (req, res) => {
  const session = authManager.verifyAuthHeader(req.headers.authorization);
  if (!session || session.role !== 'super_admin') {
    res.status(403).json({ error: 'App Owner access required.' });
    return;
  }
  const { restaurantId, username, password } = (req.body ?? {}) as {
    restaurantId?: string;
    username?: string;
    password?: string;
  };
  const result = authManager.upsertRestaurantAccount({
    restaurantId: String(restaurantId ?? ''),
    username: String(username ?? ''),
    password: typeof password === 'string' ? password : undefined,
  });
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({ account: result.account });
});

app.delete('/api/auth/restaurant-accounts/:restaurantId', (req, res) => {
  const session = authManager.verifyAuthHeader(req.headers.authorization);
  if (!session || session.role !== 'super_admin') {
    res.status(403).json({ error: 'App Owner access required.' });
    return;
  }
  authManager.deleteRestaurantAccount(req.params.restaurantId);
  res.json({ ok: true });
});

/**
 * Text-to-Speech endpoint using gemini-3.8-flash-tts.
 * Returns complete WAV base64 audio (24kHz mono 16-bit) for menu narration & kitchen order announcements.
 */
app.post('/api/tts', async (req, res) => {
  try {
    const { text, style, voiceName } = req.body as {
      text?: string;
      style?: string;
      voiceName?: string;
    };

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      res.status(400).json({ error: 'Text is required for speech generation.' });
      return;
    }

    const safeText = text.trim().slice(0, 800);
    const allowedVoices = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];
    const selectedVoice =
      voiceName && allowedVoices.includes(voiceName) ? voiceName : 'Kore';

    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: safeText,
              speechMetadata: {
                style:
                  style ||
                  'Warm, welcoming hospitality concierge speaking clearly and naturally',
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: selectedVoice },
          },
        },
      },
    });

    const base64Audio =
      response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!base64Audio) {
      res.status(502).json({ error: 'No audio was returned by Gemini TTS.' });
      return;
    }

    res.json({
      audioBase64: base64Audio,
      mimeType: 'audio/wav',
    });
  } catch (error) {
    const message = formatGeminiError(error, 'TTS request failed');
    console.error('[TTS Error]', message);
    res.status(500).json({ error: message });
  }
});

/**
 * Google Search Grounding endpoint using gemini-4-hydrogen + { googleSearch: {} }.
 * Powers real-time local restaurant market trends, pricing benchmarks, and customer dish/allergen Q&A.
 */
app.post('/api/insights', async (req, res) => {
  try {
    const { query, restaurantName, city, cuisine, mode } = req.body as {
      query?: string;
      restaurantName?: string;
      city?: string;
      cuisine?: string;
      mode?: 'market' | 'dish';
    };

    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      res.status(400).json({ error: 'A search query is required.' });
      return;
    }

    const ai = getGeminiClient();
    const prompt =
      mode === 'dish'
        ? `Answer this restaurant diner's question accurately and concisely (under 110 words) using up-to-date Google Search data. Restaurant: ${restaurantName || 'Restaurant'} (${cuisine || 'Dining'} in ${city || 'India'}). Question: ${query.trim()}`
        : `You are a restaurant operations & hospitality analyst. Use up-to-date Google Search data to answer this request concisely in clear bullet points (under 150 words) for ${restaurantName || 'a restaurant'} serving ${cuisine || 'multi-cuisine'} in ${city || 'India'}: ${query.trim()}`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const rawChunks =
      response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    const sources: { title: string; uri: string }[] = [];
    const seen = new Set<string>();

    for (const chunk of rawChunks) {
      const uri = chunk?.web?.uri;
      const title = chunk?.web?.title || uri;
      if (uri && !seen.has(uri)) {
        seen.add(uri);
        sources.push({ title: String(title), uri });
      }
    }

    res.json({
      summary: response.text ?? 'No insight generated.',
      sources,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Search grounding failed';
    console.error('[Insights Error]', message);
    res.status(500).json({ error: message });
  }
});

/**
 * Fast natural-language Hinglish/Hindi/English text order parser using gemini-4-hydrogen structured JSON.
 * Works seamlessly alongside Live API voice ordering when customers type or use quick-dictation.
 */
app.post('/api/voice-text-order', async (req, res) => {
  try {
    const { utterance, menuItems } = req.body as {
      utterance?: string;
      menuItems?: Array<{ id: string; name: string; price: number; available: boolean }>;
    };

    if (!utterance || !Array.isArray(menuItems) || menuItems.length === 0) {
      res.status(400).json({ error: 'Utterance and menuItems are required.' });
      return;
    }

    const availableMenu = menuItems.filter((m) => m.available);
    const catalogText = availableMenu
      .map((m) => `- id: "${m.id}", name: "${m.name}", price: ${m.price}`)
      .join('\n');

    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Customer order request (may be English, Hindi, or Hinglish): "${utterance.slice(0, 400)}"\n\nAvailable Menu:\n${catalogText}\n\nMatch requested dishes ONLY to available menu items above. Include any special kitchen notes (like less spicy, extra butter) and a friendly short confirmation reply in the same language the customer used.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  menuItemId: { type: Type.STRING },
                  quantity: { type: Type.INTEGER },
                },
                required: ['menuItemId', 'quantity'],
              },
            },
            notes: { type: Type.STRING },
            reply: { type: Type.STRING },
          },
          required: ['items', 'notes', 'reply'],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    res.json(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Order parsing failed';
    console.error('[Parse Order Error]', message);
    res.status(500).json({ error: message });
  }
});

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
