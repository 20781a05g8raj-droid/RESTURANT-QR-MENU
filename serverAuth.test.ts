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
