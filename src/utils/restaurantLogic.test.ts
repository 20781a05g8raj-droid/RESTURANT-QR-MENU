import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMenuQrUrl,
  buildWifiQrString,
  canRoleAccessTab,
  canRoleEditMenuPrices,
  canRoleToggleAvailability,
  canRoleTransitionOrder,
  computeAnalytics,
  computeFleetTotals,
  generateIosWifiProfileXml,
  getNextOrderStatus,
  parseScannedRestaurantParams,
  resolvePublicQrOrigin,
  slugifyRestaurantName,
  validateMenuItemInput,
  validateRestaurantInput,
} from './restaurantLogic';
import type { MenuItem, Order, Restaurant } from '../types/domain';

test('buildWifiQrString escapes special characters cleanly', () => {
  assert.equal(
    buildWifiQrString('Saffron;Guest:5G', 'spice,123\\4', 'WPA'),
    'WIFI:T:WPA;S:Saffron\\;Guest\\:5G;P:spice\\,123\\\\4;H:false;;'
  );
  assert.equal(
    buildWifiQrString('OpenLobby', 'ignored', 'nopass'),
    'WIFI:T:nopass;S:OpenLobby;P:;H:false;;'
  );
});

test('buildMenuQrUrl produces clean table and wifi query parameters', () => {
  const url = buildMenuQrUrl('https://tablepulse.app/', 'saffron-courtyard', 7, true);
  assert.equal(url, 'https://tablepulse.app/?menu=saffron-courtyard&table=7&wifi=1');

  const customUrl = buildMenuQrUrl('https://tablepulse.app/', 'tandoor-palace', 2, true, {
    name: 'Tandoor Palace',
    city: 'New Delhi',
    cuisine: 'North Indian',
    wifiSsid: 'Tandoor_5G',
  });
  const parsed = parseScannedRestaurantParams(new URL(customUrl).search);
  assert.equal(parsed?.slug, 'tandoor-palace');
  assert.equal(parsed?.tableNumber, 2);
  assert.equal(parsed?.name, 'Tandoor Palace');
  assert.equal(parsed?.city, 'New Delhi');
  assert.equal(parsed?.wifiSsid, 'Tandoor_5G');
});

test('resolvePublicQrOrigin converts private ais-dev preview URLs to public ais-pre shared URLs', () => {
  const devResolved = resolvePublicQrOrigin(
    'https://ais-dev-abc123.asia-southeast1.run.app'
  );
  assert.equal(devResolved.origin, 'https://ais-pre-abc123.asia-southeast1.run.app');
  assert.equal(devResolved.isDevPreview, true);
  assert.equal(devResolved.wasAutoConverted, true);

  const customResolved = resolvePublicQrOrigin(
    'https://ais-dev-abc123.asia-southeast1.run.app',
    'https://menu.saffroncourtyard.in/'
  );
  assert.equal(customResolved.origin, 'https://menu.saffroncourtyard.in');
  assert.equal(customResolved.usesCustomUrl, true);

  const unsafeCustom = resolvePublicQrOrigin(
    'https://ais-dev-abc123.asia-southeast1.run.app',
    'javascript:alert(1)'
  );
  assert.equal(unsafeCustom.origin, 'https://ais-pre-abc123.asia-southeast1.run.app');
  assert.equal(unsafeCustom.usesCustomUrl, false);
});

test('generateIosWifiProfileXml embeds escaped SSID and encryption type', () => {
  const xml = generateIosWifiProfileXml('Nawab & Ember', 'Nawab_5G', 'Pass<1>', 'WPA');
  assert.match(xml, /<string>Nawab &amp; Ember WiFi<\/string>/);
  assert.match(xml, /<string>WPA2<\/string>/);
  assert.match(xml, /<string>Pass&lt;1&gt;<\/string>/);
});

test('order state machine transitions and RBAC enforcement', () => {
  assert.equal(getNextOrderStatus('pending'), 'preparing');
  assert.equal(getNextOrderStatus('preparing'), 'ready');
  assert.equal(getNextOrderStatus('ready'), 'served');
  assert.equal(getNextOrderStatus('served'), null);

  assert.equal(canRoleTransitionOrder('chef', 'pending', 'preparing'), true);
  assert.equal(canRoleTransitionOrder('chef', 'ready', 'served'), false);
  assert.equal(canRoleTransitionOrder('waiter', 'ready', 'served'), true);
  assert.equal(canRoleTransitionOrder('waiter', 'pending', 'preparing'), false);
  assert.equal(canRoleTransitionOrder('manager', 'served', 'pending'), false);
  assert.equal(canRoleTransitionOrder('super_admin', 'served', 'pending'), true);
  assert.equal(canRoleTransitionOrder('customer', 'pending', 'preparing'), false);
});

test('RBAC tab and menu permissions separate staff responsibilities', () => {
  assert.equal(canRoleAccessTab('super_admin', 'fleet'), true);
  assert.equal(canRoleAccessTab('owner', 'fleet'), false);
  assert.equal(canRoleAccessTab('chef', 'orders'), true);
  assert.equal(canRoleAccessTab('chef', 'staff'), false);
  assert.equal(canRoleEditMenuPrices('manager'), true);
  assert.equal(canRoleEditMenuPrices('chef'), false);
  assert.equal(canRoleToggleAvailability('chef'), true);
  assert.equal(canRoleToggleAvailability('waiter'), false);
});

test('computeAnalytics aggregates revenue, voice orders, and top dishes accurately', () => {
  const menu: MenuItem[] = [
    {
      id: 'm1',
      restaurantId: 'r1',
      name: 'Butter Chicken',
      description: 'Creamy curry',
      category: 'Mains',
      price: 420,
      available: true,
      veg: false,
      prepMinutes: 15,
      imageUrl: '',
      popular: true,
      updatedAt: '2026-11-23T00:00:00Z',
    },
    {
      id: 'm2',
      restaurantId: 'r1',
      name: 'Garlic Naan',
      description: 'Tandoori bread',
      category: 'Breads',
      price: 90,
      available: true,
      veg: true,
      prepMinutes: 6,
      imageUrl: '',
      popular: false,
      updatedAt: '2026-11-23T00:00:00Z',
    },
  ];
  const orders: Order[] = [
    {
      id: 'o1',
      restaurantId: 'r1',
      restaurantOwnerId: 'owner1',
      orderNumber: 'ORD-101',
      tableNumber: 4,
      customerName: 'Aarav',
      customerUid: 'u1',
      items: [
        { menuItemId: 'm1', name: 'Butter Chicken', price: 420, quantity: 2, veg: false },
        { menuItemId: 'm2', name: 'Garlic Naan', price: 90, quantity: 3, veg: true },
      ],
      totalAmount: 1110,
      status: 'served',
      source: 'voice',
      notes: '',
      createdAt: '2026-11-23T12:00:00Z',
      updatedAt: '2026-11-23T12:20:00Z',
    },
    {
      id: 'o2',
      restaurantId: 'r1',
      restaurantOwnerId: 'owner1',
      orderNumber: 'ORD-102',
      tableNumber: 2,
      customerName: 'Diya',
      customerUid: 'u2',
      items: [{ menuItemId: 'm1', name: 'Butter Chicken', price: 420, quantity: 1, veg: false }],
      totalAmount: 420,
      status: 'cancelled',
      source: 'qr',
      notes: '',
      createdAt: '2026-11-23T12:10:00Z',
      updatedAt: '2026-11-23T12:12:00Z',
    },
  ];

  const stats = computeAnalytics(orders, menu);
  assert.equal(stats.totalRevenue, 1110);
  assert.equal(stats.totalOrders, 1);
  assert.equal(stats.voiceOrders, 1);
  assert.equal(stats.servedOrders, 1);
  assert.equal(stats.topDishes[0].name, 'Butter Chicken');
  assert.equal(stats.topDishes[0].unitsSold, 2);
});

test('validators reject empty or out-of-bounds blueprint fields', () => {
  assert.equal(slugifyRestaurantName('Saffron & Courtyard! '), 'saffron-courtyard');
  assert.equal(
    validateRestaurantInput({
      name: 'A',
      city: 'Mumbai',
      cuisine: 'Indian',
      wifiSsid: 'Guest',
      wifiPassword: 'pass',
      tableCount: 10,
    }).valid,
    false
  );
  assert.equal(
    validateMenuItemInput({
      name: 'Paneer Tikka',
      category: 'Starters',
      price: -10,
      description: 'Charred cottage cheese',
      prepMinutes: 12,
    }).valid,
    false
  );
  assert.equal(
    validateMenuItemInput({
      name: 'Paneer Tikka',
      category: 'Starters',
      price: 340,
      description: 'Charred cottage cheese',
      prepMinutes: 12,
    }).valid,
    true
  );

  const fleet = computeFleetTotals([
    {
      id: '1',
      slug: 'a',
      name: 'A',
      city: 'Pune',
      cuisine: 'Indian',
      ownerId: 'o1',
      plan: 'Growth',
      active: true,
      tableCount: 12,
      wifiSsid: 'A',
      wifiPassword: '123',
      wifiSecurity: 'WPA',
      currency: 'INR',
      monthlyRevenue: 500000,
      activeOrdersCount: 3,
      createdAt: '',
      updatedAt: '',
    } as Restaurant,
  ]);
  assert.equal(fleet.totalOutlets, 1);
  assert.equal(fleet.totalTables, 12);
});
