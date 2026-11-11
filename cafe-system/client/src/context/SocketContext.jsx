import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io as ClientIO } from 'socket.io-client';
import { useAuth } from './AuthContext.jsx';
import { soundPlayer } from '../utils/sound.js';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { token, user, isAuthenticated } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [toasts, setToasts] = useState([]); // [{ id, title, message, type: 'info'|'success'|'warning'|'danger' }]

  // Listeners callbacks storage for dynamic subscription
  const listenersRef = useRef(new Map());

  const addToast = (title, message, type = 'info') => {
    const id = Date.now() + Math.random().toString(36).substring(2, 6);
    setToasts((prev) => [...prev, { id, title, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 6000);
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  useEffect(() => {
    if (!isAuthenticated || !token) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
        setConnected(false);
      }
      return;
    }

    const socketUrl = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '') || '/';
    const socketInstance = ClientIO(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketInstance.on('connect', () => {
      console.log('[Socket.IO] Connected to server as:', user?.username);
      setConnected(true);
      // Trigger reconnect handlers to re-fetch active orders
      const reconnectHandlers = listenersRef.current.get('reconnect') || [];
      reconnectHandlers.forEach((cb) => cb());
    });

    socketInstance.on('disconnect', (reason) => {
      console.log('[Socket.IO] Disconnected:', reason);
      setConnected(false);
    });

    socketInstance.on('connect_error', (err) => {
      console.warn('[Socket.IO] Connection error:', err.message);
      setConnected(false);
    });

    // Central listener dispatch
    const handleEvent = (eventName, data) => {
      const callbacks = listenersRef.current.get(eventName) || [];
      callbacks.forEach((cb) => cb(data));
    };

    socketInstance.on('order:new', (data) => {
      handleEvent('order:new', data);
      if (user?.role === 'kitchen') {
        soundPlayer.playReadyBell();
        addToast('New Order Received', `Order #${data.order.orderNumber} placed for ${data.order.table?.name || 'Table'}`, 'warning');
      }
    });

    socketInstance.on('order:items-added', (data) => {
      handleEvent('order:items-added', data);
      if (user?.role === 'kitchen') {
        soundPlayer.playReadyBell();
        addToast('Items Added', `Order #${data.order.orderNumber} updated with new items`, 'info');
      }
    });

    socketInstance.on('item:status-changed', (data) => {
      handleEvent('item:status-changed', data);
      // If an item becomes ready, notify waiters and admins
      if (data.status === 'ready') {
        soundPlayer.playReadyBell();
        addToast(
          'Dish Ready to Serve! 🍽️',
          `An item in Order #${data.order?.orderNumber || data.orderId} is ready for pickup!`,
          'success'
        );
      }
    });

    socketInstance.on('order:closed', (data) => {
      handleEvent('order:closed', data);
    });

    socketInstance.on('order:cancelled', (data) => {
      handleEvent('order:cancelled', data);
    });

    socketInstance.on('stock:low', (data) => {
      handleEvent('stock:low', data);
      if (user?.role === 'admin') {
        addToast(
          'Low Stock Warning ⚠️',
          `${data.alerts?.length || 0} ingredient(s) are below low stock threshold`,
          'danger'
        );
      }
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [token, isAuthenticated]);

  const on = (eventName, callback) => {
    if (!listenersRef.current.has(eventName)) {
      listenersRef.current.set(eventName, []);
    }
    listenersRef.current.get(eventName).push(callback);

    // Return cleanup unsubscribe function
    return () => {
      const current = listenersRef.current.get(eventName) || [];
      listenersRef.current.set(
        eventName,
        current.filter((cb) => cb !== callback)
      );
    };
  };

  const value = {
    socket,
    connected,
    on,
    addToast,
    toasts,
    removeToast,
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}

