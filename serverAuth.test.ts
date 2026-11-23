import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AuthManager } from './serverAuth';

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tablepulse-auth-test-'));
}

test('first-run App Owner claim locks after setup and supports scrypt login', () => {
  const dir = createTempDir();
  try {
    const auth = new AuthManager({
      baseDir: dir,
      env: { APP_OWNER_EMAIL: 'rajensu264@gmail.com', APP_OWNER_PASSWORD: '' },
    });

    assert.equal(auth.getStatus().adminConfigured, false);

    // Reject wrong email on claim
    const wrongEmail = auth.claimFirstRunAdmin('wrong@example.com', 'MySecret123');
    assert.equal(wrongEmail.ok, false);

    // Claim once
    const claimed = auth.claimFirstRunAdmin('rajensu264@gmail.com', 'MySecret123');
    assert.equal(claimed.ok, true);
    if (claimed.ok) {
      assert.equal(claimed.session.role, 'super_admin');
      const verified = auth.verifyAuthHeader(`Bearer ${claimed.token}`);
      assert.equal(verified?.role, 'super_admin');
      assert.equal(verified?.username, 'rajensu264@gmail.com');
    }

    // Second claim must fail with 409
    const secondClaim = auth.claimFirstRunAdmin('rajensu264@gmail.com', 'OtherPass456');
    assert.equal(secondClaim.ok, false);
    if (!secondClaim.ok) assert.equal(secondClaim.status, 409);

    // Verify password login
    assert.equal(auth.login('rajensu264@gmail.com', 'MySecret123').ok, true);
    assert.equal(auth.login('rajensu264@gmail.com', 'WrongPass').ok, false);

    // Verify stored file never contains plaintext password
    const rawFile = fs.readFileSync(path.join(dir, 'auth-store.json'), 'utf8');
    assert.equal(rawFile.includes('MySecret123'), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('configured APP_OWNER_PASSWORD env var overrides claimed fallback hash', () => {
  const dir = createTempDir();
  try {
    const first = new AuthManager({
      baseDir: dir,
      env: { APP_OWNER_EMAIL: 'rajensu264@gmail.com', APP_OWNER_PASSWORD: '' },
    });
    assert.equal(first.claimFirstRunAdmin('rajensu264@gmail.com', 'ClaimedPass1').ok, true);

    const withEnv = new AuthManager({
      baseDir: dir,
      env: { APP_OWNER_EMAIL: 'rajensu264@gmail.com', APP_OWNER_PASSWORD: 'EnvOverridePass2' },
    });
    assert.equal(withEnv.getStatus().usesEnvPassword, true);
    assert.equal(withEnv.login('rajensu264@gmail.com', 'ClaimedPass1').ok, false);
    assert.equal(withEnv.login('rajensu264@gmail.com', 'EnvOverridePass2').ok, true);

    // Also handle accidental surrounding quotes pasted into Vercel Environment Variables UI
    const withQuotedEnv = new AuthManager({
      baseDir: dir,
      env: {
        APP_OWNER_EMAIL: '"rajensu264@gmail.com"',
        APP_OWNER_PASSWORD: '"QuotedPass#99"',
      },
    });
    assert.equal(withQuotedEnv.login('rajensu264@gmail.com', 'QuotedPass#99').ok, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('unconfigured deployment returns clear setup guidance without leaking owner email', () => {
  const dir = createTempDir();
  try {
    const auth = new AuthManager({
      baseDir: dir,
      env: { APP_OWNER_EMAIL: 'rajensu264@gmail.com', APP_OWNER_PASSWORD: '' },
    });
    const res = auth.login('any@example.com', 'somepass');
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.match(res.error, /APP_OWNER_PASSWORD/i);
      assert.equal(res.error.includes('rajensu264@gmail.com'), false);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('per-restaurant owner credentials isolate login to that restaurantId and support update/delete', () => {
  const dir = createTempDir();
  try {
    const auth = new AuthManager({
      baseDir: dir,
      env: { APP_OWNER_EMAIL: 'rajensu264@gmail.com', APP_OWNER_PASSWORD: 'OwnerMasterPassword' },
    });

    const created = auth.upsertRestaurantAccount({
      restaurantId: 'rest-saffron-courtyard',
      username: 'saffron_owner',
      password: 'RestPass#2026',
    });
    assert.equal(created.ok, true);

    // Prevent username collision across restaurants
    const duplicate = auth.upsertRestaurantAccount({
      restaurantId: 'rest-banyan-table',
      username: 'saffron_owner',
      password: 'AnotherPass99',
    });
    assert.equal(duplicate.ok, false);

    // Restaurant owner logs in and receives scoped session
    const loginRes = auth.login('saffron_owner', 'RestPass#2026');
    assert.equal(loginRes.ok, true);
    if (loginRes.ok) {
      assert.equal(loginRes.session.role, 'owner');
      assert.equal(loginRes.session.restaurantId, 'rest-saffron-courtyard');
    }

    // Update username without changing password
    const updated = auth.upsertRestaurantAccount({
      restaurantId: 'rest-saffron-courtyard',
      username: 'saffron_mgr',
    });
    assert.equal(updated.ok, true);
    assert.equal(auth.login('saffron_mgr', 'RestPass#2026').ok, true);
    assert.equal(auth.login('saffron_owner', 'RestPass#2026').ok, false);

    // Verify public status never leaks App Owner email
    const status = auth.getStatus() as Record<string, unknown>;
    assert.equal('appOwnerEmail' in status, false);

    // Restaurant owner changes their own password
    const wrongCurrent = auth.changeOwnPassword(
      { role: 'owner', username: 'saffron_mgr', restaurantId: 'rest-saffron-courtyard' },
      'WrongOldPass',
      'NewOwnerPass#99'
    );
    assert.equal(wrongCurrent.ok, false);
    if (!wrongCurrent.ok) assert.equal(wrongCurrent.status, 401);

    const changed = auth.changeOwnPassword(
      { role: 'owner', username: 'saffron_mgr', restaurantId: 'rest-saffron-courtyard' },
      'RestPass#2026',
      'NewOwnerPass#99'
    );
    assert.equal(changed.ok, true);
    if (changed.ok) {
      assert.equal(changed.account.passwordUpdatedBy, 'restaurant_owner');
    }

    // Old password stops working, new password works, and App Owner's list reflects update
    assert.equal(auth.login('saffron_mgr', 'RestPass#2026').ok, false);
    assert.equal(auth.login('saffron_mgr', 'NewOwnerPass#99').ok, true);
    const ownerView = auth.listRestaurantAccounts();
    assert.equal(ownerView['rest-saffron-courtyard']?.username, 'saffron_mgr');
    assert.equal(ownerView['rest-saffron-courtyard']?.passwordUpdatedBy, 'restaurant_owner');

    // App Owner can reset password anytime and status reflects app_owner
    const resetByMaster = auth.upsertRestaurantAccount({
      restaurantId: 'rest-saffron-courtyard',
      username: 'saffron_mgr',
      password: 'MasterReset#2026',
    });
    assert.equal(resetByMaster.ok, true);
    assert.equal(
      auth.listRestaurantAccounts()['rest-saffron-courtyard']?.passwordUpdatedBy,
      'app_owner'
    );
    assert.equal(auth.login('saffron_mgr', 'MasterReset#2026').ok, true);

    // Delete removes account
    assert.equal(auth.deleteRestaurantAccount('rest-saffron-courtyard'), true);
    assert.equal(auth.login('saffron_mgr', 'MasterReset#2026').ok, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('session tokens survive serverless cold starts and local restarts without losing login', () => {
  const dir = createTempDir();
  try {
    // Simulated Vercel serverless cold start with APP_OWNER_PASSWORD configured
    const lambda1 = new AuthManager({
      baseDir: dir,
      env: { APP_OWNER_EMAIL: 'rajensu264@gmail.com', APP_OWNER_PASSWORD: 'FixedOwnerPassword#7' },
    });
    const login1 = lambda1.login('rajensu264@gmail.com', 'FixedOwnerPassword#7');
    assert.equal(login1.ok, true);

    const lambda2 = new AuthManager({
      baseDir: dir,
      env: { APP_OWNER_EMAIL: 'rajensu264@gmail.com', APP_OWNER_PASSWORD: 'FixedOwnerPassword#7' },
    });
    if (login1.ok) {
      const verified = lambda2.verifySessionToken(login1.token);
      assert.equal(verified?.role, 'super_admin');
      assert.equal(verified?.username, 'rajensu264@gmail.com');

      const refreshed = lambda2.issueTokenForSession(verified!);
      assert.equal(lambda1.verifySessionToken(refreshed)?.username, 'rajensu264@gmail.com');
    }

    // Local first-run claim also keeps signing key deterministic across restarts
    const localDir = createTempDir();
    try {
      const boot1 = new AuthManager({
        baseDir: localDir,
        env: { APP_OWNER_EMAIL: 'rajensu264@gmail.com', APP_OWNER_PASSWORD: '' },
      });
      const claim = boot1.claimFirstRunAdmin('rajensu264@gmail.com', 'LocalClaim#1');
      assert.equal(claim.ok, true);

      const boot2 = new AuthManager({
        baseDir: localDir,
        env: { APP_OWNER_EMAIL: 'rajensu264@gmail.com', APP_OWNER_PASSWORD: '' },
      });
      if (claim.ok) {
        assert.equal(boot2.verifySessionToken(claim.token)?.role, 'super_admin');
      }
    } finally {
      fs.rmSync(localDir, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('HTTP auth routes set HttpOnly session cookie, restore on /auth/me, enforce CSRF, and clear on /auth/logout', async () => {
  const [{ default: express }, { default: http }, { createApiRouter, SESSION_COOKIE_NAME }] =
    await Promise.all([import('express'), import('node:http'), import('./serverApi')]);

  const dir = createTempDir();
  const auth = new AuthManager({
    baseDir: dir,
    env: { APP_OWNER_EMAIL: 'rajensu264@gmail.com', APP_OWNER_PASSWORD: 'CookiePass#2026' },
  });

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use('/api', createApiRouter(auth));

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // 1. Login issues HttpOnly cookie (with Secure; SameSite=None; Partitioned on HTTPS proxy)
    const httpsLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-Proto': 'https',
        'X-Requested-With': 'TablePulse',
      },
      body: JSON.stringify({ username: 'rajensu264@gmail.com', password: 'CookiePass#2026' }),
    });
    assert.equal(httpsLogin.status, 200);
    const setCookieHeader = httpsLogin.headers.get('set-cookie') ?? '';
    assert.match(setCookieHeader, new RegExp(`^${SESSION_COOKIE_NAME}=`));
    assert.match(setCookieHeader, /HttpOnly/i);
    assert.match(setCookieHeader, /Secure/i);
    assert.match(setCookieHeader, /SameSite=None/i);
    assert.match(setCookieHeader, /Partitioned/i);

    const cookiePair = setCookieHeader.split(';')[0];

    // 2. GET /api/auth/me restores session from HttpOnly cookie (without Bearer header)
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: cookiePair },
    });
    assert.equal(meRes.status, 200);
    const meJson = (await meRes.json()) as {
      session?: { role: string; username: string };
      token?: string;
    };
    assert.equal(meJson.session?.role, 'super_admin');
    assert.equal(meJson.session?.username, 'rajensu264@gmail.com');
    assert.ok(meJson.token && meJson.token.length > 20);

    // 3. Cookie-authenticated mutation rejects cross-site request missing X-Requested-With / matching Origin
    const csrfBlocked = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: cookiePair, Origin: 'https://evil.example' },
    });
    assert.equal(csrfBlocked.status, 403);

    // 4. Logout with X-Requested-With clears the HttpOnly cookie
    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: {
        Cookie: cookiePair,
        'X-Requested-With': 'TablePulse',
      },
    });
    assert.equal(logoutRes.status, 200);
    const clearCookieHeader = logoutRes.headers.get('set-cookie') ?? '';
    assert.match(clearCookieHeader, /Max-Age=0/i);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

