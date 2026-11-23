import React from 'react';
import { KeyRound, LogIn, LogOut, Menu, Plus, QrCode, Smartphone } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import type { UserRole, WorkspaceTab } from '../types/domain';

const TAB_TITLES: Record<WorkspaceTab, string> = {
  overview: 'Sales & Analytics',
  orders: 'Live Kitchen & Orders',
  menu: 'Menu & Price Manager',
  qr_wifi: 'QR Code & Instant WiFi Studio',
  staff: 'Staff & Role Permissions',
  fleet: 'All Managed Restaurants',
  customer_menu: 'Customer Digital QR Menu',
};

const ALL_ROLE_OPTIONS: Array<{ value: UserRole; label: string }> = [
  { value: 'super_admin', label: 'App Owner (Master)' },
  { value: 'owner', label: 'Restaurant Owner' },
  { value: 'manager', label: 'Store Manager' },
  { value: 'chef', label: 'Kitchen Chef' },
  { value: 'waiter', label: 'Waitstaff / Server' },
  { value: 'customer', label: 'Customer (QR Guest)' },
];

export function TopHeader({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const {
    activeRestaurant,
    restaurants,
    selectRestaurantById,
    activeRole,
    setActiveRole,
    activeTab,
    setActiveTab,
    setAddRestaurantModalOpen,
    setChangePasswordModalOpen,
    portalSession,
    logoutPortal,
    setGuestPreviewMode,
  } = usePlatform();

  const isSuperAdmin = portalSession?.role === 'super_admin';
  const isGuestOnly = !portalSession;
  const availableRoles = isSuperAdmin
    ? ALL_ROLE_OPTIONS
    : ALL_ROLE_OPTIONS.filter((opt) => opt.value !== 'super_admin');

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 lg:px-8 flex items-center justify-between gap-3 sticky top-0 z-30 no-print">
      <div className="flex items-center gap-3 min-w-0">
        {!isGuestOnly && (
          <button
            type="button"
            onClick={onOpenMobileNav}
            aria-label="Open navigation menu"
            className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 shrink-0"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        <div className="flex items-center gap-2 text-sm min-w-0">
          <h1 className="font-semibold text-slate-900 truncate">
            {isGuestOnly ? activeRestaurant.name : TAB_TITLES[activeTab]}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {isSuperAdmin && activeRole !== 'customer' && (
          <label className="hidden xl:flex items-center gap-2 text-xs text-slate-500">
            <span className="sr-only">Switch active restaurant</span>
            <select
              aria-label="Select restaurant"
              value={activeRestaurant.id}
              onChange={(e) => selectRestaurantById(e.target.value)}
              className="h-9 px-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-800 max-w-[195px] focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              {restaurants.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.city})
                </option>
              ))}
            </select>
          </label>
        )}

        {!isGuestOnly && (
          <label className="hidden md:flex items-center text-xs text-slate-500">
            <span className="sr-only">Preview workspace role</span>
            <select
              aria-label="Switch role"
              value={activeRole}
              onChange={(e) => setActiveRole(e.target.value as UserRole)}
              className="h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              {availableRoles.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {isSuperAdmin && (
          <button
            type="button"
            onClick={() => setAddRestaurantModalOpen(true)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Restaurant</span>
          </button>
        )}

        {!isGuestOnly && activeTab !== 'qr_wifi' && activeRole !== 'customer' && activeRole !== 'chef' && (
          <button
            type="button"
            onClick={() => setActiveTab('qr_wifi')}
            className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <QrCode className="w-3.5 h-3.5 text-emerald-700" />
            <span>QR & WiFi</span>
          </button>
        )}

        {!isGuestOnly && activeTab !== 'customer_menu' && (
          <button
            type="button"
            onClick={() => setActiveTab('customer_menu')}
            aria-label="Open Customer QR Menu"
            className="hidden lg:inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Guest Menu</span>
          </button>
        )}

        {portalSession?.role === 'owner' && (
          <button
            type="button"
            onClick={() => setChangePasswordModalOpen(true)}
            aria-label="Change password"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-emerald-200 bg-emerald-50 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition-colors whitespace-nowrap shrink-0"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Change Password</span>
          </button>
        )}

        {portalSession ? (
          <button
            type="button"
            onClick={logoutPortal}
            title={`Signed in as ${portalSession.username}`}
            aria-label="Sign out"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">Sign Out</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setGuestPreviewMode(false)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <LogIn className="w-3.5 h-3.5 text-emerald-700" />
            <span>Owner Login</span>
          </button>
        )}
      </div>
    </header>
  );
}
