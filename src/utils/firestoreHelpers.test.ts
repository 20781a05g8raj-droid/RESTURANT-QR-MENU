import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFirestoreMenuItemFields,
  buildFirestoreOrderFields,
  buildFirestoreRestaurantFields,
  buildFirestoreStaffFields,
  formatFirebaseAuthError,
  isSafeFirestoreId,
  sanitizeFirestoreImageUrl,
  sanitizeFirestoreSlug,
} from './firestoreHelpers';

test('isSafeFirestoreId validates allowed characters and length', () => {
  assert.equal(isSafeFirestoreId('rest-saffron-courtyard'), true);
  assert.equal(isSafeFirestoreId('abc_123-XYZ'), true);
  assert.equal(isSafeFirestoreId(''), false);
  assert.equal(isSafeFirestoreId('bad/slash'), false);
  assert.equal(isSafeFirestoreId('bad space'), false);
});

test('sanitizeFirestoreSlug enforces ^[a-z0-9-]+$ within 2..80 chars', () => {
  assert.equal(sanitizeFirestoreSlug('Royal Biryani & Kebab!', 'rest-1'), 'royal-biryani-kebab');
  assert.equal(sanitizeFirestoreSlug('!', ''), 'rest-outlet');
});

test('sanitizeFirestoreImageUrl replaces data URLs and oversized URLs with fallback asset', () => {
  assert.equal(sanitizeFirestoreImageUrl('/assets/dish-biryani.png'), '/assets/dish-biryani.png');
  assert.equal(
    sanitizeFirestoreImageUrl('data:image/jpeg;base64,' + 'A'.repeat(2000)),
    '/assets/dish-curry.png'
  );
  assert.equal(
    sanitizeFirestoreImageUrl('https://example.com/' + 'a'.repeat(420)),
    '/assets/dish-curry.png'
  );
});

test('buildFirestoreRestaurantFields produces exact schema keys allowed by firestore.rules', () => {
  const payload = buildFirestoreRestaurantFields(
    {
      id: 'rest-1',
      slug: 'Saffron Courtyard',
      name: 'Saffron Courtyard',
      city: 'Mumbai',
      cuisine: 'North Indian',
      plan: 'Enterprise',
      active: true,
      tableCount: 300,
      wifiSsid: 'Saffron_5G',
      wifiPassword: 'secret',
      wifiSecurity: 'WPA',
      currency: 'INR',
    },
    'uid-owner-1'
  );

  assert.deepEqual(Object.keys(payload).sort(), [
    'active',
    'city',
    'cuisine',
    'currency',
    'name',
    'ownerId',
    'plan',
    'slug',
    'tableCount',
    'wifiPassword',
    'wifiSecurity',
    'wifiSsid',
  ]);
  assert.equal(payload.slug, 'saffron-courtyard');
  assert.equal(payload.tableCount, 250);
  assert.equal(payload.ownerId, 'uid-owner-1');
});

test('buildFirestoreMenuItemFields clamps values and strips data URLs', () => {
  const payload = buildFirestoreMenuItemFields(
    {
      name: 'Paneer Tikka',
      description: 'Charcoal roasted cottage cheese',
      category: 'Starters',
      price: 380,
      available: true,
      veg: true,
      prepMinutes: 14,
      imageUrl: 'data:image/png;base64,iVBORw0KGgo=',
      popular: true,
    },
    'rest-saffron-courtyard'
  );

  assert.equal(payload.restaurantId, 'rest-saffron-courtyard');
  assert.equal(payload.imageUrl, '/assets/dish-curry.png');
  assert.equal(payload.price, 380);
  assert.equal(payload.prepMinutes, 14);
});

test('buildFirestoreOrderFields and buildFirestoreStaffFields match strict rule schemas', () => {
  const order = buildFirestoreOrderFields(
    {
      orderNumber: 'ORD-512',
      tableNumber: 4,
      customerName: 'Aarav',
      items: [{ menuItemId: 'd1', name: 'Biryani', quantity: 2, price: 420, veg: false }],
      totalAmount: 840,
      source: 'qr',
      notes: 'Less spicy',
    },
    'rest-1',
    'owner-uid',
    'cust-uid'
  );

  assert.equal(order.status, 'pending');
  assert.equal(order.restaurantOwnerId, 'owner-uid');
  assert.equal(order.customerUid, 'cust-uid');
  assert.equal(order.items.length, 1);

  const staff = buildFirestoreStaffFields(
    {
      userId: 'staff-1',
      name: 'Meera Nair',
      email: 'MEERA@example.com',
      role: 'manager',
      active: true,
    },
    'rest-1',
    'owner-uid'
  );
  assert.equal(staff.email, 'meera@example.com');
  assert.equal(staff.restaurantOwnerId, 'owner-uid');
});

test('formatFirebaseAuthError explains Vercel unauthorized-domain clearly', () => {
  const msg = formatFirebaseAuthError(
    { code: 'auth/unauthorized-domain', message: 'Firebase: Error (auth/unauthorized-domain).' },
    'my-app.vercel.app'
  );
  assert.match(msg, /Authorized domains/i);
  assert.match(msg, /my-app\.vercel\.app/);
});
