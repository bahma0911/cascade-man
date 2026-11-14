import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import AppLayout from '../components/layout/AppLayout.jsx';
import ProtectedRoute from '../components/layout/ProtectedRoute.jsx';

// Auth Pages
import LoginPage from '../pages/auth/LoginPage.jsx';

// Admin Pages
import AdminDashboardPage from '../pages/admin/AdminDashboardPage.jsx';
import MenuAdminPage from '../pages/admin/MenuAdminPage.jsx';
import IngredientsAdminPage from '../pages/admin/IngredientsAdminPage.jsx';
import TablesAdminPage from '../pages/admin/TablesAdminPage.jsx';
import UsersAdminPage from '../pages/admin/UsersAdminPage.jsx';
import ReportsAdminPage from '../pages/admin/ReportsAdminPage.jsx';
import ExpensesAdminPage from '../pages/admin/ExpensesAdminPage.jsx';
import NotificationsAdminPage from '../pages/admin/NotificationsAdminPage.jsx';

// Waiter Pages
import WaiterHomePage from '../pages/waiter/WaiterHomePage.jsx';
import WaiterOrdersPage from '../pages/waiter/WaiterOrdersPage.jsx';

// Kitchen Pages
import KitchenBoardPage from '../pages/kitchen/KitchenBoardPage.jsx';
import KitchenPrepWastagePage from '../pages/kitchen/KitchenPrepWastagePage.jsx';

// Barista Pages
import BaristaBoardPage from '../pages/barista/BaristaBoardPage.jsx';

// Inventory Pages
import InventoryToolsPage from '../pages/inventory/InventoryToolsPage.jsx';

function IndexRedirect() {
  const { user, isAuthenticated, loading } = useAuth();
  if (loading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user.role === 'admin') return <Navigate to="/admin" replace />;
  if (user.role === 'kitchen' || user.role === 'barista') return <Navigate to="/kitchen" replace />;
  return <Navigate to="/waiter" replace />;
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<IndexRedirect />} />

      {/* Protected Layout Routes */}
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        {/* Admin Routes */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/menu"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <MenuAdminPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/ingredients"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <IngredientsAdminPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/tables"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <TablesAdminPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <UsersAdminPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/reports"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <ReportsAdminPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/expenses"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <ExpensesAdminPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/notifications"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <NotificationsAdminPage />
            </ProtectedRoute>
          }
        />

        {/* Waiter Routes */}
        <Route
          path="/waiter"
          element={
            <ProtectedRoute allowedRoles={['waiter', 'admin']}>
              <WaiterHomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/waiter/orders"
          element={
            <ProtectedRoute allowedRoles={['waiter', 'admin']}>
              <WaiterOrdersPage />
            </ProtectedRoute>
          }
        />

        {/* Unified Kitchen & Bar Prep Routes */}
        <Route
          path="/kitchen"
          element={
            <ProtectedRoute allowedRoles={['kitchen', 'barista', 'admin']}>
              <KitchenBoardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/kitchen/prep-wastage"
          element={
            <ProtectedRoute allowedRoles={['kitchen', 'barista', 'admin']}>
              <KitchenPrepWastagePage />
            </ProtectedRoute>
          }
        />

        {/* Barista Route (Unified with Kitchen Board) */}
        <Route
          path="/barista"
          element={
            <ProtectedRoute allowedRoles={['barista', 'kitchen', 'admin']}>
              <KitchenBoardPage />
            </ProtectedRoute>
          }
        />

        {/* Inventory Tools Route (Permission-Gated) */}
        <Route
          path="/inventory"
          element={
            <ProtectedRoute requireInventory={true}>
              <InventoryToolsPage />
            </ProtectedRoute>
          }
        />
      </Route>

      {/* Catch-all fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

