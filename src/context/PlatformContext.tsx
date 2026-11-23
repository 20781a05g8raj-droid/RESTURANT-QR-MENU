import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  auth,
  completeGoogleRedirectSignIn,
  db,
  handleFirestoreError,
  OperationType,
  signInWithGoogle,
  signInWithGoogleRedirect,
  signOutUser,
  testFirestoreConnection,
} from '../lib/firebase';
import {
  buildFirestoreMenuItemFields,
  buildFirestoreOrderFields,
  buildFirestoreOrderStatusFields,
  buildFirestoreRestaurantFields,
  buildFirestoreStaffFields,
  formatFirebaseAuthError,
  isSafeFirestoreId,
  toIsoString,
} from '../utils/firestoreHelpers';
import {
  generateDefaultMenuForRestaurant,
  generateSeedOrders,
  generateSeedRestaurants,
  generateSeedStaff,
} from '../data/seedData';
import type {
  MenuItem,
  Order,
  OrderItem,
  OrderSource,
  OrderStatus,
  PortalSession,
  Restaurant,
  StaffMember,
  StaffRole,
  SubscriptionPlan,
  UserRole,
  WifiSecurity,
  WorkspaceTab,
} from '../types/domain';
import {
  canRoleAccessTab,
  getAllowedTabsForRole,
  normalizeDishImages,
  parseScannedRestaurantParams,
  resolvePublicQrOrigin,
  slugifyRestaurantName,
} from '../utils/restaurantLogic';

interface PersistedState {
  restaurants: Restaurant[];
  menusByRestaurant: Record<string, MenuItem[]>;
  ordersByRestaurant: Record<string, Order[]>;
  staffByRestaurant: Record<string, StaffMember[]>;
}

export interface PortalAuthStatus {
  adminConfigured: boolean;
  usesEnvPassword: boolean;
}

export interface RestaurantAccountMeta {
  username: string;
  updatedAt: string;
  passwordUpdatedBy: 'app_owner' | 'restaurant_owner';
}

const STORAGE_KEY = 'tablepulse_platform_state_v2';
const QR_BASE_URL_KEY = 'tablepulse_qr_base_url_v1';
const BROADCAST_CHANNEL = 'tablepulse_realtime_sync_v2';

function buildInitialState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedState;
      if (Array.isArray(parsed.restaurants) && parsed.restaurants.length >= 1) {
        return parsed;
      }
    }
  } catch {
    // ignore storage errors and fall back to deterministic seed
  }

  const restaurants = generateSeedRestaurants();
  const menusByRestaurant: Record<string, MenuItem[]> = {};
  const ordersByRestaurant: Record<string, Order[]> = {};
  const staffByRestaurant: Record<string, StaffMember[]> = {};

  for (const r of restaurants) {
    const menu = generateDefaultMenuForRestaurant(r.id);
    menusByRestaurant[r.id] = menu;
    ordersByRestaurant[r.id] = generateSeedOrders(r, menu);
    staffByRestaurant[r.id] = generateSeedStaff(r);
  }

  return {
    restaurants,
    menusByRestaurant,
    ordersByRestaurant,
    staffByRestaurant,
  };
}

interface PlatformContextValue {
  user: User | null;
  authReady: boolean;
  firestoreConnected: boolean;
  cloudRestaurantCount: number;
  cloudSyncing: boolean;
  cloudSyncError: string | null;
  cloudSyncSuccess: string | null;
  clearCloudSyncMessages: () => void;
  syncAllToCloudDb: () => Promise<{
    ok: boolean;
    syncedRestaurants: number;
    syncedMenuItems: number;
    syncedStaff: number;
    error?: string;
  }>;
  activeRole: UserRole;
  setActiveRole: (role: UserRole) => void;
  activeTab: WorkspaceTab;
  setActiveTab: (tab: WorkspaceTab) => void;
  restaurants: Restaurant[];
  activeRestaurant: Restaurant;
  selectRestaurantById: (id: string) => void;
  activeMenu: MenuItem[];
  activeOrders: Order[];
  activeStaff: StaffMember[];
  customerTableNumber: number;
  setCustomerTableNumber: (table: number) => void;
  wifiPromptOpen: boolean;
  setWifiPromptOpen: (open: boolean) => void;
  wifiConnected: boolean;
  setWifiConnected: (connected: boolean) => void;
  addRestaurantModalOpen: boolean;
  setAddRestaurantModalOpen: (open: boolean) => void;
  editingRestaurant: Restaurant | null;
  setEditingRestaurant: (restaurant: Restaurant | null) => void;
  changePasswordModalOpen: boolean;
  setChangePasswordModalOpen: (open: boolean) => void;
  // Portal Auth (App Owner + Per-Restaurant Owner Login)
  portalSession: PortalSession | null;
  portalAuthStatus: PortalAuthStatus | null;
  portalAuthLoading: boolean;
  guestPreviewMode: boolean;
  setGuestPreviewMode: (enabled: boolean) => void;
  restaurantAccountUsernames: Record<string, string>;
  restaurantAccountMeta: Record<string, RestaurantAccountMeta>;
  setupAppOwner: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  loginPortal: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  changeOwnPassword: (
    currentPassword: string,
    newPassword: string
  ) => Promise<{ ok: boolean; error?: string }>;
  logoutPortal: () => void;
  qrPublicOrigin: string;
  isDevPreviewOrigin: boolean;
  wasQrOriginAutoConverted: boolean;
  customQrBaseUrl: string;
  setCustomQrBaseUrl: (url: string) => void;
  // Mutations
  addRestaurant: (input: {
    name: string;
    city: string;
    cuisine: string;
    plan: SubscriptionPlan;
    tableCount: number;
    wifiSsid: string;
    wifiPassword: string;
    wifiSecurity: WifiSecurity;
    ownerUsername?: string;
    ownerPassword?: string;
  }) => Promise<{ ok: boolean; restaurant?: Restaurant; error?: string }>;
  updateRestaurant: (
    restaurantId: string,
    updates: {
      name: string;
      city: string;
      cuisine: string;
      plan: SubscriptionPlan;
      active: boolean;
      tableCount: number;
      wifiSsid: string;
      wifiPassword: string;
      wifiSecurity: WifiSecurity;
      ownerUsername?: string;
      ownerPassword?: string;
    }
  ) => Promise<{ ok: boolean; error?: string }>;
  deleteRestaurant: (restaurantId: string) => Promise<{ ok: boolean; error?: string }>;
  updateRestaurantWifi: (
    restaurantId: string,
    wifi: { wifiSsid: string; wifiPassword: string; wifiSecurity: WifiSecurity; tableCount: number }
  ) => void;
  toggleMenuItemAvailability: (itemId: string) => void;
  updateMenuItemPrice: (itemId: string, newPrice: number) => void;
  addMenuItem: (input: {
    name: string;
    description: string;
    category: string;
    price: number;
    veg: boolean;
    prepMinutes: number;
    imageUrl: string;
    images?: string[];
  }) => MenuItem;
  updateMenuItem: (
    itemId: string,
    updates: {
      name: string;
      description: string;
      category: string;
      price: number;
      veg: boolean;
      prepMinutes: number;
      imageUrl: string;
      images: string[];
    }
  ) => void;
  deleteMenuItem: (itemId: string) => void;
  placeOrder: (input: {
    tableNumber: number;
    customerName: string;
    items: OrderItem[];
    source: OrderSource;
    notes: string;
  }) => Order;
  updateOrderStatus: (orderId: string, nextStatus: OrderStatus) => void;
  addStaffMember: (input: { name: string; email: string; role: StaffRole }) => StaffMember;
  toggleStaffActive: (staffId: string) => void;
  updateStaffRole: (staffId: string, role: StaffRole) => void;
  // Auth
  handleSignIn: () => Promise<{ ok: boolean; error?: string }>;
  handleRedirectSignIn: () => Promise<{ ok: boolean; error?: string }>;
  handleSignOut: () => Promise<void>;
  // Shared TTS player (gemini-3.8-flash-tts)
  speakText: (text: string, style?: string, voiceName?: string) => Promise<void>;
  speakingText: string | null;
  ttsError: string | null;
  clearTtsError: () => void;
}

const PlatformContext = createContext<PlatformContextValue | null>(null);

export function PlatformProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PersistedState>(() => {
    const base = buildInitialState();
    const scanned = parseScannedRestaurantParams(window.location.search);
    if (
      scanned &&
      !base.restaurants.some(
        (r) => r.slug === scanned.slug || (scanned.restaurantId && r.id === scanned.restaurantId)
      )
    ) {
      const id = scanned.restaurantId || `rest-${scanned.slug}`;
      const now = new Date().toISOString();
      const scannedRestaurant: Restaurant = {
        id,
        slug: scanned.slug,
        name:
          scanned.name ||
          scanned.slug
            .split('-')
            .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ''))
            .join(' '),
        city: scanned.city || 'India',
        cuisine: scanned.cuisine || 'Multi-Cuisine',
        ownerId: 'owner-scanned',
        plan: 'Growth',
        active: true,
        tableCount: Math.max(12, scanned.tableNumber),
        wifiSsid: scanned.wifiSsid || `${scanned.slug.replace(/-/g, '').slice(0, 18)}_WiFi`,
        wifiPassword: '',
        wifiSecurity: 'WPA',
        currency: 'INR',
        monthlyRevenue: 0,
        activeOrdersCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      const defaultMenu = generateDefaultMenuForRestaurant(id);
      return {
        ...base,
        restaurants: [scannedRestaurant, ...base.restaurants],
        menusByRestaurant: {
          ...base.menusByRestaurant,
          [id]: defaultMenu,
        },
        ordersByRestaurant: {
          ...base.ordersByRestaurant,
          [id]: [],
        },
        staffByRestaurant: {
          ...base.staffByRestaurant,
          [id]: generateSeedStaff(scannedRestaurant),
        },
      };
    }
    return base;
  });

  const [activeRestaurantId, setActiveRestaurantId] = useState<string>(() => {
    const scanned = parseScannedRestaurantParams(window.location.search);
    if (scanned) {
      if (scanned.restaurantId) return scanned.restaurantId;
      const initial = buildInitialState();
      const matched = initial.restaurants.find((r) => r.slug === scanned.slug);
      return matched ? matched.id : `rest-${scanned.slug}`;
    }
    return 'rest-saffron-courtyard';
  });

  const [activeRole, setActiveRoleState] = useState<UserRole>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('menu')) return 'customer';
    return 'super_admin';
  });

  const [activeTab, setActiveTabState] = useState<WorkspaceTab>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('menu')) return 'customer_menu';
    return 'overview';
  });

  const [customerTableNumber, setCustomerTableNumber] = useState<number>(() => {
    const scanned = parseScannedRestaurantParams(window.location.search);
    return scanned ? scanned.tableNumber : 4;
  });

  const [wifiPromptOpen, setWifiPromptOpen] = useState<boolean>(() => {
    const scanned = parseScannedRestaurantParams(window.location.search);
    return Boolean(scanned?.wifiPrompt);
  });
  const [wifiConnected, setWifiConnected] = useState<boolean>(false);
  const [addRestaurantModalOpen, setAddRestaurantModalOpen] = useState<boolean>(false);
  const [editingRestaurant, setEditingRestaurant] = useState<Restaurant | null>(null);
  const [changePasswordModalOpen, setChangePasswordModalOpen] = useState<boolean>(false);

  // Portal auth state (Bearer token stored strictly in React memory, never in localStorage)
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [portalSession, setPortalSession] = useState<PortalSession | null>(null);
  const [portalAuthStatus, setPortalAuthStatus] = useState<PortalAuthStatus | null>(null);
  const [portalAuthLoading, setPortalAuthLoading] = useState<boolean>(true);
  const [guestPreviewMode, setGuestPreviewMode] = useState<boolean>(() => {
    return Boolean(new URLSearchParams(window.location.search).get('menu'));
  });
  const [restaurantAccountUsernames, setRestaurantAccountUsernames] = useState<
    Record<string, string>
  >({});
  const [restaurantAccountMeta, setRestaurantAccountMeta] = useState<
    Record<string, RestaurantAccountMeta>
  >({});

  const [customQrBaseUrl, setCustomQrBaseUrlState] = useState<string>(() => {
    try {
      return localStorage.getItem(QR_BASE_URL_KEY) ?? '';
    } catch {
      return '';
    }
  });

  const setCustomQrBaseUrl = useCallback((url: string) => {
    const trimmed = url.trim();
    setCustomQrBaseUrlState(trimmed);
    try {
      if (trimmed) {
        localStorage.setItem(QR_BASE_URL_KEY, trimmed);
      } else {
        localStorage.removeItem(QR_BASE_URL_KEY);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const resolvedQrOrigin = useMemo(
    () =>
      resolvePublicQrOrigin(
        typeof window !== 'undefined' ? window.location.origin : 'https://tablepulse.app',
        customQrBaseUrl
      ),
    [customQrBaseUrl]
  );

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [firestoreConnected, setFirestoreConnected] = useState<boolean>(false);
  const [cloudRestaurantCount, setCloudRestaurantCount] = useState<number>(0);
  const [cloudSyncing, setCloudSyncing] = useState<boolean>(false);
  const [cloudSyncError, setCloudSyncError] = useState<string | null>(null);
  const [cloudSyncSuccess, setCloudSyncSuccess] = useState<string | null>(null);
  const cloudRestaurantIdsRef = useRef<Set<string>>(new Set());
  const stateRef = useRef<PersistedState>(state);
  stateRef.current = state;
  const [speakingText, setSpeakingText] = useState<string | null>(null);
  const [ttsError, setTtsError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  // Persist and broadcast live changes across tabs (instant real-time sync between staff dashboard and customer QR menu)
  const commitState = useCallback((updater: (prev: PersistedState) => PersistedState) => {
    setState((prev) => {
      const next = updater(prev);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore quota limits
      }
      try {
        channelRef.current?.postMessage({ type: 'SYNC_STATE', payload: next });
      } catch {
        // ignore channel errors
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(BROADCAST_CHANNEL);
      channelRef.current = channel;
      channel.onmessage = (event) => {
        if (event.data?.type === 'SYNC_STATE' && event.data?.payload) {
          setState(event.data.payload as PersistedState);
        }
      };
      return () => {
        channel.close();
      };
    }
  }, []);

  const fetchRestaurantAccounts = useCallback(async (token: string) => {
    try {
      const res = await fetch('/api/auth/restaurant-accounts', {
        credentials: 'same-origin',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Requested-With': 'TablePulse',
        },
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        accounts?: Record<string, RestaurantAccountMeta>;
      };
      const accounts = data.accounts ?? {};
      const map: Record<string, string> = {};
      for (const [restId, info] of Object.entries(accounts)) {
        map[restId] = info.username;
      }
      setRestaurantAccountUsernames(map);
      setRestaurantAccountMeta(accounts);
      setState((prev) => ({
        ...prev,
        restaurants: prev.restaurants.map((r) =>
          map[r.id] ? { ...r, ownerUsername: map[r.id] } : r
        ),
      }));
    } catch {
      // ignore fetch error
    }
  }, []);

  const applyAuthenticatedSession = useCallback(
    (token: string, session: PortalSession) => {
      setAuthToken(token);
      setPortalSession(session);
      setGuestPreviewMode(false);
      if (session.role === 'super_admin') {
        setActiveRoleState('super_admin');
        setActiveTabState('fleet');
        void fetchRestaurantAccounts(token);
      } else if (session.role === 'owner' && session.restaurantId) {
        setActiveRoleState('owner');
        setActiveRestaurantId(session.restaurantId);
        setActiveTabState('overview');
      }
    },
    [fetchRestaurantAccounts]
  );

  // Load server portal auth status & restore persistent HttpOnly session cookie on mount
  useEffect(() => {
    let active = true;
    const isScannedQrMenu = Boolean(new URLSearchParams(window.location.search).get('menu'));

    const hydratePortalAuth = async () => {
      try {
        const statusRes = await fetch('/api/auth/status', {
          credentials: 'same-origin',
          cache: 'no-store',
        });
        if (!statusRes.ok) throw new Error('Auth status unavailable');
        const statusData = (await statusRes.json()) as PortalAuthStatus & { hasSession?: boolean };
        if (!active) return;

        setPortalAuthStatus({
          adminConfigured: Boolean(statusData.adminConfigured),
          usesEnvPassword: Boolean(statusData.usesEnvPassword),
        });

        if (statusData.hasSession) {
          const meRes = await fetch('/api/auth/me', {
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { 'X-Requested-With': 'TablePulse' },
          });
          if (meRes.ok && active) {
            const meData = (await meRes.json()) as {
              session?: PortalSession;
              token?: string;
            };
            if (meData.session && meData.token) {
              if (isScannedQrMenu) {
                setAuthToken(meData.token);
                setPortalSession(meData.session);
                if (meData.session.role === 'super_admin') {
                  void fetchRestaurantAccounts(meData.token);
                }
              } else {
                applyAuthenticatedSession(meData.token, meData.session);
              }
            }
          }
        }
      } catch {
        if (active) {
          setPortalAuthStatus({
            adminConfigured: true,
            usesEnvPassword: false,
          });
        }
      } finally {
        if (active) setPortalAuthLoading(false);
      }
    };

    void hydratePortalAuth();

    return () => {
      active = false;
    };
  }, [applyAuthenticatedSession, fetchRestaurantAccounts]);

  // Refresh App Owner's synced restaurant credentials & sync sign-out across browser tabs
  useEffect(() => {
    if (!channelRef.current) return;
    const channel = channelRef.current;
    const handleSync = (event: MessageEvent) => {
      if (event.data?.type === 'SYNC_STATE' && event.data?.payload) {
        setState(event.data.payload as PersistedState);
      } else if (
        event.data?.type === 'ACCOUNTS_UPDATED' &&
        portalSession?.role === 'super_admin' &&
        authToken
      ) {
        void fetchRestaurantAccounts(authToken);
      } else if (event.data?.type === 'PORTAL_LOGOUT') {
        setAuthToken(null);
        setPortalSession(null);
        setRestaurantAccountUsernames({});
        setRestaurantAccountMeta({});
        setChangePasswordModalOpen(false);
        setAddRestaurantModalOpen(false);
        setEditingRestaurant(null);
      }
    };
    channel.onmessage = handleSync;
  }, [authToken, fetchRestaurantAccounts, portalSession?.role]);

  const parseJsonResponse = async <T,>(res: Response): Promise<T | null> => {
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  };

  const setupAppOwner = useCallback(
    async (email: string, password: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await fetch('/api/auth/setup-admin', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'TablePulse',
          },
          body: JSON.stringify({ email, password }),
        });
        const data = await parseJsonResponse<{
          token?: string;
          session?: PortalSession;
          error?: string;
        }>(res);
        if (!res.ok || !data?.token || !data?.session) {
          return {
            ok: false,
            error:
              data?.error ||
              `Authentication API error (HTTP ${res.status}). Check server / Vercel API deployment.`,
          };
        }
        setPortalAuthStatus((prev) =>
          prev ? { ...prev, adminConfigured: true } : prev
        );
        applyAuthenticatedSession(data.token, data.session);
        return { ok: true };
      } catch {
        return { ok: false, error: 'Network error while setting up account.' };
      }
    },
    [applyAuthenticatedSession]
  );

  const loginPortal = useCallback(
    async (username: string, password: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'TablePulse',
          },
          body: JSON.stringify({ username, password }),
        });
        const data = await parseJsonResponse<{
          token?: string;
          session?: PortalSession;
          error?: string;
        }>(res);
        if (!res.ok || !data?.token || !data?.session) {
          return {
            ok: false,
            error:
              data?.error ||
              (res.status === 401
                ? 'Invalid username or password.'
                : `Authentication API error (HTTP ${res.status}). Ensure /api is deployed and APP_OWNER_PASSWORD is set.`),
          };
        }
        applyAuthenticatedSession(data.token, data.session);
        return { ok: true };
      } catch {
        return { ok: false, error: 'Network error while signing in.' };
      }
    },
    [applyAuthenticatedSession]
  );

  const changeOwnPassword = useCallback(
    async (
      currentPassword: string,
      newPassword: string
    ): Promise<{ ok: boolean; error?: string }> => {
      if (!authToken || portalSession?.role !== 'owner') {
        return { ok: false, error: 'Please sign in as a Restaurant Owner first.' };
      }
      try {
        const res = await fetch('/api/auth/change-password', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
            'X-Requested-With': 'TablePulse',
          },
          body: JSON.stringify({ currentPassword, newPassword }),
        });
        const data = await parseJsonResponse<{ ok?: boolean; error?: string }>(res);
        if (!res.ok || !data?.ok) {
          return {
            ok: false,
            error: data?.error || `Could not update password (HTTP ${res.status}).`,
          };
        }
        try {
          channelRef.current?.postMessage({ type: 'ACCOUNTS_UPDATED' });
        } catch {
          // ignore broadcast errors
        }
        return { ok: true };
      } catch {
        return { ok: false, error: 'Network error while updating password.' };
      }
    },
    [authToken, portalSession?.role]
  );

  const logoutPortal = useCallback(() => {
    setAuthToken(null);
    setPortalSession(null);
    setRestaurantAccountUsernames({});
    setRestaurantAccountMeta({});
    setChangePasswordModalOpen(false);
    setAddRestaurantModalOpen(false);
    setEditingRestaurant(null);
    setGuestPreviewMode(false);
    void fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'X-Requested-With': 'TablePulse' },
    }).catch(() => {
      // ignore network error on sign-out cleanup
    });
    try {
      channelRef.current?.postMessage({ type: 'PORTAL_LOGOUT' });
    } catch {
      // ignore broadcast errors
    }
  }, []);

  // Firebase Auth + Connection Validation + Redirect completion
  useEffect(() => {
    completeGoogleRedirectSignIn()
      .then((result) => {
        if (result?.user) {
          setCloudSyncSuccess(
            `Connected to Firebase Cloud Firestore as ${result.user.email ?? 'Google User'}.`
          );
        }
      })
      .catch((error) => {
        const host = typeof window !== 'undefined' ? window.location.host : undefined;
        setCloudSyncError(formatFirebaseAuthError(error, host));
      });

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);
      if (firebaseUser) {
        testFirestoreConnection().then(setFirestoreConnected);
      } else {
        setFirestoreConnected(false);
        setCloudRestaurantCount(0);
        cloudRestaurantIdsRef.current = new Set();
      }
    });
    return () => unsubscribe();
  }, []);

  // Public real-time Firestore listener for active restaurant & menu (works for QR guests without sign-in)
  useEffect(() => {
    if (!isSafeFirestoreId(activeRestaurantId)) return;

    const restRef = doc(db, 'restaurants', activeRestaurantId);
    const unsubActiveRest = onSnapshot(
      restRef,
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        cloudRestaurantIdsRef.current.add(snap.id);
        setState((prev) => {
          const existing = prev.restaurants.find((r) => r.id === snap.id);
          const merged: Restaurant = {
            id: snap.id,
            slug: String(data.slug ?? existing?.slug ?? snap.id),
            name: String(data.name ?? existing?.name ?? 'Restaurant'),
            city: String(data.city ?? existing?.city ?? 'India'),
            cuisine: String(data.cuisine ?? existing?.cuisine ?? 'Multi-Cuisine'),
            ownerId: String(data.ownerId ?? existing?.ownerId ?? 'owner-cloud'),
            ownerUsername: existing?.ownerUsername,
            plan: (data.plan as SubscriptionPlan) ?? existing?.plan ?? 'Growth',
            active: Boolean(data.active ?? existing?.active ?? true),
            tableCount: Number(data.tableCount ?? existing?.tableCount ?? 12),
            wifiSsid: String(data.wifiSsid ?? existing?.wifiSsid ?? 'Guest_WiFi'),
            wifiPassword: String(data.wifiPassword ?? existing?.wifiPassword ?? ''),
            wifiSecurity: (data.wifiSecurity as WifiSecurity) ?? existing?.wifiSecurity ?? 'WPA',
            currency: (data.currency as 'INR' | 'USD') ?? existing?.currency ?? 'INR',
            monthlyRevenue: existing?.monthlyRevenue ?? 0,
            activeOrdersCount: existing?.activeOrdersCount ?? 0,
            createdAt: toIsoString(data.createdAt, existing?.createdAt),
            updatedAt: toIsoString(data.updatedAt, existing?.updatedAt),
          };
          const restaurants = existing
            ? prev.restaurants.map((r) => (r.id === snap.id ? merged : r))
            : [merged, ...prev.restaurants];
          return { ...prev, restaurants };
        });
      },
      (error) => {
        console.warn('Public restaurant snapshot skipped:', error.message);
      }
    );

    const menuPath = `restaurants/${activeRestaurantId}/menuItems`;
    const menuQuery = query(
      collection(db, menuPath),
      where('restaurantId', '==', activeRestaurantId)
    );
    const unsubMenu = onSnapshot(
      menuQuery,
      (snap) => {
        if (snap.empty) return;
        setState((prev) => {
          const localList = prev.menusByRestaurant[activeRestaurantId] ?? [];
          const localById = new Map(localList.map((m) => [m.id, m]));
          const cloudMenu: MenuItem[] = snap.docs.map((d) => {
            const data = d.data();
            const existingLocal = localById.get(d.id);
            const cloudImg = String(data.imageUrl ?? '');
            const keepLocalGallery =
              existingLocal?.images &&
              existingLocal.images.some((img) => img.startsWith('data:'));
            return {
              id: d.id,
              restaurantId: activeRestaurantId,
              name: String(data.name ?? ''),
              description: String(data.description ?? ''),
              category: String(data.category ?? 'Mains'),
              price: Number(data.price ?? 0),
              available: Boolean(data.available ?? true),
              veg: Boolean(data.veg ?? true),
              prepMinutes: Number(data.prepMinutes ?? 12),
              imageUrl: keepLocalGallery && existingLocal ? existingLocal.imageUrl : cloudImg,
              images:
                keepLocalGallery && existingLocal?.images
                  ? existingLocal.images
                  : cloudImg
                    ? [cloudImg]
                    : undefined,
              popular: Boolean(data.popular ?? false),
              updatedAt: toIsoString(data.updatedAt),
            };
          });
          return {
            ...prev,
            menusByRestaurant: {
              ...prev.menusByRestaurant,
              [activeRestaurantId]: cloudMenu,
            },
          };
        });
      },
      (error) => {
        console.warn('Public menu snapshot skipped:', menuPath, error.message);
      }
    );

    return () => {
      unsubActiveRest();
      unsubMenu();
    };
  }, [activeRestaurantId]);

  // Authenticated real-time Firestore listener for all managed restaurants
  useEffect(() => {
    if (!authReady || !user || !user.emailVerified) return;

    const restCollectionPath = 'restaurants';
    const isBootstrappedAdmin = user.email === '20781a05g8raj@gmail.com';
    const restQuery = isBootstrappedAdmin
      ? query(collection(db, restCollectionPath))
      : query(collection(db, restCollectionPath), where('ownerId', '==', user.uid));

    const unsubRestaurants = onSnapshot(
      restQuery,
      (snap) => {
        setCloudRestaurantCount(snap.size);
        cloudRestaurantIdsRef.current = new Set(snap.docs.map((d) => d.id));
        if (snap.empty) return;
        const cloudRestaurants: Restaurant[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            slug: String(data.slug ?? d.id),
            name: String(data.name ?? 'Restaurant'),
            city: String(data.city ?? 'Mumbai'),
            cuisine: String(data.cuisine ?? 'Indian'),
            ownerId: String(data.ownerId ?? user.uid),
            plan: (data.plan as SubscriptionPlan) ?? 'Growth',
            active: Boolean(data.active ?? true),
            tableCount: Number(data.tableCount ?? 12),
            wifiSsid: String(data.wifiSsid ?? 'Guest_WiFi'),
            wifiPassword: String(data.wifiPassword ?? ''),
            wifiSecurity: (data.wifiSecurity as WifiSecurity) ?? 'WPA',
            currency: (data.currency as 'INR' | 'USD') ?? 'INR',
            monthlyRevenue: 750000,
            activeOrdersCount: 0,
            createdAt: toIsoString(data.createdAt),
            updatedAt: toIsoString(data.updatedAt),
          };
        });

        setState((prev) => {
          const map = new Map(prev.restaurants.map((r) => [r.id, r]));
          for (const cr of cloudRestaurants) {
            const existing = map.get(cr.id);
            map.set(cr.id, {
              ...(existing ?? cr),
              ...cr,
              ownerUsername: existing?.ownerUsername,
              monthlyRevenue: existing?.monthlyRevenue ?? cr.monthlyRevenue,
              activeOrdersCount: existing?.activeOrdersCount ?? cr.activeOrdersCount,
            });
          }
          const next = { ...prev, restaurants: Array.from(map.values()) };
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          } catch {
            // ignore storage limits
          }
          return next;
        });
      },
      (error) => {
        setCloudSyncError(`Firestore read error on ${restCollectionPath}: ${error.message}`);
        try {
          handleFirestoreError(error, OperationType.LIST, restCollectionPath);
        } catch {
          // logged structured FirestoreErrorInfo
        }
      }
    );

    return () => {
      unsubRestaurants();
    };
  }, [authReady, user]);

  // Authenticated real-time Firestore listeners for active restaurant orders & staff
  useEffect(() => {
    if (!authReady || !user || !user.emailVerified || !isSafeFirestoreId(activeRestaurantId)) {
      return;
    }

    const isBootstrappedAdmin = user.email === '20781a05g8raj@gmail.com';
    const ordersPath = `restaurants/${activeRestaurantId}/orders`;
    const staffPath = `restaurants/${activeRestaurantId}/staff`;

    const ordersQuery = isBootstrappedAdmin
      ? query(collection(db, ordersPath))
      : query(collection(db, ordersPath), where('restaurantOwnerId', '==', user.uid));

    const staffQuery = isBootstrappedAdmin
      ? query(collection(db, staffPath))
      : query(collection(db, staffPath), where('restaurantOwnerId', '==', user.uid));

    const unsubOrders = onSnapshot(
      ordersQuery,
      (snap) => {
        if (snap.empty) return;
        const cloudOrders: Order[] = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              restaurantId: activeRestaurantId,
              restaurantOwnerId: String(data.restaurantOwnerId ?? user.uid),
              orderNumber: String(data.orderNumber ?? 'ORD-000'),
              tableNumber: Number(data.tableNumber ?? 1),
              customerName: String(data.customerName ?? 'Guest'),
              customerUid: String(data.customerUid ?? user.uid),
              items: Array.isArray(data.items) ? (data.items as OrderItem[]) : [],
              totalAmount: Number(data.totalAmount ?? 0),
              status: (data.status as OrderStatus) ?? 'pending',
              source: (data.source as OrderSource) ?? 'qr',
              notes: String(data.notes ?? ''),
              createdAt: toIsoString(data.createdAt),
              updatedAt: toIsoString(data.updatedAt),
            };
          })
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

        setState((prev) => ({
          ...prev,
          ordersByRestaurant: {
            ...prev.ordersByRestaurant,
            [activeRestaurantId]: cloudOrders,
          },
        }));
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, ordersPath);
        } catch {
          // logged structured FirestoreErrorInfo
        }
      }
    );

    const unsubStaff = onSnapshot(
      staffQuery,
      (snap) => {
        if (snap.empty) return;
        const cloudStaff: StaffMember[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            restaurantId: activeRestaurantId,
            restaurantOwnerId: String(data.restaurantOwnerId ?? user.uid),
            userId: String(data.userId ?? d.id),
            name: String(data.name ?? 'Team Member'),
            email: String(data.email ?? ''),
            role: (data.role as StaffRole) ?? 'waiter',
            active: Boolean(data.active ?? true),
            createdAt: toIsoString(data.createdAt),
            updatedAt: toIsoString(data.updatedAt),
          };
        });

        setState((prev) => ({
          ...prev,
          staffByRestaurant: {
            ...prev.staffByRestaurant,
            [activeRestaurantId]: cloudStaff,
          },
        }));
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, staffPath);
        } catch {
          // logged structured FirestoreErrorInfo
        }
      }
    );

    return () => {
      unsubOrders();
      unsubStaff();
    };
  }, [authReady, user, activeRestaurantId]);

  const ensureRestaurantInFirestore = useCallback(
    async (restaurant: Restaurant): Promise<string | null> => {
      if (!user || !user.emailVerified || !isSafeFirestoreId(restaurant.id)) return null;
      const restRef = doc(db, 'restaurants', restaurant.id);
      const snap = await getDoc(restRef);
      if (snap.exists()) {
        cloudRestaurantIdsRef.current.add(restaurant.id);
        return String(snap.data().ownerId ?? user.uid);
      }
      const fields = buildFirestoreRestaurantFields(restaurant, user.uid);
      await setDoc(restRef, {
        ...fields,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      cloudRestaurantIdsRef.current.add(restaurant.id);
      return user.uid;
    },
    [user]
  );

  const reportCloudWriteError = useCallback(
    (error: unknown, op: OperationType, path: string) => {
      const msg = error instanceof Error ? error.message : String(error);
      setCloudSyncError(`Cloud Firestore sync failed (${path}): ${msg}`);
      try {
        handleFirestoreError(error, op, path);
      } catch {
        // structured Firestore error logged to console
      }
    },
    []
  );

  const activeRestaurant = useMemo(() => {
    return (
      state.restaurants.find((r) => r.id === activeRestaurantId) ??
      state.restaurants[0]
    );
  }, [state.restaurants, activeRestaurantId]);

  const activeMenu = useMemo(() => {
    const existing = state.menusByRestaurant[activeRestaurant.id];
    if (existing && existing.length > 0) return existing;
    return generateDefaultMenuForRestaurant(activeRestaurant.id);
  }, [state.menusByRestaurant, activeRestaurant.id]);

  const activeOrders = useMemo(() => {
    const existing = state.ordersByRestaurant[activeRestaurant.id];
    if (existing) return existing;
    return generateSeedOrders(activeRestaurant, activeMenu);
  }, [state.ordersByRestaurant, activeRestaurant, activeMenu]);

  const activeStaff = useMemo(() => {
    const existing = state.staffByRestaurant[activeRestaurant.id];
    if (existing) return existing;
    return generateSeedStaff(activeRestaurant);
  }, [state.staffByRestaurant, activeRestaurant]);

  const selectRestaurantById = useCallback(
    (id: string) => {
      // Restaurant owner sessions are strictly scoped to their own assigned restaurant
      if (portalSession?.role === 'owner' && portalSession.restaurantId && id !== portalSession.restaurantId) {
        return;
      }
      setActiveRestaurantId(id);
      setWifiConnected(false);
      // Ensure menu/orders/staff are hydrated lazily
      setState((prev) => {
        if (prev.menusByRestaurant[id]) return prev;
        const target = prev.restaurants.find((r) => r.id === id);
        if (!target) return prev;
        const menu = generateDefaultMenuForRestaurant(id);
        return {
          ...prev,
          menusByRestaurant: { ...prev.menusByRestaurant, [id]: menu },
          ordersByRestaurant: {
            ...prev.ordersByRestaurant,
            [id]: generateSeedOrders(target, menu),
          },
          staffByRestaurant: {
            ...prev.staffByRestaurant,
            [id]: generateSeedStaff(target),
          },
        };
      });
    },
    [portalSession]
  );

  const setActiveRole = useCallback(
    (role: UserRole) => {
      // Restaurant owners cannot elevate themselves to super_admin
      const nextRole =
        portalSession?.role === 'owner' && role === 'super_admin' ? 'owner' : role;
      setActiveRoleState(nextRole);
      const allowed = getAllowedTabsForRole(nextRole);
      if (!allowed.includes(activeTab)) {
        setActiveTabState(allowed[0]);
      }
    },
    [activeTab, portalSession]
  );

  const setActiveTab = useCallback(
    (tab: WorkspaceTab) => {
      if (canRoleAccessTab(activeRole, tab)) {
        setActiveTabState(tab);
      } else {
        setActiveTabState(getAllowedTabsForRole(activeRole)[0]);
      }
    },
    [activeRole]
  );

  const addRestaurant = useCallback(
    async (input: {
      name: string;
      city: string;
      cuisine: string;
      plan: SubscriptionPlan;
      tableCount: number;
      wifiSsid: string;
      wifiPassword: string;
      wifiSecurity: WifiSecurity;
      ownerUsername?: string;
      ownerPassword?: string;
    }): Promise<{ ok: boolean; restaurant?: Restaurant; error?: string }> => {
      const now = new Date().toISOString();
      const baseSlug = slugifyRestaurantName(input.name) || 'restaurant';
      const suffix = Date.now().toString(36).slice(-4);
      const slug = `${baseSlug}-${suffix}`;
      const id = `rest-${slug}`;

      const cleanOwnerUser = input.ownerUsername?.trim().toLowerCase() || '';
      const cleanOwnerPass = input.ownerPassword || '';

      if (cleanOwnerUser || cleanOwnerPass) {
        if (!authToken || portalSession?.role !== 'super_admin') {
          return { ok: false, error: 'Only the App Owner can set restaurant login credentials.' };
        }
        const credRes = await fetch('/api/auth/restaurant-accounts', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
            'X-Requested-With': 'TablePulse',
          },
          body: JSON.stringify({
            restaurantId: id,
            username: cleanOwnerUser,
            password: cleanOwnerPass,
          }),
        });
        const credData = (await credRes.json()) as {
          account?: { username: string };
          error?: string;
        };
        if (!credRes.ok) {
          return { ok: false, error: credData.error || 'Could not save restaurant owner login.' };
        }
        setRestaurantAccountUsernames((prev) => ({
          ...prev,
          [id]: credData.account?.username ?? cleanOwnerUser,
        }));
      }

      const newRest: Restaurant = {
        id,
        slug,
        name: input.name.trim(),
        city: input.city.trim(),
        cuisine: input.cuisine.trim(),
        ownerId: user?.uid ?? 'demo-owner-1',
        ownerUsername: cleanOwnerUser || undefined,
        plan: input.plan,
        active: true,
        tableCount: input.tableCount,
        wifiSsid: input.wifiSsid.trim(),
        wifiPassword: input.wifiPassword,
        wifiSecurity: input.wifiSecurity,
        currency: 'INR',
        monthlyRevenue: 0,
        activeOrdersCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      const defaultMenu = generateDefaultMenuForRestaurant(id);
      const defaultStaff = generateSeedStaff(newRest);

      commitState((prev) => ({
        ...prev,
        restaurants: [newRest, ...prev.restaurants],
        menusByRestaurant: { ...prev.menusByRestaurant, [id]: defaultMenu },
        ordersByRestaurant: { ...prev.ordersByRestaurant, [id]: [] },
        staffByRestaurant: { ...prev.staffByRestaurant, [id]: defaultStaff },
      }));

      // Sync new restaurant + default menu + staff to Firestore when signed in
      if (user && user.emailVerified) {
        const docPath = `restaurants/${id}`;
        const restPayload = buildFirestoreRestaurantFields(newRest, user.uid);
        void (async () => {
          try {
            await setDoc(doc(db, 'restaurants', id), {
              ...restPayload,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            cloudRestaurantIdsRef.current.add(id);
            const batch = writeBatch(db);
            for (const item of defaultMenu) {
              batch.set(doc(db, 'restaurants', id, 'menuItems', item.id), {
                ...buildFirestoreMenuItemFields(item, id),
                updatedAt: serverTimestamp(),
              });
            }
            for (const member of defaultStaff) {
              batch.set(doc(db, 'restaurants', id, 'staff', member.id), {
                ...buildFirestoreStaffFields(member, id, user.uid),
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            }
            await batch.commit();
          } catch (err) {
            reportCloudWriteError(err, OperationType.CREATE, docPath);
          }
        })();
      }

      setActiveRestaurantId(id);
      return { ok: true, restaurant: newRest };
    },
    [authToken, commitState, portalSession, reportCloudWriteError, user]
  );

  const updateRestaurant = useCallback(
    async (
      restaurantId: string,
      updates: {
        name: string;
        city: string;
        cuisine: string;
        plan: SubscriptionPlan;
        active: boolean;
        tableCount: number;
        wifiSsid: string;
        wifiPassword: string;
        wifiSecurity: WifiSecurity;
        ownerUsername?: string;
        ownerPassword?: string;
      }
    ): Promise<{ ok: boolean; error?: string }> => {
      // Restaurant owner may only edit their own restaurant
      if (
        portalSession?.role === 'owner' &&
        portalSession.restaurantId &&
        portalSession.restaurantId !== restaurantId
      ) {
        return { ok: false, error: 'You can only edit your own restaurant.' };
      }

      const cleanOwnerUser = updates.ownerUsername?.trim().toLowerCase() || '';
      const cleanOwnerPass = updates.ownerPassword || '';
      let savedUsername: string | undefined;

      if (portalSession?.role === 'super_admin' && authToken && (cleanOwnerUser || cleanOwnerPass)) {
        const credRes = await fetch('/api/auth/restaurant-accounts', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
            'X-Requested-With': 'TablePulse',
          },
          body: JSON.stringify({
            restaurantId,
            username: cleanOwnerUser,
            password: cleanOwnerPass || undefined,
          }),
        });
        const credData = (await credRes.json()) as {
          account?: { username: string };
          error?: string;
        };
        if (!credRes.ok) {
          return {
            ok: false,
            error: credData.error || 'Could not update restaurant owner credentials.',
          };
        }
        savedUsername = credData.account?.username ?? cleanOwnerUser;
        setRestaurantAccountUsernames((prev) => ({ ...prev, [restaurantId]: savedUsername! }));
      }

      const now = new Date().toISOString();
      commitState((prev) => ({
        ...prev,
        restaurants: prev.restaurants.map((r) =>
          r.id === restaurantId
            ? {
                ...r,
                name: updates.name.trim(),
                city: updates.city.trim(),
                cuisine: updates.cuisine.trim(),
                plan: updates.plan,
                active: updates.active,
                tableCount: updates.tableCount,
                wifiSsid: updates.wifiSsid.trim(),
                wifiPassword: updates.wifiPassword,
                wifiSecurity: updates.wifiSecurity,
                ownerUsername: savedUsername ?? r.ownerUsername,
                updatedAt: now,
              }
            : r
        ),
      }));

      if (user && user.emailVerified) {
        const docPath = `restaurants/${restaurantId}`;
        const existingLocal = stateRef.current.restaurants.find((r) => r.id === restaurantId);
        void (async () => {
          try {
            const restRef = doc(db, 'restaurants', restaurantId);
            const snap = await getDoc(restRef);
            if (snap.exists()) {
              await updateDoc(restRef, {
                name: updates.name.trim(),
                city: updates.city.trim(),
                cuisine: updates.cuisine.trim(),
                plan: updates.plan,
                active: updates.active,
                tableCount: updates.tableCount,
                wifiSsid: updates.wifiSsid.trim(),
                wifiPassword: updates.wifiPassword,
                wifiSecurity: updates.wifiSecurity,
                updatedAt: serverTimestamp(),
              });
            } else if (existingLocal) {
              await setDoc(restRef, {
                ...buildFirestoreRestaurantFields({ ...existingLocal, ...updates }, user.uid),
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
              cloudRestaurantIdsRef.current.add(restaurantId);
            }
          } catch (err) {
            reportCloudWriteError(err, OperationType.UPDATE, docPath);
          }
        })();
      }

      return { ok: true };
    },
    [authToken, commitState, portalSession, reportCloudWriteError, user]
  );

  const deleteRestaurant = useCallback(
    async (restaurantId: string): Promise<{ ok: boolean; error?: string }> => {
      if (portalSession?.role !== 'super_admin') {
        return { ok: false, error: 'Only the App Owner can delete restaurants.' };
      }
      if (state.restaurants.length <= 1) {
        return { ok: false, error: 'At least one restaurant must remain in the platform.' };
      }

      if (authToken) {
        await fetch(`/api/auth/restaurant-accounts/${encodeURIComponent(restaurantId)}`, {
          method: 'DELETE',
          credentials: 'same-origin',
          headers: {
            Authorization: `Bearer ${authToken}`,
            'X-Requested-With': 'TablePulse',
          },
        }).catch(() => {
          // ignore if account did not exist
        });
      }

      setRestaurantAccountUsernames((prev) => {
        const next = { ...prev };
        delete next[restaurantId];
        return next;
      });

      const remaining = state.restaurants.filter((r) => r.id !== restaurantId);
      commitState((prev) => {
        const nextMenus = { ...prev.menusByRestaurant };
        const nextOrders = { ...prev.ordersByRestaurant };
        const nextStaff = { ...prev.staffByRestaurant };
        delete nextMenus[restaurantId];
        delete nextOrders[restaurantId];
        delete nextStaff[restaurantId];
        return {
          restaurants: prev.restaurants.filter((r) => r.id !== restaurantId),
          menusByRestaurant: nextMenus,
          ordersByRestaurant: nextOrders,
          staffByRestaurant: nextStaff,
        };
      });

      if (activeRestaurantId === restaurantId && remaining[0]) {
        setActiveRestaurantId(remaining[0].id);
      }

      if (user && user.emailVerified) {
        const docPath = `restaurants/${restaurantId}`;
        deleteDoc(doc(db, 'restaurants', restaurantId)).catch((err) => {
          reportCloudWriteError(err, OperationType.DELETE, docPath);
        });
      }

      return { ok: true };
    },
    [
      activeRestaurantId,
      authToken,
      commitState,
      portalSession,
      reportCloudWriteError,
      state.restaurants,
      user,
    ]
  );

  const updateRestaurantWifi = useCallback(
    (
      restaurantId: string,
      wifi: {
        wifiSsid: string;
        wifiPassword: string;
        wifiSecurity: WifiSecurity;
        tableCount: number;
      }
    ) => {
      const now = new Date().toISOString();
      commitState((prev) => ({
        ...prev,
        restaurants: prev.restaurants.map((r) =>
          r.id === restaurantId ? { ...r, ...wifi, updatedAt: now } : r
        ),
      }));

      if (user && user.emailVerified) {
        const docPath = `restaurants/${restaurantId}`;
        const existingLocal = stateRef.current.restaurants.find((r) => r.id === restaurantId);
        void (async () => {
          try {
            const restRef = doc(db, 'restaurants', restaurantId);
            const snap = await getDoc(restRef);
            if (snap.exists()) {
              await updateDoc(restRef, {
                wifiSsid: wifi.wifiSsid,
                wifiPassword: wifi.wifiPassword,
                wifiSecurity: wifi.wifiSecurity,
                tableCount: wifi.tableCount,
                updatedAt: serverTimestamp(),
              });
            } else if (existingLocal) {
              await setDoc(restRef, {
                ...buildFirestoreRestaurantFields({ ...existingLocal, ...wifi }, user.uid),
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            }
          } catch (err) {
            reportCloudWriteError(err, OperationType.UPDATE, docPath);
          }
        })();
      }
    },
    [commitState, reportCloudWriteError, user]
  );

  const toggleMenuItemAvailability = useCallback(
    (itemId: string) => {
      const now = new Date().toISOString();
      const restId = activeRestaurant.id;
      let nextItem: MenuItem | null = null;

      commitState((prev) => {
        const list = prev.menusByRestaurant[restId] ?? generateDefaultMenuForRestaurant(restId);
        const updated = list.map((item) => {
          if (item.id === itemId) {
            nextItem = { ...item, available: !item.available, updatedAt: now };
            return nextItem;
          }
          return item;
        });
        return {
          ...prev,
          menusByRestaurant: { ...prev.menusByRestaurant, [restId]: updated },
        };
      });

      if (user && user.emailVerified && nextItem) {
        const itemToSync = nextItem as MenuItem;
        const itemPath = `restaurants/${restId}/menuItems/${itemId}`;
        void (async () => {
          try {
            await ensureRestaurantInFirestore(activeRestaurant);
            await setDoc(doc(db, 'restaurants', restId, 'menuItems', itemId), {
              ...buildFirestoreMenuItemFields(itemToSync, restId),
              updatedAt: serverTimestamp(),
            });
          } catch (err) {
            reportCloudWriteError(err, OperationType.UPDATE, itemPath);
          }
        })();
      }
    },
    [activeRestaurant, commitState, ensureRestaurantInFirestore, reportCloudWriteError, user]
  );

  const updateMenuItemPrice = useCallback(
    (itemId: string, newPrice: number) => {
      if (!Number.isFinite(newPrice) || newPrice < 0 || newPrice > 100000) return;
      const now = new Date().toISOString();
      const restId = activeRestaurant.id;
      const roundedPrice = Math.round(newPrice);
      let nextItem: MenuItem | null = null;

      commitState((prev) => {
        const list = prev.menusByRestaurant[restId] ?? generateDefaultMenuForRestaurant(restId);
        const updated = list.map((item) => {
          if (item.id === itemId) {
            nextItem = { ...item, price: roundedPrice, updatedAt: now };
            return nextItem;
          }
          return item;
        });
        return {
          ...prev,
          menusByRestaurant: { ...prev.menusByRestaurant, [restId]: updated },
        };
      });

      if (user && user.emailVerified && nextItem) {
        const itemToSync = nextItem as MenuItem;
        const itemPath = `restaurants/${restId}/menuItems/${itemId}`;
        void (async () => {
          try {
            await ensureRestaurantInFirestore(activeRestaurant);
            await setDoc(doc(db, 'restaurants', restId, 'menuItems', itemId), {
              ...buildFirestoreMenuItemFields(itemToSync, restId),
              updatedAt: serverTimestamp(),
            });
          } catch (err) {
            reportCloudWriteError(err, OperationType.UPDATE, itemPath);
          }
        })();
      }
    },
    [activeRestaurant, commitState, ensureRestaurantInFirestore, reportCloudWriteError, user]
  );

  const addMenuItem = useCallback(
    (input: {
      name: string;
      description: string;
      category: string;
      price: number;
      veg: boolean;
      prepMinutes: number;
      imageUrl: string;
      images?: string[];
    }): MenuItem => {
      const now = new Date().toISOString();
      const restId = activeRestaurant.id;
      const gallery = normalizeDishImages(input.images, input.imageUrl);
      const primaryImage = gallery[0] ?? input.imageUrl;

      const newItem: MenuItem = {
        id: `${restId}-dish-${Date.now().toString(36)}`,
        restaurantId: restId,
        name: input.name.trim(),
        description: input.description.trim(),
        category: input.category.trim(),
        price: Math.round(input.price),
        available: true,
        veg: input.veg,
        prepMinutes: input.prepMinutes,
        imageUrl: primaryImage,
        images: gallery,
        popular: false,
        updatedAt: now,
      };

      commitState((prev) => {
        const list = prev.menusByRestaurant[restId] ?? generateDefaultMenuForRestaurant(restId);
        return {
          ...prev,
          menusByRestaurant: { ...prev.menusByRestaurant, [restId]: [newItem, ...list] },
        };
      });

      if (user && user.emailVerified) {
        const itemPath = `restaurants/${restId}/menuItems/${newItem.id}`;
        void (async () => {
          try {
            await ensureRestaurantInFirestore(activeRestaurant);
            await setDoc(doc(db, 'restaurants', restId, 'menuItems', newItem.id), {
              ...buildFirestoreMenuItemFields(newItem, restId),
              updatedAt: serverTimestamp(),
            });
          } catch (err) {
            reportCloudWriteError(err, OperationType.CREATE, itemPath);
          }
        })();
      }

      return newItem;
    },
    [activeRestaurant, commitState, ensureRestaurantInFirestore, reportCloudWriteError, user]
  );

  const updateMenuItem = useCallback(
    (
      itemId: string,
      updates: {
        name: string;
        description: string;
        category: string;
        price: number;
        veg: boolean;
        prepMinutes: number;
        imageUrl: string;
        images: string[];
      }
    ) => {
      if (!Number.isFinite(updates.price) || updates.price < 0 || updates.price > 100000) return;
      const now = new Date().toISOString();
      const restId = activeRestaurant.id;
      const gallery = normalizeDishImages(updates.images, updates.imageUrl);
      const primaryImage = gallery[0] ?? updates.imageUrl;
      const roundedPrice = Math.round(updates.price);
      let updatedItem: MenuItem | null = null;

      commitState((prev) => {
        const list = prev.menusByRestaurant[restId] ?? generateDefaultMenuForRestaurant(restId);
        const updated = list.map((item) => {
          if (item.id === itemId) {
            updatedItem = {
              ...item,
              name: updates.name.trim(),
              description: updates.description.trim(),
              category: updates.category.trim(),
              price: roundedPrice,
              veg: updates.veg,
              prepMinutes: updates.prepMinutes,
              imageUrl: primaryImage,
              images: gallery,
              updatedAt: now,
            };
            return updatedItem;
          }
          return item;
        });
        return {
          ...prev,
          menusByRestaurant: { ...prev.menusByRestaurant, [restId]: updated },
        };
      });

      if (user && user.emailVerified && updatedItem) {
        const itemToSync = updatedItem as MenuItem;
        const itemPath = `restaurants/${restId}/menuItems/${itemId}`;
        void (async () => {
          try {
            await ensureRestaurantInFirestore(activeRestaurant);
            await setDoc(doc(db, 'restaurants', restId, 'menuItems', itemId), {
              ...buildFirestoreMenuItemFields(itemToSync, restId),
              updatedAt: serverTimestamp(),
            });
          } catch (err) {
            reportCloudWriteError(err, OperationType.UPDATE, itemPath);
          }
        })();
      }
    },
    [activeRestaurant, commitState, ensureRestaurantInFirestore, reportCloudWriteError, user]
  );

  const deleteMenuItem = useCallback(
    (itemId: string) => {
      const restId = activeRestaurant.id;
      commitState((prev) => {
        const list = prev.menusByRestaurant[restId] ?? generateDefaultMenuForRestaurant(restId);
        return {
          ...prev,
          menusByRestaurant: {
            ...prev.menusByRestaurant,
            [restId]: list.filter((i) => i.id !== itemId),
          },
        };
      });

      if (user && user.emailVerified) {
        const itemPath = `restaurants/${restId}/menuItems/${itemId}`;
        deleteDoc(doc(db, 'restaurants', restId, 'menuItems', itemId)).catch((err) => {
          reportCloudWriteError(err, OperationType.DELETE, itemPath);
        });
      }
    },
    [activeRestaurant.id, commitState, reportCloudWriteError, user]
  );

  const placeOrder = useCallback(
    (input: {
      tableNumber: number;
      customerName: string;
      items: OrderItem[];
      source: OrderSource;
      notes: string;
    }): Order => {
      const now = new Date().toISOString();
      const restId = activeRestaurant.id;
      const totalAmount = input.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
      const orderNum = `ORD-${Math.floor(410 + Math.random() * 580)}`;
      const entropyBytes = new Uint8Array(9);
      let entropyToken = '';
      if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        crypto.getRandomValues(entropyBytes);
        entropyToken = Array.from(entropyBytes, (b) => b.toString(16).padStart(2, '0')).join('');
      } else {
        entropyToken = `${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;
      }
      const guestUid = `guest-${Date.now().toString(36)}-${entropyToken.slice(0, 12)}`;
      const isSignedInVerified = Boolean(user && user.emailVerified);
      const effectiveUid = isSignedInVerified && user ? user.uid : guestUid;
      const safeSource: OrderSource =
        !isSignedInVerified && input.source === 'staff' ? 'qr' : input.source;

      const newOrder: Order = {
        id: `${restId.slice(0, 60)}-ord-${Date.now().toString(36)}-${entropyToken}`,
        restaurantId: restId,
        restaurantOwnerId: activeRestaurant.ownerId,
        orderNumber: orderNum,
        tableNumber: input.tableNumber,
        customerName: input.customerName.trim() || `Table ${input.tableNumber} Guest`,
        customerUid: effectiveUid,
        items: input.items.slice(0, 30),
        totalAmount,
        status: 'pending',
        source: safeSource,
        notes: input.notes.trim().slice(0, 240),
        createdAt: now,
        updatedAt: now,
      };

      commitState((prev) => {
        const currentMenu = prev.menusByRestaurant[restId] ?? generateDefaultMenuForRestaurant(restId);
        const currentOrders =
          prev.ordersByRestaurant[restId] ?? generateSeedOrders(activeRestaurant, currentMenu);
        return {
          ...prev,
          ordersByRestaurant: {
            ...prev.ordersByRestaurant,
            [restId]: [newOrder, ...currentOrders],
          },
          restaurants: prev.restaurants.map((r) =>
            r.id === restId
              ? {
                  ...r,
                  activeOrdersCount: r.activeOrdersCount + 1,
                  monthlyRevenue: r.monthlyRevenue + totalAmount,
                }
              : r
          ),
        };
      });

      // Sync directly to Cloud Firestore (atomic batch: order + zero-PII live orderStatus mirror)
      if (isSafeFirestoreId(restId)) {
        const orderPath = `restaurants/${restId}/orders/${newOrder.id}`;
        void (async () => {
          try {
            const restSnap = await getDoc(doc(db, 'restaurants', restId));
            let parentOwnerId: string | null = null;
            let parentTableCount = activeRestaurant.tableCount || 250;
            if (restSnap.exists()) {
              const restData = restSnap.data();
              if (restData.active === false) {
                setCloudSyncError('This restaurant is currently not accepting live orders.');
                return;
              }
              parentOwnerId = String(restData.ownerId ?? '');
              if (typeof restData.tableCount === 'number' && restData.tableCount >= 1) {
                parentTableCount = restData.tableCount;
              }
            } else if (isSignedInVerified && user?.email === '20781a05g8raj@gmail.com') {
              parentOwnerId = await ensureRestaurantInFirestore(activeRestaurant);
            }
            if (!parentOwnerId) {
              return;
            }
            const clampedTableNumber = Math.max(
              1,
              Math.min(Math.round(newOrder.tableNumber), parentTableCount)
            );
            const cloudOrder = {
              ...newOrder,
              tableNumber: clampedTableNumber,
            };
            const batch = writeBatch(db);
            batch.set(doc(db, 'restaurants', restId, 'orders', newOrder.id), {
              ...buildFirestoreOrderFields(cloudOrder, restId, parentOwnerId, effectiveUid),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            batch.set(doc(db, 'restaurants', restId, 'orderStatus', newOrder.id), {
              ...buildFirestoreOrderStatusFields(cloudOrder, restId, parentOwnerId),
              updatedAt: serverTimestamp(),
            });
            await batch.commit();
          } catch (err) {
            reportCloudWriteError(err, OperationType.CREATE, orderPath);
          }
        })();
      }

      return newOrder;
    },
    [activeRestaurant, commitState, ensureRestaurantInFirestore, reportCloudWriteError, user]
  );

  const updateOrderStatus = useCallback(
    (orderId: string, nextStatus: OrderStatus) => {
      const now = new Date().toISOString();
      const restId = activeRestaurant.id;

      commitState((prev) => {
        const currentMenu = prev.menusByRestaurant[restId] ?? generateDefaultMenuForRestaurant(restId);
        const currentOrders =
          prev.ordersByRestaurant[restId] ?? generateSeedOrders(activeRestaurant, currentMenu);
        const updatedOrders = currentOrders.map((o) =>
          o.id === orderId ? { ...o, status: nextStatus, updatedAt: now } : o
        );
        const activeCount = updatedOrders.filter(
          (o) => o.status === 'pending' || o.status === 'preparing' || o.status === 'ready'
        ).length;

        return {
          ...prev,
          ordersByRestaurant: {
            ...prev.ordersByRestaurant,
            [restId]: updatedOrders,
          },
          restaurants: prev.restaurants.map((r) =>
            r.id === restId ? { ...r, activeOrdersCount: activeCount } : r
          ),
        };
      });

      if (user && user.emailVerified && isSafeFirestoreId(restId) && isSafeFirestoreId(orderId)) {
        const orderPath = `restaurants/${restId}/orders/${orderId}`;
        void (async () => {
          try {
            const orderRef = doc(db, 'restaurants', restId, 'orders', orderId);
            const statusRef = doc(db, 'restaurants', restId, 'orderStatus', orderId);
            const [orderSnap, statusSnap] = await Promise.all([
              getDoc(orderRef),
              getDoc(statusRef),
            ]);
            if (!orderSnap.exists()) return;

            const orderData = orderSnap.data();
            const batch = writeBatch(db);
            batch.update(orderRef, {
              status: nextStatus,
              updatedAt: serverTimestamp(),
            });
            if (statusSnap.exists()) {
              batch.update(statusRef, {
                status: nextStatus,
                updatedAt: serverTimestamp(),
              });
            } else {
              batch.set(statusRef, {
                ...buildFirestoreOrderStatusFields(
                  {
                    orderNumber: String(orderData.orderNumber ?? 'ORD-100'),
                    tableNumber: Number(orderData.tableNumber ?? 1),
                    status: nextStatus,
                  },
                  restId,
                  String(orderData.restaurantOwnerId ?? activeRestaurant.ownerId)
                ),
                updatedAt: serverTimestamp(),
              });
            }
            await batch.commit();
          } catch (err) {
            reportCloudWriteError(err, OperationType.UPDATE, orderPath);
          }
        })();
      }
    },
    [activeRestaurant, commitState, reportCloudWriteError, user]
  );

  const addStaffMember = useCallback(
    (input: { name: string; email: string; role: StaffRole }): StaffMember => {
      const now = new Date().toISOString();
      const restId = activeRestaurant.id;
      const newStaff: StaffMember = {
        id: `${restId}-staff-${Date.now().toString(36)}`,
        restaurantId: restId,
        restaurantOwnerId: activeRestaurant.ownerId,
        userId: `staff-${Date.now().toString(36)}`,
        name: input.name.trim(),
        email: input.email.trim().toLowerCase(),
        role: input.role,
        active: true,
        createdAt: now,
        updatedAt: now,
      };

      commitState((prev) => {
        const list = prev.staffByRestaurant[restId] ?? generateSeedStaff(activeRestaurant);
        return {
          ...prev,
          staffByRestaurant: { ...prev.staffByRestaurant, [restId]: [...list, newStaff] },
        };
      });

      if (user && user.emailVerified) {
        const staffPath = `restaurants/${restId}/staff/${newStaff.id}`;
        void (async () => {
          try {
            const parentOwnerId = (await ensureRestaurantInFirestore(activeRestaurant)) ?? user.uid;
            await setDoc(doc(db, 'restaurants', restId, 'staff', newStaff.id), {
              ...buildFirestoreStaffFields(newStaff, restId, parentOwnerId),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } catch (err) {
            reportCloudWriteError(err, OperationType.CREATE, staffPath);
          }
        })();
      }

      return newStaff;
    },
    [activeRestaurant, commitState, ensureRestaurantInFirestore, reportCloudWriteError, user]
  );

  const toggleStaffActive = useCallback(
    (staffId: string) => {
      const now = new Date().toISOString();
      const restId = activeRestaurant.id;
      let updatedMember: StaffMember | null = null;
      commitState((prev) => {
        const list = prev.staffByRestaurant[restId] ?? generateSeedStaff(activeRestaurant);
        return {
          ...prev,
          staffByRestaurant: {
            ...prev.staffByRestaurant,
            [restId]: list.map((s) => {
              if (s.id === staffId) {
                updatedMember = { ...s, active: !s.active, updatedAt: now };
                return updatedMember;
              }
              return s;
            }),
          },
        };
      });

      if (user && user.emailVerified && updatedMember) {
        const memberToSync = updatedMember as StaffMember;
        const staffPath = `restaurants/${restId}/staff/${staffId}`;
        void (async () => {
          try {
            const parentOwnerId = (await ensureRestaurantInFirestore(activeRestaurant)) ?? user.uid;
            const staffRef = doc(db, 'restaurants', restId, 'staff', staffId);
            const snap = await getDoc(staffRef);
            if (snap.exists()) {
              await updateDoc(staffRef, {
                active: memberToSync.active,
                updatedAt: serverTimestamp(),
              });
            } else {
              await setDoc(staffRef, {
                ...buildFirestoreStaffFields(memberToSync, restId, parentOwnerId),
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            }
          } catch (err) {
            reportCloudWriteError(err, OperationType.UPDATE, staffPath);
          }
        })();
      }
    },
    [activeRestaurant, commitState, ensureRestaurantInFirestore, reportCloudWriteError, user]
  );

  const updateStaffRole = useCallback(
    (staffId: string, role: StaffRole) => {
      const now = new Date().toISOString();
      const restId = activeRestaurant.id;
      let updatedMember: StaffMember | null = null;
      commitState((prev) => {
        const list = prev.staffByRestaurant[restId] ?? generateSeedStaff(activeRestaurant);
        return {
          ...prev,
          staffByRestaurant: {
            ...prev.staffByRestaurant,
            [restId]: list.map((s) => {
              if (s.id === staffId) {
                updatedMember = { ...s, role, updatedAt: now };
                return updatedMember;
              }
              return s;
            }),
          },
        };
      });

      if (user && user.emailVerified && updatedMember) {
        const memberToSync = updatedMember as StaffMember;
        const staffPath = `restaurants/${restId}/staff/${staffId}`;
        void (async () => {
          try {
            const parentOwnerId = (await ensureRestaurantInFirestore(activeRestaurant)) ?? user.uid;
            const staffRef = doc(db, 'restaurants', restId, 'staff', staffId);
            const snap = await getDoc(staffRef);
            if (snap.exists()) {
              await updateDoc(staffRef, {
                role: memberToSync.role,
                updatedAt: serverTimestamp(),
              });
            } else {
              await setDoc(staffRef, {
                ...buildFirestoreStaffFields(memberToSync, restId, parentOwnerId),
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            }
          } catch (err) {
            reportCloudWriteError(err, OperationType.UPDATE, staffPath);
          }
        })();
      }
    },
    [activeRestaurant, commitState, ensureRestaurantInFirestore, reportCloudWriteError, user]
  );

  const syncAllToCloudDb = useCallback(async () => {
    if (!user || !user.emailVerified) {
      const msg = 'Please connect your Google account first to sync with Cloud Firestore.';
      setCloudSyncError(msg);
      return { ok: false, syncedRestaurants: 0, syncedMenuItems: 0, syncedStaff: 0, error: msg };
    }

    setCloudSyncing(true);
    setCloudSyncError(null);
    setCloudSyncSuccess(null);

    try {
      const snapshot = stateRef.current;
      let syncedRestaurants = 0;
      let syncedMenuItems = 0;
      let syncedStaff = 0;

      for (const rest of snapshot.restaurants) {
        if (!isSafeFirestoreId(rest.id)) continue;
        const restRef = doc(db, 'restaurants', rest.id);
        const existingSnap = await getDoc(restRef);
        let parentOwnerId = user.uid;

        if (existingSnap.exists()) {
          parentOwnerId = String(existingSnap.data().ownerId ?? user.uid);
          const fields = buildFirestoreRestaurantFields(rest, parentOwnerId);
          await updateDoc(restRef, {
            name: fields.name,
            city: fields.city,
            cuisine: fields.cuisine,
            plan: fields.plan,
            active: fields.active,
            tableCount: fields.tableCount,
            wifiSsid: fields.wifiSsid,
            wifiPassword: fields.wifiPassword,
            wifiSecurity: fields.wifiSecurity,
            currency: fields.currency,
            updatedAt: serverTimestamp(),
          });
        } else {
          const fields = buildFirestoreRestaurantFields(rest, user.uid);
          await setDoc(restRef, {
            ...fields,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        cloudRestaurantIdsRef.current.add(rest.id);
        syncedRestaurants += 1;

        const menu = snapshot.menusByRestaurant[rest.id] ?? generateDefaultMenuForRestaurant(rest.id);
        const staff = snapshot.staffByRestaurant[rest.id] ?? generateSeedStaff(rest);

        // Batch menu items (safe setDoc: no createdAt immutability constraint)
        const menuBatch = writeBatch(db);
        for (const item of menu) {
          if (!isSafeFirestoreId(item.id)) continue;
          menuBatch.set(doc(db, 'restaurants', rest.id, 'menuItems', item.id), {
            ...buildFirestoreMenuItemFields(item, rest.id),
            updatedAt: serverTimestamp(),
          });
          syncedMenuItems += 1;
        }
        if (menu.length > 0) {
          await menuBatch.commit();
        }

        // Sync staff docs (preserve createdAt on updates)
        for (const member of staff) {
          if (!isSafeFirestoreId(member.id)) continue;
          const staffRef = doc(db, 'restaurants', rest.id, 'staff', member.id);
          const staffSnap = await getDoc(staffRef);
          if (staffSnap.exists()) {
            await updateDoc(staffRef, {
              name: member.name.trim(),
              role: member.role,
              active: member.active,
              updatedAt: serverTimestamp(),
            });
          } else {
            await setDoc(staffRef, {
              ...buildFirestoreStaffFields(member, rest.id, parentOwnerId),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
          syncedStaff += 1;
        }
      }

      const summary = `Synced ${syncedRestaurants} restaurants, ${syncedMenuItems} menu items & ${syncedStaff} staff to Cloud Firestore.`;
      setCloudSyncSuccess(summary);
      return { ok: true, syncedRestaurants, syncedMenuItems, syncedStaff };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Cloud Firestore sync failed.';
      reportCloudWriteError(err, OperationType.WRITE, 'restaurants');
      return { ok: false, syncedRestaurants: 0, syncedMenuItems: 0, syncedStaff: 0, error: msg };
    } finally {
      setCloudSyncing(false);
    }
  }, [reportCloudWriteError, user]);

  const handleSignIn = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    setCloudSyncError(null);
    setCloudSyncSuccess(null);
    try {
      const result = await signInWithGoogle();
      if (result.user) {
        const connected = await testFirestoreConnection();
        setFirestoreConnected(connected);
        setCloudSyncSuccess(`Connected to Firebase Cloud Firestore as ${result.user.email ?? 'Google User'}.`);
      }
      return { ok: true };
    } catch (error) {
      const host = typeof window !== 'undefined' ? window.location.host : undefined;
      const friendly = formatFirebaseAuthError(error, host);
      setCloudSyncError(friendly);
      console.error('Google Sign-In failed:', error);
      return { ok: false, error: friendly };
    }
  }, []);

  const handleRedirectSignIn = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    setCloudSyncError(null);
    setCloudSyncSuccess(null);
    try {
      await signInWithGoogleRedirect();
      return { ok: true };
    } catch (error) {
      const host = typeof window !== 'undefined' ? window.location.host : undefined;
      const friendly = formatFirebaseAuthError(error, host);
      setCloudSyncError(friendly);
      console.error('Google Redirect Sign-In failed:', error);
      return { ok: false, error: friendly };
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    setCloudSyncError(null);
    setCloudSyncSuccess(null);
    try {
      await signOutUser();
    } catch (error) {
      console.error('Sign-Out failed:', error);
    }
  }, []);

  // Gemini 3.8 Flash TTS playback helper
  const speakText = useCallback(
    async (text: string, style?: string, voiceName = 'Kore') => {
      setTtsError(null);
      setSpeakingText(text);
      try {
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, style, voiceName }),
        });
        const data = (await res.json()) as { audioBase64?: string; error?: string };
        if (!res.ok || !data.audioBase64) {
          throw new Error(data.error || 'Could not generate speech audio.');
        }
        const audio = new Audio(`data:audio/wav;base64,${data.audioBase64}`);
        audioRef.current = audio;
        audio.onended = () => setSpeakingText(null);
        audio.onerror = () => setSpeakingText(null);
        await audio.play();
      } catch (err) {
        setSpeakingText(null);
        setTtsError(err instanceof Error ? err.message : 'TTS playback error');
      }
    },
    []
  );

  const value: PlatformContextValue = {
    user,
    authReady,
    firestoreConnected,
    cloudRestaurantCount,
    cloudSyncing,
    cloudSyncError,
    cloudSyncSuccess,
    clearCloudSyncMessages: () => {
      setCloudSyncError(null);
      setCloudSyncSuccess(null);
    },
    syncAllToCloudDb,
    activeRole,
    setActiveRole,
    activeTab,
    setActiveTab,
    restaurants: state.restaurants,
    activeRestaurant,
    selectRestaurantById,
    activeMenu,
    activeOrders,
    activeStaff,
    customerTableNumber,
    setCustomerTableNumber,
    wifiPromptOpen,
    setWifiPromptOpen,
    wifiConnected,
    setWifiConnected,
    addRestaurantModalOpen,
    setAddRestaurantModalOpen,
    editingRestaurant,
    setEditingRestaurant,
    changePasswordModalOpen,
    setChangePasswordModalOpen,
    portalSession,
    portalAuthStatus,
    portalAuthLoading,
    guestPreviewMode,
    setGuestPreviewMode,
    restaurantAccountUsernames,
    restaurantAccountMeta,
    setupAppOwner,
    loginPortal,
    changeOwnPassword,
    logoutPortal,
    qrPublicOrigin: resolvedQrOrigin.origin,
    isDevPreviewOrigin: resolvedQrOrigin.isDevPreview,
    wasQrOriginAutoConverted: resolvedQrOrigin.wasAutoConverted,
    customQrBaseUrl,
    setCustomQrBaseUrl,
    addRestaurant,
    updateRestaurant,
    deleteRestaurant,
    updateRestaurantWifi,
    toggleMenuItemAvailability,
    updateMenuItemPrice,
    addMenuItem,
    updateMenuItem,
    deleteMenuItem,
    placeOrder,
    updateOrderStatus,
    addStaffMember,
    toggleStaffActive,
    updateStaffRole,
    handleSignIn,
    handleRedirectSignIn,
    handleSignOut,
    speakText,
    speakingText,
    ttsError,
    clearTtsError: () => setTtsError(null),
  };

  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
}

export function usePlatform(): PlatformContextValue {
  const ctx = useContext(PlatformContext);
  if (!ctx) throw new Error('usePlatform must be used within PlatformProvider');
  return ctx;
}
