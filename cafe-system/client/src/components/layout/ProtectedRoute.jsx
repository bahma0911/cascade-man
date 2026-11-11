import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

export default function ProtectedRoute({ children, allowedRoles, requireInventory = false }) {
  const { user, loading, isAuthenticated, canManageInventory } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-amber-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium text-gray-600">Initializing session...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Redirect to their default dashboard
    if (user.role === 'admin') return <Navigate to="/admin" replace />;
    if (user.role === 'kitchen') return <Navigate to="/kitchen" replace />;
    if (user.role === 'barista') return <Navigate to="/barista" replace />;
    return <Navigate to="/waiter" replace />;
  }

  if (requireInventory && !canManageInventory) {
    if (user?.role === 'admin') return <Navigate to="/admin" replace />;
    if (user?.role === 'kitchen') return <Navigate to="/kitchen" replace />;
    if (user?.role === 'barista') return <Navigate to="/barista" replace />;
    return <Navigate to="/waiter" replace />;
  }

  return children;
}

