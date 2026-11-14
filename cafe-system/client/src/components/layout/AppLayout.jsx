import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import Header from '../common/Header.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { STRINGS } from '../../locales/strings.js';
import {
  LayoutDashboard,
  UtensilsCrossed,
  Boxes,
  Grid,
  Users,
  ChefHat,
  ShoppingBag,
  Scale,
  BarChart3,
  ClipboardList,
  Receipt,
  Clock,
  Mail,
  Coffee,
} from 'lucide-react';

export default function AppLayout() {
  const { isAdmin, isWaiter, isKitchen, isBarista, canManageInventory } = useAuth();

  const navLinkClass = ({ isActive }) =>
    `flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all whitespace-nowrap active:scale-95 ${
      isActive
        ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
    }`;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />

      {/* Navigation Bar */}
      <div className="bg-white border-b border-gray-200 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-2 py-2 overflow-x-auto no-scrollbar">
            {isAdmin && (
              <>
                <NavLink to="/admin" end className={navLinkClass}>
                  <LayoutDashboard className="w-4 h-4" />
                  {STRINGS.nav.dashboard}
                </NavLink>
                <NavLink to="/admin/menu" className={navLinkClass}>
                  <UtensilsCrossed className="w-4 h-4" />
                  {STRINGS.nav.menu}
                </NavLink>
                <NavLink to="/admin/ingredients" className={navLinkClass}>
                  <Boxes className="w-4 h-4" />
                  {STRINGS.nav.ingredients}
                </NavLink>
                <NavLink to="/admin/tables" className={navLinkClass}>
                  <Grid className="w-4 h-4" />
                  {STRINGS.nav.tables}
                </NavLink>
                <NavLink to="/admin/users" className={navLinkClass}>
                  <Users className="w-4 h-4" />
                  {STRINGS.nav.users}
                </NavLink>
                <NavLink to="/inventory" className={navLinkClass}>
                  <ClipboardList className="w-4 h-4" />
                  {STRINGS.nav.inventory}
                </NavLink>
                <NavLink to="/admin/expenses" className={navLinkClass}>
                  <Receipt className="w-4 h-4" />
                  Expenses
                </NavLink>
                <NavLink to="/kitchen" className={navLinkClass}>
                  <ChefHat className="w-4 h-4" />
                  Kitchen & Bar
                </NavLink>
                <NavLink to="/admin/reports" className={navLinkClass}>
                  <BarChart3 className="w-4 h-4" />
                  {STRINGS.nav.reports}
                </NavLink>
                <NavLink to="/admin/notifications" className={navLinkClass}>
                  <Mail className="w-4 h-4" />
                  Notifications
                </NavLink>
              </>
            )}

            {isWaiter && (
              <>
                <NavLink to="/waiter" end className={navLinkClass}>
                  <ShoppingBag className="w-4 h-4" />
                  {STRINGS.nav.orders}
                </NavLink>
                <NavLink to="/waiter/orders" className={navLinkClass}>
                  <Clock className="w-4 h-4" />
                  My Orders
                </NavLink>
                {canManageInventory && (
                  <NavLink to="/inventory" className={navLinkClass}>
                    <Boxes className="w-4 h-4" />
                    {STRINGS.nav.inventory}
                  </NavLink>
                )}
              </>
            )}

            {(isKitchen || isBarista) && (
              <>
                <NavLink to="/kitchen" end className={navLinkClass}>
                  <ChefHat className="w-4 h-4" />
                  Kitchen & Bar
                </NavLink>
                <NavLink to="/kitchen/prep-wastage" className={navLinkClass}>
                  <Scale className="w-4 h-4" />
                  {STRINGS.nav.prepWastage}
                </NavLink>
              </>
            )}
          </nav>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Outlet />
      </main>
    </div>
  );
}

