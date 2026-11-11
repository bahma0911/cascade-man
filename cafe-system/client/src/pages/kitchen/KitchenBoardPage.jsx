import React, { useState, useEffect } from 'react';
import { ordersApi } from '../../api/client.js';
import { useSocket } from '../../context/SocketContext.jsx';
import { STRINGS } from '../../locales/strings.js';
import { soundPlayer } from '../../utils/sound.js';
import {
  ChefHat,
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
  Calendar,
  UtensilsCrossed,
  Layers,
  ArrowRight,
} from 'lucide-react';

export function isFoodItem(item) {
  if (item?.itemType === 'drink') return false;
  if (item?.itemType === 'food') return true;
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
  return !drinkKeywords.some((k) => cat.includes(k) || name.includes(k));
}

export default function KitchenBoardPage() {
  const [activeTab, setActiveTab] = useState('queue'); // 'queue' | 'history'
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(Date.now());

  // History State
  const [historyOrders, setHistoryOrders] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyTimeFilter, setHistoryTimeFilter] = useState('all'); // 'all' | 'today' | 'week'

  const { on, connected } = useSocket();

  // Load and refresh active orders
  const loadOrders = async () => {
    try {
      const res = await ordersApi.getActive();
      // Exclude lateEntry orders from kitchen board (Rule 6)
      const kitchenOrders = (res.data?.data?.orders || []).filter(
        (o) => !o.lateEntry && o.status === 'open'
      );
      setOrders(kitchenOrders);
    } catch (err) {
      console.error('Failed to load kitchen orders', err);
    } finally {
      setLoading(false);
    }
  };

  // Load Order History for Kitchen
  const loadHistory = async () => {
    try {
      setHistoryLoading(true);
      const res = await ordersApi.getHistory({ limit: 60 });
      const allPast = res.data?.data?.orders || [];
      // Filter orders to only those containing food items
      const pastFood = allPast
        .map((order) => ({
          ...order,
          items: (order.items || []).filter(isFoodItem),
        }))
        .filter((order) => order.items.length > 0);
      setHistoryOrders(pastFood);
    } catch (err) {
      console.error('Failed to load kitchen order history', err);
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
        // Only trigger alert if this order contains food items
        if ((order.items || []).some(isFoodItem)) {
          soundPlayer.playAlert();
        }
        setOrders((prev) => {
          if (prev.some((o) => o._id === order._id)) return prev;
          return [...prev, order];
        });
      }
    });

    const unsubItemsAdded = on('order:items-added', ({ order, addedItems }) => {
      if ((addedItems || []).some(isFoodItem)) {
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
      console.log('[Kitchen] Reconnected. Re-fetching active kitchen board...');
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

  // Bulk action: Mark all FOOD items in an order to 'preparing' or 'ready'
  const handleBulkStatusChange = async (order, targetStatus) => {
    try {
      const foodItems = order.items.filter(isFoodItem);
      const itemsToUpdate = foodItems.filter((item) => {
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

  // Calculate elapsed time and severity color
  const getElapsedInfo = (createdAt) => {
    const elapsedMs = currentTime - new Date(createdAt).getTime();
    const elapsedMinutes = Math.floor(elapsedMs / 60000);
    const elapsedSeconds = Math.floor((elapsedMs % 60000) / 1000);

    const formattedTime = `${elapsedMinutes}m ${elapsedSeconds.toString().padStart(2, '0')}s`;

    if (elapsedMinutes >= 20) {
      return {
        formattedTime,
        color: 'rose',
        cardBorder: 'border-rose-400 bg-rose-50/20 shadow-rose-500/10 shadow-lg',
        badgeBg: 'bg-rose-600 text-white animate-pulse',
        isUrgent: true,
      };
    }
    if (elapsedMinutes >= 10) {
      return {
        formattedTime,
        color: 'amber',
        cardBorder: 'border-amber-400 bg-amber-50/10 shadow-md',
        badgeBg: 'bg-amber-500 text-white',
        isUrgent: false,
      };
    }
    return {
      formattedTime,
      color: 'emerald',
      cardBorder: 'border-gray-200/90 bg-white shadow-xs',
      badgeBg: 'bg-emerald-100 text-emerald-800',
      isUrgent: false,
    };
  };

  // Filter orders to ONLY include orders that have FOOD items
  const activeFoodOrders = orders
    .map((order) => ({
      ...order,
      items: (order.items || []).filter(isFoodItem),
    }))
    .filter((order) => order.items.length > 0);

  // Filter History Orders by search & date range
  const filteredHistory = historyOrders.filter((order) => {
    const q = historySearch.toLowerCase();
    const matchesQuery =
      !q ||
      order.orderNumber.toString().includes(q) ||
      (order.table?.name || '').toLowerCase().includes(q) ||
      (order.waiter?.name || '').toLowerCase().includes(q) ||
      order.items.some((i) => i.nameSnapshot.toLowerCase().includes(q));

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
      {/* Kitchen Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-gray-900 text-white p-6 rounded-3xl shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-orange-500 flex items-center justify-center text-white shadow-lg shadow-orange-500/30">
            <ChefHat className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-black tracking-tight">
                Kitchen Display System (KDS)
              </h2>
              <span className="px-2 py-0.5 rounded-md bg-orange-500/20 text-orange-400 font-extrabold text-[11px] border border-orange-500/30 uppercase tracking-wider">
                Food Station
              </span>
            </div>
            <p className="text-xs text-gray-400 font-medium">
              Food orders queue • Automatic barista routing for beverages
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
            className="p-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors active:scale-95"
            title="Force refresh"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs: Live Queue vs Order History */}
      <div className="flex items-center justify-between border-b border-gray-200 pb-3 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('queue')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-black transition-all ${
              activeTab === 'queue'
                ? 'bg-orange-600 text-white shadow-md shadow-orange-600/20'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <ChefHat className="w-4 h-4" />
            Live Food Queue
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                activeTab === 'queue' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
              }`}
            >
              {activeFoodOrders.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-black transition-all ${
              activeTab === 'history'
                ? 'bg-orange-600 text-white shadow-md shadow-orange-600/20'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <History className="w-4 h-4" />
            Order History
          </button>
        </div>

        {activeTab === 'history' && (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-3" />
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search history by order, table, food..."
                className="w-full pl-9 pr-3.5 py-2 bg-white border border-gray-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              />
            </div>
            <select
              value={historyTimeFilter}
              onChange={(e) => setHistoryTimeFilter(e.target.value)}
              className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
            >
              <option value="all">All Dates</option>
              <option value="today">Today Only</option>
              <option value="week">Past 7 Days</option>
            </select>
          </div>
        )}
      </div>

      {/* ===================== VIEW 1: LIVE FOOD QUEUE ===================== */}
      {activeTab === 'queue' && (
        <>
          {loading ? (
            <div className="flex justify-center py-24">
              <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : activeFoodOrders.length === 0 ? (
            <div className="text-center py-24 bg-white rounded-3xl border border-dashed border-gray-300 shadow-xs">
              <ChefHat className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-gray-900 mb-1">Kitchen Queue is Clear!</h3>
              <p className="text-xs text-gray-500 max-w-sm mx-auto">
                All food orders have been prepared and served. New food items ordered by waiters will chime and appear here automatically.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {activeFoodOrders.map((order) => {
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

                      {/* Ticket Items List (Only Food Items) */}
                      <div className="space-y-3">
                        {order.items.map((item) => (
                          <div
                            key={item._id}
                            className={`p-3 rounded-2xl border text-xs flex flex-col gap-2 ${
                              item.status === 'ready'
                                ? 'bg-emerald-50/70 border-emerald-200'
                                : item.status === 'preparing'
                                ? 'bg-blue-50/60 border-blue-200'
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
                                    ? 'bg-blue-600 text-white'
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
                                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all"
                                >
                                  <Play className="w-3.5 h-3.5 fill-current" /> Start Preparing
                                </button>
                              )}

                              {item.status === 'preparing' && (
                                <button
                                  onClick={() => handleItemStatusChange(order._id, item._id, 'ready')}
                                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all"
                                >
                                  <Check className="w-4 h-4 stroke-[3]" /> Mark as Ready
                                </button>
                              )}

                              {item.status === 'ready' && (
                                <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1 py-1">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Waiting for waiter pickup
                                </span>
                              )}

                              {item.status === 'served' && (
                                <span className="text-[11px] font-medium text-gray-500 py-1">
                                  ✓ Delivered to table
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
                          className="flex-1 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold rounded-xl text-xs transition-colors"
                        >
                          Start All ({pendingCount})
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

      {/* ===================== VIEW 2: KITCHEN ORDER HISTORY ===================== */}
      {activeTab === 'history' && (
        <div>
          {historyLoading ? (
            <div className="flex justify-center py-24">
              <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-300">
              <History className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-gray-900 mb-1">No past food orders found</h3>
              <p className="text-xs text-gray-500">
                Completed food tickets and closed orders will be archived here for reference.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredHistory.map((order) => {
                const totalFoodItems = order.items.reduce((acc, i) => acc + i.quantity, 0);
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
                    className="bg-white rounded-3xl p-5 border border-gray-200 shadow-xs flex flex-col justify-between hover:border-orange-300 transition-all"
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
                          <p className="text-xs font-semibold text-gray-600 mt-0.5">
                            {order.table?.name || 'Table'} • Waiter @{order.waiter?.username || 'waiter'}
                          </p>
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

                      {/* Prepared Food Items List */}
                      <div className="space-y-2">
                        {order.items.map((item, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between text-xs py-1.5 border-b border-gray-50 last:border-0"
                          >
                            <div>
                              <span className="font-bold text-gray-900">
                                {item.quantity}x {item.nameSnapshot}
                              </span>
                              {item.note && (
                                <span className="block text-[11px] text-amber-700 italic">
                                  Note: {item.note}
                                </span>
                              )}
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
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
                        ))}
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500 font-medium">
                      <span>Total: {totalFoodItems} food portion{totalFoodItems > 1 ? 's' : ''}</span>
                      <span className="text-[11px] text-gray-400">
                        {order.updatedAt ? `Finalized ${new Date(order.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
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
