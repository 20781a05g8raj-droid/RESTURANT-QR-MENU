import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  Mic,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Volume2,
  Wifi,
  X,
} from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import { GENERATED_IMAGES } from '../data/seedData';
import type { MarketInsightResult, OrderItem } from '../types/domain';
import {
  buildWifiQrString,
  formatCurrency,
  generateIosWifiProfileXml,
  getMenuItemPhotos,
} from '../utils/restaurantLogic';
import { LiveVoiceOrderDrawer } from './LiveVoiceOrderDrawer';

export function CustomerMenuView() {
  const {
    user,
    cloudSyncError,
    handleSignIn,
    handleRedirectSignIn,
    activeRestaurant,
    activeMenu,
    activeOrders,
    customerTableNumber,
    setCustomerTableNumber,
    wifiPromptOpen,
    setWifiPromptOpen,
    wifiConnected,
    setWifiConnected,
    placeOrder,
    speakText,
    speakingText,
  } = usePlatform();

  const [selectedCategory, setSelectedCategory] = useState('All');
  const [vegOnly, setVegOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [customerName, setCustomerName] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [lastPlacedOrderId, setLastPlacedOrderId] = useState<string | null>(null);
  const [copiedWifiPass, setCopiedWifiPass] = useState(false);
  const [wifiQrUrl, setWifiQrUrl] = useState('');
  const [photoIndexByDish, setPhotoIndexByDish] = useState<Record<string, number>>({});

  // Dish Search Grounding modal
  const [dishAskOpen, setDishAskOpen] = useState(false);
  const [dishQuestion, setDishQuestion] = useState('');
  const [dishInsight, setDishInsight] = useState<MarketInsightResult | null>(null);
  const [dishInsightLoading, setDishInsightLoading] = useState(false);

  useEffect(() => {
    const payload = buildWifiQrString(
      activeRestaurant.wifiSsid,
      activeRestaurant.wifiPassword,
      activeRestaurant.wifiSecurity
    );
    QRCode.toDataURL(payload, { width: 220, margin: 1 })
      .then(setWifiQrUrl)
      .catch(console.error);
  }, [activeRestaurant.wifiSsid, activeRestaurant.wifiPassword, activeRestaurant.wifiSecurity]);

  const categories = useMemo(() => {
    const unique = Array.from(new Set(activeMenu.map((m) => m.category)));
    return ['All', ...unique];
  }, [activeMenu]);

  const filteredMenu = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return activeMenu.filter((item) => {
      if (selectedCategory !== 'All' && item.category !== selectedCategory) return false;
      if (vegOnly && !item.veg) return false;
      if (q && !item.name.toLowerCase().includes(q) && !item.description.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [activeMenu, selectedCategory, vegOnly, searchQuery]);

  const cartItems: OrderItem[] = useMemo(() => {
    const list: OrderItem[] = [];
    for (const [id, qty] of Object.entries(cart)) {
      if (qty <= 0) continue;
      const dish = activeMenu.find((m) => m.id === id);
      if (!dish || !dish.available) continue;
      list.push({
        menuItemId: dish.id,
        name: dish.name,
        price: dish.price,
        quantity: qty,
        veg: dish.veg,
      });
    }
    return list;
  }, [cart, activeMenu]);

  const cartTotalCount = cartItems.reduce((sum, i) => sum + i.quantity, 0);
  const cartTotalAmount = cartItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

  const trackedOrder = useMemo(() => {
    if (lastPlacedOrderId) {
      return activeOrders.find((o) => o.id === lastPlacedOrderId) ?? null;
    }
    return (
      activeOrders.find(
        (o) =>
          o.tableNumber === customerTableNumber &&
          o.status !== 'served' &&
          o.status !== 'cancelled'
      ) ?? null
    );
  }, [activeOrders, lastPlacedOrderId, customerTableNumber]);

  const updateCartQty = (menuItemId: string, delta: number) => {
    const dish = activeMenu.find((m) => m.id === menuItemId);
    if (!dish || !dish.available) return;
    setCart((prev) => {
      const nextQty = Math.max(0, (prev[menuItemId] ?? 0) + delta);
      if (nextQty === 0) {
        const clone = { ...prev };
        delete clone[menuItemId];
        return clone;
      }
      return { ...prev, [menuItemId]: nextQty };
    });
  };

  const addCartFromVoice = (menuItemId: string, quantity: number) => {
    updateCartQty(menuItemId, quantity);
  };

  const removeCartFromVoice = (menuItemId: string) => {
    setCart((prev) => {
      const clone = { ...prev };
      delete clone[menuItemId];
      return clone;
    });
  };

  const submitOrder = (source: 'qr' | 'voice', overrideNotes?: string) => {
    if (cartItems.length === 0) return;
    const created = placeOrder({
      tableNumber: customerTableNumber,
      customerName: customerName || `Table ${customerTableNumber} Guest`,
      items: cartItems,
      source,
      notes: overrideNotes ?? orderNotes,
    });
    setLastPlacedOrderId(created.id);
    setCart({});
    setOrderNotes('');
    setCartOpen(false);
    setVoiceOpen(false);

    // Friendly spoken confirmation via Gemini 3.8 Flash TTS
    const summary = `Thank you! Order ${created.orderNumber} for Table ${created.tableNumber} has been sent to the kitchen. Total is ${formatCurrency(
      created.totalAmount,
      activeRestaurant.currency
    )}.`;
    speakText(summary, 'Warm, welcoming restaurant host confirming an order', 'Kore');
  };

  const handleListenToChefSpecials = () => {
    const specials = activeMenu
      .filter((m) => m.available)
      .slice(0, 3)
      .map((m) => `${m.name} for ${formatCurrency(m.price, activeRestaurant.currency)}`)
      .join(', ');
    const script = `Welcome to ${activeRestaurant.name}! Today's fresh highlights on the menu are: ${specials}. You can tap the voice button anytime to place your order directly.`;
    speakText(script, 'Warm, inviting fine-dining host introducing signature dishes', 'Kore');
  };

  const handleCopyWifi = async () => {
    try {
      await navigator.clipboard.writeText(activeRestaurant.wifiPassword);
      setCopiedWifiPass(true);
      setTimeout(() => setCopiedWifiPass(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleDownloadIosWifi = () => {
    const xml = generateIosWifiProfileXml(
      activeRestaurant.name,
      activeRestaurant.wifiSsid,
      activeRestaurant.wifiPassword,
      activeRestaurant.wifiSecurity
    );
    const blob = new Blob([xml], { type: 'application/x-apple-aspen-config' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeRestaurant.slug}-wifi.mobileconfig`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleAskDishInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dishQuestion.trim()) return;
    setDishInsightLoading(true);
    try {
      const res = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: dishQuestion,
          restaurantName: activeRestaurant.name,
          city: activeRestaurant.city,
          cuisine: activeRestaurant.cuisine,
          mode: 'dish',
        }),
      });
      const data = (await res.json()) as MarketInsightResult;
      if (res.ok) setDishInsight(data);
    } finally {
      setDishInsightLoading(false);
    }
  };

  const statusSteps = ['pending', 'preparing', 'ready', 'served'] as const;

  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-8 py-6 pb-28 space-y-6">
      {/* Editorial Restaurant Hero Banner */}
      <section className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-900">
        <img
          src={GENERATED_IMAGES.heroInterior}
          alt={`${activeRestaurant.name} dining room`}
          referrerPolicy="no-referrer"
          className="w-full h-52 sm:h-64 object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/45 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7 flex flex-col sm:flex-row sm:items-end justify-between gap-4 text-white">
          <div>
            <p className="text-xs font-medium text-emerald-300">
              {activeRestaurant.cuisine} · {activeRestaurant.city}
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mt-0.5">
              {activeRestaurant.name}
            </h2>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-200">
              <label className="inline-flex items-center gap-1.5">
                <span>Dining at</span>
                <select
                  aria-label="Select your table number"
                  value={customerTableNumber}
                  onChange={(e) => setCustomerTableNumber(Number(e.target.value))}
                  className="bg-white/15 border border-white/25 rounded-md px-2 py-1 text-xs font-mono text-white focus:outline-none"
                >
                  {Array.from(
                    { length: Math.min(activeRestaurant.tableCount, 30) },
                    (_, i) => i + 1
                  ).map((n) => (
                    <option key={n} value={n} className="text-slate-900">
                      Table {n}
                    </option>
                  ))}
                </select>
              </label>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={() => setWifiPromptOpen(true)}
                className="inline-flex items-center gap-1.5 text-emerald-300 hover:text-emerald-200 font-medium underline underline-offset-4"
              >
                <Wifi className="w-3.5 h-3.5" />
                <span>
                  {wifiConnected
                    ? `WiFi Connected (${activeRestaurant.wifiSsid})`
                    : `Auto-Connect WiFi (${activeRestaurant.wifiSsid})`}
                </span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setVoiceOpen(true)}
              className="inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-emerald-500 text-slate-950 text-sm font-bold hover:bg-emerald-400 transition-colors whitespace-nowrap"
            >
              <Mic className="w-4 h-4" />
              <span>Order by Voice</span>
            </button>
            <button
              type="button"
              onClick={handleListenToChefSpecials}
              disabled={Boolean(speakingText)}
              aria-label="Listen to menu highlights"
              className="inline-flex items-center gap-1.5 h-11 px-3.5 rounded-xl bg-white/15 border border-white/25 text-white text-xs font-semibold hover:bg-white/25 transition-colors whitespace-nowrap disabled:opacity-50"
            >
              <Volume2 className="w-4 h-4" />
              <span className="hidden sm:inline">Audio Menu</span>
            </button>
          </div>
        </div>
      </section>

      {/* Instant Smart WiFi Auto-Connect Bar (always reachable in 1 tap) */}
      {!wifiConnected && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <Wifi className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-emerald-950">
                Free Restaurant WiFi Ready: {activeRestaurant.wifiSsid}
              </p>
              <p className="text-xs text-emerald-800">
                Connect in one tap — no need to ask staff for the password.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setWifiConnected(true);
                setWifiPromptOpen(false);
              }}
              className="h-9 px-4 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 whitespace-nowrap"
            >
              Connect WiFi Now
            </button>
            <button
              type="button"
              onClick={() => setWifiPromptOpen(true)}
              className="h-9 px-3 rounded-lg border border-emerald-300 bg-white text-emerald-900 text-xs font-medium hover:bg-emerald-100 whitespace-nowrap"
            >
              Details & QR
            </button>
          </div>
        </div>
      )}

      {/* Live Order Tracker for Current Table */}
      {trackedOrder && (
        <section
          aria-label="Live order tracker"
          className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-emerald-700">Live Order Status</p>
              <h3 className="text-base font-bold text-slate-900">
                {trackedOrder.orderNumber} · Table {trackedOrder.tableNumber}
              </h3>
            </div>
            <span className="font-mono tabular-nums text-sm font-semibold text-slate-900">
              {formatCurrency(trackedOrder.totalAmount, activeRestaurant.currency)}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {statusSteps.map((step, index) => {
              const currentIdx = statusSteps.indexOf(
                trackedOrder.status === 'cancelled' ? 'pending' : trackedOrder.status
              );
              const done = index <= currentIdx;
              return (
                <div key={step} className="space-y-1.5">
                  <div
                    className={`h-1.5 rounded-full ${
                      done ? 'bg-emerald-600' : 'bg-slate-200'
                    }`}
                  />
                  <p
                    className={`text-xs font-medium capitalize ${
                      done ? 'text-slate-900' : 'text-slate-400'
                    }`}
                  >
                    {step === 'pending' ? 'Received' : step}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Filter & Dish Search Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <label htmlFor="customer-menu-search" className="sr-only">
              Search menu dishes
            </label>
            <input
              id="customer-menu-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search dishes..."
              className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          <button
            type="button"
            onClick={() => setVegOnly((v) => !v)}
            className={`h-10 px-3.5 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap ${
              vegOnly
                ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            Veg Only
          </button>

          <button
            type="button"
            onClick={() => setDishAskOpen((v) => !v)}
            className="h-10 px-3.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            Allergens & Origins
          </button>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                selectedCategory === cat
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Dish Origin & Allergen Search Grounding Panel */}
      {dishAskOpen && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Ask Dish Origins, Ingredients & Allergens
              </h3>
              <p className="text-xs text-slate-500">
                Verified with up-to-date Google Search data
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDishAskOpen(false)}
              aria-label="Close dish info panel"
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleAskDishInfo} className="flex gap-2">
            <input
              type="text"
              value={dishQuestion}
              onChange={(e) => setDishQuestion(e.target.value)}
              placeholder="e.g. Does Butter Chicken usually contain nuts or gluten?"
              className="flex-1 h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
            <button
              type="submit"
              disabled={dishInsightLoading}
              className="h-10 px-4 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
            >
              {dishInsightLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Check Info'}
            </button>
          </form>

          {dishInsight && (
            <div className="text-sm text-slate-700 space-y-2 pt-2 border-t border-slate-100">
              <p className="leading-relaxed">{dishInsight.summary}</p>
              {dishInsight.sources.length > 0 && (
                <div className="flex flex-wrap gap-3 pt-1">
                  {dishInsight.sources.slice(0, 3).map((s) => (
                    <a
                      key={s.uri}
                      href={s.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>{s.title}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Real-time Menu Dish Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {filteredMenu.map((item) => {
          const qty = cart[item.id] ?? 0;
          const photos = getMenuItemPhotos(item);
          const activePhotoIdx =
            photos.length > 0 ? (photoIndexByDish[item.id] ?? 0) % photos.length : 0;
          const currentPhoto = photos[activePhotoIdx] ?? item.imageUrl;

          const stepPhoto = (delta: number) => {
            if (photos.length <= 1) return;
            setPhotoIndexByDish((prev) => ({
              ...prev,
              [item.id]: ((prev[item.id] ?? 0) + delta + photos.length) % photos.length,
            }));
          };

          return (
            <article
              key={item.id}
              className={`bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col sm:flex-row transition-opacity ${
                item.available ? '' : 'opacity-70 bg-slate-50'
              }`}
            >
              <div className="sm:w-44 h-48 sm:h-auto shrink-0 relative bg-slate-100 select-none">
                <img
                  src={currentPhoto}
                  alt={
                    photos.length > 1
                      ? `${item.name} photo ${activePhotoIdx + 1} of ${photos.length}`
                      : item.name
                  }
                  referrerPolicy="no-referrer"
                  className={`w-full h-full object-cover ${item.available ? '' : 'grayscale'}`}
                />

                {photos.length > 1 && (
                  <>
                    <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-slate-900/75 text-white text-[10px] font-mono tabular-nums font-semibold">
                      {activePhotoIdx + 1}/{photos.length}
                    </span>

                    <button
                      type="button"
                      onClick={() => stepPhoto(-1)}
                      aria-label={`Previous photo of ${item.name}`}
                      className="absolute left-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-slate-900/70 text-white flex items-center justify-center hover:bg-slate-900 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => stepPhoto(1)}
                      aria-label={`Next photo of ${item.name}`}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-slate-900/70 text-white flex items-center justify-center hover:bg-slate-900 transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>

                    <div className="absolute bottom-2 inset-x-0 flex items-center justify-center gap-1.5">
                      {photos.map((_, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() =>
                            setPhotoIndexByDish((prev) => ({ ...prev, [item.id]: idx }))
                          }
                          aria-label={`Show photo ${idx + 1} of ${item.name}`}
                          className={`h-1.5 rounded-full transition-all ${
                            idx === activePhotoIdx
                              ? 'w-4 bg-white'
                              : 'w-1.5 bg-white/60 hover:bg-white/90'
                          }`}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-bold text-slate-900 leading-snug">
                      {item.name}
                    </h3>
                    <button
                      type="button"
                      onClick={() =>
                        speakText(
                          `${item.name}. ${item.description} Priced at ${formatCurrency(
                            item.price,
                            activeRestaurant.currency
                          )}.`,
                          'Warm culinary host describing a signature dish',
                          'Kore'
                        )
                      }
                      aria-label={`Listen to description of ${item.name}`}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 shrink-0"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  </div>

                  <p className="text-xs text-slate-500 mt-1">
                    {item.veg ? 'Vegetarian' : 'Non-Veg'} · {item.category} · {item.prepMinutes} min
                  </p>
                  <p className="text-sm text-slate-600 mt-2 line-clamp-2 leading-relaxed">
                    {item.description}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <span className="text-base font-bold font-mono tabular-nums text-slate-900">
                    {formatCurrency(item.price, activeRestaurant.currency)}
                  </span>

                  {!item.available ? (
                    <span className="text-xs font-semibold text-red-600">Sold Out</span>
                  ) : qty > 0 ? (
                    <div className="inline-flex items-center gap-2 border border-emerald-600 rounded-lg p-1 bg-emerald-50">
                      <button
                        type="button"
                        onClick={() => updateCartQty(item.id, -1)}
                        aria-label={`Decrease quantity of ${item.name}`}
                        className="w-7 h-7 rounded-md bg-white text-emerald-800 flex items-center justify-center hover:bg-emerald-100"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-6 text-center text-sm font-mono tabular-nums font-bold text-emerald-950">
                        {qty}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateCartQty(item.id, 1)}
                        aria-label={`Increase quantity of ${item.name}`}
                        className="w-7 h-7 rounded-md bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => updateCartQty(item.id, 1)}
                      aria-label={`Add ${item.name} to cart`}
                      className="h-9 px-4 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors whitespace-nowrap"
                    >
                      Add to Order
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Sticky Bottom Cart Bar (compact, respects <= 15% mobile viewport cap) */}
      {cartTotalCount > 0 && (
        <div className="fixed bottom-4 inset-x-4 sm:left-auto sm:right-8 sm:w-96 z-40">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="w-full h-14 px-5 rounded-xl bg-emerald-600 text-white shadow-lg hover:bg-emerald-700 transition-colors flex items-center justify-between"
          >
            <span className="flex items-center gap-2.5 text-sm font-semibold">
              <ShoppingBag className="w-4 h-4" />
              <span>
                {cartTotalCount} {cartTotalCount === 1 ? 'item' : 'items'} · Table{' '}
                {customerTableNumber}
              </span>
            </span>
            <span className="font-mono tabular-nums text-sm font-bold">
              {formatCurrency(cartTotalAmount, activeRestaurant.currency)} · View Cart
            </span>
          </button>
        </div>
      )}

      {/* Cart Checkout Modal */}
      {cartOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cart-modal-title"
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-end sm:items-center justify-center sm:p-4"
        >
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-slate-200 p-6 space-y-4 max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 id="cart-modal-title" className="text-lg font-bold text-slate-900">
                Confirm Table {customerTableNumber} Order
              </h3>
              <button
                type="button"
                onClick={() => setCartOpen(false)}
                aria-label="Close cart"
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <ul className="divide-y divide-slate-100">
              {cartItems.map((item) => (
                <li key={item.menuItemId} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                    <p className="text-xs font-mono text-slate-500">
                      {item.quantity} x {formatCurrency(item.price, activeRestaurant.currency)}
                    </p>
                  </div>
                  <span className="font-mono tabular-nums text-sm font-semibold text-slate-900">
                    {formatCurrency(item.price * item.quantity, activeRestaurant.currency)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div>
                <label htmlFor="guest-name-input" className="block text-xs font-medium text-slate-700 mb-1">
                  Your Name (optional)
                </label>
                <input
                  id="guest-name-input"
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. Aarav"
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label htmlFor="guest-notes-input" className="block text-xs font-medium text-slate-700 mb-1">
                  Kitchen Notes (optional)
                </label>
                <input
                  id="guest-notes-input"
                  type="text"
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  placeholder="Less spicy, serve starters first..."
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-200">
              <span className="text-sm font-medium text-slate-600">Total Bill</span>
              <span className="text-lg font-bold font-mono tabular-nums text-slate-900">
                {formatCurrency(cartTotalAmount, activeRestaurant.currency)}
              </span>
            </div>

            {user && user.emailVerified ? (
              <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                Connected as <span className="font-mono">{user.email}</span> — your order will appear live on the restaurant kitchen screen.
              </p>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                <p className="text-xs text-amber-900">
                  Sign in with Google (1 tap) so your order goes live directly to{' '}
                  <span className="font-semibold">{activeRestaurant.name}</span>&apos;s kitchen dashboard.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleSignIn()}
                    className="h-8 px-3 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors"
                  >
                    Sign in with Google
                  </button>
                  {cloudSyncError &&
                    typeof window !== 'undefined' &&
                    window.self === window.top && (
                      <button
                        type="button"
                        onClick={() => void handleRedirectSignIn()}
                        className="h-8 px-3 rounded-lg border border-amber-300 bg-white text-amber-900 text-xs font-semibold hover:bg-amber-100 transition-colors"
                      >
                        Use Redirect Sign-In
                      </button>
                    )}
                </div>
                {cloudSyncError && (
                  <p className="text-[11px] text-red-700">{cloudSyncError}</p>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => submitOrder('qr')}
              className="w-full h-11 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition-colors"
            >
              Send Order to Kitchen
            </button>
          </div>
        </div>
      )}

      {/* Smart WiFi Auto-Connect Modal */}
      {wifiPromptOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="wifi-modal-title"
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl border border-slate-200 max-w-sm w-full p-6 space-y-4 text-center">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-700">Instant Guest WiFi</span>
              <button
                type="button"
                onClick={() => setWifiPromptOpen(false)}
                aria-label="Close WiFi modal"
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <h3 id="wifi-modal-title" className="text-lg font-bold text-slate-900">
              Join {activeRestaurant.wifiSsid}
            </h3>

            {wifiQrUrl && (
              <img
                src={wifiQrUrl}
                alt={`Scan to connect to ${activeRestaurant.wifiSsid}`}
                className="w-44 h-44 mx-auto rounded-lg border border-slate-200"
              />
            )}

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-left space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Network</span>
                <span className="font-mono font-semibold text-slate-900">
                  {activeRestaurant.wifiSsid}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Password</span>
                <button
                  type="button"
                  onClick={handleCopyWifi}
                  className="inline-flex items-center gap-1 font-mono font-semibold text-emerald-700"
                >
                  <span>
                    {activeRestaurant.wifiSecurity === 'nopass'
                      ? 'Open Network'
                      : activeRestaurant.wifiPassword}
                  </span>
                  {copiedWifiPass ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  setWifiConnected(true);
                  setWifiPromptOpen(false);
                }}
                className="w-full h-10 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 inline-flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Connect & Continue to Menu</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadIosWifi}
                className="w-full h-10 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center justify-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Install iOS Auto-Join Profile (.mobileconfig)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gemini Live Voice Ordering Drawer */}
      <LiveVoiceOrderDrawer
        open={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        restaurant={activeRestaurant}
        tableNumber={customerTableNumber}
        menuItems={activeMenu}
        onAddCartItem={addCartFromVoice}
        onRemoveCartItem={removeCartFromVoice}
        onConfirmVoiceOrder={(notes) => submitOrder('voice', notes)}
      />
    </div>
  );
}
