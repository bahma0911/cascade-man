import mongoose from 'mongoose';
import { Order } from '../models/Order.js';
import { MenuItem } from '../models/MenuItem.js';
import { Table } from '../models/Table.js';
import { Ingredient } from '../models/Ingredient.js';
import { stockService } from './stockService.js';
import { notificationService } from './notificationService.js';
import { getDailyBounds } from '../utils/timezone.js';

/**
 * Executes a transaction with automatic retry on TransientTransactionError / WriteConflict.
 * This guarantees atomic serialization under concurrent orders on identical ingredients.
 */
async function executeTransactionWithRetry(fn, maxRetries = 5) {
  let attempts = 0;
  while (attempts < maxRetries) {
    attempts++;
    const session = await mongoose.startSession();
    try {
      let result;
      await session.withTransaction(async () => {
        result = await fn(session);
      });
      return result;
    } catch (err) {
      const isTransient =
        (err.hasErrorLabel && err.hasErrorLabel('TransientTransactionError')) ||
        (err.errorLabels && err.errorLabels.includes('TransientTransactionError'));
      const isWriteConflict = err.code === 112 || err.codeName === 'WriteConflict';

      if ((isTransient || isWriteConflict) && attempts < maxRetries) {
        const delay = Math.floor(Math.random() * 40) + 20;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    } finally {
      await session.endSession();
    }
  }
}

export function determineItemType(item) {
  if (item?.itemType === 'drink' || item?.itemType === 'food') {
    return item.itemType;
  }
  const cat = (item?.category || '').toLowerCase();
  const name = (item?.name || '').toLowerCase();
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
  if (drinkKeywords.some((k) => cat.includes(k) || name.includes(k))) {
    return 'drink';
  }
  return 'food';
}

/**
 * Snapshots a menu item's recipe with wastage rates at order time.
 * Skips any orphaned recipe lines whose ingredient record no longer exists.
 */
function buildRecipeSnapshot(menuItem) {
  return (menuItem.recipe || [])
    .filter((r) => Boolean(r?.ingredient))
    .map((r) => {
      const ing = r.ingredient;
      const wastageRate = ing.autoWastageEnabled ? ing.wastageRate || 0 : 0;
      const usableQty = r.quantity;
      const grossQty =
        wastageRate > 0 && wastageRate < 1
          ? Number((usableQty / (1 - wastageRate)).toFixed(4))
          : usableQty;

      return {
        ingredient: ing._id,
        quantity: usableQty,
        wastageRate,
        grossQuantity: grossQty,
      };
    });
}

export const orderService = {
  /**
   * Creates an order with items inside a MongoDB transaction.
   * Atomically validates items, snapshots recipe & pricing, deducts stock, and creates order.
   */
  async createOrder({
    tableId,
    waiterId,
    items,
    lateEntry = false,
    customCreatedAt = null,
  }) {
    if (!items || items.length === 0) {
      throw new Error('Order must contain at least one item');
    }

    const result = await executeTransactionWithRetry(async (session) => {
      // 1. Verify Table exists and is active
      const table = await Table.findById(tableId).session(session);
      if (!table || !table.isActive) {
        throw new Error('Selected dining table does not exist or is inactive');
      }

      // Check if table currently has an open order (unless late entry)
      if (!lateEntry) {
        const existingOpen = await Order.findOne({ table: tableId, status: 'open' }).session(session);
        if (existingOpen) {
          throw new Error(`Table ${table.name} already has an active open order (#${existingOpen.orderNumber})`);
        }
      }

      // 2. Compute daily sequential order number
      const orderDate = customCreatedAt ? new Date(customCreatedAt) : new Date();
      const { startOfDay, endOfDay } = getDailyBounds(orderDate);

      const latestOrderToday = await Order.findOne({
        createdAt: { $gte: startOfDay, $lte: endOfDay },
      })
        .sort({ orderNumber: -1 })
        .session(session);

      const nextOrderNumber = latestOrderToday ? latestOrderToday.orderNumber + 1 : 1;

      // 3. Snapshot items and validate MenuItems
      const snapshotItems = [];
      const menuItemIds = items.map((i) => i.menuItemId);
      const menuItems = await MenuItem.find({ _id: { $in: menuItemIds }, isActive: true })
        .populate('recipe.ingredient')
        .session(session);

      const menuMap = new Map(menuItems.map((m) => [m._id.toString(), m]));

      for (const itemReq of items) {
        const menuItem = menuMap.get(itemReq.menuItemId.toString());
        if (!menuItem) {
          throw new Error(`Menu item ${itemReq.menuItemId} is not available`);
        }
        if (!menuItem.isAvailable) {
          throw new Error(`Menu item "${menuItem.name}" is currently marked out of stock`);
        }

        const recipeSnapshot = buildRecipeSnapshot(menuItem);

        const itemType = determineItemType(menuItem);

        snapshotItems.push({
          _id: new mongoose.Types.ObjectId(),
          nameSnapshot: menuItem.name,
          priceSnapshot: menuItem.price,
          categorySnapshot: menuItem.category || '',
          itemType,
          quantity: itemReq.quantity,
          note: itemReq.note || '',
          status: 'pending',
          recipeSnapshot,
          addedAt: customCreatedAt ? new Date(customCreatedAt) : new Date(),
          cancelReason: '',
          cancelledAfterPrep: false,
        });
      }

      // 4. Create Order document
      const orderDoc = new Order({
        orderNumber: nextOrderNumber,
        table: tableId,
        waiter: waiterId,
        status: 'open',
        lateEntry: Boolean(lateEntry),
        createdAt: customCreatedAt ? new Date(customCreatedAt) : new Date(),
        items: snapshotItems,
      });

      // 5. Atomically deduct stock inside the transaction (Rule 1 & Rule 13)
      const { stockMovement, lowStockAlerts } = await stockService.deductStockForOrderItems(
        snapshotItems,
        waiterId,
        session,
        orderDoc._id
      );

      await orderDoc.save({ session });

      return {
        order: orderDoc,
        stockMovement,
        lowStockAlerts,
      };
    });

    // Asynchronously dispatch low/critical stock email notifications (Section 15.C)
    if (result.lowStockAlerts?.length > 0) {
      for (const alert of result.lowStockAlerts) {
        Ingredient.findById(alert.ingredientId)
          .then((ing) => {
            if (!ing) return;
            if (ing.currentStock <= 0) {
              notificationService.notifyCriticalStock(ing);
            } else if (ing.currentStock <= ing.lowStockThreshold) {
              notificationService.notifyLowStock(ing);
            }
          })
          .catch(() => {});
      }
    }

    return result;
  },

  /**
   * Adds additional items to an existing open order inside a transaction.
   */
  async addItemsToOrder(orderId, items, performedByUserId) {
    if (!items || items.length === 0) {
      throw new Error('Must provide at least one item to add');
    }

    const result = await executeTransactionWithRetry(async (session) => {
      const order = await Order.findById(orderId).session(session);
      if (!order) throw new Error('Order not found');
      if (order.status !== 'open') {
        throw new Error(`Cannot add items to an order with status "${order.status}"`);
      }

      const snapshotItems = [];
      const menuItemIds = items.map((i) => i.menuItemId);
      const menuItems = await MenuItem.find({ _id: { $in: menuItemIds }, isActive: true })
        .populate('recipe.ingredient')
        .session(session);

      const menuMap = new Map(menuItems.map((m) => [m._id.toString(), m]));

      for (const itemReq of items) {
        const menuItem = menuMap.get(itemReq.menuItemId.toString());
        if (!menuItem || !menuItem.isAvailable) {
          throw new Error(`Menu item ${itemReq.menuItemId} is not available`);
        }

        const recipeSnapshot = buildRecipeSnapshot(menuItem);

        const itemType = determineItemType(menuItem);

        snapshotItems.push({
          _id: new mongoose.Types.ObjectId(),
          nameSnapshot: menuItem.name,
          priceSnapshot: menuItem.price,
          categorySnapshot: menuItem.category || '',
          itemType,
          quantity: itemReq.quantity,
          note: itemReq.note || '',
          status: 'pending',
          recipeSnapshot,
          addedAt: new Date(),
          cancelReason: '',
          cancelledAfterPrep: false,
        });
      }

      // Deduct stock for new items
      const { stockMovement, lowStockAlerts } = await stockService.deductStockForOrderItems(
        snapshotItems,
        performedByUserId,
        session,
        order._id
      );

      // Append items to order
      order.items.push(...snapshotItems);
      await order.save({ session });

      return {
        order,
        addedItems: snapshotItems,
        stockMovement,
        lowStockAlerts,
      };
    });

    if (result.lowStockAlerts?.length > 0) {
      for (const alert of result.lowStockAlerts) {
        Ingredient.findById(alert.ingredientId)
          .then((ing) => {
            if (!ing) return;
            if (ing.currentStock <= 0) {
              notificationService.notifyCriticalStock(ing);
            } else if (ing.currentStock <= ing.lowStockThreshold) {
              notificationService.notifyLowStock(ing);
            }
          })
          .catch(() => {});
      }
    }

    return result;
  },

  /**
   * Updates an item's status forward: pending -> preparing -> ready -> served
   * Kitchen sets preparing / ready; Waiter sets served; Admin sets any.
   */
  async updateItemStatus(orderId, itemId, newStatus, user) {
    const validStatuses = ['pending', 'preparing', 'ready', 'served'];
    if (!validStatuses.includes(newStatus)) {
      throw new Error(`Invalid status: ${newStatus}`);
    }

    const order = await Order.findById(orderId);
    if (!order) throw new Error('Order not found');

    const item = order.items.id(itemId);
    if (!item) throw new Error('Order item not found');

    if (item.status === 'cancelled') {
      throw new Error('Cannot update status of a cancelled item');
    }

    const statusOrder = { pending: 1, preparing: 2, ready: 3, served: 4 };
    const currentRank = statusOrder[item.status];
    const newRank = statusOrder[newStatus];

    // Status moves forward only
    if (newRank <= currentRank && user.role !== 'admin') {
      throw new Error(`Item status can only move forward (${item.status} -> ${newStatus} not allowed)`);
    }

    // Role verification (Rule 5)
    if (['kitchen', 'barista'].includes(user.role) && !['preparing', 'ready'].includes(newStatus)) {
      throw new Error('Kitchen and barista staff can only set status to preparing or ready');
    }
    if (user.role === 'waiter' && !['ready', 'served'].includes(newStatus)) {
      throw new Error('Waiters can only mark items as ready or served');
    }

    item.status = newStatus;
    await order.save();

    return order;
  },

  /**
   * Cancels an order item (Rule 4).
   * - If pending: restore stock with 'sale_reversal'. Waiters or admin may cancel.
   * - If preparing/ready: requires reason, do NOT restore stock, set cancelledAfterPrep = true. Admin only.
   */
  async cancelItem(orderId, itemId, reason, user) {
    const result = await executeTransactionWithRetry(async (session) => {
      const order = await Order.findById(orderId).session(session);
      if (!order) throw new Error('Order not found');

      const item = order.items.id(itemId);
      if (!item) throw new Error('Order item not found');

      if (item.status === 'cancelled') {
        throw new Error('Item is already cancelled');
      }
      if (item.status === 'served') {
        throw new Error('Served items cannot be cancelled');
      }

      let restoredStock = false;

      if (item.status === 'pending') {
        if (!['waiter', 'admin'].includes(user.role)) {
          throw new Error('Only waiters or administrators can cancel pending items');
        }
        // Waiter or Admin may cancel pending items
        await stockService.restoreStockForCancelledItem(item, user._id, session, order._id);
        restoredStock = true;
        item.status = 'cancelled';
        item.cancelReason = reason || 'Cancelled before preparation';
        item.cancelledAfterPrep = false;
      } else if (['preparing', 'ready'].includes(item.status)) {
        // Admin only
        if (user.role !== 'admin') {
          throw new Error('Only administrators can cancel items that have already entered preparation');
        }
        if (!reason || !reason.trim()) {
          throw new Error('Cancellation reason is required for items already in preparation');
        }

        // Do NOT restore stock; mark for waste report
        item.status = 'cancelled';
        item.cancelReason = reason.trim();
        item.cancelledAfterPrep = true;
      }

      await order.save({ session });
      return { order, item, restoredStock };
    });

    if (result.restoredStock && result.item?.recipeSnapshot) {
      for (const line of result.item.recipeSnapshot) {
        if (!line.ingredient) continue;
        Ingredient.findById(line.ingredient)
          .then((ing) => {
            if (ing && ing.currentStock > ing.lowStockThreshold) {
              notificationService.resetAlertFlagsOnRestock(ing._id, ing.currentStock, ing.lowStockThreshold);
            }
          })
          .catch(() => {});
      }
    }

    return result;
  },

  /**
   * Closes an order when all items are served or cancelled (Rule 5).
   * Supports paymentMethod: 'cash' | 'transfer'.
   * If autoServeReady is true, automatically transitions ready/preparing items to served upon closing.
   * Frees the dining table.
   */
  async closeOrder(orderId, user, { paymentMethod = 'cash', autoServeReady = false } = {}) {
    const order = await Order.findById(orderId);
    if (!order) throw new Error('Order not found');
    if (order.status !== 'open') {
      throw new Error(`Order is already ${order.status}`);
    }

    if (autoServeReady) {
      for (const item of order.items) {
        if (item.status !== 'cancelled' && item.status !== 'served') {
          item.status = 'served';
        }
      }
    } else {
      // Ensure all items are either served or cancelled
      const unservedItems = order.items.filter(
        (item) => item.status !== 'served' && item.status !== 'cancelled'
      );

      if (unservedItems.length > 0) {
        throw new Error(
          `Cannot close order: ${unservedItems.length} item(s) are not yet served or cancelled`
        );
      }
    }

    order.status = 'closed';
    order.closedAt = new Date();
    if (paymentMethod && ['cash', 'transfer'].includes(paymentMethod)) {
      order.paymentMethod = paymentMethod;
    } else {
      order.paymentMethod = 'cash';
    }
    await order.save();

    return order;
  },

  /**
   * Cancels an entire open order.
   * Restores inventory for any pending items.
   * Marks preparing/ready/served items as cancelledAfterPrep for waste auditing.
   * Frees the dining table.
   */
  async cancelOrder(orderId, reason = 'Cancelled by staff', user) {
    return executeTransactionWithRetry(async (session) => {
      const order = await Order.findById(orderId).session(session);
      if (!order) throw new Error('Order not found');
      if (order.status !== 'open') {
        throw new Error(`Cannot cancel order: Order is already ${order.status}`);
      }

      for (const item of order.items) {
        if (item.status === 'cancelled') continue;

        if (item.status === 'pending') {
          // Restore inventory stock for pending items
          await stockService.restoreStockForCancelledItem(item, user?._id, session, order._id);
          item.status = 'cancelled';
          item.cancelReason = reason || 'Order cancelled by staff';
          item.cancelledAfterPrep = false;
        } else {
          // Items already in preparation or ready: marked as waste
          item.status = 'cancelled';
          item.cancelReason = reason || 'Order cancelled after prep';
          item.cancelledAfterPrep = true;
        }
      }

      order.status = 'cancelled';
      order.cancelReason = reason || 'Cancelled by staff';
      order.cancelledAt = new Date();
      order.cancelledBy = user?._id || null;

      await order.save({ session });
      return order;
    });
  },

  /**
   * Retrieves active open orders.
   */
  async getActiveOrders(filter = {}) {
    return Order.find({ status: 'open', ...filter })
      .populate('table', 'name')
      .populate('waiter', 'name username')
      .sort({ createdAt: 1 });
  },

  /**
   * Retrieves active or filtered orders for a specific waiter.
   */
  async getMyOrders(waiterId, status) {
    const query = { waiter: waiterId };
    if (status && status !== 'all') {
      query.status = status;
    } else if (!status) {
      query.status = 'open';
    }
    return Order.find(query)
      .populate('table', 'name')
      .populate('waiter', 'name username')
      .sort({ createdAt: -1 });
  },

  /**
   * Retrieves orders history with pagination and filters.
   */
  async getOrderHistory({
    status,
    tableId,
    waiterId,
    startDate,
    endDate,
    page = 1,
    limit = 20,
  }) {
    const query = {};

    if (status) query.status = status;
    if (tableId) query.table = tableId;
    if (waiterId) query.waiter = waiterId;

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate('table', 'name')
        .populate('waiter', 'name username')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Order.countDocuments(query),
    ]);

    return {
      orders,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  },
};
