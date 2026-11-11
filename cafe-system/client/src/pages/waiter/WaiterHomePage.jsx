import React, { useState, useEffect } from 'react';
import { tablesApi, menuApi, ordersApi } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSocket } from '../../context/SocketContext.jsx';
import { STRINGS } from '../../locales/strings.js';
import { soundPlayer } from '../../utils/sound.js';
import Modal from '../../components/common/Modal.jsx';
import {
  Grid,
  ShoppingBag,
  Plus,
  Minus,
  Trash2,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Search,
  Check,
  Send,
  Coffee,
  RotateCcw,
  Sparkles,
  Layers,
  ArrowRight,
  User,
  Banknote,
  Smartphone,
} from 'lucide-react';

export default function WaiterHomePage() {
  const { user } = useAuth();
  const { on, connected } = useSocket();

  // Navigation tabs: 'tables' | 'my-orders' | 'late-entry'
  const [activeTab, setActiveTab] = useState('tables');

  const [tables, setTables] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeOrders, setActiveOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  // New Order / Cart State
  const [selectedTable, setSelectedTable] = useState(null);
  const [cart, setCart] = useState([]); // [{ menuItem, quantity, note }]
  const [selectedCategory, setSelectedCategory] = useState('');
  const [menuSearch, setMenuSearch] = useState('');
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [orderError, setOrderError] = useState('');

  // Selected Order Detail View
  const [viewingOrder, setViewingOrder] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Payment & Order Completion Modal State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentOrder, setPaymentOrder] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // Cancellation Modal State (Cancel Entire Order)
  const [isCancelOrderModalOpen, setIsCancelOrderModalOpen] = useState(false);
  const [orderToCancel, setOrderToCancel] = useState(null);
  const [cancelOrderReason, setCancelOrderReason] = useState('');
  const [submittingCancelOrder, setSubmittingCancelOrder] = useState(false);

  // Add items to existing order modal
  const [isAddItemsModalOpen, setIsAddItemsModalOpen] = useState(false);
  const [additionalCart, setAdditionalCart] = useState([]);

  // Late Entry Form State
  const [lateTableId, setLateTableId] = useState('');
  const [lateTime, setLateTime] = useState('');
  const [lateCart, setLateCart] = useState([]);

  useEffect(() => {
    loadInitialData();

    // Socket.IO event subscriptions for real-time table & order synchronization
    const unsubNew = on('order:new', ({ order }) => {
      setActiveOrders((prev) => {
        if (prev.some((o) => o._id === order._id)) return prev;
        return [...prev, order];
      });
    });

    const unsubItemsAdded = on('order:items-added', ({ order }) => {
      setActiveOrders((prev) =>
        prev.map((o) => (o._id === order._id ? order : o))
      );
    });

    const unsubStatusChanged = on('item:status-changed', ({ orderId, itemId, status }) => {
      setActiveOrders((prev) =>
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
      setActiveOrders((prev) => prev.filter((o) => String(o._id) !== String(orderId)));
      loadActiveOrders();
    });

    const unsubCancelled = on('order:cancelled', ({ orderId }) => {
      setActiveOrders((prev) => prev.filter((o) => String(o._id) !== String(orderId)));
      loadActiveOrders();
    });

    // Reconnect handler: re-fetch active orders immediately upon reconnection
    const unsubReconnect = on('reconnect', () => {
      console.log('[Waiter] Reconnected. Re-fetching active orders...');
      loadActiveOrders();
    });

    return () => {
      unsubNew();
      unsubItemsAdded();
      unsubStatusChanged();
      unsubClosed();
      unsubCancelled();
      unsubReconnect();
    };
  }, []);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const [tablesRes, menuRes, ordersRes] = await Promise.all([
        tablesApi.getAll(),
        menuApi.getAll(),
        ordersApi.getActive(),
      ]);

      setTables(tablesRes.data?.data?.tables || []);
      setMenuItems(menuRes.data?.data?.items || []);
      setCategories(menuRes.data?.data?.categories || []);
      setActiveOrders(ordersRes.data?.data?.orders || []);
    } catch (err) {
      console.error('Failed to load waiter data', err);
    } finally {
      setLoading(false);
    }
  };

  const loadActiveOrders = async () => {
    try {
      const res = await ordersApi.getActive();
      const freshOrders = res.data?.data?.orders || [];
      setActiveOrders(freshOrders);

      // Check if any order currently has ready items and trigger sound
      const hasReadyItems = freshOrders.some((o) =>
        o.items.some((i) => i.status === 'ready')
      );
      if (hasReadyItems) {
        soundPlayer.playReadyBell();
      }

      // If viewing an order in modal, update its state
      if (viewingOrder) {
        const updated = freshOrders.find((o) => o._id === viewingOrder._id);
        if (updated) setViewingOrder(updated);
      }
    } catch (err) {
      console.warn('Silent refresh of active orders failed', err);
    }
  };

  // Find active order for a table
  const getOrderForTable = (tableId) => {
    return activeOrders.find(
      (o) => String(o.table?._id || o.table) === String(tableId) && o.status === 'open'
    );
  };

  // Handle table tap
  const handleTableClick = (table) => {
    const existingOrder = getOrderForTable(table._id);
    if (existingOrder) {
      setViewingOrder(existingOrder);
      setIsDetailModalOpen(true);
    } else {
      setSelectedTable(table);
      setCart([]);
      setOrderError('');
      setIsOrderModalOpen(true);
    }
  };

  // Cart operations
  const addToCart = (item) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.menuItem._id === item._id);
      if (existing) {
        return prev.map((c) =>
          c.menuItem._id === item._id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [...prev, { menuItem: item, quantity: 1, note: '' }];
    });
  };

  const updateCartQty = (itemId, delta) => {
    setCart((prev) =>
      prev
        .map((c) => {
          if (c.menuItem._id === itemId) {
            const newQty = c.quantity + delta;
            return newQty > 0 ? { ...c, quantity: newQty } : null;
          }
          return c;
        })
        .filter(Boolean)
    );
  };

  const updateCartNote = (itemId, note) => {
    setCart((prev) =>
      prev.map((c) => (c.menuItem._id === itemId ? { ...c, note } : c))
    );
  };

  const cartTotal = cart.reduce(
    (sum, c) => sum + c.menuItem.price * c.quantity,
    0
  );

  // Submit New Order
  const handleSendOrder = async () => {
    if (cart.length === 0 || !selectedTable) return;

    try {
      setSubmittingOrder(true);
      setOrderError('');

      const items = cart.map((c) => ({
        menuItemId: c.menuItem._id,
        quantity: c.quantity,
        note: c.note.trim(),
      }));

      await ordersApi.create({
        tableId: selectedTable._id,
        items,
        lateEntry: false,
      });

      setIsOrderModalOpen(false);
      setCart([]);
      await loadActiveOrders();
    } catch (err) {
      setOrderError(
        err.response?.data?.error?.message ||
          err.message ||
          'Failed to send order'
      );
    } finally {
      setSubmittingOrder(false);
    }
  };

  // Add Items to Existing Open Order
  const handleAddItemsSubmit = async () => {
    if (additionalCart.length === 0 || !viewingOrder) return;
    try {
      const items = additionalCart.map((c) => ({
        menuItemId: c.menuItem._id,
        quantity: c.quantity,
        note: c.note.trim(),
      }));

      await ordersApi.addItems(viewingOrder._id, { items });
      setIsAddItemsModalOpen(false);
      setAdditionalCart([]);
      await loadActiveOrders();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to add items');
    }
  };

  // Item status update (e.g. mark served)
  const handleMarkServed = async (orderId, itemId) => {
    try {
      await ordersApi.updateItemStatus(orderId, itemId, 'served');
      await loadActiveOrders();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to update status');
    }
  };

  // Serve all items in an order at once
  const handleServeAllItems = async (order) => {
    const unserved = (order?.items || []).filter(
      (i) => i.status !== 'served' && i.status !== 'cancelled'
    );
    if (unserved.length === 0) return;
    try {
      for (const item of unserved) {
        await ordersApi.updateItemStatus(order._id, item._id, 'served');
      }
      await loadActiveOrders();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to serve items');
    }
  };

  // Cancel item
  const handleCancelItem = async (orderId, itemId) => {
    const reason = prompt('Please enter cancellation reason:') || 'Cancelled by waiter';
    try {
      await ordersApi.cancelItem(orderId, itemId, reason);
      await loadActiveOrders();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to cancel item');
    }
  };

  // Payment & Complete Order Flow
  const handleOpenPayment = (order) => {
    setPaymentOrder(order || viewingOrder);
    setPaymentMethod('cash');
    setIsPaymentModalOpen(true);
  };

  const handleConfirmPayment = async () => {
    if (!paymentOrder) return;
    setSubmittingPayment(true);
    try {
      await ordersApi.close(paymentOrder._id, {
        paymentMethod,
        autoServeReady: true,
      });
      setIsPaymentModalOpen(false);
      setIsDetailModalOpen(false);
      setActiveOrders((prev) => prev.filter((o) => String(o._id) !== String(paymentOrder._id)));
      await loadActiveOrders();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to complete order');
    } finally {
      setSubmittingPayment(false);
    }
  };

  // Cancel Entire Order Flow
  const handleOpenCancelOrder = (order) => {
    setOrderToCancel(order || viewingOrder);
    setCancelOrderReason('');
    setIsCancelOrderModalOpen(true);
  };

  const handleConfirmCancelOrder = async () => {
    if (!orderToCancel) return;
    setSubmittingCancelOrder(true);
    try {
      await ordersApi.cancel(orderToCancel._id, {
        reason: cancelOrderReason || 'Cancelled by staff',
      });
      setIsCancelOrderModalOpen(false);
      setIsDetailModalOpen(false);
      setActiveOrders((prev) => prev.filter((o) => String(o._id) !== String(orderToCancel._id)));
      await loadActiveOrders();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to cancel order');
    } finally {
      setSubmittingCancelOrder(false);
    }
  };

  // Late Entry Submit
  const handleLateEntrySubmit = async (e) => {
    e.preventDefault();
    if (!lateTableId || lateCart.length === 0) {
      alert('Please select table and at least one item');
      return;
    }

    try {
      const items = lateCart.map((c) => ({
        menuItemId: c.menuItem._id,
        quantity: c.quantity,
        note: c.note.trim(),
      }));

      await ordersApi.create({
        tableId: lateTableId,
        items,
        lateEntry: true,
        customCreatedAt: lateTime ? new Date(lateTime).toISOString() : null,
      });

      alert('Late entry order recorded and stock deducted successfully');
      setLateCart([]);
      setLateTableId('');
      setLateTime('');
      setActiveTab('tables');
      await loadActiveOrders();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to submit late entry');
    }
  };

  // Filtered menu items for order builder
  const filteredMenu = menuItems.filter(
    (item) =>
      item.isAvailable &&
      (selectedCategory ? item.category === selectedCategory : true) &&
      (menuSearch
        ? item.name.toLowerCase().includes(menuSearch.toLowerCase())
        : true)
  );

  return (
    <div className="space-y-6">
      {/* Top Tabs */}
      <div className="flex items-center justify-between border-b border-gray-200 pb-3">
        <div className="flex space-x-2">
          <button
            onClick={() => setActiveTab('tables')}
            className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all ${
              activeTab === 'tables'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
                : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            Dining Tables Grid
          </button>
          <button
            onClick={() => setActiveTab('my-orders')}
            className={`relative px-4 py-2.5 rounded-2xl text-xs font-bold transition-all ${
              activeTab === 'my-orders'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
                : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            My Open Orders
            {activeOrders.filter((o) => (o.waiter?._id || o.waiter) === user?.id).length > 0 && (
              <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-900 font-black">
                {activeOrders.filter((o) => (o.waiter?._id || o.waiter) === user?.id).length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('late-entry')}
            className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all ${
              activeTab === 'late-entry'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
                : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            Late-Entry Order
          </button>
        </div>

        <button
          onClick={loadActiveOrders}
          className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
          title="Refresh orders"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* --- TAB 1: TABLES GRID --- */}
      {activeTab === 'tables' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-gray-500 font-semibold px-1">
            <p>Tap an empty table to start a new order, or tap an occupied table to view status.</p>
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Free Table
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Occupied
              </span>
            </div>
          </div>

          {tables.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-3xl border border-dashed border-gray-300">
              <p className="text-gray-500 font-medium text-sm">
                No dining tables configured yet. You can add tables in the Tables management section.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {tables.map((table) => {
              const activeOrder = getOrderForTable(table._id);
              const isOccupied = Boolean(activeOrder);

              const readyCount =
                activeOrder?.items.filter((i) => i.status === 'ready').length || 0;
              const preparingCount =
                activeOrder?.items.filter((i) => i.status === 'preparing').length || 0;
              const pendingCount =
                activeOrder?.items.filter((i) => i.status === 'pending').length || 0;
              const servedCount =
                activeOrder?.items.filter((i) => i.status === 'served').length || 0;

              return (
                <button
                  key={table._id}
                  onClick={() => handleTableClick(table)}
                  className={`p-5 rounded-3xl border text-left transition-all relative flex flex-col justify-between min-h-[140px] active:scale-95 ${
                    isOccupied
                      ? 'bg-amber-50/70 border-amber-300 hover:border-amber-500 shadow-sm'
                      : 'bg-white border-gray-200 hover:border-emerald-500 hover:shadow-md'
                  }`}
                >
                  <div className="flex items-start justify-between w-full">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                        {isOccupied ? 'Occupied' : 'Free Table'}
                      </span>
                      <h3 className="font-extrabold text-gray-900 text-lg">{table.name}</h3>
                    </div>
                    <span
                      className={`w-3.5 h-3.5 rounded-full ${
                        isOccupied ? 'bg-amber-500 ring-4 ring-amber-100' : 'bg-emerald-500 ring-4 ring-emerald-100'
                      }`}
                    />
                  </div>

                  {isOccupied ? (
                    <div className="mt-3 pt-3 border-t border-amber-200/60 w-full text-xs">
                      <div className="flex items-center justify-between text-amber-900 font-bold mb-1">
                        <span>Order #{activeOrder.orderNumber}</span>
                        <span>{activeOrder.items.length} items</span>
                      </div>
                      <div className="text-[11px] font-bold text-amber-900 mb-1.5 flex items-center gap-1">
                        <User className="w-3 h-3 text-amber-700 shrink-0" />
                        <span className="truncate">@{activeOrder.waiter?.username || activeOrder.waiter?.name || 'staff'}</span>
                        {(activeOrder.waiter?._id === user?._id || activeOrder.waiter === user?._id) && (
                          <span className="text-[8px] bg-amber-600 text-white px-1 rounded font-black shrink-0">YOU</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] flex-wrap">
                        {readyCount > 0 && (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-black animate-pulse">
                            {readyCount} Ready
                          </span>
                        )}
                        {preparingCount > 0 && (
                          <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 font-semibold">
                            {preparingCount} Prep
                          </span>
                        )}
                        {pendingCount > 0 && readyCount === 0 && preparingCount === 0 && (
                          <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 font-bold">
                            {pendingCount} Confirmed
                          </span>
                        )}
                        {pendingCount === 0 && readyCount === 0 && preparingCount === 0 && servedCount > 0 && (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold">
                            All Served
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 text-xs font-bold text-emerald-600 flex items-center gap-1">
                      <Plus className="w-3.5 h-3.5" /> Start Order
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* --- TAB 2: MY OPEN ORDERS --- */}
      {activeTab === 'my-orders' && (
        <div className="space-y-4">
          {activeOrders.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-3xl border border-dashed border-gray-300">
              <ShoppingBag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium text-sm">No active orders open right now</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeOrders.map((order) => {
                const readyItems = order.items.filter((i) => i.status === 'ready');
                return (
                  <div
                    key={order._id}
                    className="bg-white rounded-3xl p-5 border border-gray-200 shadow-xs flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-extrabold px-3 py-1 bg-amber-50 text-amber-800 rounded-full border border-amber-200/60">
                          Order #{order.orderNumber}
                        </span>
                        <span className="text-xs font-bold text-gray-500">
                          {order.table?.name || 'Table'}
                        </span>
                      </div>

                      {/* Server attribution badge */}
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold bg-amber-50 text-amber-900 border border-amber-200/60">
                          <User className="w-3 h-3 text-amber-700" />
                          <span>Server: {order.waiter?.name || order.waiter?.username || 'Staff'}</span>
                          {(order.waiter?._id === user?._id || order.waiter === user?._id) && (
                            <span className="bg-amber-600 text-white text-[8px] px-1 rounded font-black">YOU</span>
                          )}
                        </span>
                      </div>

                      {/* Ready Alert */}
                      {readyItems.length > 0 && (
                        <div className="my-2 p-2.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center justify-between">
                          <span>🔔 {readyItems.length} item(s) ready to serve!</span>
                        </div>
                      )}

                      <div className="mt-3 space-y-2">
                        {order.items.map((item) => (
                          <div
                            key={item._id}
                            className="flex items-center justify-between text-xs p-2 rounded-xl bg-gray-50"
                          >
                            <div>
                              <p className="font-bold text-gray-900">
                                {item.quantity}x {item.nameSnapshot}
                              </p>
                              {item.note && (
                                <p className="text-[11px] text-amber-700 italic">
                                  "{item.note}"
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span
                                className={`px-2 py-0.5 rounded-md font-bold text-[10px] uppercase ${
                                  item.status === 'ready'
                                    ? 'bg-emerald-100 text-emerald-800 animate-pulse'
                                    : item.status === 'preparing'
                                    ? 'bg-blue-100 text-blue-800'
                                    : item.status === 'served'
                                    ? 'bg-gray-200 text-gray-600'
                                    : item.status === 'cancelled'
                                    ? 'bg-rose-100 text-rose-700 line-through'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {item.status}
                              </span>
                              {item.status === 'ready' && (
                                <button
                                  onClick={() => handleMarkServed(order._id, item._id)}
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-[10px] transition-all active:scale-95"
                                >
                                  Serve
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                      <span className="font-black text-gray-900 text-sm">
                        Total: {order.totalAmount || 0} {STRINGS.currency}
                      </span>
                      <button
                        onClick={() => {
                          setViewingOrder(order);
                          setIsDetailModalOpen(true);
                        }}
                        className="text-xs font-bold text-amber-600 hover:text-amber-700"
                      >
                        Manage Order →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* --- TAB 3: LATE ENTRY ORDER FORM --- */}
      {activeTab === 'late-entry' && (
        <div className="max-w-xl mx-auto bg-white rounded-3xl p-6 sm:p-8 border border-gray-200 shadow-sm space-y-6">
          <div>
            <h3 className="text-xl font-bold text-gray-900 mb-1">Late-Entry Order Submission</h3>
            <p className="text-xs text-gray-500">
              Record orders taken during offline / network outage periods. Stock will be deducted
              normally without triggering kitchen screen tickets.
            </p>
          </div>

          <form onSubmit={handleLateEntrySubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                Dining Table
              </label>
              <select
                required
                value={lateTableId}
                onChange={(e) => setLateTableId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              >
                <option value="">Select table...</option>
                {tables.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                Past Order Date & Time (Optional)
              </label>
              <input
                type="datetime-local"
                value={lateTime}
                onChange={(e) => setLateTime(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>

            {/* Quick Item Picker for Late Entry */}
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                Order Items ({lateCart.length} selected)
              </label>
              <div className="max-h-48 overflow-y-auto space-y-2 border border-gray-200 rounded-2xl p-3 bg-gray-50">
                {menuItems.map((m) => {
                  const inCart = lateCart.find((c) => c.menuItem._id === m._id);
                  return (
                    <div
                      key={m._id}
                      className="flex items-center justify-between p-2 bg-white rounded-xl text-xs font-medium"
                    >
                      <span>
                        {m.name} ({m.price} {STRINGS.currency})
                      </span>
                      {inCart ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setLateCart((prev) =>
                                prev
                                  .map((c) =>
                                    c.menuItem._id === m._id
                                      ? { ...c, quantity: c.quantity - 1 }
                                      : c
                                  )
                                  .filter((c) => c.quantity > 0)
                              )
                            }
                            className="p-1 rounded bg-gray-100 text-gray-700"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="font-bold">{inCart.quantity}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setLateCart((prev) =>
                                prev.map((c) =>
                                  c.menuItem._id === m._id
                                    ? { ...c, quantity: c.quantity + 1 }
                                    : c
                                )
                              )
                            }
                            className="p-1 rounded bg-gray-100 text-gray-700"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setLateCart((prev) => [
                              ...prev,
                              { menuItem: m, quantity: 1, note: '' },
                            ])
                          }
                          className="px-2.5 py-1 bg-amber-50 text-amber-800 font-bold rounded-lg text-xs hover:bg-amber-100"
                        >
                          + Add
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3.5 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold rounded-2xl shadow-lg shadow-amber-600/25 transition-all text-sm"
            >
              Record Late-Entry Order
            </button>
          </form>
        </div>
      )}

      {/* --- MODAL: NEW ORDER CREATOR (FOR SELECTED TABLE) --- */}
      <Modal
        isOpen={isOrderModalOpen}
        onClose={() => setIsOrderModalOpen(false)}
        title={`New Order for ${selectedTable?.name || 'Table'}`}
        maxWidth="max-w-4xl"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Menu Browser (2 columns) */}
          <div className="md:col-span-2 space-y-4">
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              <button
                onClick={() => setSelectedCategory('')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  selectedCategory === ''
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All
              </button>
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setSelectedCategory(c)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                    selectedCategory === c
                      ? 'bg-amber-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-1">
              {filteredMenu.map((item) => (
                <button
                  key={item._id}
                  onClick={() => addToCart(item)}
                  className="p-3.5 rounded-2xl bg-gray-50 border border-gray-200/80 hover:border-amber-500 hover:bg-amber-50/20 text-left transition-all active:scale-95 flex flex-col justify-between"
                >
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 block mb-0.5">
                      {item.category}
                    </span>
                    <h4 className="font-bold text-gray-900 text-sm leading-tight">
                      {item.name}
                    </h4>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="font-extrabold text-amber-700">
                      {item.price} {STRINGS.currency}
                    </span>
                    <span className="p-1 rounded-lg bg-amber-600 text-white">
                      <Plus className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Cart & Send Panel (1 column) */}
          <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-gray-200 mb-3">
                <h4 className="font-bold text-gray-900 text-sm">Cart Items</h4>
                <span className="text-xs font-bold text-gray-500">
                  {cart.length} unique
                </span>
              </div>

              {orderError && (
                <div className="mb-3 p-2 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs">
                  {orderError}
                </div>
              )}

              {cart.length === 0 ? (
                <p className="text-xs text-gray-400 italic text-center py-10">
                  Tap menu items to add to this order
                </p>
              ) : (
                <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                  {cart.map((c) => (
                    <div
                      key={c.menuItem._id}
                      className="p-2.5 rounded-xl bg-white border border-gray-200 text-xs"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-bold text-gray-900 leading-tight">
                          {c.menuItem.name}
                        </span>
                        <span className="font-black text-amber-700">
                          {c.menuItem.price * c.quantity} {STRINGS.currency}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <input
                          type="text"
                          placeholder="Add note..."
                          value={c.note}
                          onChange={(e) => updateCartNote(c.menuItem._id, e.target.value)}
                          className="px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg text-[11px] w-28 focus:bg-white focus:outline-none"
                        />
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => updateCartQty(c.menuItem._id, -1)}
                            className="p-1 rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-black text-xs px-1">
                            {c.quantity}
                          </span>
                          <button
                            onClick={() => updateCartQty(c.menuItem._id, 1)}
                            className="p-1 rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-gray-200 mt-4">
              <div className="flex items-center justify-between mb-3 text-sm">
                <span className="font-bold text-gray-600">Total:</span>
                <span className="font-black text-lg text-gray-900">
                  {cartTotal} {STRINGS.currency}
                </span>
              </div>
              <button
                onClick={handleSendOrder}
                disabled={cart.length === 0 || submittingOrder}
                className="w-full py-3 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold rounded-xl shadow-md shadow-amber-600/20 transition-all flex items-center justify-center gap-2 text-xs disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                {submittingOrder ? 'Submitting...' : 'Send Order to Kitchen'}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* --- MODAL: ACTIVE ORDER DETAILS & ACTIONS --- */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title={`Order #${viewingOrder?.orderNumber} • ${viewingOrder?.table?.name || 'Table'}`}
        maxWidth="max-w-2xl"
      >
        {viewingOrder && (
          <div className="space-y-5">
            <div className="flex items-center justify-between text-xs text-gray-500 pb-3 border-b border-gray-100 flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 font-bold text-gray-800">
                <User className="w-3.5 h-3.5 text-amber-600" />
                Server: {viewingOrder.waiter?.name || viewingOrder.waiter?.username || 'Staff'}
                {(viewingOrder.waiter?._id === user?._id || viewingOrder.waiter === user?._id) && (
                  <span className="bg-amber-600 text-white text-[8px] px-1.5 py-0.2 rounded font-black">
                    YOU
                  </span>
                )}
              </span>
              <span>Status: <strong className="uppercase text-amber-700">{viewingOrder.status}</strong></span>
            </div>

            {/* Item List */}
            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
              {viewingOrder.items.map((item) => (
                <div
                  key={item._id}
                  className="flex items-center justify-between p-3 rounded-2xl bg-gray-50 border border-gray-200/80 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-900 text-sm">
                        {item.quantity}x {item.nameSnapshot}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md font-bold text-[10px] uppercase ${
                          item.status === 'ready'
                            ? 'bg-emerald-100 text-emerald-800 animate-pulse'
                            : item.status === 'preparing'
                            ? 'bg-blue-100 text-blue-800'
                            : item.status === 'served'
                            ? 'bg-gray-200 text-gray-600'
                            : item.status === 'cancelled'
                            ? 'bg-rose-100 text-rose-700 line-through'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                    {item.note && (
                      <p className="text-gray-500 text-[11px] italic mt-0.5">
                        Note: "{item.note}"
                      </p>
                    )}
                    {item.cancelReason && (
                      <p className="text-rose-600 text-[11px] mt-0.5">
                        Cancelled: {item.cancelReason}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="font-black text-gray-900 text-xs mr-2">
                      {item.priceSnapshot * item.quantity} {STRINGS.currency}
                    </span>

                    {/* Waiter marks item as Served */}
                    {item.status !== 'served' && item.status !== 'cancelled' && (
                      <button
                        onClick={() => handleMarkServed(viewingOrder._id, item._id)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-all active:scale-95 shadow-sm flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Serve
                      </button>
                    )}

                    {/* Waiter can cancel pending items */}
                    {item.status === 'pending' && (
                      <button
                        onClick={() => handleCancelItem(viewingOrder._id, item._id)}
                        className="p-1.5 text-gray-400 hover:text-rose-600 rounded-lg hover:bg-white transition-colors"
                        title="Cancel item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Total and Actions */}
            <div className="pt-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-xs text-gray-500 font-semibold block">Order Total</span>
                <span className="text-xl font-black text-gray-900">
                  {viewingOrder.totalAmount} {STRINGS.currency}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenCancelOrder(viewingOrder)}
                  className="px-3.5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-xl text-xs border border-rose-200 transition-colors flex items-center gap-1.5 active:scale-95"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Cancel Order
                </button>

                {viewingOrder.items.some((i) => i.status !== 'served' && i.status !== 'cancelled') && (
                  <button
                    type="button"
                    onClick={() => handleServeAllItems(viewingOrder)}
                    className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 active:scale-95 shadow-sm"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Serve All
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setAdditionalCart([]);
                    setIsAddItemsModalOpen(true);
                  }}
                  className="px-3.5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl text-xs transition-colors"
                >
                  + Add More Items
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenPayment(viewingOrder)}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold rounded-xl text-xs shadow-md shadow-emerald-600/20 transition-all flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Complete Order &amp; Free Table
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* --- MODAL: ADD ITEMS TO EXISTING ORDER --- */}
      <Modal
        isOpen={isAddItemsModalOpen}
        onClose={() => setIsAddItemsModalOpen(false)}
        title={`Add Items to Order #${viewingOrder?.orderNumber}`}
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            Select items to append to this table's open ticket:
          </p>
          <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
            {menuItems
              .filter((m) => m.isAvailable)
              .map((item) => {
                const inCart = additionalCart.find(
                  (c) => c.menuItem._id === item._id
                );
                return (
                  <div
                    key={item._id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50 border border-gray-200 text-xs"
                  >
                    <div>
                      <span className="font-bold text-gray-900">{item.name}</span>
                      <span className="text-gray-500 ml-2">
                        {item.price} {STRINGS.currency}
                      </span>
                    </div>

                    {inCart ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            setAdditionalCart((prev) =>
                              prev
                                .map((c) =>
                                  c.menuItem._id === item._id
                                    ? { ...c, quantity: c.quantity - 1 }
                                    : c
                                )
                                .filter((c) => c.quantity > 0)
                            )
                          }
                          className="p-1 rounded bg-gray-200 text-gray-700"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="font-bold">{inCart.quantity}</span>
                        <button
                          onClick={() =>
                            setAdditionalCart((prev) =>
                              prev.map((c) =>
                                c.menuItem._id === item._id
                                  ? { ...c, quantity: c.quantity + 1 }
                                  : c
                              )
                            )
                          }
                          className="p-1 rounded bg-gray-200 text-gray-700"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() =>
                          setAdditionalCart((prev) => [
                            ...prev,
                            { menuItem: item, quantity: 1, note: '' },
                          ])
                        }
                        className="px-3 py-1 bg-amber-50 text-amber-800 font-bold rounded-lg text-xs hover:bg-amber-100"
                      >
                        + Add
                      </button>
                    )}
                  </div>
                );
              })}
          </div>

          <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-3">
            <button
              onClick={() => setIsAddItemsModalOpen(false)}
              className="px-4 py-2 text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl"
            >
              Cancel
            </button>
            <button
              onClick={handleAddItemsSubmit}
              disabled={additionalCart.length === 0}
              className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl disabled:opacity-50"
            >
              Confirm & Deduct Stock
            </button>
          </div>
        </div>
      </Modal>

      {/* --- MODAL: COMPLETE ORDER & SELECT PAYMENT METHOD --- */}
      {isPaymentModalOpen && paymentOrder && (
        <Modal
          isOpen={isPaymentModalOpen}
          onClose={() => !submittingPayment && setIsPaymentModalOpen(false)}
          title={`Complete Order #${paymentOrder.orderNumber}`}
          maxWidth="max-w-md"
        >
          <div className="space-y-5">
            <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80">
              <div className="flex items-center justify-between text-xs text-amber-900 font-bold mb-1">
                <span>Table: {paymentOrder.table?.name || 'Dining Table'}</span>
                <span>Server: @{paymentOrder.waiter?.username || paymentOrder.waiter?.name || 'staff'}</span>
              </div>
              <div className="mt-2 flex items-baseline justify-between border-t border-amber-200/60 pt-2">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Total Amount Due</span>
                <span className="text-2xl font-black text-gray-900">
                  {paymentOrder.totalAmount || 0} {STRINGS.currency}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2.5">
                Select Payment Method
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('cash')}
                  className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                    paymentMethod === 'cash'
                      ? 'border-emerald-500 bg-emerald-50/60 ring-2 ring-emerald-500/30'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="p-2 rounded-xl bg-emerald-100 text-emerald-800">
                      <Banknote className="w-5 h-5" />
                    </span>
                    {paymentMethod === 'cash' && (
                      <Check className="w-4 h-4 text-emerald-600 font-black" />
                    )}
                  </div>
                  <div>
                    <h4 className="font-extrabold text-gray-900 text-sm">Cash</h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">Physical Birr notes</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('transfer')}
                  className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                    paymentMethod === 'transfer'
                      ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-500/30'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="p-2 rounded-xl bg-blue-100 text-blue-800">
                      <Smartphone className="w-5 h-5" />
                    </span>
                    {paymentMethod === 'transfer' && (
                      <Check className="w-4 h-4 text-blue-600 font-black" />
                    )}
                  </div>
                  <div>
                    <h4 className="font-extrabold text-gray-900 text-sm">Transfer</h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">Telebirr / CBE / Bank</p>
                  </div>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                disabled={submittingPayment}
                onClick={() => setIsPaymentModalOpen(false)}
                className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition-colors"
              >
                Back
              </button>
              <button
                type="button"
                disabled={submittingPayment}
                onClick={handleConfirmPayment}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-xl shadow-md shadow-emerald-600/20 transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                {submittingPayment ? 'Processing...' : 'Confirm Payment & Complete'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* --- MODAL: CANCEL ENTIRE ORDER --- */}
      {isCancelOrderModalOpen && orderToCancel && (
        <Modal
          isOpen={isCancelOrderModalOpen}
          onClose={() => !submittingCancelOrder && setIsCancelOrderModalOpen(false)}
          title={`Cancel Order #${orderToCancel.orderNumber}`}
          maxWidth="max-w-md"
        >
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs">
              <p className="font-bold mb-1">
                Are you sure you want to cancel the entire ticket for {orderToCancel.table?.name || 'this table'}?
              </p>
              <p className="text-rose-700 text-[11px] leading-relaxed">
                • Dining table will be immediately freed.<br/>
                • Unprepared items will have inventory stock restored.<br/>
                • Items already prepared will be recorded as wasted inventory.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                Reason for Cancellation (required)
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Customer walked out, ordered by mistake"
                value={cancelOrderReason}
                onChange={(e) => setCancelOrderReason(e.target.value)}
                className="w-full text-xs border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                disabled={submittingCancelOrder}
                onClick={() => setIsCancelOrderModalOpen(false)}
                className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition-colors"
              >
                Keep Order Open
              </button>
              <button
                type="button"
                disabled={submittingCancelOrder || !cancelOrderReason.trim()}
                onClick={handleConfirmCancelOrder}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold rounded-xl shadow-md shadow-rose-600/20 transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
              >
                <XCircle className="w-4 h-4" />
                {submittingCancelOrder ? 'Cancelling...' : 'Confirm Order Cancellation'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
