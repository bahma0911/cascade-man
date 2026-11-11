import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('cafe_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem('cafe_token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function verifySession() {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const res = await authApi.getMe();
        if (res.data?.success) {
          const freshUser = res.data.data.user;
          setUser(freshUser);
          localStorage.setItem('cafe_user', JSON.stringify(freshUser));
        }
      } catch (err) {
        console.warn('Session verification failed, clearing auth state');
        logout();
      } finally {
        setLoading(false);
      }
    }

    verifySession();
  }, [token]);

  const login = async (username, password) => {
    const res = await authApi.login({ username, password });
    if (res.data?.success) {
      const { token: newToken, user: newUser } = res.data.data;
      localStorage.setItem('cafe_token', newToken);
      localStorage.setItem('cafe_user', JSON.stringify(newUser));
      setToken(newToken);
      setUser(newUser);
      return newUser;
    }
    throw new Error(res.data?.error?.message || 'Login failed');
  };

  const logout = () => {
    localStorage.removeItem('cafe_token');
    localStorage.removeItem('cafe_user');
    setToken(null);
    setUser(null);
  };

  const value = {
    user,
    token,
    loading,
    login,
    logout,
    isAuthenticated: Boolean(user && token),
    isAdmin: user?.role === 'admin',
    isWaiter: user?.role === 'waiter',
    isKitchen: user?.role === 'kitchen',
    isBarista: user?.role === 'barista',
    canManageInventory: Boolean(user?.role === 'admin' || (user?.role === 'waiter' && user?.canManageInventory)),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

