import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { corsOriginHandler } from '../utils/cors.js';

let io = null;

export function initSocketIO(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: corsOriginHandler,
      credentials: true,
    },
  });

  // JWT Authentication Middleware for WebSockets
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) {
        return next(new Error('Authentication token required for WebSocket'));
      }

      const decoded = jwt.verify(token, config.jwtSecret);
      socket.user = decoded;
      next();
    } catch (err) {
      next(new Error('Invalid or expired WebSocket token'));
    }
  });

  io.on('connection', (socket) => {
    const { id, role } = socket.user;

    // Join role-based rooms
    socket.join(`role:${role}`);
    socket.join(`user:${id}`);

    // Admins join all rooms for monitoring
    if (role === 'admin') {
      socket.join('role:kitchen');
      socket.join('role:barista');
      socket.join('role:waiter');
    }

    console.log(`[Socket.IO] Client connected: ${socket.id} (User: ${id}, Role: ${role})`);

    socket.on('disconnect', (reason) => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id} (${reason})`);
    });
  });

  return io;
}

export function getIO() {
  return io;
}

/**
 * Socket Notification Helper Functions
 */
export const socketEvents = {
  // New order created (only non-late orders notify kitchen & barista)
  emitNewOrder(order, lowStockAlerts = []) {
    if (!io) return;

    if (!order.lateEntry) {
      io.to('role:kitchen').emit('order:new', { order });
      io.to('role:barista').emit('order:new', { order });
    }
    io.to('role:waiter').emit('order:new', { order });
    io.to('role:admin').emit('order:new', { order });

    if (lowStockAlerts && lowStockAlerts.length > 0) {
      io.to('role:admin').emit('stock:low', { alerts: lowStockAlerts });
    }
  },

  // Items added to open order
  emitItemsAdded(order, addedItems, lowStockAlerts = []) {
    if (!io) return;

    if (!order.lateEntry) {
      io.to('role:kitchen').emit('order:items-added', { order, addedItems });
      io.to('role:barista').emit('order:items-added', { order, addedItems });
    }
    io.to('role:waiter').emit('order:items-added', { order, addedItems });
    io.to('role:admin').emit('order:items-added', { order, addedItems });

    if (lowStockAlerts && lowStockAlerts.length > 0) {
      io.to('role:admin').emit('stock:low', { alerts: lowStockAlerts });
    }
  },

  // Item status updated (pending -> preparing -> ready -> served / cancelled)
  emitItemStatusChanged(orderId, itemId, status, order) {
    if (!io) return;

    const payload = { orderId, itemId, status, order };
    io.to('role:kitchen').emit('item:status-changed', payload);
    io.to('role:barista').emit('item:status-changed', payload);
    io.to('role:waiter').emit('item:status-changed', payload);
    io.to('role:admin').emit('item:status-changed', payload);
  },

  // Order closed
  emitOrderClosed(orderId, order) {
    if (!io) return;

    const payload = { orderId, order };
    io.to('role:kitchen').emit('order:closed', payload);
    io.to('role:barista').emit('order:closed', payload);
    io.to('role:waiter').emit('order:closed', payload);
    io.to('role:admin').emit('order:closed', payload);
  },

  // Order cancelled
  emitOrderCancelled(orderId, order) {
    if (!io) return;

    const payload = { orderId, order };
    io.to('role:kitchen').emit('order:cancelled', payload);
    io.to('role:barista').emit('order:cancelled', payload);
    io.to('role:waiter').emit('order:cancelled', payload);
    io.to('role:admin').emit('order:cancelled', payload);

    // Also notify closed handlers so active lists remove it immediately
    io.to('role:kitchen').emit('order:closed', payload);
    io.to('role:barista').emit('order:closed', payload);
    io.to('role:waiter').emit('order:closed', payload);
    io.to('role:admin').emit('order:closed', payload);
  },

  // Low stock alert
  emitLowStock(alerts) {
    if (!io || !alerts || alerts.length === 0) return;
    io.to('role:admin').emit('stock:low', { alerts });
  },
};

