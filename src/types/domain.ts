export type SubscriptionPlan = 'Starter' | 'Growth' | 'Enterprise';
export type WifiSecurity = 'WPA' | 'WEP' | 'nopass';
export type CurrencyCode = 'INR' | 'USD';
export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'served' | 'cancelled';
export type OrderSource = 'qr' | 'voice' | 'staff';
export type StaffRole = 'owner' | 'manager' | 'chef' | 'waiter';
export type UserRole = 'super_admin' | 'owner' | 'manager' | 'chef' | 'waiter' | 'customer';

export type WorkspaceTab =
  | 'overview'
  | 'orders'
  | 'menu'
  | 'qr_wifi'
  | 'staff'
  | 'fleet'
  | 'customer_menu';

export interface PortalSession {
  role: 'super_admin' | 'owner';
  username: string;
  restaurantId: string | null;
}

export interface Restaurant {
  id: string;
  slug: string;
  name: string;
  city: string;
  cuisine: string;
  ownerId: string;
  ownerUsername?: string;
  plan: SubscriptionPlan;
  active: boolean;
  tableCount: number;
  wifiSsid: string;
  wifiPassword: string;
  wifiSecurity: WifiSecurity;
  currency: CurrencyCode;
  monthlyRevenue: number;
  activeOrdersCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface MenuItem {
  id: string;
  restaurantId: string;
  name: string;
  description: string;
  category: string;
  price: number;
  available: boolean;
  veg: boolean;
  prepMinutes: number;
  imageUrl: string;
  images?: string[];
  popular: boolean;
  updatedAt: string;
}

export interface OrderItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  veg: boolean;
}

export interface Order {
  id: string;
  restaurantId: string;
  restaurantOwnerId: string;
  orderNumber: string;
  tableNumber: number;
  customerName: string;
  customerUid: string;
  items: OrderItem[];
  totalAmount: number;
  status: OrderStatus;
  source: OrderSource;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface StaffMember {
  id: string;
  restaurantId: string;
  restaurantOwnerId: string;
  userId: string;
  name: string;
  email: string;
  role: StaffRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HourlySalesPoint {
  hour: string;
  revenue: number;
  orders: number;
}

export interface CategorySalesPoint {
  category: string;
  revenue: number;
  units: number;
}

export interface TopDishStat {
  name: string;
  unitsSold: number;
  revenue: number;
  available: boolean;
}

export interface AnalyticsSummary {
  totalRevenue: number;
  totalOrders: number;
  activeOrders: number;
  servedOrders: number;
  voiceOrders: number;
  averageOrderValue: number;
  hourlyTrend: HourlySalesPoint[];
  categorySplit: CategorySalesPoint[];
  topDishes: TopDishStat[];
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface MarketInsightResult {
  summary: string;
  sources: GroundingSource[];
}
