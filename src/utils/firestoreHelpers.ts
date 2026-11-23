import type {
  MenuItem,
  Order,
  Restaurant,
  StaffMember,
  SubscriptionPlan,
  WifiSecurity,
} from '../types/domain';

const FALLBACK_DISH_IMAGE = '/assets/dish-curry.png';
const VALID_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
const VALID_SLUG_REGEX = /^[a-z0-9-]+$/;

/**
 * Ensures a document or entity ID conforms to firestore.rules isValidId(id).
 */
export function isSafeFirestoreId(id: string): boolean {
  return typeof id === 'string' && id.length >= 1 && id.length <= 128 && VALID_ID_REGEX.test(id);
}

/**
 * Normalizes a restaurant slug to satisfy firestore.rules:
 * ^[a-z0-9-]+$ with length 2..80.
 */
export function sanitizeFirestoreSlug(slug: string, fallbackId: string): string {
  const cleaned = (slug || fallbackId || 'restaurant')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  if (cleaned.length >= 2 && VALID_SLUG_REGEX.test(cleaned)) {
    return cleaned;
  }
  return 'rest-outlet';
}

/**
 * Firestore documents must stay small and firestore.rules enforces imageUrl.size() <= 400.
 * Local base64 data URLs are preserved in local state but replaced with a safe preset asset
 * path when persisting to Firestore.
 */
export function sanitizeFirestoreImageUrl(imageUrl?: string, fallback = FALLBACK_DISH_IMAGE): string {
  const candidate = (imageUrl ?? '').trim();
  if (!candidate) return fallback;
  if (candidate.startsWith('data:')) return fallback;
  if (candidate.length > 400) return fallback;
  return candidate;
}

/**
 * Converts a Firestore Timestamp-like object or ISO string into an ISO string.
 */
export function toIsoString(value: unknown, fallback = new Date().toISOString()): string {
  if (!value) return fallback;
  if (typeof value === 'string') return value;
  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate: unknown }).toDate === 'function'
  ) {
    try {
      return (value as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function clampString(value: string, minLen: number, maxLen: number, fallback: string): string {
  const trimmed = (value ?? '').trim().slice(0, maxLen);
  if (trimmed.length >= minLen) return trimmed;
  return fallback.slice(0, maxLen);
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

const VALID_PLANS: SubscriptionPlan[] = ['Starter', 'Growth', 'Enterprise'];
const VALID_WIFI_SEC: WifiSecurity[] = ['WPA', 'WEP', 'nopass'];

/**
 * Builds the exact payload expected by firestore.rules isValidRestaurant(data)
 * (excluding createdAt/updatedAt serverTimestamp fields which callers attach).
 */
export function buildFirestoreRestaurantFields(
  restaurant: Pick<
    Restaurant,
    | 'id'
    | 'slug'
    | 'name'
    | 'city'
    | 'cuisine'
    | 'plan'
    | 'active'
    | 'tableCount'
    | 'wifiSsid'
    | 'wifiPassword'
    | 'wifiSecurity'
    | 'currency'
  >,
  ownerId: string
) {
  return {
    slug: sanitizeFirestoreSlug(restaurant.slug, restaurant.id),
    name: clampString(restaurant.name, 2, 120, 'Restaurant'),
    city: clampString(restaurant.city, 2, 80, 'India'),
    cuisine: clampString(restaurant.cuisine, 2, 80, 'Multi-Cuisine'),
    ownerId: isSafeFirestoreId(ownerId) ? ownerId : 'owner-default',
    plan: VALID_PLANS.includes(restaurant.plan) ? restaurant.plan : 'Growth',
    active: Boolean(restaurant.active),
    tableCount: clampInt(restaurant.tableCount, 1, 250, 12),
    wifiSsid: clampString(restaurant.wifiSsid, 1, 64, 'Guest_WiFi'),
    wifiPassword: (restaurant.wifiPassword ?? '').slice(0, 64),
    wifiSecurity: VALID_WIFI_SEC.includes(restaurant.wifiSecurity)
      ? restaurant.wifiSecurity
      : 'WPA',
    currency: restaurant.currency === 'USD' ? ('USD' as const) : ('INR' as const),
  };
}

/**
 * Builds the exact payload expected by firestore.rules isValidMenuItem(data, restaurantId)
 * (excluding updatedAt serverTimestamp which callers attach).
 */
export function buildFirestoreMenuItemFields(
  item: Pick<
    MenuItem,
    | 'name'
    | 'description'
    | 'category'
    | 'price'
    | 'available'
    | 'veg'
    | 'prepMinutes'
    | 'imageUrl'
    | 'popular'
  >,
  restaurantId: string
) {
  return {
    restaurantId,
    name: clampString(item.name, 2, 100, 'House Special'),
    description: (item.description ?? '').trim().slice(0, 320),
    category: clampString(item.category, 2, 60, 'Mains'),
    price: clampNumber(item.price, 0, 100000, 0),
    available: Boolean(item.available),
    veg: Boolean(item.veg),
    prepMinutes: clampInt(item.prepMinutes, 1, 180, 12),
    imageUrl: sanitizeFirestoreImageUrl(item.imageUrl),
    popular: Boolean(item.popular),
  };
}

/**
 * Builds the exact payload expected by firestore.rules isValidOrder(data, restaurantId)
 * (excluding createdAt/updatedAt serverTimestamp which callers attach).
 */
export function buildFirestoreOrderFields(
  order: Pick<
    Order,
    'orderNumber' | 'tableNumber' | 'customerName' | 'items' | 'totalAmount' | 'source' | 'notes'
  >,
  restaurantId: string,
  restaurantOwnerId: string,
  customerUid: string
) {
  const safeItems = order.items.slice(0, 30).map((i) => ({
    menuItemId: String(i.menuItemId || 'item'),
    name: String(i.name || 'Dish').slice(0, 100),
    quantity: clampInt(i.quantity, 1, 99, 1),
    price: clampNumber(i.price, 0, 100000, 0),
    veg: Boolean(i.veg),
  }));

  return {
    restaurantId,
    restaurantOwnerId,
    orderNumber: clampString(order.orderNumber, 2, 32, 'ORD-100'),
    tableNumber: clampInt(order.tableNumber, 1, 250, 1),
    customerName: clampString(order.customerName, 1, 80, 'Table Guest'),
    customerUid,
    items:
      safeItems.length > 0
        ? safeItems
        : [{ menuItemId: 'item', name: 'Dish', quantity: 1, price: 0, veg: true }],
    totalAmount: clampNumber(order.totalAmount, 0, 500000, 0),
    status: 'pending' as const,
    source:
      order.source === 'voice' || order.source === 'staff' ? order.source : ('qr' as const),
    notes: (order.notes ?? '').trim().slice(0, 240),
  };
}

/**
 * Builds the exact payload expected by firestore.rules isValidStaffMember(data, restaurantId)
 * (excluding createdAt/updatedAt serverTimestamp which callers attach).
 */
export function buildFirestoreStaffFields(
  staff: Pick<StaffMember, 'userId' | 'name' | 'email' | 'role' | 'active'>,
  restaurantId: string,
  restaurantOwnerId: string
) {
  const safeRole =
    staff.role === 'owner' ||
    staff.role === 'manager' ||
    staff.role === 'chef' ||
    staff.role === 'waiter'
      ? staff.role
      : 'waiter';

  return {
    restaurantId,
    restaurantOwnerId,
    userId: isSafeFirestoreId(staff.userId) ? staff.userId : 'staff-member',
    name: clampString(staff.name, 2, 100, 'Team Member'),
    email: clampString(staff.email.toLowerCase(), 5, 160, 'staff@tablepulse.in'),
    role: safeRole,
    active: Boolean(staff.active),
  };
}

/**
 * Formats Firebase Auth sign-in errors into actionable user messages (e.g. Vercel unauthorized domain).
 */
export function formatFirebaseAuthError(error: unknown, currentHost?: string): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : '';
  const message = error instanceof Error ? error.message : String(error ?? '');

  if (code === 'auth/unauthorized-domain' || message.includes('unauthorized-domain')) {
    const hostLabel = currentHost ? ` (${currentHost})` : '';
    return `Domain not authorized in Firebase Auth${hostLabel}. Add this domain in Firebase Console -> Authentication -> Settings -> Authorized domains.`;
  }
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'Google sign-in popup was closed before completing.';
  }
  if (code === 'auth/popup-blocked') {
    return 'Browser blocked the Google sign-in popup. Please allow popups for this site and try again.';
  }
  return message || 'Could not connect to Firebase Authentication.';
}
