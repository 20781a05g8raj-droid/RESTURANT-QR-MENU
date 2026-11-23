import React, { useState } from 'react';
import { X } from 'lucide-react';
import { PlatformProvider, usePlatform } from './context/PlatformContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Sidebar } from './components/Sidebar';
import { TopHeader } from './components/TopHeader';
import { OverviewAnalytics } from './components/OverviewAnalytics';
import { KitchenOrdersBoard } from './components/KitchenOrdersBoard';
import { MenuManager } from './components/MenuManager';
import { QrWifiStudio } from './components/QrWifiStudio';
import { StaffManager } from './components/StaffManager';
import { FleetDirectory } from './components/FleetDirectory';
import { CustomerMenuView } from './components/CustomerMenuView';
import { AddRestaurantModal } from './components/AddRestaurantModal';
import { EditRestaurantModal } from './components/EditRestaurantModal';
import { PortalAuthGate } from './components/PortalAuthGate';

function WorkspaceShell() {
  const {
    activeTab,
    activeRole,
    portalSession,
    guestPreviewMode,
    ttsError,
    clearTtsError,
  } = usePlatform();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  if (!portalSession && !guestPreviewMode) {
    return <PortalAuthGate />;
  }

  const isStandaloneCustomer = activeRole === 'customer' || (!portalSession && guestPreviewMode);

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {!isStandaloneCustomer && (
        <Sidebar
          mobileOpen={mobileNavOpen}
          onCloseMobile={() => setMobileNavOpen(false)}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <TopHeader onOpenMobileNav={() => setMobileNavOpen(true)} />

        {ttsError && (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 text-xs text-amber-800 flex items-center justify-between gap-4">
            <span>Audio notice: {ttsError}</span>
            <button
              type="button"
              onClick={clearTtsError}
              aria-label="Dismiss audio notice"
              className="p-1 rounded hover:bg-amber-100 text-amber-700 shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <main className="flex-1 min-w-0">
          {isStandaloneCustomer ? (
            <CustomerMenuView />
          ) : (
            <>
              {activeTab === 'overview' && <OverviewAnalytics />}
              {activeTab === 'orders' && <KitchenOrdersBoard />}
              {activeTab === 'menu' && <MenuManager />}
              {activeTab === 'qr_wifi' && <QrWifiStudio />}
              {activeTab === 'staff' && <StaffManager />}
              {activeTab === 'fleet' && <FleetDirectory />}
              {activeTab === 'customer_menu' && <CustomerMenuView />}
            </>
          )}
        </main>
      </div>

      <AddRestaurantModal />
      <EditRestaurantModal />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <PlatformProvider>
        <WorkspaceShell />
      </PlatformProvider>
    </ErrorBoundary>
  );
}
