import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Download, Globe, Printer, Smartphone, Wifi } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import type { WifiSecurity } from '../types/domain';
import {
  buildMenuQrUrl,
  buildWifiQrString,
  generateIosWifiProfileXml,
} from '../utils/restaurantLogic';

export function QrWifiStudio() {
  const {
    activeRestaurant,
    updateRestaurantWifi,
    setActiveTab,
    setCustomerTableNumber,
    setWifiPromptOpen,
    qrPublicOrigin,
    isDevPreviewOrigin,
    wasQrOriginAutoConverted,
    customQrBaseUrl,
    setCustomQrBaseUrl,
  } = usePlatform();

  const [selectedTable, setSelectedTable] = useState(4);
  const [wifiSsid, setWifiSsid] = useState(activeRestaurant.wifiSsid);
  const [wifiPassword, setWifiPassword] = useState(activeRestaurant.wifiPassword);
  const [wifiSecurity, setWifiSecurity] = useState<WifiSecurity>(activeRestaurant.wifiSecurity);
  const [tableCount, setTableCount] = useState(activeRestaurant.tableCount);
  const [domainInput, setDomainInput] = useState(customQrBaseUrl);
  const [savedBanner, setSavedBanner] = useState(false);

  const [menuQrDataUrl, setMenuQrDataUrl] = useState('');
  const [wifiQrDataUrl, setWifiQrDataUrl] = useState('');
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Sync local form when switching restaurants
  useEffect(() => {
    setWifiSsid(activeRestaurant.wifiSsid);
    setWifiPassword(activeRestaurant.wifiPassword);
    setWifiSecurity(activeRestaurant.wifiSecurity);
    setTableCount(activeRestaurant.tableCount);
  }, [activeRestaurant]);

  useEffect(() => {
    setDomainInput(customQrBaseUrl);
  }, [customQrBaseUrl]);

  const menuUrl = buildMenuQrUrl(qrPublicOrigin, activeRestaurant.slug, selectedTable, true, {
    name: activeRestaurant.name,
    city: activeRestaurant.city,
    cuisine: activeRestaurant.cuisine,
    wifiSsid,
  });
  const wifiPayload = buildWifiQrString(wifiSsid, wifiPassword, wifiSecurity);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(menuUrl, { width: 320, margin: 2, color: { dark: '#0f172a', light: '#ffffff' } })
      .then((url) => {
        if (active) setMenuQrDataUrl(url);
      })
      .catch(console.error);

    QRCode.toDataURL(wifiPayload, { width: 320, margin: 2, color: { dark: '#065f46', light: '#ffffff' } })
      .then((url) => {
        if (active) setWifiQrDataUrl(url);
      })
      .catch(console.error);

    return () => {
      active = false;
    };
  }, [menuUrl, wifiPayload]);

  const handleSaveWifiConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (!wifiSsid.trim()) return;
    updateRestaurantWifi(activeRestaurant.id, {
      wifiSsid: wifiSsid.trim(),
      wifiPassword,
      wifiSecurity,
      tableCount: Math.max(1, Math.min(250, Number(tableCount) || 12)),
    });
    setCustomQrBaseUrl(domainInput);
    setSavedBanner(true);
    setTimeout(() => setSavedBanner(false), 2500);
  };

  const handleCopyMenuUrl = async () => {
    try {
      await navigator.clipboard.writeText(menuUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      // ignore clipboard restrictions
    }
  };

  const handleDownloadQr = (dataUrl: string, filename: string) => {
    if (!dataUrl) return;
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    link.click();
  };

  const handleDownloadIosProfile = () => {
    const xml = generateIosWifiProfileXml(
      activeRestaurant.name,
      wifiSsid,
      wifiPassword,
      wifiSecurity
    );
    const blob = new Blob([xml], { type: 'application/x-apple-aspen-config' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeRestaurant.slug}-wifi.mobileconfig`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleSimulateGuestScan = () => {
    setCustomerTableNumber(selectedTable);
    setWifiPromptOpen(true);
    setActiveTab('customer_menu');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 no-print">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            QR Code & Instant Guest WiFi Studio
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Guests scan once to auto-join {activeRestaurant.name} WiFi and open the live voice-enabled menu.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleSimulateGuestScan}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors whitespace-nowrap"
          >
            <Smartphone className="w-4 h-4" />
            <span>Test Guest QR Scan</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <Printer className="w-4 h-4" />
            <span>Print Table Tent</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Printable Unified Table Standee */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <p className="text-xs font-medium text-emerald-700">Table Standee Preview</p>
              <h3 className="text-xl font-bold text-slate-900 mt-0.5">
                {activeRestaurant.name}
              </h3>
              <p className="text-xs text-slate-500">
                {activeRestaurant.city} · Table {selectedTable}
              </p>
            </div>

            <div className="flex items-center gap-2 no-print">
              <label htmlFor="table-qr-select" className="text-xs font-medium text-slate-600">
                Table #
              </label>
              <select
                id="table-qr-select"
                value={selectedTable}
                onChange={(e) => setSelectedTable(Number(e.target.value))}
                className="h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 text-sm font-mono tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                {Array.from({ length: Math.min(activeRestaurant.tableCount, 40) }, (_, i) => i + 1).map(
                  (num) => (
                    <option key={num} value={num}>
                      Table {num}
                    </option>
                  )
                )}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Smart Menu + Auto-WiFi QR */}
            <div className="border border-slate-200 rounded-xl p-5 flex flex-col items-center text-center space-y-3">
              <p className="text-sm font-semibold text-slate-900">
                1. Smart Menu & Voice Order
              </p>
              <p className="text-xs text-slate-500">
                Opens live menu + 1-tap WiFi auto-connect sheet
              </p>
              {menuQrDataUrl ? (
                <img
                  src={menuQrDataUrl}
                  alt={`Digital Menu QR code for ${activeRestaurant.name} Table ${selectedTable}`}
                  className="w-48 h-48 rounded-lg border border-slate-100"
                />
              ) : (
                <div className="w-48 h-48 bg-slate-100 rounded-lg animate-pulse" />
              )}
              <p className="text-[11px] font-mono text-slate-500 break-all line-clamp-2">
                {qrPublicOrigin}/?menu={activeRestaurant.slug}&table={selectedTable}
              </p>
              <div className="flex items-center gap-2 pt-1 no-print">
                <button
                  type="button"
                  onClick={() =>
                    handleDownloadQr(
                      menuQrDataUrl,
                      `${activeRestaurant.slug}-table-${selectedTable}-menu-qr.png`
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>PNG</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyMenuUrl}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedUrl ? 'Copied' : 'Copy Link'}</span>
                </button>
              </div>
            </div>

            {/* Instant Native WiFi Join QR (Captive Portal Trigger) */}
            <div className="border border-emerald-200 bg-emerald-50/40 rounded-xl p-5 flex flex-col items-center text-center space-y-3">
              <p className="text-sm font-semibold text-emerald-950 flex items-center gap-1.5">
                <Wifi className="w-4 h-4 text-emerald-700" />
                <span>2. Instant Camera WiFi Join</span>
              </p>
              <p className="text-xs text-emerald-900/75">
                Auto-connects phone to WiFi without asking staff
              </p>
              {wifiQrDataUrl ? (
                <img
                  src={wifiQrDataUrl}
                  alt={`Instant WiFi QR code for ${wifiSsid}`}
                  className="w-48 h-48 rounded-lg border border-emerald-200 bg-white"
                />
              ) : (
                <div className="w-48 h-48 bg-emerald-100/50 rounded-lg animate-pulse" />
              )}
              <p className="text-xs font-mono font-medium text-emerald-900">
                Network: {wifiSsid}
              </p>
              <div className="flex items-center gap-2 pt-1 no-print">
                <button
                  type="button"
                  onClick={() =>
                    handleDownloadQr(wifiQrDataUrl, `${activeRestaurant.slug}-wifi-qr.png`)
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-200 bg-white text-xs font-medium text-emerald-800 hover:bg-emerald-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>WiFi QR</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadIosProfile}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-200 bg-white text-xs font-medium text-emerald-800 hover:bg-emerald-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>iOS Profile</span>
                </button>
              </div>
            </div>
          </div>

          {isDevPreviewOrigin && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-950 space-y-1.5 no-print">
              <p className="font-semibold">
                Scanning from a mobile phone? Public URL is automatically enabled
              </p>
              <p className="text-amber-900">
                {wasQrOriginAutoConverted
                  ? `Private editor links (ais-dev-...) block phone cameras with "we don't have access". Your Menu QR now automatically points to your Shared App URL (${qrPublicOrigin}). Make sure App Sharing or Cloud Run Deploy is turned on so any customer phone can open it without logging in.`
                  : `Your Menu QR currently uses your custom public URL (${qrPublicOrigin}).`}
              </p>
              <p className="text-amber-900">
                Note: <span className="font-semibold">QR #2 (Instant WiFi Join)</span> works directly offline on every phone camera without opening any web link.
              </p>
            </div>
          )}

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 space-y-1.5">
            <p className="font-semibold text-slate-900">
              How Single-QR Captive Portal Auto-Open Works in Your Restaurant
            </p>
            <p>
              Set your restaurant router's Guest Captive Portal Splash URL to{' '}
              <span className="font-mono text-slate-900 break-all">{menuUrl}</span>. When a guest
              scans the WiFi QR with their phone camera, their device connects to{' '}
              <span className="font-mono font-semibold text-slate-900">{wifiSsid}</span> and
              immediately pops open your live digital menu automatically.
            </p>
          </div>
        </section>

        {/* Right: WiFi & Table Configuration Form */}
        <form
          onSubmit={handleSaveWifiConfig}
          className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 space-y-4 no-print"
        >
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Restaurant WiFi & QR Configuration
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Update credentials anytime — QR codes regenerate instantly.
            </p>
          </div>

          {savedBanner && (
            <div className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-800">
              WiFi & QR configuration updated live for {activeRestaurant.name}.
            </div>
          )}

          <div>
            <label htmlFor="wifi-ssid" className="block text-xs font-medium text-slate-700 mb-1">
              Guest WiFi Network Name (SSID)
            </label>
            <input
              id="wifi-ssid"
              type="text"
              required
              maxLength={64}
              value={wifiSsid}
              onChange={(e) => setWifiSsid(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          <div>
            <label htmlFor="wifi-password" className="block text-xs font-medium text-slate-700 mb-1">
              WiFi Password
            </label>
            <input
              id="wifi-password"
              type="text"
              maxLength={64}
              disabled={wifiSecurity === 'nopass'}
              value={wifiPassword}
              onChange={(e) => setWifiPassword(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:bg-slate-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="wifi-security" className="block text-xs font-medium text-slate-700 mb-1">
                Security Protocol
              </label>
              <select
                id="wifi-security"
                value={wifiSecurity}
                onChange={(e) => setWifiSecurity(e.target.value as WifiSecurity)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                <option value="WPA">WPA / WPA2 / WPA3</option>
                <option value="WEP">WEP</option>
                <option value="nopass">Open (No Password)</option>
              </select>
            </div>

            <div>
              <label htmlFor="wifi-tables" className="block text-xs font-medium text-slate-700 mb-1">
                Total Tables
              </label>
              <input
                id="wifi-tables"
                type="number"
                min={1}
                max={250}
                value={tableCount}
                onChange={(e) => setTableCount(Number(e.target.value))}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100">
            <label htmlFor="qr-public-domain" className="flex items-center gap-1.5 text-xs font-medium text-slate-700 mb-1">
              <Globe className="w-3.5 h-3.5 text-emerald-700" />
              <span>Public Menu Base URL (Optional Custom / Deployed Domain)</span>
            </label>
            <input
              id="qr-public-domain"
              type="url"
              value={domainInput}
              onChange={(e) => setDomainInput(e.target.value)}
              placeholder={qrPublicOrigin}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Leave blank to auto-use <span className="font-mono">{qrPublicOrigin}</span>, or paste your deployed public app URL so any customer phone can scan freely.
            </p>
          </div>

          <button
            type="submit"
            className="w-full h-10 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
          >
            Save WiFi & Regenerate QR
          </button>
        </form>
      </div>
    </div>
  );
}
