import React from 'react';
import {
  BarChart3,
  Building2,
  ChefHat,
  Plus,
  QrCode,
  Smartphone,
  Users,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import type { WorkspaceTab } from '../types/domain';
import { canRoleAccessTab } from '../utils/restaurantLogic';

interface SidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: Array<{
  id: WorkspaceTab;
  label: string;
  section: 'Restaurant' | 'Customer' | 'Platform';
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'overview', label: 'Sales & Analytics', section: 'Restaurant', icon: BarChart3 },
  { id: 'orders', label: 'Live Orders', section: 'Restaurant', icon: ChefHat },
  { id: 'menu', label: 'Menu & Prices', section: 'Restaurant', icon: UtensilsCrossed },
  { id: 'qr_wifi', label: 'QR & Auto WiFi', section: 'Restaurant', icon: QrCode },
  { id: 'staff', label: 'Staff & Roles', section: 'Restaurant', icon: Users },
  { id: 'customer_menu', label: 'Customer QR Menu', section: 'Customer', icon: Smartphone },
  { id: 'fleet', label: 'All 100+ Outlets', section: 'Platform', icon: Building2 },
];

export function Sidebar({ mobileOpen, onCloseMobile }: SidebarProps) {
  const {
    activeRole,
    activeTab,
    setActiveTab,
    activeOrders,
    restaurants,
    activeRestaurant,
    setAddRestaurantModalOpen,
  } = usePlatform();

  const pendingOrdersCount = activeOrders.filter(
    (o) => o.status === 'pending' || o.status === 'preparing' || o.status === 'ready'
  ).length;

  const canAddRestaurant =
    activeRole === 'super_admin' || activeRole === 'owner' || activeRole === 'manager';

  const visibleItems = NAV_ITEMS.filter((item) => canRoleAccessTab(activeRole, item.id));
  const sections: Array<'Platform' | 'Restaurant' | 'Customer'> = [
    'Platform',
    'Restaurant',
    'Customer',
  ];

  const navContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200 shrink-0">
        <a
          href="#overview"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab(visibleItems[0]?.id ?? 'customer_menu');
            onCloseMobile();
          }}
          className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap"
        >
          TablePulse
        </a>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="lg:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="px-4 py-4 border-b border-slate-100 space-y-3">
        <div>
          <p className="text-xs text-slate-500">Active outlet</p>
          <p className="text-sm font-semibold text-slate-900 truncate mt-0.5">
            {activeRestaurant.name}
          </p>
          <p className="text-xs text-slate-500 mt-0.5 truncate">
            {activeRestaurant.city} · {activeRestaurant.tableCount} tables
          </p>
        </div>

        {canAddRestaurant && (
          <button
            type="button"
            onClick={() => {
              setAddRestaurantModalOpen(true);
              onCloseMobile();
            }}
            className="w-full inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Restaurant</span>
          </button>
        )}
      </div>

      <nav aria-label="Workspace navigation" className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {sections.map((sectionName) => {
          const sectionItems = visibleItems.filter((i) => i.section === sectionName);
          if (sectionItems.length === 0) return null;
          return (
            <div key={sectionName} className="space-y-1">
              <p className="px-3 text-xs font-medium text-slate-400">{sectionName}</p>
              {sectionItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      onCloseMobile();
                    }}
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                      isActive
                        ? 'bg-emerald-50 text-emerald-800'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          isActive ? 'text-emerald-700' : 'text-slate-400'
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {item.id === 'orders' && pendingOrdersCount > 0 && (
                      <span className="text-xs font-mono tabular-nums font-semibold text-emerald-700">
                        {pendingOrdersCount}
                      </span>
                    )}
                    {item.id === 'fleet' && (
                      <span className="text-xs font-mono tabular-nums text-slate-500">
                        {restaurants.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-200 text-xs text-slate-500 space-y-1">
        <p className="font-medium text-slate-700">Instant QR + WiFi Menu</p>
        <p>Updates sync live to every guest table.</p>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block w-64 shrink-0 h-screen sticky top-0 no-print">
        {navContent}
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative w-72 max-w-[85vw] h-full z-10">{navContent}</aside>
        </div>
      )}
    </>
  );
}
