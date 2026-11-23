import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
  signInWithGoogle,
  signOutUser,
  testFirestoreConnection,
} from '../lib/firebase';
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

const STORAGE_KEY = 'tablepulse_platform_state_v1';
const QR_BASE_URL_KEY = 'tablepulse_qr_base_url_v1';
const BROADCAST_CHANNEL = 'tablepulse_realtime_sync_v1';

function buildInitialState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedState;
      if (Array.isArray(parsed.restaurants) && parsed.restaurants.length >= 100) {
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

  for (const r of restaurants.slice(0, 6)) {
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
  }) => Restaurant;
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
  }) => MenuItem;
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
  handleSignIn: () => Promise<void>;
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
    if (scanned && !base.restaurants.some((r) => r.slug === scanned.slug)) {
      const id = `rest-${scanned.slug}`;
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

  // Firebase Auth + Startup Connection Validation
  useEffect(() => {
    testFirestoreConnection().then(setFirestoreConnected);
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Attach real-time Firestore onSnapshot listeners ONLY when auth is ready & user is authenticated
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
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        });

        setState((prev) => {
          const map = new Map(prev.restaurants.map((r) => [r.id, r]));
          for (const cr of cloudRestaurants) {
            map.set(cr.id, { ...(map.get(cr.id) ?? cr), ...cr });
          }
          return { ...prev, restaurants: Array.from(map.values()) };
        });
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, restCollectionPath);
      }
    );

    return () => {
      unsubRestaurants();
    };
  }, [authReady, user]);

  // Real-time Firestore listener for active restaurant menu items when signed in
  useEffect(() => {
    if (!authReady || !user || !user.emailVerified) return;
    const menuPath = `restaurants/${activeRestaurantId}/menuItems`;
    const menuQuery = query(
      collection(db, menuPath),
      where('restaurantId', '==', activeRestaurantId)
    );
    const unsubMenu = onSnapshot(
      menuQuery,
      (snap) => {
        if (snap.empty) return;
        const cloudMenu: MenuItem[] = snap.docs.map((d) => {
          const data = d.data();
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
            imageUrl: String(data.imageUrl ?? ''),
            popular: Boolean(data.popular ?? false),
            updatedAt: new Date().toISOString(),
          };
        });
        setState((prev) => ({
          ...prev,
          menusByRestaurant: {
            ...prev.menusByRestaurant,
            [activeRestaurantId]: cloudMenu,
          },
        }));
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, menuPath);
      }
    );
    return () => unsubMenu();
  }, [authReady, user, activeRestaurantId]);

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
      setActiveRestaurantId(id);
      setWifiConnected(false);
      // Ensure menu/orders/staff are hydrated lazily for any of the 100+ outlets
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
    []
  );

  const setActiveRole = useCallback(
    (role: UserRole) => {
      setActiveRoleState(role);
      const allowed = getAllowedTabsForRole(role);
      if (!allowed.includes(activeTab)) {
        setActiveTabState(allowed[0]);
      }
    },
    [activeTab]
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
    (input: {
      name: string;
      city: string;
      cuisine: string;
      plan: SubscriptionPlan;
      tableCount: number;
      wifiSsid: string;
      wifiPassword: string;
      wifiSecurity: WifiSecurity;
    }): Restaurant => {
      const now = new Date().toISOString();
      const baseSlug = slugifyRestaurantName(input.name) || 'restaurant';
      const id = `rest-${baseSlug}-${Date.now().toString(36).slice(-4)}`;
      const slug = `${baseSlug}-${Date.now().toString(36).slice(-3)}`;
      const newRest: Restaurant = {
        id,
        slug,
        name: input.name.trim(),
        city: input.city.trim(),
        cuisine: input.cuisine.trim(),
        ownerId: user?.uid ?? 'demo-owner-1',
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

      // Sync to Firestore if signed in with verified account
      if (user && user.emailVerified) {
        const docPath = `restaurants/${id}`;
        setDoc(doc(db, 'restaurants', id), {
          slug: newRest.slug,
          name: newRest.name,
          city: newRest.city,
          cuisine: newRest.cuisine,
          ownerId: user.uid,
          plan: newRest.plan,
          active: newRest.active,
          tableCount: newRest.tableCount,
          wifiSsid: newRest.wifiSsid,
          wifiPassword: newRest.wifiPassword,
          wifiSecurity: newRest.wifiSecurity,
          currency: newRest.currency,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }).catch((err) => {
          console.warn('Firestore restaurant sync skipped:', docPath, err);
        });
      }

      setActiveRestaurantId(id);
      return newRest;
    },
    [commitState, user]
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
        updateDoc(doc(db, 'restaurants', restaurantId), {
          wifiSsid: wifi.wifiSsid,
          wifiPassword: wifi.wifiPassword,
          wifiSecurity: wifi.wifiSecurity,
          tableCount: wifi.tableCount,
          updatedAt: serverTimestamp(),
        }).catch(() => {
          // Local seed restaurants may not exist in cloud until created
        });
      }
    },
    [commitState, user]
  );

  const toggleMenuItemAvailability = useCallback(
    (itemId: string) => {
      const now = new Date().toISOString();
      const restId = activeRestaurant.id;
      let nextAvailable = true;

      commitState((prev) => {
        const list = prev.menusByRestaurant[restId] ?? generateDefaultMenuForRestaurant(restId);
        const updated = list.map((item) => {
          if (item.id === itemId) {
            nextAvailable = !item.available;
            return { ...item, available: nextAvailable, updatedAt: now };
          }
          return item;
        });
        return {
          ...prev,
          menusByRestaurant: { ...prev.menusByRestaurant, [restId]: updated },
        };
      });

      if (user && user.emailVerified) {
        updateDoc(doc(db, 'restaurants', restId, 'menuItems', itemId), {
          available: nextAvailable,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
    },
    [activeRestaurant.id, commitState, user]
  );

  const updateMenuItemPrice = useCallback(
    (itemId: string, newPrice: number) => {
      if (!Number.isFinite(newPrice) || newPrice < 0 || newPrice > 100000) return;
      const now = new Date().toISOString();
      const restId = activeRestaurant.id;
      const roundedPrice = Math.round(newPrice);

      commitState((prev) => {
        const list = prev.menusByRestaurant[restId] ?? generateDefaultMenuForRestaurant(restId);
        const updated = list.map((item) =>
          item.id === itemId ? { ...item, price: roundedPrice, updatedAt: now } : item
        );
        return {
          ...prev,
          menusByRestaurant: { ...prev.menusByRestaurant, [restId]: updated },
        };
      });

      if (user && user.emailVerified) {
        updateDoc(doc(db, 'restaurants', restId, 'menuItems', itemId), {
          price: roundedPrice,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
    },
    [activeRestaurant.id, commitState, user]
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
    }): MenuItem => {
      const now = new Date().toISOString();
      const restId = activeRestaurant.id;
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
        imageUrl: input.imageUrl,
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
        setDoc(doc(db, 'restaurants', restId, 'menuItems', newItem.id), {
          restaurantId: restId,
          name: newItem.name,
          description: newItem.description,
          category: newItem.category,
          price: newItem.price,
          available: newItem.available,
          veg: newItem.veg,
          prepMinutes: newItem.prepMinutes,
          imageUrl: newItem.imageUrl,
          popular: newItem.popular,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }

      return newItem;
    },
    [activeRestaurant.id, commitState, user]
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
    },
    [activeRestaurant.id, commitState]
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

      const newOrder: Order = {
        id: `${restId}-ord-${Date.now().toString(36)}`,
        restaurantId: restId,
        restaurantOwnerId: activeRestaurant.ownerId,
        orderNumber: orderNum,
        tableNumber: input.tableNumber,
        customerName: input.customerName.trim() || `Table ${input.tableNumber} Guest`,
        customerUid: user?.uid ?? `guest-${Date.now().toString(36)}`,
        items: input.items.slice(0, 30),
        totalAmount,
        status: 'pending',
        source: input.source,
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

      if (user && user.emailVerified) {
        setDoc(doc(db, 'restaurants', restId, 'orders', newOrder.id), {
          restaurantId: restId,
          restaurantOwnerId: activeRestaurant.ownerId,
          orderNumber: newOrder.orderNumber,
          tableNumber: newOrder.tableNumber,
          customerName: newOrder.customerName,
          customerUid: user.uid,
          items: newOrder.items,
          totalAmount: newOrder.totalAmount,
          status: 'pending',
          source: newOrder.source,
          notes: newOrder.notes,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }

      return newOrder;
    },
    [activeRestaurant, commitState, user]
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

      if (user && user.emailVerified) {
        updateDoc(doc(db, 'restaurants', restId, 'orders', orderId), {
          status: nextStatus,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
    },
    [activeRestaurant, commitState, user]
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

      return newStaff;
    },
    [activeRestaurant, commitState]
  );

  const toggleStaffActive = useCallback(
    (staffId: string) => {
      const now = new Date().toISOString();
      const restId = activeRestaurant.id;
      commitState((prev) => {
        const list = prev.staffByRestaurant[restId] ?? generateSeedStaff(activeRestaurant);
        return {
          ...prev,
          staffByRestaurant: {
            ...prev.staffByRestaurant,
            [restId]: list.map((s) =>
              s.id === staffId ? { ...s, active: !s.active, updatedAt: now } : s
            ),
          },
        };
      });
    },
    [activeRestaurant, commitState]
  );

  const updateStaffRole = useCallback(
    (staffId: string, role: StaffRole) => {
      const now = new Date().toISOString();
      const restId = activeRestaurant.id;
      commitState((prev) => {
        const list = prev.staffByRestaurant[restId] ?? generateSeedStaff(activeRestaurant);
        return {
          ...prev,
          staffByRestaurant: {
            ...prev.staffByRestaurant,
            [restId]: list.map((s) =>
              s.id === staffId ? { ...s, role, updatedAt: now } : s
            ),
          },
        };
      });
    },
    [activeRestaurant, commitState]
  );

  const handleSignIn = useCallback(async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error('Google Sign-In failed:', error);
    }
  }, []);

  const handleSignOut = useCallback(async () => {
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
    qrPublicOrigin: resolvedQrOrigin.origin,
    isDevPreviewOrigin: resolvedQrOrigin.isDevPreview,
    wasQrOriginAutoConverted: resolvedQrOrigin.wasAutoConverted,
    customQrBaseUrl,
    setCustomQrBaseUrl,
    addRestaurant,
    updateRestaurantWifi,
    toggleMenuItemAvailability,
    updateMenuItemPrice,
    addMenuItem,
    deleteMenuItem,
    placeOrder,
    updateOrderStatus,
    addStaffMember,
    toggleStaffActive,
    updateStaffRole,
    handleSignIn,
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
