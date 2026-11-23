import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
const blueprintPath = path.resolve(process.cwd(), 'firebase-blueprint.json');
const rulesSource = fs.readFileSync(rulesPath, 'utf8');
const blueprint = JSON.parse(fs.readFileSync(blueprintPath, 'utf8'));

test('firestore.rules enforces default-deny catch-all and rules_version 2', () => {
  assert.match(rulesSource, /rules_version\s*=\s*'2';/);
  assert.match(rulesSource, /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;\s*\}/);
});

test('firestore.rules verifies email_verified for admin and writes (Dirty Dozen #3)', () => {
  assert.match(rulesSource, /request\.auth\.token\.email_verified == true/);
  assert.match(rulesSource, /20781a05g8raj@gmail\.com/);
});

test('firestore.rules enforces isValidId and size checks on every collection (Dirty Dozen #4)', () => {
  assert.match(rulesSource, /function isValidId\(id\)/);
  assert.match(rulesSource, /id\.size\(\) <= 128/);
  assert.match(rulesSource, /data\.items\.size\(\) <= 30/);
});

test('firestore.rules enforces strict keys, immutable fields, and terminal state lock (Dirty Dozen #1, #6, #12)', () => {
  assert.match(rulesSource, /data\.keys\(\)\.hasAll/);
  assert.match(rulesSource, /data\.keys\(\)\.hasOnly/);
  assert.match(rulesSource, /affectedKeys\(\)\.hasOnly/);
  assert.match(rulesSource, /!\(existing\(\)\.status in \['served', 'cancelled'\]\)/);
  assert.match(rulesSource, /incoming\(\)\.createdAt == existing\(\)\.createdAt/);
  assert.match(rulesSource, /incoming\(\)\.updatedAt == request\.time/);
});

test('firestore.rules covers every collection defined in firebase-blueprint.json', () => {
  const paths = Object.keys(blueprint.firestore);
  assert.ok(paths.length >= 5);
  assert.match(rulesSource, /match \/admins\/\{userId\}/);
  assert.match(rulesSource, /match \/restaurants\/\{restaurantId\}/);
  assert.match(rulesSource, /match \/menuItems\/\{itemId\}/);
  assert.match(rulesSource, /match \/orders\/\{orderId\}/);
  assert.match(rulesSource, /match \/staff\/\{staffId\}/);
});

test('firestore.rules allows strictly validated guest QR/voice order creation while keeping order reads/updates private', () => {
  assert.match(rulesSource, /function isGuestOrderUid\(uid\)/);
  assert.match(rulesSource, /incoming\(\)\.source in \['qr', 'voice'\]/);
  assert.match(rulesSource, /restaurantDoc\(restaurantId\)\.data\.active == true/);
  assert.match(rulesSource, /incoming\(\)\.tableNumber <= restaurantDoc\(restaurantId\)\.data\.tableCount/);
  assert.match(rulesSource, /allow get: if isVerifiedUser\(\)/);
  assert.match(rulesSource, /allow update: if isVerifiedUser\(\)/);
});
