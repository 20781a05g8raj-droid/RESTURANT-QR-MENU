import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ExternalLink, Loader2, QrCode, Search, Volume2 } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import type { MarketInsightResult } from '../types/domain';
import { computeAnalytics, formatCurrency } from '../utils/restaurantLogic';

const PRESET_QUERIES = [
  'Top trending dishes and menu pricing benchmarks right now',
  'Seasonal festival menu ideas with high profit margins',
  'Current dairy, spice, and chicken wholesale price trends',
];

export function OverviewAnalytics() {
  const {
    activeRestaurant,
    activeOrders,
    activeMenu,
    setActiveTab,
    speakText,
    speakingText,
  } = usePlatform();
  const analytics = useMemo(
    () => computeAnalytics(activeOrders, activeMenu),
    [activeOrders, activeMenu]
  );

  const [queryText, setQueryText] = useState(PRESET_QUERIES[0]);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState<string | null>(null);
  const [insightResult, setInsightResult] = useState<MarketInsightResult | null>(null);

  const runMarketSearch = async (customQuery?: string) => {
    const q = (customQuery ?? queryText).trim();
    if (!q) return;
    setInsightLoading(true);
    setInsightError(null);
    try {
      const res = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q,
          restaurantName: activeRestaurant.name,
          city: activeRestaurant.city,
          cuisine: activeRestaurant.cuisine,
          mode: 'market',
        }),
      });
      const data = (await res.json()) as MarketInsightResult & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Could not fetch live search insights.');
      }
      setInsightResult(data);
    } catch (err) {
      setInsightError(err instanceof Error ? err.message : 'Search request failed.');
    } finally {
      setInsightLoading(false);
    }
  };

  const handleReadDailySummary = () => {
    const summaryScript = `Daily report for ${activeRestaurant.name}. Today's total sales are ${formatCurrency(
      analytics.totalRevenue,
      activeRestaurant.currency
    )} across ${analytics.totalOrders} orders, including ${analytics.voiceOrders} direct voice orders. Average bill value is ${formatCurrency(
      analytics.averageOrderValue,
      activeRestaurant.currency
    )}, and ${analytics.activeOrders} orders are currently active in the kitchen.`;
    speakText(summaryScript, 'Crisp, clear restaurant business briefing', 'Fenrir');
  };

  const availableDishesCount = activeMenu.filter((m) => m.available).length;

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6 space-y-8">
      {/* Top context strip */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            {activeRestaurant.name} — Live Sales & Operations
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {activeRestaurant.city} · {activeRestaurant.cuisine} · {availableDishesCount} of{' '}
            {activeMenu.length} dishes live on QR menu
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('qr_wifi')}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <QrCode className="w-4 h-4 text-emerald-400" />
            <span>Generate QR & WiFi</span>
          </button>
          <button
            type="button"
            onClick={handleReadDailySummary}
            disabled={Boolean(speakingText)}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap disabled:opacity-50"
          >
            <Volume2 className="w-4 h-4 text-emerald-600" />
            <span>{speakingText ? 'Speaking...' : 'Audio Briefing'}</span>
          </button>
        </div>
      </div>

      {/* 4-column KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Live Shift Revenue</p>
          <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-2">
            {formatCurrency(analytics.totalRevenue, activeRestaurant.currency)}
          </p>
          <p className="text-xs text-emerald-700 mt-1.5">
            {analytics.totalOrders} orders today · {analytics.servedOrders} served
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Active Kitchen Queue</p>
          <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-2">
            {analytics.activeOrders}
          </p>
          <p className="text-xs text-slate-500 mt-1.5">
            Across {activeRestaurant.tableCount} dining tables
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Average Order Value</p>
          <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-2">
            {formatCurrency(analytics.averageOrderValue, activeRestaurant.currency)}
          </p>
          <p className="text-xs text-slate-500 mt-1.5">Per table ticket</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Direct Voice Orders</p>
          <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-2">
            {analytics.voiceOrders}
          </p>
          <p className="text-xs text-slate-500 mt-1.5">
            {analytics.totalOrders > 0
              ? `${Math.round((analytics.voiceOrders / analytics.totalOrders) * 100)}% of total orders`
              : 'Ready for voice guests'}
          </p>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Hourly Revenue Pulse
              </h3>
              <p className="text-xs text-slate-500">
                Real-time dining service curve ({activeRestaurant.currency})
              </p>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analytics.hourlyTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#059669" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#059669" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="hour" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                />
                <Tooltip
                  formatter={(value: unknown) =>
                    formatCurrency(Number(value ?? 0), activeRestaurant.currency)
                  }
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#059669"
                  strokeWidth={2}
                  fill="url(#revGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-slate-900">
              Revenue by Category
            </h3>
            <p className="text-xs text-slate-500">Live breakdown from today's tickets</p>
          </div>
          {analytics.categorySplit.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-sm text-slate-500">
              Place an order to see category splits.
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={analytics.categorySplit}
                  layout="vertical"
                  margin={{ top: 4, right: 12, left: 0, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="category"
                    width={84}
                    tick={{ fontSize: 12, fill: '#334155' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value: unknown) =>
                      formatCurrency(Number(value ?? 0), activeRestaurant.currency)
                    }
                  />
                  <Bar dataKey="revenue" fill="#0f172a" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>

      {/* Bottom split: Top Selling Dishes + Live Google Search Grounded Market Intelligence */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h3 className="text-base font-semibold text-slate-900">Best-Selling Dishes</h3>
            <p className="text-xs text-slate-500">Ranked by real-time ticket revenue</p>
          </div>
          {analytics.topDishes.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No completed sales yet for this outlet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-medium text-slate-500">
                    <th className="py-3 px-5">Dish</th>
                    <th className="py-3 px-4 text-right">Units</th>
                    <th className="py-3 px-4 text-right">Revenue</th>
                    <th className="py-3 px-5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {analytics.topDishes.map((dish) => (
                    <tr key={dish.name} className="hover:bg-slate-50/70">
                      <td className="py-3 px-5 font-medium text-slate-900">{dish.name}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                        {dish.unitsSold}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-slate-900">
                        {formatCurrency(dish.revenue, activeRestaurant.currency)}
                      </td>
                      <td className="py-3 px-5 text-right text-xs font-medium">
                        <span className={dish.available ? 'text-emerald-700' : 'text-red-600'}>
                          {dish.available ? 'In Stock' : 'Sold Out'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Live Market & Menu Pricing Benchmark
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Powered by Google Search data for {activeRestaurant.city} · {activeRestaurant.cuisine}
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              runMarketSearch();
            }}
            className="flex gap-2"
          >
            <label htmlFor="market-search-input" className="sr-only">
              Search local restaurant trends and pricing
            </label>
            <input
              id="market-search-input"
              type="text"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder="Ask about local menu prices, food trends, or ingredient costs..."
              className="flex-1 h-10 px-3 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
            <button
              type="submit"
              disabled={insightLoading}
              className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
            >
              {insightLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              <span>Search</span>
            </button>
          </form>

          <div className="flex flex-wrap gap-2">
            {PRESET_QUERIES.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  setQueryText(preset);
                  runMarketSearch(preset);
                }}
                className="text-xs text-slate-600 hover:text-emerald-700 underline decoration-slate-300 underline-offset-4 text-left"
              >
                {preset}
              </button>
            ))}
          </div>

          {insightError && (
            <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-700">
              {insightError}
            </div>
          )}

          {insightResult ? (
            <div className="space-y-3 border-t border-slate-100 pt-3">
              <div className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">
                {insightResult.summary}
              </div>
              {insightResult.sources.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  <p className="text-xs font-medium text-slate-500">Verified Web Sources</p>
                  <ul className="space-y-1">
                    {insightResult.sources.slice(0, 4).map((src) => (
                      <li key={src.uri}>
                        <a
                          href={src.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:underline break-all"
                        >
                          <ExternalLink className="w-3 h-3 shrink-0" />
                          <span>{src.title}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center py-6 text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
              Run a search to compare live local restaurant trends & pricing with verified Google sources.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
