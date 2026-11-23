import express from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import {
  SESSION_COOKIE_MAX_AGE_SECONDS,
  type AuthManager,
  type PortalSessionPayload,
} from './serverAuth.js';

export const SESSION_COOKIE_NAME = 'tp_portal_session';

export function parseCookies(cookieHeader?: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const rawVal = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      result[key] = decodeURIComponent(rawVal);
    } catch {
      result[key] = rawVal;
    }
  }
  return result;
}

function isHttpsRequest(req: express.Request): boolean {
  const protoHeader = String(req.headers['x-forwarded-proto'] ?? '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  return Boolean(req.secure || protoHeader === 'https' || process.env.VERCEL === '1');
}

function buildSessionCookieHeader(req: express.Request, value: string, maxAgeSeconds: number): string {
  const attrs = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}`,
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
    'HttpOnly',
  ];
  if (maxAgeSeconds === 0) {
    attrs.push('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  }
  if (isHttpsRequest(req)) {
    attrs.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    attrs.push('SameSite=Lax');
  }
  return attrs.join('; ');
}

function setSessionCookie(req: express.Request, res: express.Response, token: string): void {
  res.setHeader(
    'Set-Cookie',
    buildSessionCookieHeader(req, token, SESSION_COOKIE_MAX_AGE_SECONDS)
  );
}

function clearSessionCookie(req: express.Request, res: express.Response): void {
  res.setHeader('Set-Cookie', buildSessionCookieHeader(req, '', 0));
}

function verifyCsrfForCookieMutation(req: express.Request): boolean {
  const requestedWith = String(req.headers['x-requested-with'] ?? '').trim();
  if (requestedWith === 'TablePulse') return true;

  const originHeader = String(req.headers.origin ?? '').trim();
  const hostHeader = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  if (originHeader && hostHeader) {
    try {
      const originHost = new URL(originHeader).host.toLowerCase();
      if (originHost === hostHeader) return true;
    } catch {
      return false;
    }
  }
  return false;
}

function authenticateRequest(
  req: express.Request,
  authManager: AuthManager
): { session: PortalSessionPayload; viaCookie: boolean } | null {
  const bearerSession = authManager.verifyAuthHeader(req.headers.authorization);
  if (bearerSession) {
    return { session: bearerSession, viaCookie: false };
  }
  const cookies = parseCookies(req.headers.cookie);
  const cookieToken = cookies[SESSION_COOKIE_NAME];
  if (!cookieToken) return null;
  const cookieSession = authManager.verifySessionToken(cookieToken);
  if (!cookieSession) return null;
  return { session: cookieSession, viaCookie: true };
}

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
  router.get('/auth/status', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const authResult = authenticateRequest(req, authManager);
    res.json({
      ...authManager.getStatus(),
      hasSession: Boolean(authResult),
    });
  });

  router.post('/auth/setup-admin', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const { email, password } = (req.body ?? {}) as { email?: string; password?: string };
    const result = authManager.claimFirstRunAdmin(String(email ?? ''), String(password ?? ''));
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    setSessionCookie(req, res, result.token);
    res.json({ token: result.token, session: result.session });
  });

  router.post('/auth/login', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const { username, password } = (req.body ?? {}) as { username?: string; password?: string };
    const result = authManager.login(String(username ?? ''), String(password ?? ''));
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    setSessionCookie(req, res, result.token);
    res.json({ token: result.token, session: result.session });
  });

  router.get('/auth/me', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const authResult = authenticateRequest(req, authManager);
    if (!authResult) {
      res.status(401).json({ error: 'Not authenticated.' });
      return;
    }
    const freshToken = authManager.issueTokenForSession(authResult.session);
    setSessionCookie(req, res, freshToken);
    res.json({ session: authResult.session, token: freshToken });
  });

  router.post('/auth/logout', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const cookies = parseCookies(req.headers.cookie);
    if (cookies[SESSION_COOKIE_NAME] && !verifyCsrfForCookieMutation(req)) {
      res.status(403).json({ error: 'Invalid request origin.' });
      return;
    }
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  router.post('/auth/change-password', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const authResult = authenticateRequest(req, authManager);
    if (!authResult) {
      res.status(401).json({ error: 'Not authenticated.' });
      return;
    }
    if (authResult.viaCookie && !verifyCsrfForCookieMutation(req)) {
      res.status(403).json({ error: 'Invalid request origin.' });
      return;
    }
    const { currentPassword, newPassword } = (req.body ?? {}) as {
      currentPassword?: string;
      newPassword?: string;
    };
    const result = authManager.changeOwnPassword(
      authResult.session,
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
    res.setHeader('Cache-Control', 'no-store');
    const authResult = authenticateRequest(req, authManager);
    if (!authResult || authResult.session.role !== 'super_admin') {
      res.status(403).json({ error: 'App Owner access required.' });
      return;
    }
    res.json({ accounts: authManager.listRestaurantAccounts() });
  });

  router.post('/auth/restaurant-accounts', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const authResult = authenticateRequest(req, authManager);
    if (!authResult || authResult.session.role !== 'super_admin') {
      res.status(403).json({ error: 'App Owner access required.' });
      return;
    }
    if (authResult.viaCookie && !verifyCsrfForCookieMutation(req)) {
      res.status(403).json({ error: 'Invalid request origin.' });
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
    res.setHeader('Cache-Control', 'no-store');
    const authResult = authenticateRequest(req, authManager);
    if (!authResult || authResult.session.role !== 'super_admin') {
      res.status(403).json({ error: 'App Owner access required.' });
      return;
    }
    if (authResult.viaCookie && !verifyCsrfForCookieMutation(req)) {
      res.status(403).json({ error: 'Invalid request origin.' });
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
