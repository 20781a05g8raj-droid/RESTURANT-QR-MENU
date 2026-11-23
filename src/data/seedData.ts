import type { MenuItem, Order, Restaurant, StaffMember, SubscriptionPlan } from '../types/domain';
import { slugifyRestaurantName } from '../utils/restaurantLogic';

export const GENERATED_IMAGES = {
  butterChicken: '/src/assets/images/dish_butter_chicken_1795431928721.jpg',
  paneerTikka: '/src/assets/images/dish_paneer_tikka_1795431928350.jpg',
  trufflePasta: '/src/assets/images/dish_truffle_pasta_1795431929020.jpg',
  matchaTiramisu: '/src/assets/images/dish_matcha_tiramisu_1795431928287.jpg',
  heroInterior: '/src/assets/images/restaurant_hero_interior_1795431929113.jpg',
};

const NOW_ISO = '2026-11-23T09:30:00.000Z';

const FLAGSHIP_RESTAURANTS: Restaurant[] = [
  {
    id: 'rest-saffron-courtyard',
    slug: 'saffron-courtyard',
    name: 'Saffron Courtyard',
    city: 'Mumbai',
    cuisine: 'Modern North Indian',
    ownerId: 'demo-owner-1',
    plan: 'Enterprise',
    active: true,
    tableCount: 24,
    wifiSsid: 'SaffronCourtyard_5G',
    wifiPassword: 'SaffronDine2026',
    wifiSecurity: 'WPA',
    currency: 'INR',
    monthlyRevenue: 1485000,
    activeOrdersCount: 5,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  },
  {
    id: 'rest-banyan-table',
    slug: 'banyan-table',
    name: 'The Banyan Table',
    city: 'Bengaluru',
    cuisine: 'Artisanal Cafe & Italian',
    ownerId: 'demo-owner-2',
    plan: 'Growth',
    active: true,
    tableCount: 18,
    wifiSsid: 'BanyanGuest_WiFi',
    wifiPassword: 'TruffleBrew88',
    wifiSecurity: 'WPA',
    currency: 'INR',
    monthlyRevenue: 980000,
    activeOrdersCount: 3,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  },
  {
    id: 'rest-nawab-ember',
    slug: 'nawab-ember',
    name: 'Nawab & Ember',
    city: 'New Delhi',
    cuisine: 'Awadhi & Tandoor',
    ownerId: 'demo-owner-3',
    plan: 'Enterprise',
    active: true,
    tableCount: 32,
    wifiSsid: 'NawabEmber_VIP',
    wifiPassword: 'RoyalKebabs24',
    wifiSecurity: 'WPA',
    currency: 'INR',
    monthlyRevenue: 1920000,
    activeOrdersCount: 4,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  },
  {
    id: 'rest-kaya-kitchen',
    slug: 'kaya-kitchen',
    name: 'Kaya Courtyard Kitchen',
    city: 'Jaipur',
    cuisine: 'Rajasthani Heritage',
    ownerId: 'demo-owner-4',
    plan: 'Growth',
    active: true,
    tableCount: 20,
    wifiSsid: 'KayaJaipur_Guest',
    wifiPassword: 'PinkCityDine',
    wifiSecurity: 'WPA',
    currency: 'INR',
    monthlyRevenue: 840000,
    activeOrdersCount: 2,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  },
  {
    id: 'rest-malabar-coast',
    slug: 'malabar-coast',
    name: 'Malabar Coast Bistro',
    city: 'Kochi',
    cuisine: 'Coastal Seafood & Spice',
    ownerId: 'demo-owner-5',
    plan: 'Starter',
    active: true,
    tableCount: 14,
    wifiSsid: 'MalabarCoast_Free',
    wifiPassword: 'CurryLeaf99',
    wifiSecurity: 'WPA',
    currency: 'INR',
    monthlyRevenue: 615000,
    activeOrdersCount: 2,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  },
  {
    id: 'rest-zest-roastery',
    slug: 'zest-roastery',
    name: 'Zest Craft Roastery',
    city: 'Pune',
    cuisine: 'Specialty Coffee & Bakery',
    ownerId: 'demo-owner-6',
    plan: 'Growth',
    active: true,
    tableCount: 16,
    wifiSsid: 'ZestRoastery_5G',
    wifiPassword: 'MatchaCraft26',
    wifiSecurity: 'WPA',
    currency: 'INR',
    monthlyRevenue: 745000,
    activeOrdersCount: 3,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  },
];

const FLEET_PREFIXES = [
  'Spice', 'Copper', 'Royal', 'Olive', 'Cedar', 'Lotus', 'Velvet', 'Amber',
  'Indigo', 'Coastal', 'Heritage', 'Urban', 'Grand', 'Bistro', 'Tamarind', 'Mint',
];
const FLEET_SUFFIXES = [
  'Kitchen', 'House', 'Terrace', 'Lounge', 'Table', 'Grill', 'Cafe', 'Darbar',
  'Pavilion', 'Express', 'Haveli', 'Bites',
];
const FLEET_CITIES = [
  'Mumbai', 'Bengaluru', 'New Delhi', 'Hyderabad', 'Pune', 'Chennai',
  'Kolkata', 'Ahmedabad', 'Jaipur', 'Chandigarh', 'Goa', 'Indore',
];
const FLEET_CUISINES = [
  'North Indian', 'South Indian', 'Pan-Asian', 'Italian & Pizza', 'Continental',
  'Mughlai & Kebabs', 'Cafe & Bakery', 'Coastal Seafood', 'Street Food Studio',
];
const PLANS: SubscriptionPlan[] = ['Starter', 'Growth', 'Enterprise'];

export function generateSeedRestaurants(): Restaurant[] {
  const fleet: Restaurant[] = [...FLAGSHIP_RESTAURANTS];
  let idx = 0;
  for (let i = 0; i < 96; i++) {
    const prefix = FLEET_PREFIXES[i % FLEET_PREFIXES.length];
    const suffix = FLEET_SUFFIXES[Math.floor(i / 8) % FLEET_SUFFIXES.length];
    const city = FLEET_CITIES[(i * 3) % FLEET_CITIES.length];
    const cuisine = FLEET_CUISINES[(i * 5) % FLEET_CUISINES.length];
    const plan = PLANS[(i * 7) % PLANS.length];
    const branchNo = i >= 16 ? ` #${Math.floor(i / 16) + 1}` : '';
    const name = `${prefix} ${suffix}${branchNo}`;
    const slug = `${slugifyRestaurantName(name)}-${city.toLowerCase().slice(0, 3)}-${101 + idx}`;
    const tableCount = 10 + ((i * 3) % 26);
    const monthlyRevenue =
      plan === 'Enterprise'
        ? 1100000 + (i % 7) * 145000
        : plan === 'Growth'
          ? 640000 + (i % 6) * 85000
          : 310000 + (i % 5) * 48000;

    fleet.push({
      id: `rest-partner-${101 + idx}`,
      slug,
      name,
      city,
      cuisine,
      ownerId: `demo-partner-${101 + idx}`,
      plan,
      active: i % 19 !== 18,
      tableCount,
      wifiSsid: `${prefix}${suffix}_Guest`.replace(/\s+/g, ''),
      wifiPassword: `Dine${2026 + (i % 90)}`,
      wifiSecurity: 'WPA',
      currency: 'INR',
      monthlyRevenue,
      activeOrdersCount: i % 6,
      createdAt: NOW_ISO,
      updatedAt: NOW_ISO,
    });
    idx++;
  }
  return fleet;
}

export function generateDefaultMenuForRestaurant(restaurantId: string): MenuItem[] {
  if (restaurantId === 'rest-banyan-table') {
    return [
      {
        id: `${restaurantId}-item-1`,
        restaurantId,
        name: 'Black Truffle Wild Mushroom Tagliatelle',
        description: 'Hand-rolled eggless ribbon pasta tossed with porcini cream, shaved black truffle, and fresh thyme.',
        category: 'Mains',
        price: 580,
        available: true,
        veg: true,
        prepMinutes: 16,
        imageUrl: GENERATED_IMAGES.trufflePasta,
        popular: true,
        updatedAt: NOW_ISO,
      },
      {
        id: `${restaurantId}-item-2`,
        restaurantId,
        name: 'Kyoto Matcha Tiramisu',
        description: 'Mascarpone cream layered with ceremonial grade Uji matcha sponge and dark cocoa.',
        category: 'Desserts',
        price: 360,
        available: true,
        veg: true,
        prepMinutes: 5,
        imageUrl: GENERATED_IMAGES.matchaTiramisu,
        popular: true,
        updatedAt: NOW_ISO,
      },
      {
        id: `${restaurantId}-item-3`,
        restaurantId,
        name: 'Charred Cottage Cheese Skewers',
        description: 'Herb-marinated artisanal paneer roasted over wood embers with mint emulsion.',
        category: 'Starters',
        price: 390,
        available: true,
        veg: true,
        prepMinutes: 12,
        imageUrl: GENERATED_IMAGES.paneerTikka,
        popular: false,
        updatedAt: NOW_ISO,
      },
      {
        id: `${restaurantId}-item-4`,
        restaurantId,
        name: 'Smoked Tomato & Burrata Flatbread',
        description: 'Sourdough blistered flatbread topped with heirloom tomato confit and cold-pressed basil oil.',
        category: 'Starters',
        price: 440,
        available: true,
        veg: true,
        prepMinutes: 14,
        imageUrl: GENERATED_IMAGES.trufflePasta,
        popular: false,
        updatedAt: NOW_ISO,
      },
      {
        id: `${restaurantId}-item-5`,
        restaurantId,
        name: 'Cold Brew Tonic',
        description: '18-hour single-estate Chikmagalur cold brew poured over botanical tonic water and orange peel.',
        category: 'Beverages',
        price: 220,
        available: true,
        veg: true,
        prepMinutes: 4,
        imageUrl: GENERATED_IMAGES.matchaTiramisu,
        popular: true,
        updatedAt: NOW_ISO,
      },
    ];
  }

  return [
    {
      id: `${restaurantId}-item-1`,
      restaurantId,
      name: 'Smoked Butter Chicken',
      description: 'Charcoal-grilled chicken simmered in velvety heirloom tomato, fenugreek, and cultured butter makhani gravy.',
      category: 'Mains',
      price: 420,
      available: true,
      veg: false,
      prepMinutes: 18,
      imageUrl: GENERATED_IMAGES.butterChicken,
      popular: true,
      updatedAt: NOW_ISO,
    },
    {
      id: `${restaurantId}-item-2`,
      restaurantId,
      name: 'Tandoori Paneer Tikka',
      description: 'House-pressed malai paneer and bell peppers roasted in clay tandoor, served with mint chutney and pickled shallots.',
      category: 'Starters',
      price: 340,
      available: true,
      veg: true,
      prepMinutes: 14,
      imageUrl: GENERATED_IMAGES.paneerTikka,
      popular: true,
      updatedAt: NOW_ISO,
    },
    {
      id: `${restaurantId}-item-3`,
      restaurantId,
      name: 'Truffle Mushroom Tagliatelle',
      description: 'Silky hand-cut pasta coated in roasted wild mushroom veloute and shaved black truffle.',
      category: 'Mains',
      price: 540,
      available: true,
      veg: true,
      prepMinutes: 16,
      imageUrl: GENERATED_IMAGES.trufflePasta,
      popular: true,
      updatedAt: NOW_ISO,
    },
    {
      id: `${restaurantId}-item-4`,
      restaurantId,
      name: 'Roasted Garlic Butter Naan',
      description: 'Blistered tandoori leavened flatbread brushed with roasted garlic and salted farm butter.',
      category: 'Breads',
      price: 95,
      available: true,
      veg: true,
      prepMinutes: 6,
      imageUrl: GENERATED_IMAGES.butterChicken,
      popular: true,
      updatedAt: NOW_ISO,
    },
    {
      id: `${restaurantId}-item-5`,
      restaurantId,
      name: 'Kyoto Matcha Tiramisu',
      description: 'Airy mascarpone layered with ceremonial matcha-soaked sponge and delicate cocoa dusting.',
      category: 'Desserts',
      price: 350,
      available: true,
      veg: true,
      prepMinutes: 5,
      imageUrl: GENERATED_IMAGES.matchaTiramisu,
      popular: false,
      updatedAt: NOW_ISO,
    },
    {
      id: `${restaurantId}-item-6`,
      restaurantId,
      name: 'Dal Saffron 24-Hour',
      description: 'Slow-simmered black urad lentils finished overnight over dying charcoal embers with cream.',
      category: 'Mains',
      price: 360,
      available: true,
      veg: true,
      prepMinutes: 12,
      imageUrl: GENERATED_IMAGES.butterChicken,
      popular: false,
      updatedAt: NOW_ISO,
    },
    {
      id: `${restaurantId}-item-7`,
      restaurantId,
      name: 'Mint & Kokum Cooler',
      description: 'Refreshing coastal kokum infusion muddled with garden mint, roasted cumin, and sparkling soda.',
      category: 'Beverages',
      price: 160,
      available: true,
      veg: true,
      prepMinutes: 4,
      imageUrl: GENERATED_IMAGES.paneerTikka,
      popular: false,
      updatedAt: NOW_ISO,
    },
  ];
}

export function generateSeedOrders(restaurant: Restaurant, menuItems: MenuItem[]): Order[] {
  const m1 = menuItems[0];
  const m2 = menuItems[1];
  const m3 = menuItems[2];
  const m4 = menuItems[3] ?? menuItems[0];
  const m5 = menuItems[4] ?? menuItems[1];

  return [
    {
      id: `${restaurant.id}-ord-1`,
      restaurantId: restaurant.id,
      restaurantOwnerId: restaurant.ownerId,
      orderNumber: 'ORD-408',
      tableNumber: 4,
      customerName: 'Rohan Mehta',
      customerUid: 'guest-rohan',
      items: [
        { menuItemId: m1.id, name: m1.name, price: m1.price, quantity: 2, veg: m1.veg },
        { menuItemId: m4.id, name: m4.name, price: m4.price, quantity: 3, veg: m4.veg },
      ],
      totalAmount: m1.price * 2 + m4.price * 3,
      status: 'pending',
      source: 'voice',
      notes: 'Less spicy, extra butter on garlic naan',
      createdAt: '2026-11-23T09:18:00.000Z',
      updatedAt: '2026-11-23T09:18:00.000Z',
    },
    {
      id: `${restaurant.id}-ord-2`,
      restaurantId: restaurant.id,
      restaurantOwnerId: restaurant.ownerId,
      orderNumber: 'ORD-407',
      tableNumber: 9,
      customerName: 'Ananya Sharma',
      customerUid: 'guest-ananya',
      items: [
        { menuItemId: m2.id, name: m2.name, price: m2.price, quantity: 1, veg: m2.veg },
        { menuItemId: m3.id, name: m3.name, price: m3.price, quantity: 1, veg: m3.veg },
      ],
      totalAmount: m2.price + m3.price,
      status: 'preparing',
      source: 'qr',
      notes: 'Serve starters first please',
      createdAt: '2026-11-23T09:05:00.000Z',
      updatedAt: '2026-11-23T09:10:00.000Z',
    },
    {
      id: `${restaurant.id}-ord-3`,
      restaurantId: restaurant.id,
      restaurantOwnerId: restaurant.ownerId,
      orderNumber: 'ORD-406',
      tableNumber: 2,
      customerName: 'Vikram Kapoor',
      customerUid: 'guest-vikram',
      items: [
        { menuItemId: m5.id, name: m5.name, price: m5.price, quantity: 2, veg: m5.veg },
      ],
      totalAmount: m5.price * 2,
      status: 'ready',
      source: 'qr',
      notes: '',
      createdAt: '2026-11-23T08:52:00.000Z',
      updatedAt: '2026-11-23T09:14:00.000Z',
    },
    {
      id: `${restaurant.id}-ord-4`,
      restaurantId: restaurant.id,
      restaurantOwnerId: restaurant.ownerId,
      orderNumber: 'ORD-405',
      tableNumber: 12,
      customerName: 'Priya Nair',
      customerUid: 'guest-priya',
      items: [
        { menuItemId: m1.id, name: m1.name, price: m1.price, quantity: 2, veg: m1.veg },
        { menuItemId: m2.id, name: m2.name, price: m2.price, quantity: 2, veg: m2.veg },
        { menuItemId: m5.id, name: m5.name, price: m5.price, quantity: 2, veg: m5.veg },
      ],
      totalAmount: m1.price * 2 + m2.price * 2 + m5.price * 2,
      status: 'served',
      source: 'voice',
      notes: 'Birthday table — candle on dessert',
      createdAt: '2026-11-23T08:15:00.000Z',
      updatedAt: '2026-11-23T08:45:00.000Z',
    },
    {
      id: `${restaurant.id}-ord-5`,
      restaurantId: restaurant.id,
      restaurantOwnerId: restaurant.ownerId,
      orderNumber: 'ORD-404',
      tableNumber: 6,
      customerName: 'Kabir Verma',
      customerUid: 'guest-kabir',
      items: [
        { menuItemId: m3.id, name: m3.name, price: m3.price, quantity: 2, veg: m3.veg },
        { menuItemId: m4.id, name: m4.name, price: m4.price, quantity: 4, veg: m4.veg },
      ],
      totalAmount: m3.price * 2 + m4.price * 4,
      status: 'served',
      source: 'staff',
      notes: '',
      createdAt: '2026-11-23T07:45:00.000Z',
      updatedAt: '2026-11-23T08:12:00.000Z',
    },
  ];
}

export function generateSeedStaff(restaurant: Restaurant): StaffMember[] {
  return [
    {
      id: `${restaurant.id}-staff-1`,
      restaurantId: restaurant.id,
      restaurantOwnerId: restaurant.ownerId,
      userId: restaurant.ownerId,
      name: 'Rajeshwari Kulkarni',
      email: 'owner@saffroncourtyard.in',
      role: 'owner',
      active: true,
      createdAt: NOW_ISO,
      updatedAt: NOW_ISO,
    },
    {
      id: `${restaurant.id}-staff-2`,
      restaurantId: restaurant.id,
      restaurantOwnerId: restaurant.ownerId,
      userId: 'staff-manager-1',
      name: 'Siddharth Joshi',
      email: 'manager@saffroncourtyard.in',
      role: 'manager',
      active: true,
      createdAt: NOW_ISO,
      updatedAt: NOW_ISO,
    },
    {
      id: `${restaurant.id}-staff-3`,
      restaurantId: restaurant.id,
      restaurantOwnerId: restaurant.ownerId,
      userId: 'staff-chef-1',
      name: 'Chef Harpreet Gill',
      email: 'kitchen@saffroncourtyard.in',
      role: 'chef',
      active: true,
      createdAt: NOW_ISO,
      updatedAt: NOW_ISO,
    },
    {
      id: `${restaurant.id}-staff-4`,
      restaurantId: restaurant.id,
      restaurantOwnerId: restaurant.ownerId,
      userId: 'staff-waiter-1',
      name: 'Neha Deshmukh',
      email: 'floor@saffroncourtyard.in',
      role: 'waiter',
      active: true,
      createdAt: NOW_ISO,
      updatedAt: NOW_ISO,
    },
  ];
}
