import type {
  AnalyticsSummary,
  CurrencyCode,
  MenuItem,
  Order,
  OrderStatus,
  Restaurant,
  UserRole,
  WifiSecurity,
  WorkspaceTab,
} from '../types/domain';

function escapeWifiField(value: string): string {
  return value.replace(/([\\;,:"])/g, '\\$1');
}

/**
 * Generates a standards-compliant WiFi QR payload recognized natively by iOS & Android cameras.
 */
export function buildWifiQrString(
  ssid: string,
  password: string,
  security: WifiSecurity = 'WPA'
): string {
  const safeSsid = escapeWifiField(ssid.trim());
  const safePassword = security === 'nopass' ? '' : escapeWifiField(password);
  return `WIFI:T:${security};S:${safeSsid};P:${safePassword};H:false;;`;
}

export interface ResolvedQrOrigin {
  origin: string;
  isDevPreview: boolean;
  wasAutoConverted: boolean;
  usesCustomUrl: boolean;
}

/**
 * Resolves a publicly reachable base URL for scannable Menu QR codes.
 * Automatically converts private AI Studio dev preview hosts (`ais-dev-...`)
 * into the Shared App URL (`ais-pre-...`) so external phones aren't blocked by
 * private developer session auth, unless the user configures a custom domain.
 */
export function resolvePublicQrOrigin(
  currentOrigin: string,
  customBaseUrl?: string
): ResolvedQrOrigin {
  const safeCurrent = currentOrigin.trim().replace(/\/+$/, '');
  const isDevPreview = /^https:\/\/ais-dev-/i.test(safeCurrent);

  if (customBaseUrl && customBaseUrl.trim().length > 0) {
    const trimmed = customBaseUrl.trim();
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        const normalizedPath = parsed.pathname.replace(/\/+$/, '');
        return {
          origin: `${parsed.origin}${normalizedPath}`,
          isDevPreview,
          wasAutoConverted: false,
          usesCustomUrl: true,
        };
      }
    } catch {
      // ignore invalid custom URL and fall back safely
    }
  }

  if (isDevPreview) {
    return {
      origin: safeCurrent.replace(/^https:\/\/ais-dev-/i, 'https://ais-pre-'),
      isDevPreview: true,
      wasAutoConverted: true,
      usesCustomUrl: false,
    };
  }

  return {
    origin: safeCurrent || 'https://tablepulse.app',
    isDevPreview: false,
    wasAutoConverted: false,
    usesCustomUrl: false,
  };
}

export interface QrRestaurantFallbackMeta {
  name?: string;
  city?: string;
  cuisine?: string;
  wifiSsid?: string;
}

/**
 * Generates a unique QR URL for a restaurant and table with optional WiFi auto-connect prompt
 * and safe public fallback metadata (never includes passwords) so newly created outlets open cleanly on any device.
 */
export function buildMenuQrUrl(
  origin: string,
  slug: string,
  tableNumber?: number,
  includeWifiPrompt = true,
  fallbackMeta?: QrRestaurantFallbackMeta
): string {
  const base = origin.replace(/\/+$/, '');
  const params = new URLSearchParams();
  params.set('menu', slug);
  if (tableNumber && tableNumber > 0) {
    params.set('table', String(tableNumber));
  }
  if (includeWifiPrompt) {
    params.set('wifi', '1');
  }
  if (fallbackMeta?.name) {
    params.set('rn', fallbackMeta.name.trim().slice(0, 60));
  }
  if (fallbackMeta?.city) {
    params.set('rc', fallbackMeta.city.trim().slice(0, 40));
  }
  if (fallbackMeta?.cuisine) {
    params.set('ru', fallbackMeta.cuisine.trim().slice(0, 40));
  }
  if (fallbackMeta?.wifiSsid) {
    params.set('rs', fallbackMeta.wifiSsid.trim().slice(0, 48));
  }
  return `${base}/?${params.toString()}`;
}

export interface ScannedMenuParams {
  slug: string;
  tableNumber: number;
  wifiPrompt: boolean;
  name?: string;
  city?: string;
  cuisine?: string;
  wifiSsid?: string;
}

export function parseScannedRestaurantParams(search: string): ScannedMenuParams | null {
  const params = new URLSearchParams(search);
  const slug = params.get('menu')?.trim();
  if (!slug) return null;
  const parsedTable = Number(params.get('table'));
  const tableNumber =
    Number.isInteger(parsedTable) && parsedTable >= 1 && parsedTable <= 250
      ? parsedTable
      : 4;
  return {
    slug: slug.slice(0, 80),
    tableNumber,
    wifiPrompt: params.get('wifi') === '1',
    name: params.get('rn')?.trim().slice(0, 80) || undefined,
    city: params.get('rc')?.trim().slice(0, 50) || undefined,
    cuisine: params.get('ru')?.trim().slice(0, 50) || undefined,
    wifiSsid: params.get('rs')?.trim().slice(0, 64) || undefined,
  };
}

/**
 * Generates an Apple iOS/macOS .mobileconfig WiFi auto-join profile XML.
 */
export function generateIosWifiProfileXml(
  restaurantName: string,
  ssid: string,
  password: string,
  security: WifiSecurity
): string {
  const escapeXml = (str: string) =>
    str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

  const encryptionType =
    security === 'nopass' ? 'None' : security === 'WEP' ? 'WEP' : 'WPA2';

  const safeSlug = slugifyRestaurantName(restaurantName) || 'restaurant';

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>AutoJoin</key>
      <true/>
      <key>EncryptionType</key>
      <string>${encryptionType}</string>
      <key>HIDDEN_NETWORK</key>
      <false/>
      <key>Password</key>
      <string>${escapeXml(security === 'nopass' ? '' : password)}</string>
      <key>PayloadDescription</key>
      <string>Guest WiFi for ${escapeXml(restaurantName)}</string>
      <key>PayloadDisplayName</key>
      <string>${escapeXml(restaurantName)} WiFi</string>
      <key>PayloadIdentifier</key>
      <string>com.tablepulse.wifi.${safeSlug}</string>
      <key>PayloadType</key>
      <string>com.apple.wifi.managed</string>
      <key>PayloadUUID</key>
      <string>84B6F85B-AEEF-4F38-9908-FAAC9177A75A</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
      <key>SSID_STR</key>
      <string>${escapeXml(ssid)}</string>
    </dict>
  </array>
  <key>PayloadDisplayName</key>
  <string>${escapeXml(restaurantName)} Instant WiFi</string>
  <key>PayloadIdentifier</key>
  <string>com.tablepulse.profile.${safeSlug}</string>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadUUID</key>
  <string>A2C1D90E-73A1-44AA-9E8C-4012AB77C119</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
</dict>
</plist>`;
}

export function slugifyRestaurantName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 72);
}

export function formatCurrency(amount: number, currency: CurrencyCode = 'INR'): string {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  if (currency === 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(safeAmount);
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(safeAmount);
}

export function getNextOrderStatus(current: OrderStatus): OrderStatus | null {
  switch (current) {
    case 'pending':
      return 'preparing';
    case 'preparing':
      return 'ready';
    case 'ready':
      return 'served';
    case 'served':
    case 'cancelled':
      return null;
  }
}

export function canRoleTransitionOrder(
  role: UserRole,
  current: OrderStatus,
  next: OrderStatus
): boolean {
  if (current === 'served' || current === 'cancelled') {
    return role === 'super_admin';
  }
  if (role === 'customer') return false;
  if (role === 'super_admin' || role === 'owner' || role === 'manager') {
    return true;
  }
  if (role === 'chef') {
    return (
      (current === 'pending' && next === 'preparing') ||
      (current === 'preparing' && next === 'ready')
    );
  }
  if (role === 'waiter') {
    return current === 'ready' && next === 'served';
  }
  return false;
}

const ROLE_TABS: Record<UserRole, WorkspaceTab[]> = {
  super_admin: ['fleet', 'overview', 'orders', 'menu', 'qr_wifi', 'staff', 'customer_menu'],
  owner: ['overview', 'orders', 'menu', 'qr_wifi', 'staff', 'customer_menu'],
  manager: ['overview', 'orders', 'menu', 'qr_wifi', 'staff', 'customer_menu'],
  chef: ['orders', 'menu', 'customer_menu'],
  waiter: ['orders', 'qr_wifi', 'customer_menu'],
  customer: ['customer_menu'],
};

export function getAllowedTabsForRole(role: UserRole): WorkspaceTab[] {
  return ROLE_TABS[role];
}

export function canRoleAccessTab(role: UserRole, tab: WorkspaceTab): boolean {
  return ROLE_TABS[role].includes(tab);
}

export function canRoleEditMenuPrices(role: UserRole): boolean {
  return role === 'super_admin' || role === 'owner' || role === 'manager';
}

export function canRoleToggleAvailability(role: UserRole): boolean {
  return role === 'super_admin' || role === 'owner' || role === 'manager' || role === 'chef';
}

export function computeAnalytics(orders: Order[], menuItems: MenuItem[]): AnalyticsSummary {
  const validOrders = orders.filter((o) => o.status !== 'cancelled');
  const totalRevenue = validOrders.reduce((sum, o) => sum + o.totalAmount, 0);
  const totalOrders = validOrders.length;
  const activeOrders = validOrders.filter(
    (o) => o.status === 'pending' || o.status === 'preparing' || o.status === 'ready'
  ).length;
  const servedOrders = validOrders.filter((o) => o.status === 'served').length;
  const voiceOrders = validOrders.filter((o) => o.source === 'voice').length;
  const averageOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

  // Hourly trend buckets (11 AM to 10 PM)
  const hourLabels = [
    '11 AM',
    '12 PM',
    '1 PM',
    '2 PM',
    '4 PM',
    '6 PM',
    '7 PM',
    '8 PM',
    '9 PM',
    '10 PM',
  ];
  const baseDistribution = [0.05, 0.11, 0.14, 0.09, 0.06, 0.08, 0.13, 0.16, 0.12, 0.06];
  const baselineTotal = Math.max(totalRevenue, 12000);
  const hourlyTrend = hourLabels.map((hour, idx) => {
    const rev = Math.round(baselineTotal * baseDistribution[idx]);
    const ord = Math.max(1, Math.round((Math.max(totalOrders, 18) * baseDistribution[idx])));
    return { hour, revenue: rev, orders: ord };
  });

  // Category revenue split
  const menuById = new Map(menuItems.map((m) => [m.id, m]));
  const categoryMap = new Map<string, { revenue: number; units: number }>();
  const dishMap = new Map<string, { name: string; unitsSold: number; revenue: number; available: boolean }>();

  for (const order of validOrders) {
    for (const item of order.items) {
      const matched = menuById.get(item.menuItemId);
      const cat = matched?.category ?? 'Specials';
      const prevCat = categoryMap.get(cat) ?? { revenue: 0, units: 0 };
      const lineRev = item.price * item.quantity;
      categoryMap.set(cat, {
        revenue: prevCat.revenue + lineRev,
        units: prevCat.units + item.quantity,
      });

      const prevDish = dishMap.get(item.name) ?? {
        name: item.name,
        unitsSold: 0,
        revenue: 0,
        available: matched ? matched.available : true,
      };
      dishMap.set(item.name, {
        ...prevDish,
        unitsSold: prevDish.unitsSold + item.quantity,
        revenue: prevDish.revenue + lineRev,
        available: matched ? matched.available : prevDish.available,
      });
    }
  }

  const categorySplit = Array.from(categoryMap.entries())
    .map(([category, stats]) => ({ category, ...stats }))
    .sort((a, b) => b.revenue - a.revenue);

  const topDishes = Array.from(dishMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 6);

  return {
    totalRevenue,
    totalOrders,
    activeOrders,
    servedOrders,
    voiceOrders,
    averageOrderValue,
    hourlyTrend,
    categorySplit,
    topDishes,
  };
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateRestaurantInput(input: {
  name: string;
  city: string;
  cuisine: string;
  wifiSsid: string;
  wifiPassword: string;
  tableCount: number;
}): ValidationResult {
  if (input.name.trim().length < 2 || input.name.trim().length > 120) {
    return { valid: false, error: 'Restaurant name must be between 2 and 120 characters.' };
  }
  if (input.city.trim().length < 2 || input.city.trim().length > 80) {
    return { valid: false, error: 'City must be between 2 and 80 characters.' };
  }
  if (input.cuisine.trim().length < 2 || input.cuisine.trim().length > 80) {
    return { valid: false, error: 'Cuisine must be between 2 and 80 characters.' };
  }
  if (input.wifiSsid.trim().length < 1 || input.wifiSsid.trim().length > 64) {
    return { valid: false, error: 'WiFi network name (SSID) is required (max 64 chars).' };
  }
  if (input.wifiPassword.length > 64) {
    return { valid: false, error: 'WiFi password must be 64 characters or fewer.' };
  }
  if (!Number.isInteger(input.tableCount) || input.tableCount < 1 || input.tableCount > 250) {
    return { valid: false, error: 'Table count must be a whole number between 1 and 250.' };
  }
  return { valid: true };
}

export function validateMenuItemInput(input: {
  name: string;
  category: string;
  price: number;
  description: string;
  prepMinutes: number;
}): ValidationResult {
  if (input.name.trim().length < 2 || input.name.trim().length > 100) {
    return { valid: false, error: 'Dish name must be between 2 and 100 characters.' };
  }
  if (input.category.trim().length < 2 || input.category.trim().length > 60) {
    return { valid: false, error: 'Category must be between 2 and 60 characters.' };
  }
  if (!Number.isFinite(input.price) || input.price < 0 || input.price > 100000) {
    return { valid: false, error: 'Price must be between 0 and 100,000.' };
  }
  if (input.description.length > 320) {
    return { valid: false, error: 'Description must be 320 characters or fewer.' };
  }
  if (!Number.isInteger(input.prepMinutes) || input.prepMinutes < 1 || input.prepMinutes > 180) {
    return { valid: false, error: 'Prep time must be between 1 and 180 minutes.' };
  }
  return { valid: true };
}

export function computeFleetTotals(restaurants: Restaurant[]): {
  totalOutlets: number;
  activeOutlets: number;
  totalTables: number;
  monthlyGmv: number;
} {
  return restaurants.reduce(
    (acc, r) => {
      acc.totalOutlets += 1;
      if (r.active) acc.activeOutlets += 1;
      acc.totalTables += r.tableCount;
      acc.monthlyGmv += r.monthlyRevenue;
      return acc;
    },
    { totalOutlets: 0, activeOutlets: 0, totalTables: 0, monthlyGmv: 0 }
  );
}

export const MAX_DISH_IMAGES = 6;

const SAFE_DATA_IMAGE_REGEX = /^data:image\/(jpeg|jpg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/i;

/**
 * Validates that a dish image URL uses an allowed scheme (http/https, root-relative asset path,
 * or raster base64 data URL). Rejects javascript:, SVG data URIs, and HTML payloads.
 */
export function isSafeImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > 600_000) return false;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return !/[\s<>"'`]/.test(trimmed);
  }
  if (SAFE_DATA_IMAGE_REGEX.test(trimmed)) {
    return true;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Deduplicates, validates, and caps a dish's multi-photo gallery (up to 6 images).
 */
export function normalizeDishImages(
  images: string[] | undefined,
  fallbackUrl?: string
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of images ?? []) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed || seen.has(trimmed) || !isSafeImageUrl(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
    if (result.length >= MAX_DISH_IMAGES) break;
  }

  if (result.length === 0 && fallbackUrl && isSafeImageUrl(fallbackUrl)) {
    result.push(fallbackUrl.trim());
  }

  return result;
}

export function getMenuItemPhotos(item: Pick<MenuItem, 'imageUrl' | 'images'>): string[] {
  return normalizeDishImages(
    item.images && item.images.length > 0 ? item.images : [item.imageUrl],
    item.imageUrl
  );
}

