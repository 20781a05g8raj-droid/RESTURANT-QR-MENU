import React, { useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  ArrowUpRight,
  Download,
  KeyRound,
  Pencil,
  Plus,
  QrCode,
  Search,
  Smartphone,
  Trash2,
  X,
} from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import type { SubscriptionPlan } from '../types/domain';
import {
  buildMenuQrUrl,
  computeFleetTotals,
  formatCurrency,
} from '../utils/restaurantLogic';

export function FleetDirectory() {
  const {
    restaurants,
    activeRestaurant,
    selectRestaurantById,
    setActiveTab,
    setAddRestaurantModalOpen,
    setEditingRestaurant,
    deleteRestaurant,
    restaurantAccountUsernames,
    qrPublicOrigin,
  } = usePlatform();

  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState<'All' | SubscriptionPlan>('All');
  const [cityFilter, setCityFilter] = useState('All');
  const [page, setPage] = useState(1);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Bulk QR Kit modal state
  const [bulkKitOpen, setBulkKitOpen] = useState(false);
  const [bulkQrPreview, setBulkQrPreview] = useState<
    Array<{ id: string; name: string; city: string; wifiSsid: string; qrUrl: string }>
  >([]);
  const [generatingBulk, setGeneratingBulk] = useState(false);

  const totals = useMemo(() => computeFleetTotals(restaurants), [restaurants]);

  const cities = useMemo(() => {
    const unique = Array.from(new Set(restaurants.map((r) => r.city))).sort();
    return ['All', ...unique];
  }, [restaurants]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return restaurants.filter((r) => {
      const matchPlan = planFilter === 'All' || r.plan === planFilter;
      const matchCity = cityFilter === 'All' || r.city === cityFilter;
      const matchQuery =
        !q ||
        r.name.toLowerCase().includes(q) ||
        r.city.toLowerCase().includes(q) ||
        r.cuisine.toLowerCase().includes(q) ||
        r.wifiSsid.toLowerCase().includes(q);
      return matchPlan && matchCity && matchQuery;
    });
  }, [restaurants, search, planFilter, cityFilter]);

  const pageSize = 15;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const openBulkQrKit = async () => {
    setBulkKitOpen(true);
    setGeneratingBulk(true);
    const sample = filtered.slice(0, 12);
    const results = await Promise.all(
      sample.map(async (r) => {
        const url = buildMenuQrUrl(qrPublicOrigin, r.slug, 1, true, {
          name: r.name,
          city: r.city,
          cuisine: r.cuisine,
          wifiSsid: r.wifiSsid,
        });
        const qrUrl = await QRCode.toDataURL(url, { width: 180, margin: 1 });
        return { id: r.id, name: r.name, city: r.city, wifiSsid: r.wifiSsid, qrUrl };
      })
    );
    setBulkQrPreview(results);
    setGeneratingBulk(false);
  };

  const downloadFleetCsv = () => {
    const header = 'Restaurant,City,Plan,Tables,WiFi SSID,Menu QR URL\n';
    const rows = filtered
      .map(
        (r) =>
          `"${r.name}","${r.city}","${r.plan}",${r.tableCount},"${r.wifiSsid}","${buildMenuQrUrl(
            qrPublicOrigin,
            r.slug,
            1,
            true,
            { name: r.name, city: r.city, cuisine: r.cuisine, wifiSsid: r.wifiSsid }
          )}"`
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tablepulse-${filtered.length}-restaurants-qr-links.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            Multi-Restaurant SaaS Fleet
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Manage {totals.totalOutlets} partner restaurants, onboard new outlets, and generate bulk QR + WiFi kits in seconds.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={openBulkQrKit}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <QrCode className="w-4 h-4 text-emerald-700" />
            <span>Bulk QR Kit ({filtered.length})</span>
          </button>
          <button
            type="button"
            onClick={downloadFleetCsv}
            className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={() => setAddRestaurantModalOpen(true)}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Add Restaurant</span>
          </button>
        </div>
      </div>

      {/* Platform KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Total Managed Outlets</p>
          <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-2">
            {totals.totalOutlets}
          </p>
          <p className="text-xs text-emerald-700 mt-1">{totals.activeOutlets} active live</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Live QR Tables Deployed</p>
          <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-2">
            {totals.totalTables.toLocaleString('en-IN')}
          </p>
          <p className="text-xs text-slate-500 mt-1">Menu + Auto-WiFi QR</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Platform Monthly GMV</p>
          <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-2">
            {formatCurrency(totals.monthlyGmv, 'INR')}
          </p>
          <p className="text-xs text-slate-500 mt-1">Across all subscribed outlets</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Estimated SaaS MRR</p>
          <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-2">
            {formatCurrency(totals.activeOutlets * 3499, 'INR')}
          </p>
          <p className="text-xs text-slate-500 mt-1">Recurring subscription revenue</p>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <label htmlFor="fleet-search" className="sr-only">
            Search restaurants
          </label>
          <input
            id="fleet-search"
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by outlet name, city, cuisine, or WiFi SSID..."
            className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            aria-label="Filter by city"
            value={cityFilter}
            onChange={(e) => {
              setCityFilter(e.target.value);
              setPage(1);
            }}
            className="h-10 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700"
          >
            {cities.map((c) => (
              <option key={c} value={c}>
                {c === 'All' ? 'All Cities' : c}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(['All', 'Starter', 'Growth', 'Enterprise'] as const).map((plan) => (
              <button
                key={plan}
                type="button"
                onClick={() => {
                  setPlanFilter(plan);
                  setPage(1);
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  planFilter === plan
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {plan}
              </button>
            ))}
          </div>
        </div>
      </div>

      {deleteError && (
        <div
          role="alert"
          className="px-4 py-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center justify-between"
        >
          <span>{deleteError}</span>
          <button
            type="button"
            onClick={() => setDeleteError(null)}
            aria-label="Dismiss delete error"
            className="p-1 text-red-600 hover:bg-red-100 rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Restaurant Fleet Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50/70">
                <th className="py-3.5 px-5">Restaurant</th>
                <th className="py-3.5 px-4">Owner Login ID</th>
                <th className="py-3.5 px-4">Plan & Status</th>
                <th className="py-3.5 px-4">Guest WiFi</th>
                <th className="py-3.5 px-4 text-right">Tables</th>
                <th className="py-3.5 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {paged.map((r) => {
                const isSelected = r.id === activeRestaurant.id;
                const ownerUser = restaurantAccountUsernames[r.id] ?? r.ownerUsername;
                const isConfirmingDelete = confirmDeleteId === r.id;
                return (
                  <tr
                    key={r.id}
                    className={`transition-colors ${
                      isSelected ? 'bg-emerald-50/50' : 'hover:bg-slate-50/70'
                    }`}
                  >
                    <td className="py-3 px-5">
                      <p className="font-semibold text-slate-900">{r.name}</p>
                      <p className="text-xs text-slate-500">
                        {r.city} · {r.cuisine}
                      </p>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {ownerUser ? (
                        <span className="inline-flex items-center gap-1.5 font-mono text-xs text-emerald-800">
                          <KeyRound className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{ownerUser}</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEditingRestaurant(r)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-900 underline underline-offset-2"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          <span>Set ID & Password</span>
                        </button>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs font-medium text-slate-700 whitespace-nowrap">
                      {r.plan} ·{' '}
                      <span className={r.active ? 'text-emerald-700' : 'text-amber-700'}>
                        {r.active ? 'Active' : 'Paused'}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-600 whitespace-nowrap">
                      {r.wifiSsid}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                      {r.tableCount}
                    </td>
                    <td className="py-3 px-5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            selectRestaurantById(r.id);
                            setActiveTab('overview');
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          <span>Dashboard</span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            selectRestaurantById(r.id);
                            setActiveTab('qr_wifi');
                          }}
                          aria-label={`Generate QR and WiFi for ${r.name}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-medium hover:bg-emerald-100"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                          <span>QR</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            selectRestaurantById(r.id);
                            setActiveTab('customer_menu');
                          }}
                          aria-label={`Open customer QR menu for ${r.name}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700"
                        >
                          <Smartphone className="w-3.5 h-3.5" />
                          <span>Menu</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingRestaurant(r)}
                          aria-label={`Edit ${r.name}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                        {restaurants.length > 1 && (
                          <button
                            type="button"
                            onClick={async () => {
                              if (!isConfirmingDelete) {
                                setConfirmDeleteId(r.id);
                                return;
                              }
                              setDeleteError(null);
                              const res = await deleteRestaurant(r.id);
                              setConfirmDeleteId(null);
                              if (!res.ok && res.error) {
                                setDeleteError(res.error);
                              }
                            }}
                            aria-label={`Delete ${r.name}`}
                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                              isConfirmingDelete
                                ? 'bg-red-600 text-white hover:bg-red-700'
                                : 'border border-red-200 text-red-700 hover:bg-red-50'
                            }`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>{isConfirmingDelete ? 'Confirm' : 'Delete'}</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-5 py-3.5 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
          <span className="font-mono tabular-nums">
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of{' '}
            {filtered.length} restaurants
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
            >
              Previous
            </button>
            <span className="font-mono tabular-nums">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Bulk QR Kit Modal */}
      {bulkKitOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="bulk-qr-title"
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl border border-slate-200 max-w-4xl w-full max-h-[85vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 id="bulk-qr-title" className="text-lg font-bold text-slate-900">
                  Bulk QR Deployment Kit ({filtered.length} Outlets Ready)
                </h3>
                <p className="text-xs text-slate-500">
                  Previewing first 12 outlets. Export CSV for all {filtered.length} unique URLs & WiFi credentials.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBulkKitOpen(false)}
                aria-label="Close bulk QR kit"
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {generatingBulk ? (
                <div className="py-12 text-center text-sm text-slate-500">
                  Generating scannable QR codes...
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {bulkQrPreview.map((item) => (
                    <div
                      key={item.id}
                      className="border border-slate-200 rounded-xl p-3 flex flex-col items-center text-center space-y-2"
                    >
                      <img
                        src={item.qrUrl}
                        alt={`QR code for ${item.name}`}
                        className="w-28 h-28"
                      />
                      <p className="text-xs font-semibold text-slate-900 truncate w-full">
                        {item.name}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate w-full">
                        {item.city} · {item.wifiSsid}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={downloadFleetCsv}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download All {filtered.length} QR Links (CSV)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
