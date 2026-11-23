import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Download, QrCode, Smartphone, Wifi, X } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import type { Restaurant, SubscriptionPlan, WifiSecurity } from '../types/domain';
import {
  buildMenuQrUrl,
  buildWifiQrString,
  validateRestaurantInput,
} from '../utils/restaurantLogic';

export function AddRestaurantModal() {
  const {
    addRestaurantModalOpen,
    setAddRestaurantModalOpen,
    addRestaurant,
    setActiveTab,
    setCustomerTableNumber,
    setWifiPromptOpen,
    qrPublicOrigin,
    isDevPreviewOrigin,
  } = usePlatform();

  const [newName, setNewName] = useState('');
  const [newCity, setNewCity] = useState('Mumbai');
  const [newCuisine, setNewCuisine] = useState('North Indian');
  const [newPlan, setNewPlan] = useState<SubscriptionPlan>('Growth');
  const [newTables, setNewTables] = useState('16');
  const [newSsid, setNewSsid] = useState('');
  const [newPassword, setNewPassword] = useState('GuestDine2026');
  const [newSecurity, setNewSecurity] = useState<WifiSecurity>('WPA');
  const [formError, setFormError] = useState<string | null>(null);

  const [createdRestaurant, setCreatedRestaurant] = useState<Restaurant | null>(null);
  const [menuQrUrl, setMenuQrUrl] = useState('');
  const [wifiQrUrl, setWifiQrUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!createdRestaurant) return;
    let mounted = true;
    const url = buildMenuQrUrl(qrPublicOrigin, createdRestaurant.slug, 1, true, {
      name: createdRestaurant.name,
      city: createdRestaurant.city,
      cuisine: createdRestaurant.cuisine,
      wifiSsid: createdRestaurant.wifiSsid,
    });
    const wifiPayload = buildWifiQrString(
      createdRestaurant.wifiSsid,
      createdRestaurant.wifiPassword,
      createdRestaurant.wifiSecurity
    );

    QRCode.toDataURL(url, { width: 260, margin: 2, color: { dark: '#0f172a', light: '#ffffff' } })
      .then((data) => {
        if (mounted) setMenuQrUrl(data);
      })
      .catch(console.error);

    QRCode.toDataURL(wifiPayload, {
      width: 260,
      margin: 2,
      color: { dark: '#065f46', light: '#ffffff' },
    })
      .then((data) => {
        if (mounted) setWifiQrUrl(data);
      })
      .catch(console.error);

    return () => {
      mounted = false;
    };
  }, [createdRestaurant, qrPublicOrigin]);

  if (!addRestaurantModalOpen) return null;

  const resetAndClose = () => {
    setCreatedRestaurant(null);
    setMenuQrUrl('');
    setWifiQrUrl('');
    setNewName('');
    setNewSsid('');
    setFormError(null);
    setAddRestaurantModalOpen(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const tableNum = Number(newTables);
    const cleanedName = newName.trim();
    const ssidValue =
      newSsid.trim() || `${cleanedName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20) || 'Hotel'}_WiFi`;

    const check = validateRestaurantInput({
      name: cleanedName,
      city: newCity,
      cuisine: newCuisine,
      wifiSsid: ssidValue,
      wifiPassword: newPassword,
      tableCount: tableNum,
    });

    if (!check.valid) {
      setFormError(check.error ?? 'Please check the restaurant details.');
      return;
    }

    const created = addRestaurant({
      name: cleanedName,
      city: newCity.trim(),
      cuisine: newCuisine.trim(),
      plan: newPlan,
      tableCount: tableNum,
      wifiSsid: ssidValue,
      wifiPassword: newPassword,
      wifiSecurity: newSecurity,
    });

    setFormError(null);
    setCreatedRestaurant(created);
  };

  const downloadImage = (dataUrl: string, filename: string) => {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    a.click();
  };

  const copyMenuLink = async () => {
    if (!createdRestaurant) return;
    const url = buildMenuQrUrl(qrPublicOrigin, createdRestaurant.slug, 1, true, {
      name: createdRestaurant.name,
      city: createdRestaurant.city,
      cuisine: createdRestaurant.cuisine,
      wifiSsid: createdRestaurant.wifiSsid,
    });
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-restaurant-modal-title"
      className="fixed inset-0 z-50 bg-slate-900/55 flex items-center justify-center p-4"
    >
      <div className="bg-white rounded-2xl border border-slate-200 max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 id="add-restaurant-modal-title" className="text-lg font-bold text-slate-900">
              {createdRestaurant
                ? `${createdRestaurant.name} — QR & WiFi Ready`
                : 'Add New Restaurant & Generate QR'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {createdRestaurant
                ? 'Unique digital menu dashboard, menu QR, and instant WiFi QR are live.'
                : 'Creates a dedicated restaurant dashboard, live menu, and scannable Menu + WiFi QR codes.'}
            </p>
          </div>
          <button
            type="button"
            onClick={resetAndClose}
            aria-label="Close add restaurant dialog"
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!createdRestaurant ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {formError}
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label htmlFor="modal-rest-name" className="block text-xs font-medium text-slate-700 mb-1">
                  Restaurant / Hotel Name *
                </label>
                <input
                  id="modal-rest-name"
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Royal Spice Palace"
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label htmlFor="modal-rest-city" className="block text-xs font-medium text-slate-700 mb-1">
                  City *
                </label>
                <input
                  id="modal-rest-city"
                  type="text"
                  required
                  value={newCity}
                  onChange={(e) => setNewCity(e.target.value)}
                  placeholder="Mumbai, Delhi, Jaipur..."
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label htmlFor="modal-rest-cuisine" className="block text-xs font-medium text-slate-700 mb-1">
                  Cuisine Type *
                </label>
                <input
                  id="modal-rest-cuisine"
                  type="text"
                  required
                  value={newCuisine}
                  onChange={(e) => setNewCuisine(e.target.value)}
                  placeholder="North Indian, Cafe, Multi-Cuisine"
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label htmlFor="modal-rest-ssid" className="block text-xs font-medium text-slate-700 mb-1">
                  Restaurant WiFi Name (SSID)
                </label>
                <input
                  id="modal-rest-ssid"
                  type="text"
                  value={newSsid}
                  onChange={(e) => setNewSsid(e.target.value)}
                  placeholder="Auto-filled if left blank"
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label htmlFor="modal-rest-pass" className="block text-xs font-medium text-slate-700 mb-1">
                  WiFi Password
                </label>
                <input
                  id="modal-rest-pass"
                  type="text"
                  disabled={newSecurity === 'nopass'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:bg-slate-100"
                />
              </div>

              <div>
                <label htmlFor="modal-rest-security" className="block text-xs font-medium text-slate-700 mb-1">
                  WiFi Security
                </label>
                <select
                  id="modal-rest-security"
                  value={newSecurity}
                  onChange={(e) => setNewSecurity(e.target.value as WifiSecurity)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white"
                >
                  <option value="WPA">WPA / WPA2 / WPA3</option>
                  <option value="WEP">WEP</option>
                  <option value="nopass">Open WiFi (No Password)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="modal-rest-tables" className="block text-xs font-medium text-slate-700 mb-1">
                    Tables
                  </label>
                  <input
                    id="modal-rest-tables"
                    type="number"
                    min={1}
                    max={250}
                    value={newTables}
                    onChange={(e) => setNewTables(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label htmlFor="modal-rest-plan" className="block text-xs font-medium text-slate-700 mb-1">
                    Plan
                  </label>
                  <select
                    id="modal-rest-plan"
                    value={newPlan}
                    onChange={(e) => setNewPlan(e.target.value as SubscriptionPlan)}
                    className="w-full h-10 px-2.5 rounded-lg border border-slate-200 text-sm bg-white"
                  >
                    <option value="Starter">Starter</option>
                    <option value="Growth">Growth</option>
                    <option value="Enterprise">Enterprise</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={resetAndClose}
                className="h-10 px-4 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors"
              >
                <QrCode className="w-4 h-4" />
                <span>Create Restaurant & Generate QR</span>
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="border border-slate-200 rounded-xl p-4 flex flex-col items-center text-center space-y-2.5">
                <p className="text-xs font-semibold text-slate-900">1. Digital Menu & Voice QR</p>
                {menuQrUrl ? (
                  <img
                    src={menuQrUrl}
                    alt={`Menu QR code for ${createdRestaurant.name}`}
                    className="w-40 h-40 rounded-lg border border-slate-100"
                  />
                ) : (
                  <div className="w-40 h-40 bg-slate-100 rounded-lg animate-pulse" />
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      downloadImage(menuQrUrl, `${createdRestaurant.slug}-menu-qr.png`)
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download QR</span>
                  </button>
                  <button
                    type="button"
                    onClick={copyMenuLink}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {copied ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copied ? 'Copied' : 'Copy URL'}</span>
                  </button>
                </div>
              </div>

              <div className="border border-emerald-200 bg-emerald-50/40 rounded-xl p-4 flex flex-col items-center text-center space-y-2.5">
                <p className="text-xs font-semibold text-emerald-950 inline-flex items-center gap-1">
                  <Wifi className="w-3.5 h-3.5 text-emerald-700" />
                  <span>2. Instant Auto-Connect WiFi QR</span>
                </p>
                {wifiQrUrl ? (
                  <img
                    src={wifiQrUrl}
                    alt={`WiFi QR code for ${createdRestaurant.wifiSsid}`}
                    className="w-40 h-40 rounded-lg border border-emerald-200 bg-white"
                  />
                ) : (
                  <div className="w-40 h-40 bg-emerald-100/50 rounded-lg animate-pulse" />
                )}
                <p className="text-xs font-mono text-emerald-900">
                  {createdRestaurant.wifiSsid}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    downloadImage(wifiQrUrl, `${createdRestaurant.slug}-wifi-qr.png`)
                  }
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-emerald-200 bg-white text-xs font-medium text-emerald-800 hover:bg-emerald-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download WiFi QR</span>
                </button>
              </div>
            </div>

            {isDevPreviewOrigin && (
              <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Menu QR uses your Shared App URL (<span className="font-mono">{qrPublicOrigin}</span>) instead of the private dev link. Turn on App Sharing / Deploy in AI Studio before scanning from another phone, or click <span className="font-semibold">Test Customer QR Menu</span> below.
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setCustomerTableNumber(1);
                  setWifiPromptOpen(true);
                  setActiveTab('customer_menu');
                  resetAndClose();
                }}
                className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Smartphone className="w-4 h-4" />
                <span>Test Customer QR Menu</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('menu');
                    resetAndClose();
                  }}
                  className="h-10 px-4 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Edit Dishes
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('qr_wifi');
                    resetAndClose();
                  }}
                  className="h-10 px-4 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
                >
                  Open Full QR Studio
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
