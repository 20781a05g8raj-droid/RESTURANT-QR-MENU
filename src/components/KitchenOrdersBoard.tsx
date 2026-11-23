import React, { useMemo, useState } from 'react';
import { CheckCircle2, Clock, Mic, Volume2, XCircle } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import type { Order, OrderStatus } from '../types/domain';
import {
  canRoleTransitionOrder,
  formatCurrency,
  getNextOrderStatus,
} from '../utils/restaurantLogic';

const COLUMNS: Array<{ status: OrderStatus; title: string; actionLabel: string }> = [
  { status: 'pending', title: 'New Orders', actionLabel: 'Start Preparing' },
  { status: 'preparing', title: 'In Kitchen', actionLabel: 'Mark Ready' },
  { status: 'ready', title: 'Ready to Serve', actionLabel: 'Mark Served' },
  { status: 'served', title: 'Served Today', actionLabel: '' },
];

export function KitchenOrdersBoard() {
  const {
    activeRestaurant,
    activeOrders,
    activeRole,
    updateOrderStatus,
    speakText,
    speakingText,
  } = usePlatform();

  const [sourceFilter, setSourceFilter] = useState<'all' | 'voice' | 'qr' | 'staff'>('all');

  const filteredOrders = useMemo(() => {
    if (sourceFilter === 'all') return activeOrders;
    return activeOrders.filter((o) => o.source === sourceFilter);
  }, [activeOrders, sourceFilter]);

  const announceOrder = (order: Order) => {
    const itemsText = order.items.map((i) => `${i.quantity} ${i.name}`).join(', ');
    const notesText = order.notes ? `. Kitchen note: ${order.notes}` : '';
    const script = `Order ${order.orderNumber} for Table ${order.tableNumber}: ${itemsText}${notesText}.`;
    speakText(script, 'Clear, calm kitchen expeditor announcing an order ticket', 'Puck');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            Live Order Tracking
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            One-tap status updates sync immediately to guest phones and waitstaff.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
          {(['all', 'voice', 'qr', 'staff'] as const).map((src) => (
            <button
              key={src}
              type="button"
              onClick={() => setSourceFilter(src)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                sourceFilter === src
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {src === 'all'
                ? 'All Channels'
                : src === 'voice'
                  ? 'Voice Orders'
                  : src === 'qr'
                    ? 'QR Menu'
                    : 'Staff'}
            </button>
          ))}
        </div>
      </div>

      {/* Role guidance banner for chef/waiter */}
      {(activeRole === 'chef' || activeRole === 'waiter') && (
        <div className="px-4 py-3 rounded-lg bg-slate-100 text-xs text-slate-700">
          {activeRole === 'chef'
            ? 'Kitchen Chef View: You can move New Orders to Preparing and Preparing orders to Ready.'
            : 'Waitstaff View: You can mark Ready orders as Served once delivered to the guest table.'}
        </div>
      )}

      {/* 4-column live status board */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 items-start">
        {COLUMNS.map((col) => {
          const colOrders = filteredOrders.filter((o) => o.status === col.status);
          return (
            <section
              key={col.status}
              aria-label={col.title}
              className="bg-slate-100/70 border border-slate-200 rounded-xl p-3.5 space-y-3"
            >
              <div className="flex items-center justify-between px-1">
                <h3 className="text-sm font-semibold text-slate-900">{col.title}</h3>
                <span className="text-xs font-mono tabular-nums font-semibold text-slate-600">
                  {colOrders.length}
                </span>
              </div>

              {colOrders.length === 0 ? (
                <div className="bg-white/70 border border-dashed border-slate-200 rounded-lg py-8 px-4 text-center text-xs text-slate-400">
                  No orders in {col.title.toLowerCase()}
                </div>
              ) : (
                <div className="space-y-3">
                  {colOrders.map((order) => {
                    const nextStatus = getNextOrderStatus(order.status);
                    const canAdvance =
                      nextStatus !== null &&
                      canRoleTransitionOrder(activeRole, order.status, nextStatus);
                    const canCancel =
                      order.status !== 'served' &&
                      order.status !== 'cancelled' &&
                      canRoleTransitionOrder(activeRole, order.status, 'cancelled');

                    return (
                      <article
                        key={order.id}
                        className="bg-white border border-slate-200 rounded-lg p-4 space-y-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-base font-bold text-slate-900 font-mono tabular-nums">
                                Table {order.tableNumber}
                              </span>
                              <span className="text-xs text-slate-400" aria-hidden="true">
                                ·
                              </span>
                              <span className="text-xs font-mono text-slate-500">
                                {order.orderNumber}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {order.customerName} ·{' '}
                              {order.source === 'voice'
                                ? 'Voice Order'
                                : order.source === 'qr'
                                  ? 'QR Menu'
                                  : 'Staff'}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => announceOrder(order)}
                            disabled={Boolean(speakingText)}
                            aria-label={`Announce order ${order.orderNumber} aloud`}
                            title="Announce order aloud via Gemini TTS"
                            className="p-2 rounded-lg text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-50"
                          >
                            <Volume2 className="w-4 h-4" />
                          </button>
                        </div>

                        <ul className="divide-y divide-slate-100 text-sm">
                          {order.items.map((item, idx) => (
                            <li
                              key={`${order.id}-${item.menuItemId}-${idx}`}
                              className="py-1.5 flex items-center justify-between gap-2"
                            >
                              <span className="text-slate-800">
                                <span className="font-mono font-semibold text-slate-900 mr-1.5">
                                  {item.quantity}x
                                </span>
                                {item.name}
                              </span>
                              <span className="text-xs font-mono tabular-nums text-slate-500 shrink-0">
                                {formatCurrency(item.price * item.quantity, activeRestaurant.currency)}
                              </span>
                            </li>
                          ))}
                        </ul>

                        {order.notes && (
                          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200/70 rounded-md px-2.5 py-1.5">
                            Note: {order.notes}
                          </p>
                        )}

                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                          <span className="inline-flex items-center gap-1 text-slate-500">
                            {order.source === 'voice' ? (
                              <Mic className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Clock className="w-3.5 h-3.5 text-slate-400" />
                            )}
                            <span>
                              {new Date(order.createdAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </span>
                          <span className="font-mono tabular-nums font-semibold text-slate-900">
                            {formatCurrency(order.totalAmount, activeRestaurant.currency)}
                          </span>
                        </div>

                        {nextStatus && (
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              type="button"
                              disabled={!canAdvance}
                              onClick={() => updateOrderStatus(order.id, nextStatus)}
                              className="flex-1 h-9 px-3 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed whitespace-nowrap"
                            >
                              {col.actionLabel}
                            </button>
                            {canCancel && (
                              <button
                                type="button"
                                onClick={() => updateOrderStatus(order.id, 'cancelled')}
                                aria-label={`Cancel order ${order.orderNumber}`}
                                className="h-9 px-2.5 rounded-lg border border-slate-200 text-slate-500 hover:text-red-600 hover:border-red-200 transition-colors"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        )}

                        {order.status === 'served' && (
                          <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 pt-1">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Completed</span>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
