import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface PortalSessionPayload {
  role: 'super_admin' | 'owner';
  username: string;
  restaurantId: string | null;
}

export type PasswordUpdatedBy = 'app_owner' | 'restaurant_owner';

export interface RestaurantAccountSummary {
  username: string;
  updatedAt: string;
  passwordUpdatedBy: PasswordUpdatedBy;
}

interface StoredAdminAccount {
  email: string;
  salt: string;
  hash: string;
  createdAt: string;
}

interface StoredRestaurantAccount {
  restaurantId: string;
  username: string;
  salt: string;
  hash: string;
  updatedAt: string;
  passwordUpdatedBy?: PasswordUpdatedBy;
}

interface AuthStoreData {
  adminAccount?: StoredAdminAccount;
  restaurantAccounts: Record<string, StoredRestaurantAccount>;
}

const DEFAULT_APP_OWNER_EMAIL = 'rajensu264@gmail.com';
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const VALID_RESTAURANT_ID = /^[a-zA-Z0-9_-]{2,80}$/;

export function hashPassword(password: string): { salt: string; hash: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password: string, salt: string, expectedHashHex: string): boolean {
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHashHex, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function constantTimeEqualString(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function signToken(payload: PortalSessionPayload, secret: string): string {
  const body = {
    ...payload,
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function verifyToken(token: string, secret: string): PortalSessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;

  const expectedSig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expectedSig, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
      role?: string;
      username?: string;
      restaurantId?: string | null;
      exp?: number;
    };
    if (!parsed.exp || Date.now() > parsed.exp) return null;
    if (parsed.role !== 'super_admin' && parsed.role !== 'owner') return null;
    if (typeof parsed.username !== 'string' || !parsed.username) return null;
    return {
      role: parsed.role,
      username: parsed.username,
      restaurantId: typeof parsed.restaurantId === 'string' ? parsed.restaurantId : null,
    };
  } catch {
    return null;
  }
}

export interface AuthManagerOptions {
  baseDir: string;
  storeFileName?: string;
  env?: Record<string, string | undefined>;
}

export class AuthManager {
  private readonly baseDir: string;
  private readonly storePath: string;
  private readonly env: Record<string, string | undefined>;
  private readonly signingSecret: string;
  private store: AuthStoreData;

  constructor(options: AuthManagerOptions) {
    this.env = options.env ?? process.env;
    const effectiveBase =
      this.env.VERCEL === '1'
        ? path.join(os.tmpdir(), 'tablepulse-data')
        : options.baseDir;
    this.baseDir = path.resolve(effectiveBase);
    const fileName = options.storeFileName ?? 'auth-store.json';
    const resolved = path.resolve(this.baseDir, fileName);
    if (!resolved.startsWith(this.baseDir + path.sep)) {
      throw new Error('Auth store path escapes base directory.');
    }
    this.storePath = resolved;
    this.signingSecret =
      (this.env.SESSION_SECRET && this.env.SESSION_SECRET.trim().length >= 16
        ? this.env.SESSION_SECRET.trim()
        : null) ?? crypto.randomBytes(32).toString('hex');
    this.store = this.loadStore();
  }

  private getAppOwnerEmail(): string {
    return (this.env.APP_OWNER_EMAIL || DEFAULT_APP_OWNER_EMAIL).trim().toLowerCase();
  }

  private getEnvAdminPassword(): string {
    return (this.env.APP_OWNER_PASSWORD || '').trim();
  }

  private loadStore(): AuthStoreData {
    try {
      if (fs.existsSync(this.storePath)) {
        const raw = fs.readFileSync(this.storePath, 'utf8');
        const parsed = JSON.parse(raw) as Partial<AuthStoreData>;
        return {
          adminAccount: parsed.adminAccount,
          restaurantAccounts: parsed.restaurantAccounts ?? {},
        };
      }
    } catch {
      // fall back to clean store
    }
    return { restaurantAccounts: {} };
  }

  private saveStore(): void {
    try {
      fs.mkdirSync(this.baseDir, { recursive: true });
      fs.writeFileSync(this.storePath, JSON.stringify(this.store, null, 2), { mode: 0o600 });
    } catch {
      // On read-only serverless runtimes, keep in-memory state intact without crashing
    }
  }

  /**
   * Public auth status never discloses the App Owner's email address.
   */
  getStatus() {
    const usesEnvPassword = this.getEnvAdminPassword().length > 0;
    const adminConfigured = usesEnvPassword || Boolean(this.store.adminAccount);
    return {
      adminConfigured,
      usesEnvPassword,
    };
  }

  claimFirstRunAdmin(
    email: string,
    password: string
  ):
    | { ok: true; token: string; session: PortalSessionPayload }
    | { ok: false; status: number; error: string } {
    if (this.getEnvAdminPassword().length > 0 || this.store.adminAccount) {
      return {
        ok: false,
        status: 409,
        error: 'App Owner account is already configured. Please sign in.',
      };
    }

    const normalizedEmail = String(email || '').trim().toLowerCase();
    const expectedEmail = this.getAppOwnerEmail();
    if (normalizedEmail !== expectedEmail) {
      return {
        ok: false,
        status: 400,
        error: 'Invalid App Owner email address.',
      };
    }

    const cleanPassword = String(password || '');
    if (cleanPassword.length < 6 || cleanPassword.length > 128) {
      return {
        ok: false,
        status: 400,
        error: 'Password must be between 6 and 128 characters.',
      };
    }

    const { salt, hash } = hashPassword(cleanPassword);
    this.store.adminAccount = {
      email: expectedEmail,
      salt,
      hash,
      createdAt: new Date().toISOString(),
    };
    this.saveStore();

    const session: PortalSessionPayload = {
      role: 'super_admin',
      username: expectedEmail,
      restaurantId: null,
    };
    return {
      ok: true,
      token: signToken(session, this.signingSecret),
      session,
    };
  }

  login(
    username: string,
    password: string
  ):
    | { ok: true; token: string; session: PortalSessionPayload }
    | { ok: false; status: number; error: string } {
    const normalizedUsername = String(username || '').trim().toLowerCase();
    const cleanPassword = String(password || '');
    if (!normalizedUsername || !cleanPassword) {
      return { ok: false, status: 400, error: 'Username and password are required.' };
    }

    const appOwnerEmail = this.getAppOwnerEmail();
    if (normalizedUsername === appOwnerEmail) {
      const envPassword = this.getEnvAdminPassword();
      if (envPassword.length > 0) {
        if (constantTimeEqualString(cleanPassword, envPassword)) {
          const session: PortalSessionPayload = {
            role: 'super_admin',
            username: appOwnerEmail,
            restaurantId: null,
          };
          return { ok: true, token: signToken(session, this.signingSecret), session };
        }
        return { ok: false, status: 401, error: 'Invalid username or password.' };
      }

      if (
        this.store.adminAccount &&
        verifyPassword(cleanPassword, this.store.adminAccount.salt, this.store.adminAccount.hash)
      ) {
        const session: PortalSessionPayload = {
          role: 'super_admin',
          username: appOwnerEmail,
          restaurantId: null,
        };
        return { ok: true, token: signToken(session, this.signingSecret), session };
      }
      return { ok: false, status: 401, error: 'Invalid username or password.' };
    }

    const matchedAccount = Object.values(this.store.restaurantAccounts).find(
      (acc) => acc.username === normalizedUsername
    );
    if (
      matchedAccount &&
      verifyPassword(cleanPassword, matchedAccount.salt, matchedAccount.hash)
    ) {
      const session: PortalSessionPayload = {
        role: 'owner',
        username: matchedAccount.username,
        restaurantId: matchedAccount.restaurantId,
      };
      return { ok: true, token: signToken(session, this.signingSecret), session };
    }

    return { ok: false, status: 401, error: 'Invalid username or password.' };
  }

  verifyAuthHeader(authHeader?: string): PortalSessionPayload | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) return null;
    return verifyToken(token, this.signingSecret);
  }

  listRestaurantAccounts(): Record<string, RestaurantAccountSummary> {
    const output: Record<string, RestaurantAccountSummary> = {};
    for (const [restaurantId, acc] of Object.entries(this.store.restaurantAccounts)) {
      output[restaurantId] = {
        username: acc.username,
        updatedAt: acc.updatedAt,
        passwordUpdatedBy: acc.passwordUpdatedBy ?? 'app_owner',
      };
    }
    return output;
  }

  upsertRestaurantAccount(input: {
    restaurantId: string;
    username: string;
    password?: string;
  }):
    | { ok: true; account: RestaurantAccountSummary & { restaurantId: string } }
    | { ok: false; status: number; error: string } {
    const restaurantId = String(input.restaurantId || '').trim();
    if (!VALID_RESTAURANT_ID.test(restaurantId)) {
      return { ok: false, status: 400, error: 'Invalid restaurant ID.' };
    }

    const normalizedUsername = String(input.username || '').trim().toLowerCase();
    if (normalizedUsername.length < 3 || normalizedUsername.length > 80) {
      return {
        ok: false,
        status: 400,
        error: 'Restaurant owner username must be between 3 and 80 characters.',
      };
    }

    if (normalizedUsername === this.getAppOwnerEmail()) {
      return {
        ok: false,
        status: 400,
        error: 'This username is reserved for the App Owner account.',
      };
    }

    const collision = Object.values(this.store.restaurantAccounts).find(
      (acc) => acc.username === normalizedUsername && acc.restaurantId !== restaurantId
    );
    if (collision) {
      return {
        ok: false,
        status: 409,
        error: 'That username is already assigned to another restaurant.',
      };
    }

    const existing = this.store.restaurantAccounts[restaurantId];
    const cleanPassword = typeof input.password === 'string' ? input.password : '';

    if (!existing && cleanPassword.length < 6) {
      return {
        ok: false,
        status: 400,
        error: 'Password must be at least 6 characters when creating a restaurant owner login.',
      };
    }

    if (cleanPassword.length > 0 && (cleanPassword.length < 6 || cleanPassword.length > 128)) {
      return {
        ok: false,
        status: 400,
        error: 'Password must be between 6 and 128 characters.',
      };
    }

    const credentials =
      cleanPassword.length > 0
        ? hashPassword(cleanPassword)
        : { salt: existing!.salt, hash: existing!.hash };

    const updatedAt = new Date().toISOString();
    const passwordUpdatedBy: PasswordUpdatedBy =
      cleanPassword.length > 0 ? 'app_owner' : existing?.passwordUpdatedBy ?? 'app_owner';

    this.store.restaurantAccounts[restaurantId] = {
      restaurantId,
      username: normalizedUsername,
      salt: credentials.salt,
      hash: credentials.hash,
      updatedAt,
      passwordUpdatedBy,
    };
    this.saveStore();

    return {
      ok: true,
      account: {
        restaurantId,
        username: normalizedUsername,
        updatedAt,
        passwordUpdatedBy,
      },
    };
  }

  /**
   * Allows a logged-in Restaurant Owner to update their own password.
   * Immediately updates the shared credential store so the App Owner's dashboard stays in sync.
   */
  changeOwnPassword(
    session: PortalSessionPayload,
    currentPassword: string,
    newPassword: string
  ):
    | { ok: true; account: RestaurantAccountSummary & { restaurantId: string } }
    | { ok: false; status: number; error: string } {
    if (session.role !== 'owner' || !session.restaurantId) {
      return {
        ok: false,
        status: 403,
        error: 'Only Restaurant Owner accounts can change their password here.',
      };
    }

    const existing = this.store.restaurantAccounts[session.restaurantId];
    if (!existing || existing.username !== session.username) {
      return { ok: false, status: 404, error: 'Restaurant owner account not found.' };
    }

    const cleanCurrent = String(currentPassword || '');
    const cleanNext = String(newPassword || '');
    if (!verifyPassword(cleanCurrent, existing.salt, existing.hash)) {
      return { ok: false, status: 401, error: 'Current password is incorrect.' };
    }

    if (cleanNext.length < 6 || cleanNext.length > 128) {
      return { ok: false, status: 400, error: 'New password must be between 6 and 128 characters.' };
    }

    if (cleanNext === cleanCurrent) {
      return {
        ok: false,
        status: 400,
        error: 'New password must be different from your current password.',
      };
    }

    const { salt, hash } = hashPassword(cleanNext);
    const updatedAt = new Date().toISOString();
    this.store.restaurantAccounts[session.restaurantId] = {
      ...existing,
      salt,
      hash,
      updatedAt,
      passwordUpdatedBy: 'restaurant_owner',
    };
    this.saveStore();

    return {
      ok: true,
      account: {
        restaurantId: existing.restaurantId,
        username: existing.username,
        updatedAt,
        passwordUpdatedBy: 'restaurant_owner',
      },
    };
  }

  deleteRestaurantAccount(restaurantId: string): boolean {
    if (!VALID_RESTAURANT_ID.test(restaurantId)) return false;
    if (this.store.restaurantAccounts[restaurantId]) {
      delete this.store.restaurantAccounts[restaurantId];
      this.saveStore();
      return true;
    }
    return false;
  }
}
