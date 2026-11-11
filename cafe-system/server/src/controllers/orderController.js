import { z } from 'zod';
import mongoose from 'mongoose';
import { orderService } from '../services/orderService.js';
import { Order } from '../models/Order.js';
import { socketEvents } from '../sockets/socket.js';

const orderItemInputSchema = z.object({
  menuItemId: z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
    message: 'Invalid menu item ID',
  }),
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
  note: z.string().trim().max(150).optional().default(''),
});

export const createOrderSchema = z.object({
  tableId: z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
    message: 'Invalid table ID',
  }),
  items: z.array(orderItemInputSchema).min(1, 'At least one item is required'),
  lateEntry: z.boolean().optional().default(false),
  customCreatedAt: z.string().datetime().optional().nullable(),
});

export const addItemsSchema = z.object({
  items: z.array(orderItemInputSchema).min(1, 'At least one item is required'),
});

export const updateItemStatusSchema = z.object({
  status: z.enum(['pending', 'preparing', 'ready', 'served']),
});

export const cancelItemSchema = z.object({
  reason: z.string().trim().max(200).optional().default(''),
});

export async function createOrder(req, res, next) {
  try {
    const { tableId, items, lateEntry, customCreatedAt } = req.body;

    const result = await orderService.createOrder({
      tableId,
      waiterId: req.user._id,
      items,
      lateEntry,
      customCreatedAt,
    });

    // Real-time notification (Section 7)
    socketEvents.emitNewOrder(result.order, result.lowStockAlerts);

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

export async function addItemsToOrder(req, res, next) {
  try {
    const { id } = req.params;
    const { items } = req.body;

    const result = await orderService.addItemsToOrder(id, items, req.user._id);

    // Real-time notification
    socketEvents.emitItemsAdded(result.order, result.addedItems, result.lowStockAlerts);

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateItemStatus(req, res, next) {
  try {
    const { id, itemId } = req.params;
    const { status } = req.body;

    const order = await orderService.updateItemStatus(id, itemId, status, req.user);

    // Real-time notification
    socketEvents.emitItemStatusChanged(id, itemId, status, order);

    res.json({
      success: true,
      data: { order },
    });
  } catch (err) {
    next(err);
  }
}

export async function cancelItem(req, res, next) {
  try {
    const { id, itemId } = req.params;
    const { reason } = req.body;

    const result = await orderService.cancelItem(id, itemId, reason, req.user);

    // Real-time notification
    socketEvents.emitItemStatusChanged(id, itemId, 'cancelled', result.order);

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

export async function closeOrder(req, res, next) {
  try {
    const { id } = req.params;
    const { paymentMethod = 'cash', autoServeReady } = req.body || {};
    // If autoServeReady is not explicitly boolean, default to true if paymentMethod or autoServeReady is present
    const shouldAutoServe = autoServeReady !== undefined ? Boolean(autoServeReady) : Boolean(req.body?.paymentMethod);
    const order = await orderService.closeOrder(id, req.user, {
      paymentMethod,
      autoServeReady: shouldAutoServe,
    });

    // Real-time notification
    socketEvents.emitOrderClosed(id, order);

    res.json({
      success: true,
      data: { order },
    });
  } catch (err) {
    next(err);
  }
}

export async function cancelOrder(req, res, next) {
  try {
    const { id } = req.params;
    const { reason = 'Cancelled by staff' } = req.body || {};
    const order = await orderService.cancelOrder(id, reason, req.user);

    // Real-time notification
    socketEvents.emitOrderCancelled(id, order);

    res.json({
      success: true,
      data: { order },
    });
  } catch (err) {
    next(err);
  }
}

export async function getActiveOrders(req, res, next) {
  try {
    const orders = await orderService.getActiveOrders();
    res.json({
      success: true,
      data: { orders },
    });
  } catch (err) {
    next(err);
  }
}

export async function getMyOrders(req, res, next) {
  try {
    const { status } = req.query;
    const orders = await orderService.getMyOrders(req.user._id, status);
    res.json({
      success: true,
      data: { orders },
    });
  } catch (err) {
    next(err);
  }
}

export async function getOrderById(req, res, next) {
  try {
    const { id } = req.params;
    const order = await Order.findById(id)
      .populate('table', 'name')
      .populate('waiter', 'name username');

    if (!order) {
      return res.status(404).json({
        success: false,
        error: { message: 'Order not found', code: 'NOT_FOUND' },
      });
    }

    res.json({
      success: true,
      data: { order },
    });
  } catch (err) {
    next(err);
  }
}

export async function getOrderHistory(req, res, next) {
  try {
    const { status, tableId, startDate, endDate, page, limit } = req.query;
    let { waiterId } = req.query;

    // Waiters can only view orders they created; Admins can view all orders
    if (req.user.role === 'waiter') {
      waiterId = req.user._id.toString();
    }

    const result = await orderService.getOrderHistory({
      status,
      tableId,
      waiterId,
      startDate,
      endDate,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

