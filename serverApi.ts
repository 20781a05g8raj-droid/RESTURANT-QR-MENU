import express from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import type { AuthManager } from './serverAuth.js';

export function getGeminiClient(): GoogleGenAI {
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

export function createApiRouter(authManager: AuthManager): express.Router {
  const router = express.Router();

  // Health check
  router.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  // ---- Portal Authentication & Per-Restaurant Credentials ----
  router.get('/auth/status', (_req, res) => {
    res.json(authManager.getStatus());
  });

  router.post('/auth/setup-admin', (req, res) => {
    const { email, password } = (req.body ?? {}) as { email?: string; password?: string };
    const result = authManager.claimFirstRunAdmin(String(email ?? ''), String(password ?? ''));
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ token: result.token, session: result.session });
  });

  router.post('/auth/login', (req, res) => {
    const { username, password } = (req.body ?? {}) as { username?: string; password?: string };
    const result = authManager.login(String(username ?? ''), String(password ?? ''));
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ token: result.token, session: result.session });
  });

  router.get('/auth/me', (req, res) => {
    const session = authManager.verifyAuthHeader(req.headers.authorization);
    if (!session) {
      res.status(401).json({ error: 'Not authenticated.' });
      return;
    }
    res.json({ session });
  });

  router.post('/auth/change-password', (req, res) => {
    const session = authManager.verifyAuthHeader(req.headers.authorization);
    if (!session) {
      res.status(401).json({ error: 'Not authenticated.' });
      return;
    }
    const { currentPassword, newPassword } = (req.body ?? {}) as {
      currentPassword?: string;
      newPassword?: string;
    };
    const result = authManager.changeOwnPassword(
      session,
      String(currentPassword ?? ''),
      String(newPassword ?? '')
    );
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ ok: true, account: result.account });
  });

  router.get('/auth/restaurant-accounts', (req, res) => {
    const session = authManager.verifyAuthHeader(req.headers.authorization);
    if (!session || session.role !== 'super_admin') {
      res.status(403).json({ error: 'App Owner access required.' });
      return;
    }
    res.json({ accounts: authManager.listRestaurantAccounts() });
  });

  router.post('/auth/restaurant-accounts', (req, res) => {
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

  router.delete('/auth/restaurant-accounts/:restaurantId', (req, res) => {
    const session = authManager.verifyAuthHeader(req.headers.authorization);
    if (!session || session.role !== 'super_admin') {
      res.status(403).json({ error: 'App Owner access required.' });
      return;
    }
    authManager.deleteRestaurantAccount(req.params.restaurantId);
    res.json({ ok: true });
  });

  // ---- Gemini Text-to-Speech ----
  router.post('/tts', async (req, res) => {
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

  // ---- Gemini Search Grounding Insights ----
  router.post('/insights', async (req, res) => {
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

  // ---- Fast Hinglish/Hindi/English Text Order Parser ----
  router.post('/voice-text-order', async (req, res) => {
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

  return router;
}
