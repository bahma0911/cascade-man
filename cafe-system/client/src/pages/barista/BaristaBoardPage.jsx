import React, { useState, useEffect } from 'react';
import { ordersApi } from '../../api/client.js';
import { useSocket } from '../../context/SocketContext.jsx';
import { STRINGS } from '../../locales/strings.js';
import { soundPlayer } from '../../utils/sound.js';
import {
  Coffee,
  Clock,
  CheckCircle2,
  AlertCircle,
  Play,
  Check,
  RotateCcw,
  Wifi,
  WifiOff,
  Flame,
  Search,
  History,
  Sparkles,
  UtensilsCrossed,
} from 'lucide-react';

export function isDrinkItem(item) {
  if (item?.itemType === 'drink') return true;
  if (item?.itemType === 'food') return false;
  const cat = (item?.categorySnapshot || '').toLowerCase();
  const name = (item?.nameSnapshot || '').toLowerCase();
  const drinkKeywords = [
    'drink',
    'beverage',
    'coffee',
    'tea',
    'juice',
    'smoothie',
    'macchiato',
    'latte',
    'espresso',
    'cappuccino',
    'water',
    'soda',
    'cocktail',
    'mocktail',
    'milk',
    'shake',
  ];
  return drinkKeywords.some((k) => cat.includes(k) || name.includes(k));
}

export default function BaristaBoardPage() {
  const [activeTab, setActiveTab] = useState('queue'); // 'queue' | 'history'
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(Date.now());

  // History State
  const [historyOrders, setHistoryOrders] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyTimeFilter, setHistoryTimeFilter] = useState('all'); // 'all' | 'today' | 'week'
  const [historyCategoryFilter, setHistoryCategoryFilter] = useState('all'); // 'all' | 'drinks' | 'food'

  const { on, connected } = useSocket();

  // Load and refresh active orders
  const loadOrders = async () => {
    try {
      const res = await ordersApi.getActive();
      // Exclude lateEntry orders from board
      const activeOrders = (res.data?.data?.orders || []).filter(
        (o) => !o.lateEntry && o.status === 'open'
      );
      setOrders(activeOrders);
    } catch (err) {
      console.error('Failed to load barista orders', err);
    } finally {
      setLoading(false);
    }
  };

  // Load Order History for Barista (Loads ALL past orders with station filter)
  const loadHistory = async () => {
    try {
      setHistoryLoading(true);
      const res = await ordersApi.getHistory({ limit: 100 });
      const allPast = res.data?.data?.orders || [];
      setHistoryOrders(allPast);
    } catch (err) {
      console.error('Failed to load barista order history', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();

    // 1-second interval to update elapsed timers
    const timerInterval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    // Socket.IO event subscriptions
    const unsubNew = on('order:new', ({ order }) => {
      if (!order.lateEntry) {
        if ((order.items || []).some(isDrinkItem)) {
          soundPlayer.playAlert();
        }
        setOrders((prev) => {
          if (prev.some((o) => o._id === order._id)) return prev;
          return [...prev, order];
        });
      }
    });

    const unsubItemsAdded = on('order:items-added', ({ order, addedItems }) => {
      if ((addedItems || []).some(isDrinkItem)) {
        soundPlayer.playAlert();
      }
      setOrders((prev) =>
        prev.map((o) => (o._id === order._id ? order : o))
      );
    });

    const unsubStatusChanged = on('item:status-changed', ({ orderId, itemId, status }) => {
      setOrders((prev) =>
        prev.map((o) => {
          if (o._id === orderId) {
            return {
              ...o,
              items: o.items.map((i) => (i._id === itemId ? { ...i, status } : i)),
            };
          }
          return o;
        })
      );
    });

    const unsubClosed = on('order:closed', ({ orderId }) => {
      setOrders((prev) => prev.filter((o) => o._id !== orderId));
      if (activeTab === 'history') {
        loadHistory();
      }
    });

    // Re-fetch orders when connection is restored
    const unsubReconnect = on('reconnect', () => {
      console.log('[Barista] Reconnected. Re-fetching active barista board...');
      loadOrders();
      if (activeTab === 'history') loadHistory();
    });

    return () => {
      clearInterval(timerInterval);
      unsubNew();
      unsubItemsAdded();
      unsubStatusChanged();
      unsubClosed();
      unsubReconnect();
    };
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'history') {
      loadHistory();
    }
  }, [activeTab]);

  // One-tap status update
  const handleItemStatusChange = async (orderId, itemId, newStatus) => {
    try {
      // Optimistic UI update
      setOrders((prev) =>
        prev.map((o) => {
          if (o._id === orderId) {
            return {
              ...o,
              items: o.items.map((i) => (i._id === itemId ? { ...i, status: newStatus } : i)),
            };
          }
          return o;
        })
      );

      await ordersApi.updateItemStatus(orderId, itemId, newStatus);
    } catch (err) {
      console.error('Failed to update status', err);
      // Revert from server on failure
      await loadOrders();
    }
  };

  // Bulk action: Mark all DRINK items in an order to 'preparing' or 'ready'
  const handleBulkStatusChange = async (order, targetStatus) => {
    try {
      const drinkItems = order.items.filter(isDrinkItem);
      const itemsToUpdate = drinkItems.filter((item) => {
        if (targetStatus === 'preparing') return item.status === 'pending';
        if (targetStatus === 'ready') return item.status === 'preparing' || item.status === 'pending';
        return false;
      });

      for (const item of itemsToUpdate) {
        if (targetStatus === 'ready' && item.status === 'pending') {
          await ordersApi.updateItemStatus(order._id, item._id, 'preparing');
        }
        await ordersApi.updateItemStatus(order._id, item._id, targetStatus);
      }

      await loadOrders();
    } catch (err) {
      console.error('Failed bulk status update', err);
    }
  };

  // Calculate elapsed time (drinks pacing: urgent at 10m, warning at 5m)
  const getElapsedInfo = (createdAt) => {
    const elapsedMs = currentTime - new Date(createdAt).getTime();
    const elapsedMinutes = Math.floor(elapsedMs / 60000);
    const elapsedSeconds = Math.floor((elapsedMs % 60000) / 1000);

    const formattedTime = `${elapsedMinutes}m ${elapsedSeconds.toString().padStart(2, '0')}s`;

    if (elapsedMinutes >= 10) {
      return {
        formattedTime,
        color: 'rose',
        cardBorder: 'border-rose-400 bg-rose-50/25 shadow-rose-500/10 shadow-lg',
        badgeBg: 'bg-rose-600 text-white animate-pulse',
        isUrgent: true,
      };
    }
    if (elapsedMinutes >= 5) {
      return {
        formattedTime,
        color: 'amber',
        cardBorder: 'border-amber-400 bg-amber-50/15 shadow-md',
        badgeBg: 'bg-amber-500 text-white',
        isUrgent: false,
      };
    }
    return {
      formattedTime,
      color: 'emerald',
      cardBorder: 'border-gray-200/90 bg-white shadow-xs',
      badgeBg: 'bg-amber-100 text-amber-900',
      isUrgent: false,
    };
  };

  // Filter orders to ONLY include orders that have DRINK items
  const activeDrinkOrders = orders
    .map((order) => ({
      ...order,
      items: (order.items || []).filter(isDrinkItem),
    }))
    .filter((order) => order.items.length > 0);

  // Filter History Orders by search & date range and station category
  const filteredHistory = historyOrders
    .map((order) => {
      let items = order.items || [];
      if (historyCategoryFilter === 'drinks') {
        items = items.filter(isDrinkItem);
      } else if (historyCategoryFilter === 'food') {
        items = items.filter((i) => !isDrinkItem(i));
      }
      return { ...order, displayItems: items };
    })
    .filter((order) => {
      if (order.displayItems.length === 0) return false;

      const q = historySearch.toLowerCase();
      const matchesQuery =
        !q ||
        order.orderNumber.toString().includes(q) ||
        (order.table?.name || '').toLowerCase().includes(q) ||
        (order.waiter?.name || '').toLowerCase().includes(q) ||
        (order.waiter?.username || '').toLowerCase().includes(q) ||
        order.displayItems.some((i) => i.nameSnapshot.toLowerCase().includes(q));

      if (!matchesQuery) return false;

      if (historyTimeFilter === 'today') {
        const orderDate = new Date(order.createdAt).toDateString();
        const today = new Date().toDateString();
        return orderDate === today;
      }

      if (historyTimeFilter === 'week') {
        const orderTime = new Date(order.createdAt).getTime();
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        return orderTime >= weekAgo;
      }

      return true;
    });

  return (
    <div className="space-y-6">
      {/* Barista Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-gradient-to-r from-stone-900 via-amber-950 to-stone-900 text-white p-6 rounded-3xl shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-600 flex items-center justify-center text-white shadow-lg shadow-amber-600/30">
            <Coffee className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-black tracking-tight">
                Barista Display System (BDS)
              </h2>
              <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-400 font-extrabold text-[11px] border border-amber-500/30 uppercase tracking-wider">
                Coffee & Beverage Bar
              </span>
            </div>
            <p className="text-xs text-amber-200/70 font-medium">
              Live coffee, macchiato, tea & beverage drink ticket queue
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Socket Connection Pill */}
          <div
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold ${
              connected
                ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800'
                : 'bg-rose-950/80 text-rose-400 border border-rose-800 animate-pulse'
            }`}
          >
            {connected ? (
              <>
                <Wifi className="w-3.5 h-3.5" /> Live Connected
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5" /> Reconnecting...
              </>
            )}
          </div>

          <button
            onClick={() => (activeTab === 'queue' ? loadOrders() : loadHistory())}
            className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-amber-100 transition-colors active:scale-95"
            title="Force refresh"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs: Live Drink Queue vs Drink History */}
      <div className="flex items-center justify-between border-b border-gray-200 pb-3 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('queue')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-black transition-all ${
              activeTab === 'queue'
                ? 'bg-amber-700 text-white shadow-md shadow-amber-700/20'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Coffee className="w-4 h-4" />
            Live Drink Queue
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                activeTab === 'queue' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
              }`}
            >
              {activeDrinkOrders.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('history');
              loadHistory();
            }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-black transition-all ${
              activeTab === 'history'
                ? 'bg-amber-700 text-white shadow-md shadow-amber-700/20'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <History className="w-4 h-4" />
            Order History
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                activeTab === 'history' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
              }`}
            >
              {historyOrders.length}
            </span>
          </button>
        </div>

        {activeTab === 'history' && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto">
            {/* Category Filter Pills */}
            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setHistoryCategoryFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  historyCategoryFilter === 'all'
                    ? 'bg-white text-gray-900 shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                All Orders
              </button>
              <button
                type="button"
                onClick={() => setHistoryCategoryFilter('drinks')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                  historyCategoryFilter === 'drinks'
                    ? 'bg-white text-amber-800 shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Coffee className="w-3 h-3" /> Drinks Only
              </button>
              <button
                type="button"
                onClick={() => setHistoryCategoryFilter('food')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                  historyCategoryFilter === 'food'
                    ? 'bg-white text-orange-800 shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <UtensilsCrossed className="w-3 h-3" /> Food Only
              </button>
            </div>

            <div className="relative flex-1 sm:w-56">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-3" />
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search history..."
                className="w-full pl-9 pr-3.5 py-2 bg-white border border-gray-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>
            <select
              value={historyTimeFilter}
              onChange={(e) => setHistoryTimeFilter(e.target.value)}
              className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            >
              <option value="all">All Dates</option>
              <option value="today">Today Only</option>
              <option value="week">Past 7 Days</option>
            </select>
          </div>
        )}
      </div>

      {/* ===================== VIEW 1: LIVE DRINK QUEUE ===================== */}
      {activeTab === 'queue' && (
        <>
          {loading ? (
            <div className="flex justify-center py-24">
              <div className="w-10 h-10 border-4 border-amber-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : activeDrinkOrders.length === 0 ? (
            <div className="text-center py-24 bg-white rounded-3xl border border-dashed border-gray-300 shadow-xs">
              <Coffee className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-gray-900 mb-1">Barista Queue is Clear!</h3>
              <p className="text-xs text-gray-500 max-w-sm mx-auto">
                No active drink orders at the moment. Coffee, macchiatos, and beverages ordered by waiters will chime and appear here in real time.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {activeDrinkOrders.map((order) => {
                const elapsed = getElapsedInfo(order.createdAt);
                const pendingCount = order.items.filter((i) => i.status === 'pending').length;
                const preparingCount = order.items.filter((i) => i.status === 'preparing').length;

                return (
                  <div
                    key={order._id}
                    className={`rounded-3xl border-2 p-5 flex flex-col justify-between transition-all ${elapsed.cardBorder}`}
                  >
                    <div>
                      {/* Ticket Header */}
                      <div className="flex items-start justify-between gap-2 pb-3 border-b border-gray-100 mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-lg font-black text-gray-900">
                              Order #{order.orderNumber}
                            </span>
                            {elapsed.isUrgent && (
                              <span className="p-1 rounded-md bg-rose-100 text-rose-700 animate-bounce">
                                <Flame className="w-4 h-4" />
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-bold text-gray-600 mt-0.5">
                            {order.table?.name || 'Table'} • Waiter @{order.waiter?.username || 'waiter'}
                          </p>
                        </div>

                        {/* Elapsed Timer Badge */}
                        <div
                          className={`px-3 py-1 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-xs ${elapsed.badgeBg}`}
                        >
                          <Clock className="w-3.5 h-3.5" />
                          {elapsed.formattedTime}
                        </div>
                      </div>

                      {/* Ticket Items List (Only Drink Items) */}
                      <div className="space-y-3">
                        {order.items.map((item) => (
                          <div
                            key={item._id}
                            className={`p-3 rounded-2xl border text-xs flex flex-col gap-2 ${
                              item.status === 'ready'
                                ? 'bg-emerald-50/70 border-emerald-200'
                                : item.status === 'preparing'
                                ? 'bg-amber-50/70 border-amber-200'
                                : item.status === 'served'
                                ? 'bg-gray-100/70 border-gray-200 opacity-60'
                                : item.status === 'cancelled'
                                ? 'bg-rose-50 border-rose-200 opacity-60 line-through'
                                : 'bg-white border-gray-200 shadow-2xs'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span className="font-extrabold text-gray-900 text-sm leading-tight block">
                                  {item.quantity}x {item.nameSnapshot}
                                </span>
                                {item.note && (
                                  <span className="inline-block px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 font-bold text-[11px] mt-1">
                                    Note: {item.note}
                                  </span>
                                )}
                              </div>

                              <span
                                className={`px-2 py-0.5 rounded-md font-black text-[10px] uppercase ${
                                  item.status === 'ready'
                                    ? 'bg-emerald-600 text-white'
                                    : item.status === 'preparing'
                                    ? 'bg-amber-600 text-white'
                                    : item.status === 'served'
                                    ? 'bg-gray-300 text-gray-700'
                                    : item.status === 'cancelled'
                                    ? 'bg-rose-200 text-rose-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {item.status}
                              </span>
                            </div>

                            {/* One-Tap Action Buttons */}
                            <div className="flex items-center gap-2 pt-1">
                              {item.status === 'pending' && (
                                <button
                                  onClick={() => handleItemStatusChange(order._id, item._id, 'preparing')}
                                  className="w-full py-2 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all"
                                >
                                  <Coffee className="w-3.5 h-3.5" /> Start Brewing
                                </button>
                              )}

                              {item.status === 'preparing' && (
                                <button
                                  onClick={() => handleItemStatusChange(order._id, item._id, 'ready')}
                                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all"
                                >
                                  <Check className="w-4 h-4 stroke-[3]" /> Mark Ready
                                </button>
                              )}

                              {item.status === 'ready' && (
                                <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1 py-1">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Ready at bar counter
                                </span>
                              )}

                              {item.status === 'served' && (
                                <span className="text-[11px] font-medium text-gray-500 py-1">
                                  ✓ Delivered to customer
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Ticket Footer Quick Actions */}
                    <div className="mt-4 pt-3 border-t border-gray-100 flex items-center gap-2">
                      {pendingCount > 0 && (
                        <button
                          onClick={() => handleBulkStatusChange(order, 'preparing')}
                          className="flex-1 py-2 bg-amber-50 text-amber-800 hover:bg-amber-100 font-bold rounded-xl text-xs transition-colors"
                        >
                          Brew All ({pendingCount})
                        </button>
                      )}
                      {preparingCount > 0 && (
                        <button
                          onClick={() => handleBulkStatusChange(order, 'ready')}
                          className="flex-1 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold rounded-xl text-xs transition-colors"
                        >
                          All Ready ({preparingCount})
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ===================== VIEW 2: BARISTA ORDER HISTORY ===================== */}
      {activeTab === 'history' && (
        <div>
          {historyLoading ? (
            <div className="flex justify-center py-24">
              <div className="w-10 h-10 border-4 border-amber-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-300">
              <Coffee className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-gray-900 mb-1">No past orders found</h3>
              <p className="text-xs text-gray-500">
                Completed tickets and closed orders will be archived here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredHistory.map((order) => {
                const drinksCount = order.displayItems.filter(isDrinkItem).reduce((a, b) => a + b.quantity, 0);
                const foodCount = order.displayItems.filter((i) => !isDrinkItem(i)).reduce((a, b) => a + b.quantity, 0);
                const totalItemsCount = drinksCount + foodCount;

                const orderTimeStr = new Date(order.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                });
                const orderDateStr = new Date(order.createdAt).toLocaleDateString([], {
                  month: 'short',
                  day: 'numeric',
                });

                return (
                  <div
                    key={order._id}
                    className="bg-white rounded-3xl p-5 border border-gray-200 shadow-xs flex flex-col justify-between hover:border-amber-300 transition-all"
                  >
                    <div>
                      {/* History Card Header */}
                      <div className="flex items-start justify-between pb-3 border-b border-gray-100 mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-base font-black text-gray-900">
                              Order #{order.orderNumber}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                                order.status === 'closed'
                                  ? 'bg-gray-100 text-gray-700'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {order.status}
                            </span>
                          </div>
                          <div className="text-xs font-semibold text-gray-600 mt-1 flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-gray-800">{order.table?.name || 'Table'}</span>
                            <span className="text-gray-300">•</span>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-50 text-amber-900 font-bold text-[11px] border border-amber-200/60">
                              Server: {order.waiter?.name || order.waiter?.username || 'Staff'}
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-xs font-bold text-gray-700 block">
                            {orderTimeStr}
                          </span>
                          <span className="text-[11px] text-gray-400 font-medium">
                            {orderDateStr}
                          </span>
                        </div>
                      </div>

                      {/* Items List */}
                      <div className="space-y-2">
                        {order.displayItems.map((item, idx) => {
                          const isDrink = isDrinkItem(item);
                          return (
                            <div
                              key={idx}
                              className="flex items-center justify-between text-xs py-1.5 border-b border-gray-50 last:border-0"
                            >
                              <div className="flex-1 pr-2">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                                      isDrink
                                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                        : 'bg-orange-100 text-orange-800 border border-orange-200'
                                    }`}
                                  >
                                    {isDrink ? '☕ Drink' : '🍽️ Food'}
                                  </span>
                                  <span className="font-bold text-gray-900">
                                    {item.quantity}x {item.nameSnapshot}
                                  </span>
                                </div>
                                {item.note && (
                                  <span className="block text-[11px] text-amber-700 italic ml-1 mt-0.5">
                                    Note: {item.note}
                                  </span>
                                )}
                              </div>
                              <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase shrink-0 ${
                                  item.status === 'served'
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : item.status === 'cancelled'
                                    ? 'bg-rose-50 text-rose-700 line-through'
                                    : 'bg-gray-100 text-gray-600'
                                }`}
                              >
                                {item.status}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500 font-medium">
                      <span className="font-bold text-gray-700">
                        Total: {totalItemsCount} item{totalItemsCount !== 1 ? 's' : ''}{' '}
                        <span className="text-gray-400 font-normal">
                          ({drinksCount} drink{drinksCount !== 1 ? 's' : ''}, {foodCount} food)
                        </span>
                      </span>
                      <span className="text-[11px] text-gray-400">
                        {order.updatedAt
                          ? `Finalized ${new Date(order.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                          : ''}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

