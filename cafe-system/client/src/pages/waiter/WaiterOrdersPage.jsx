import React, { useState, useEffect, useRef } from 'react';
import { ordersApi, menuApi } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSocket } from '../../context/SocketContext.jsx';
import { STRINGS } from '../../locales/strings.js';
import { soundPlayer } from '../../utils/sound.js';
import Modal from '../../components/common/Modal.jsx';
import {
  ShoppingBag,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Plus,
  Minus,
  Trash2,
  Search,
  Check,
  RotateCcw,
  Bell,
  ChefHat,
  Filter,
  ArrowRight,
  Sparkles,
  User,
  Banknote,
  Smartphone,
} from 'lucide-react';

export default function WaiterOrdersPage() {
  const { user } = useAuth();
  const { on, connected } = useSocket();

  // Filter tab: 'active' | 'ready' | 'preparing' | 'pending' | 'completed'
  const [filterTab, setFilterTab] = useState('active');

  // Server ownership filter: 'all' (all servers) | 'mine' (my orders only)
  const [ownershipFilter, setOwnershipFilter] = useState('all');
  const [selectedWaiterId, setSelectedWaiterId] = useState('all');

  const [orders, setOrders] = useState([]);
  const [completedOrders, setCompletedOrders] = useState([]);
  const [cancelledOrders, setCancelledOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  // Complete Order & Payment Modal State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentOrder, setPaymentOrder] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // Cancel Entire Order Modal State
  const [isCancelOrderModalOpen, setIsCancelOrderModalOpen] = useState(false);
  const [orderToCancel, setOrderToCancel] = useState(null);
  const [cancelOrderReason, setCancelOrderReason] = useState('');
  const [submittingCancelOrder, setSubmittingCancelOrder] = useState(false);

  // Menu items for "Add items to existing order"
  const [menuItems, setMenuItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedOrderForAdd, setSelectedOrderForAdd] = useState(null);
  const [additionalCart, setAdditionalCart] = useState([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [menuSearch, setMenuSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [submittingAdd, setSubmittingAdd] = useState(false);

  // Cancellation Modal
  const [cancellingItem, setCancellingItem] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);

  // Detail Modal
  const [viewingOrder, setViewingOrder] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Ticking timer for live elapsed time updates
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  const fetchOrders = async () => {
    try {
      const [activeRes, closedRes, cancelledRes, menuRes] = await Promise.all([
        ordersApi.getActive(),
        ordersApi.getHistory({ limit: 100, status: 'closed' }),
        ordersApi.getHistory({ limit: 100, status: 'cancelled' }),
        menuApi.getAll({ activeOnly: true }),
      ]);

      setOrders(activeRes.data?.data?.orders || []);
      setCompletedOrders(closedRes.data?.data?.orders || []);
      setCancelledOrders(cancelledRes.data?.data?.orders || []);

      const items = menuRes.data?.data?.items || [];
      setMenuItems(items);
      const uniqueCats = [...new Set(items.map((i) => i.category))];
      setCategories(uniqueCats);
      if (uniqueCats.length > 0 && !selectedCategory) setSelectedCategory(uniqueCats[0]);
    } catch (err) {
      console.error('Failed to load waiter orders:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();

    // Socket.IO Real-time synchronization
    const unsubNew = on('order:new', ({ order }) => {
      setOrders((prev) => {
        if (prev.some((o) => o._id === order._id)) return prev;
        return [order, ...prev];
      });
    });

    const unsubItemsAdded = on('order:items-added', ({ order }) => {
      setOrders((prev) => prev.map((o) => (o._id === order._id ? order : o)));
      if (viewingOrder?._id === order._id) setViewingOrder(order);
    });

    const unsubStatusChanged = ({ orderId, itemId, status }) => {
      setOrders((prev) =>
        prev.map((o) => {
          if (o._id === orderId) {
            const updatedItems = o.items.map((i) => (i._id === itemId ? { ...i, status } : i));
            const updatedOrder = { ...o, items: updatedItems };

            // Trigger notification chime and alert if an item became ready
            if (status === 'ready') {
              try {
                soundPlayer.play('ready');
              } catch (e) {
                // Ignore audio play errors if gesture not triggered
              }
            }

            if (viewingOrder?._id === orderId) {
              setViewingOrder(updatedOrder);
            }
            return updatedOrder;
          }
          return o;
        })
      );
    };

    const unsubStatus = on('item:status-changed', unsubStatusChanged);

    const unsubClosed = on('order:closed', () => {
      fetchOrders();
      if (viewingOrder) setIsDetailModalOpen(false);
    });

    const unsubCancelled = on('order:cancelled', () => {
      fetchOrders();
      if (viewingOrder) setIsDetailModalOpen(false);
    });

    const unsubReconnect = on('reconnect', () => {
      fetchOrders();
    });

    return () => {
      unsubNew();
      unsubItemsAdded();
      unsubStatus();
      unsubClosed();
      unsubCancelled();
      unsubReconnect();
    };
  }, [user, viewingOrder]);

  // Elapsed time helper
  const getElapsedString = (createdAt) => {
    const elapsedMinutes = Math.floor((now - new Date(createdAt).getTime()) / 60000);
    if (elapsedMinutes < 1) return 'Just now';
    if (elapsedMinutes === 1) return '1 min ago';
    if (elapsedMinutes < 60) return `${elapsedMinutes} mins ago`;
    const hours = Math.floor(elapsedMinutes / 60);
    const mins = elapsedMinutes % 60;
    return `${hours}h ${mins}m ago`;
  };

  // Mark item as served
  const handleMarkServed = async (orderId, itemId) => {
    try {
      await ordersApi.updateItemStatus(orderId, itemId, 'served');
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to mark item as served');
    }
  };

  // Mark all unserved items in an order as served
  const handleServeAllItems = async (order) => {
    const unserved = (order?.items || []).filter(
      (i) => i.status !== 'served' && i.status !== 'cancelled'
    );
    if (unserved.length === 0) return;
    try {
      for (const item of unserved) {
        await ordersApi.updateItemStatus(order._id, item._id, 'served');
      }
      await fetchOrders();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to serve items');
    }
  };

  // Open item cancellation modal
  const handleOpenCancel = (orderId, item) => {
    setCancellingItem({ orderId, item });
    setCancelReason('');
    setIsCancelModalOpen(true);
  };

  const handleConfirmCancel = async () => {
    if (!cancellingItem) return;
    try {
      await ordersApi.cancelItem(
        cancellingItem.orderId,
        cancellingItem.item._id,
        cancelReason || 'Customer requested cancellation'
      );
      setIsCancelModalOpen(false);
      setCancellingItem(null);
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to cancel item');
    }
  };

  // Payment & Complete Order Flow
  const handleOpenPayment = (order) => {
    setPaymentOrder(order);
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
      await fetchOrders();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to complete order');
    } finally {
      setSubmittingPayment(false);
    }
  };

  // Cancel Entire Order Flow
  const handleOpenCancelOrder = (order) => {
    setOrderToCancel(order);
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
      await fetchOrders();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to cancel order');
    } finally {
      setSubmittingCancelOrder(false);
    }
  };

  // Add more items to open order
  const handleOpenAddItems = (order) => {
    setSelectedOrderForAdd(order);
    setAdditionalCart([]);
    setIsAddModalOpen(true);
  };

  const addToAdditionalCart = (menuItem) => {
    setAdditionalCart((prev) => {
      const existing = prev.find((c) => c.menuItem._id === menuItem._id);
      if (existing) {
        return prev.map((c) =>
          c.menuItem._id === menuItem._id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [...prev, { menuItem, quantity: 1, note: '' }];
    });
  };

  const updateAdditionalQty = (index, delta) => {
    setAdditionalCart((prev) => {
      const updated = [...prev];
      const newQty = updated[index].quantity + delta;
      if (newQty <= 0) {
        updated.splice(index, 1);
      } else {
        updated[index].quantity = newQty;
      }
      return updated;
    });
  };

  const submitAdditionalItems = async () => {
    if (additionalCart.length === 0 || !selectedOrderForAdd) return;
    setSubmittingAdd(true);
    try {
      const itemsPayload = additionalCart.map((c) => ({
        menuItemId: c.menuItem._id,
        quantity: c.quantity,
        note: c.note,
      }));

      await ordersApi.addItems(selectedOrderForAdd._id, { items: itemsPayload });
      setIsAddModalOpen(false);
      setAdditionalCart([]);
      setSelectedOrderForAdd(null);
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to add items to order');
    } finally {
      setSubmittingAdd(false);
    }
  };

  // Extract unique active waiters from orders
  const availableWaiters = Array.from(
    new Map(
      orders
        .filter((o) => o.waiter && typeof o.waiter === 'object')
        .map((o) => [o.waiter._id, o.waiter])
    ).values()
  );

  // Filter orders based on active filterTab and server ownership
  const filteredOrders = orders.filter((order) => {
    // Ownership / Waiter filter
    if (ownershipFilter === 'mine') {
      const waiterId = order.waiter?._id || order.waiter;
      if (waiterId !== user?._id) return false;
    } else if (selectedWaiterId !== 'all') {
      const waiterId = order.waiter?._id || order.waiter;
      if (waiterId !== selectedWaiterId) return false;
    }

    if (filterTab === 'ready') {
      return order.items.some((i) => i.status === 'ready');
    }
    if (filterTab === 'preparing') {
      return order.items.some((i) => i.status === 'preparing');
    }
    if (filterTab === 'pending') {
      return order.items.some((i) => i.status === 'pending');
    }
    return true; // 'active'
  });

  const filteredCompletedOrders = completedOrders.filter((order) => {
    if (ownershipFilter === 'mine') {
      const waiterId = order.waiter?._id || order.waiter;
      return waiterId === user?._id;
    }
    if (selectedWaiterId !== 'all') {
      const waiterId = order.waiter?._id || order.waiter;
      return waiterId === selectedWaiterId;
    }
    return true;
  });

  const filteredCancelledOrders = cancelledOrders.filter((order) => {
    if (ownershipFilter === 'mine') {
      const waiterId = order.waiter?._id || order.waiter;
      return waiterId === user?._id;
    }
    if (selectedWaiterId !== 'all') {
      const waiterId = order.waiter?._id || order.waiter;
      return waiterId === selectedWaiterId;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header with Live Status Indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
              Orders & Live Ticket Tracker
            </h1>
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                connected ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  connected ? 'bg-emerald-500 animate-ping' : 'bg-rose-500'
                }`}
              />
              {connected ? 'Live Sync Active' : 'Disconnected'}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Track kitchen preparation progress across all active restaurant tables in real-time
          </p>
        </div>

        <button
          onClick={fetchOrders}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 font-semibold text-xs rounded-2xl hover:bg-gray-50 shadow-xs transition-all active:scale-95"
        >
          <RotateCcw className="w-4 h-4 text-amber-600" />
          Refresh
        </button>
      </div>

      {/* Server Filter Ribbon */}
      <div className="bg-white p-3 rounded-2xl border border-gray-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
            <User className="w-4 h-4 text-amber-600" />
            Server Filter:
          </span>
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setOwnershipFilter('all');
                setSelectedWaiterId('all');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                ownershipFilter === 'all' && selectedWaiterId === 'all'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              All Waiters ({orders.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setOwnershipFilter('mine');
                setSelectedWaiterId('all');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                ownershipFilter === 'mine'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              My Orders ({orders.filter((o) => (o.waiter?._id || o.waiter) === user?._id).length})
            </button>
          </div>
        </div>

        {availableWaiters.length > 1 && (
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-gray-500">Specific Waiter:</label>
            <select
              value={selectedWaiterId}
              onChange={(e) => {
                setSelectedWaiterId(e.target.value);
                if (e.target.value !== 'all') {
                  setOwnershipFilter('all');
                }
              }}
              className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            >
              <option value="all">All Active Waiters ({availableWaiters.length})</option>
              {availableWaiters.map((w) => (
                <option key={w._id} value={w._id}>
                  {w.name || w.username} {w._id === user?._id ? '(You)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Filter Tabs Ribbon */}
      <div className="bg-white p-2 rounded-2xl border border-gray-200 shadow-xs flex flex-wrap gap-2">
        <button
          onClick={() => setFilterTab('active')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
            filterTab === 'active'
              ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          All Active Orders ({orders.length})
        </button>

        <button
          onClick={() => setFilterTab('ready')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
            filterTab === 'ready'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
          }`}
        >
          <Bell className="w-4 h-4 text-emerald-500" />
          Ready to Serve ({orders.filter((o) => o.items.some((i) => i.status === 'ready')).length})
        </button>

        <button
          onClick={() => setFilterTab('preparing')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
            filterTab === 'preparing'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
          }`}
        >
          <ChefHat className="w-4 h-4 text-blue-500" />
          Preparing ({orders.filter((o) => o.items.some((i) => i.status === 'preparing')).length})
        </button>

        <button
          onClick={() => setFilterTab('pending')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
            filterTab === 'pending'
              ? 'bg-amber-700 text-white shadow-md shadow-amber-700/20'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
          }`}
        >
          <Clock className="w-4 h-4 text-amber-500" />
          Pending ({orders.filter((o) => o.items.some((i) => i.status === 'pending')).length})
        </button>

        <button
          onClick={() => setFilterTab('completed')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
            filterTab === 'completed'
              ? 'bg-gray-900 text-white shadow-md shadow-gray-900/20'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          Completed ({completedOrders.length})
        </button>

        <button
          onClick={() => setFilterTab('cancelled')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
            filterTab === 'cancelled'
              ? 'bg-rose-700 text-white shadow-md shadow-rose-700/20'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
          }`}
        >
          <XCircle className="w-4 h-4 text-rose-500" />
          Cancelled Orders ({cancelledOrders.length})
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex justify-center items-center py-20">
          <div className="w-10 h-10 border-4 border-amber-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Active Orders Grid View */}
      {!loading && filterTab !== 'completed' && filterTab !== 'cancelled' && (
        <>
          {filteredOrders.length === 0 ? (
            <div className="p-16 text-center bg-white rounded-3xl border border-dashed border-gray-300">
              <ShoppingBag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-700 font-bold text-base">No orders matching this filter</p>
              <p className="text-xs text-gray-400 mt-1">Take a new order from the Dining Tables Grid</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredOrders.map((order) => {
                const readyItems = order.items.filter((i) => i.status === 'ready');
                const allServedOrCancelled = order.items.every(
                  (i) => i.status === 'served' || i.status === 'cancelled'
                );

                return (
                  <div
                    key={order._id}
                    className={`bg-white rounded-3xl p-5 border shadow-xs flex flex-col justify-between transition-all ${
                      readyItems.length > 0
                        ? 'border-emerald-300 ring-2 ring-emerald-500/20'
                        : 'border-gray-200 hover:border-amber-400'
                    }`}
                  >
                    <div>
                      {/* Top Bar: Order Number, Table, Elapsed Time */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black px-3 py-1 bg-amber-50 text-amber-900 rounded-full border border-amber-200">
                            Ticket #{order.orderNumber}
                          </span>
                          <span className="font-extrabold text-gray-900 text-sm">
                            {order.table?.name || 'Table'}
                          </span>
                        </div>
                        <span className="flex items-center gap-1 text-xs font-bold text-gray-400">
                          <Clock className="w-3.5 h-3.5" />
                          {getElapsedString(order.createdAt)}
                        </span>
                      </div>

                      {/* Server Attribution Badge */}
                      <div className="flex items-center gap-1.5 mb-2.5">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-amber-50/80 text-amber-950 border border-amber-200/80">
                          <User className="w-3.5 h-3.5 text-amber-700" />
                          <span>Server: {order.waiter?.name || order.waiter?.username || 'Staff'}</span>
                          {(order.waiter?._id === user?._id || order.waiter === user?._id) && (
                            <span className="bg-amber-600 text-white text-[9px] px-1.5 py-0.2 rounded-md font-black">
                              YOU
                            </span>
                          )}
                        </span>
                      </div>

                      {/* Ready Notification Banner */}
                      {readyItems.length > 0 && (
                        <div className="my-3 p-3 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold flex items-center justify-between animate-pulse">
                          <span className="flex items-center gap-1.5">
                            <Bell className="w-4 h-4 text-emerald-600" />
                            {readyItems.length} item(s) ready to serve!
                          </span>
                          <span className="text-[10px] uppercase font-black tracking-wider text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                            Action Needed
                          </span>
                        </div>
                      )}

                      {/* Ordered Items List */}
                      <div className="mt-3 space-y-2">
                        {order.items.map((item) => (
                          <div
                            key={item._id}
                            className={`p-3 rounded-2xl border transition-all flex items-center justify-between text-xs ${
                              item.status === 'ready'
                                ? 'bg-emerald-50/60 border-emerald-200'
                                : item.status === 'preparing'
                                ? 'bg-blue-50/50 border-blue-100'
                                : item.status === 'served'
                                ? 'bg-gray-50 border-gray-100 opacity-60'
                                : item.status === 'cancelled'
                                ? 'bg-rose-50/40 border-rose-100 opacity-50'
                                : 'bg-gray-50/80 border-gray-200/60'
                            }`}
                          >
                            <div className="flex-1 mr-2">
                              <p
                                className={`font-bold ${
                                  item.status === 'cancelled'
                                    ? 'line-through text-rose-800'
                                    : 'text-gray-900'
                                }`}
                              >
                                {item.quantity}x {item.nameSnapshot}
                              </p>
                              {item.note && (
                                <p className="text-[11px] text-amber-700 italic mt-0.5">
                                  "{item.note}"
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <span
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                                  item.status === 'ready'
                                    ? 'bg-emerald-600 text-white shadow-xs'
                                    : item.status === 'preparing'
                                    ? 'bg-blue-600 text-white'
                                    : item.status === 'served'
                                    ? 'bg-gray-200 text-gray-700'
                                    : item.status === 'cancelled'
                                    ? 'bg-rose-100 text-rose-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {item.status}
                              </span>

                              {/* One-tap Serve button for any unserved item */}
                              {item.status !== 'served' && item.status !== 'cancelled' && (
                                <button
                                  onClick={() => handleMarkServed(order._id, item._id)}
                                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-lg text-xs shadow-xs transition-all active:scale-95 flex items-center gap-1"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  Serve
                                </button>
                              )}

                              {/* Cancellation for eligible pending items */}
                              {item.status === 'pending' && (
                                <button
                                  onClick={() => handleOpenCancel(order._id, item)}
                                  title="Cancel item"
                                  className="p-1 text-gray-400 hover:text-rose-600 transition-colors"
                                >
                                  <XCircle className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Card Footer: Total, Add Items, Cancel, Complete */}
                    <div className="mt-5 pt-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                          Total Ticket
                        </span>
                        <span className="font-black text-gray-900 text-base">
                          {order.totalAmount || 0} {STRINGS.currency}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {order.items.some((i) => i.status !== 'served' && i.status !== 'cancelled') && (
                          <button
                            onClick={() => handleServeAllItems(order)}
                            className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold border border-emerald-200 transition-all active:scale-95 flex items-center gap-1"
                            title="Mark all items served"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Serve All
                          </button>
                        )}

                        <button
                          onClick={() => handleOpenCancelOrder(order)}
                          className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold border border-rose-200 transition-all active:scale-95 flex items-center gap-1"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Cancel
                        </button>

                        <button
                          onClick={() => handleOpenAddItems(order)}
                          className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl text-xs font-bold transition-all active:scale-95"
                        >
                          + Add Items
                        </button>

                        <button
                          onClick={() => handleOpenPayment(order)}
                          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold shadow-sm transition-all active:scale-95 flex items-center gap-1.5"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Complete &amp; Pay
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Completed Orders History View */}
      {!loading && filterTab === 'completed' && (
        <div className="bg-white rounded-3xl border border-gray-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-extrabold text-gray-900 text-base">Completed Order History</h3>
            <span className="text-xs text-emerald-600 font-bold bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
              All closed &amp; paid tickets
            </span>
          </div>

          {filteredCompletedOrders.length === 0 ? (
            <div className="p-12 text-center text-gray-400 text-sm">No completed orders found for this filter.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-4">Ticket #</th>
                    <th className="px-6 py-4">Table</th>
                    <th className="px-6 py-4">Server</th>
                    <th className="px-6 py-4">Payment</th>
                    <th className="px-6 py-4">Ordered Dishes</th>
                    <th className="px-6 py-4">Closed Time</th>
                    <th className="px-6 py-4 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium">
                  {filteredCompletedOrders.map((order) => (
                    <tr key={order._id} className="hover:bg-amber-50/40 transition-colors">
                      <td className="px-6 py-4 font-black text-gray-900">#{order.orderNumber}</td>
                      <td className="px-6 py-4 font-bold text-gray-800">{order.table?.name || 'Table'}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-bold bg-amber-50 text-amber-900 border border-amber-200/60">
                          <User className="w-3 h-3 text-amber-700" />
                          <span>{order.waiter?.name || order.waiter?.username || 'Staff'}</span>
                          {(order.waiter?._id === user?._id || order.waiter === user?._id) && (
                            <span className="bg-amber-600 text-white text-[8px] px-1 rounded font-black">
                              YOU
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                          order.paymentMethod === 'transfer'
                            ? 'bg-blue-100 text-blue-800 border border-blue-200'
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        }`}>
                          {order.paymentMethod === 'transfer' ? <Smartphone className="w-3 h-3" /> : <Banknote className="w-3 h-3" />}
                          <span className="capitalize">{order.paymentMethod || 'cash'}</span>
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-600">
                        {order.items?.map((i) => `${i.quantity}x ${i.nameSnapshot}`).join(', ')}
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-500">
                        {new Date(order.closedAt || order.updatedAt).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right font-black text-emerald-600">
                        {order.totalAmount || 0} {STRINGS.currency}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Cancelled Orders History View */}
      {!loading && filterTab === 'cancelled' && (
        <div className="bg-white rounded-3xl border border-gray-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-extrabold text-gray-900 text-base">Cancelled Orders History</h3>
            <span className="text-xs text-rose-600 font-bold bg-rose-50 px-3 py-1 rounded-full border border-rose-200">
              Voided / Cancelled tickets
            </span>
          </div>

          {filteredCancelledOrders.length === 0 ? (
            <div className="p-12 text-center text-gray-400 text-sm">No cancelled orders found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-4">Ticket #</th>
                    <th className="px-6 py-4">Table</th>
                    <th className="px-6 py-4">Server</th>
                    <th className="px-6 py-4">Cancellation Reason</th>
                    <th className="px-6 py-4">Cancelled Date</th>
                    <th className="px-6 py-4 text-right">Voided Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium">
                  {filteredCancelledOrders.map((order) => (
                    <tr key={order._id} className="hover:bg-rose-50/20 transition-colors">
                      <td className="px-6 py-4 font-black text-rose-700">#{order.orderNumber}</td>
                      <td className="px-6 py-4 font-bold text-gray-800">{order.table?.name || 'Table'}</td>
                      <td className="px-6 py-4 text-xs text-gray-600">
                        @{order.waiter?.username || order.waiter?.name || 'staff'}
                      </td>
                      <td className="px-6 py-4 text-xs text-rose-700 font-bold">
                        {order.cancelReason || 'Cancelled by staff'}
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-500">
                        {new Date(order.cancelledAt || order.updatedAt).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right font-black text-gray-400 line-through">
                        {order.totalAmount || 0} {STRINGS.currency}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL: ADD ITEMS TO EXISTING ORDER */}
      {isAddModalOpen && selectedOrderForAdd && (
        <Modal
          isOpen={isAddModalOpen}
          onClose={() => {
            setIsAddModalOpen(false);
            setAdditionalCart([]);
            setSelectedOrderForAdd(null);
          }}
          title={`Add Dishes to Ticket #${selectedOrderForAdd.orderNumber} (${selectedOrderForAdd.table?.name})`}
          maxWidth="max-w-3xl"
        >
          <div className="space-y-4">
            {/* Category Filter Pills */}
            <div className="flex space-x-2 overflow-x-auto no-scrollbar pb-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize whitespace-nowrap transition-all ${
                    selectedCategory === cat
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Menu Items Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-60 overflow-y-auto p-1">
              {menuItems
                .filter((item) => !selectedCategory || item.category === selectedCategory)
                .map((item) => (
                  <button
                    key={item._id}
                    onClick={() => addToAdditionalCart(item)}
                    className="p-3 text-left rounded-2xl border border-gray-200 bg-white hover:border-amber-500 hover:shadow-xs transition-all flex flex-col justify-between active:scale-95"
                  >
                    <div>
                      <p className="font-bold text-gray-900 text-xs">{item.name}</p>
                      <p className="text-[11px] text-gray-400 capitalize">{item.category}</p>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="font-black text-emerald-600 text-xs">
                        {item.price} {STRINGS.currency}
                      </span>
                      <span className="w-5 h-5 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center text-xs font-black">
                        +
                      </span>
                    </div>
                  </button>
                ))}
            </div>

            {/* Additional Cart Summary */}
            {additionalCart.length > 0 && (
              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200 space-y-2">
                <h4 className="text-xs font-extrabold text-gray-700 uppercase tracking-wider">
                  New Items to Send to Kitchen:
                </h4>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {additionalCart.map((c, idx) => (
                    <div
                      key={c.menuItem._id}
                      className="flex items-center justify-between text-xs bg-white p-2 rounded-xl border border-gray-100"
                    >
                      <span className="font-bold text-gray-800">{c.menuItem.name}</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateAdditionalQty(idx, -1)}
                          className="w-5 h-5 rounded bg-gray-100 text-gray-700 flex items-center justify-center font-bold"
                        >
                          -
                        </button>
                        <span className="font-black text-gray-900">{c.quantity}</span>
                        <button
                          onClick={() => updateAdditionalQty(idx, 1)}
                          className="w-5 h-5 rounded bg-gray-100 text-gray-700 flex items-center justify-center font-bold"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 text-xs font-bold rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={additionalCart.length === 0 || submittingAdd}
                onClick={submitAdditionalItems}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs"
              >
                {submittingAdd ? 'Sending...' : 'Send to Kitchen'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL: ITEM CANCELLATION */}
      {isCancelModalOpen && cancellingItem && (
        <Modal
          isOpen={isCancelModalOpen}
          onClose={() => setIsCancelModalOpen(false)}
          title="Cancel Ordered Item"
        >
          <div className="space-y-4">
            <p className="text-xs text-gray-600">
              Are you sure you want to cancel{' '}
              <strong className="text-gray-900">
                {cancellingItem.item.quantity}x {cancellingItem.item.nameSnapshot}
              </strong>
              ?
            </p>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Reason for cancellation (optional):
              </label>
              <input
                type="text"
                placeholder="e.g. Customer changed mind, wrong item selected"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full text-xs border border-gray-200 rounded-xl p-2.5 focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsCancelModalOpen(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 text-xs font-bold rounded-xl"
              >
                Keep Item
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs"
              >
                Confirm Cancellation
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL: COMPLETE ORDER & PAYMENT METHOD */}
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
                Select Customer Payment Method
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

      {/* MODAL: CANCEL ENTIRE ORDER */}
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
                • Un-prepared items will have inventory stock restored automatically.<br/>
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

