import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { menuApi, ingredientsApi, tablesApi, usersApi } from '../../api/client.js';
import { STRINGS } from '../../locales/strings.js';
import {
  UtensilsCrossed,
  Boxes,
  Grid,
  Users,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  ShoppingBag,
  ChefHat,
  BarChart3,
  ClipboardList,
  Receipt,
  Mail,
} from 'lucide-react';

export default function AdminDashboardPage() {
  const [stats, setStats] = useState({
    menuCount: 0,
    ingredientCount: 0,
    tableCount: 0,
    userCount: 0,
    lowStockIngredients: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [menuRes, ingRes, tabRes, userRes] = await Promise.all([
          menuApi.getAll({ all: true }),
          ingredientsApi.getAll(true),
          tablesApi.getAll(true),
          usersApi.getAll(),
        ]);

        const ingredients = ingRes.data?.data?.ingredients || [];
        const lowStock = ingredients.filter(
          (ing) => ing.isActive && ing.currentStock <= ing.lowStockThreshold
        );

        setStats({
          menuCount: menuRes.data?.data?.items?.length || 0,
          ingredientCount: ingredients.length,
          tableCount: tabRes.data?.data?.tables?.length || 0,
          userCount: userRes.data?.data?.users?.length || 0,
          lowStockIngredients: lowStock,
        });
      } catch (err) {
        console.error('Failed to load dashboard data', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-amber-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-amber-600 to-amber-700 rounded-3xl p-6 sm:p-8 text-white shadow-lg shadow-amber-600/20">
        <div className="max-w-2xl">
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2">
            Cafe & Restaurant Control Center
          </h2>
          <p className="text-amber-100 text-sm sm:text-base leading-relaxed">
            Manage recipes, ingredients, tables, staff roles, and monitor live inventory with automatic preparation wastage tracking.
          </p>
        </div>
      </div>

      {/* Low Stock Alert Banner (Rule 3) */}
      {stats.lowStockIngredients.length > 0 && (
        <div className="bg-rose-50 border-2 border-rose-200 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-600 text-white">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-rose-900">
                  Low Stock Alert ({stats.lowStockIngredients.length} item{stats.lowStockIngredients.length > 1 ? 's' : ''})
                </h3>
                <p className="text-xs text-rose-700">
                  The following ingredients have fallen below their safety threshold:
                </p>
              </div>
            </div>
            <Link
              to="/admin/ingredients"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-bold text-rose-800 bg-rose-100 hover:bg-rose-200 px-3.5 py-2 rounded-xl transition-colors"
            >
              Manage Stock <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {stats.lowStockIngredients.map((ing) => (
              <div
                key={ing._id}
                className="bg-white p-4 rounded-2xl border border-rose-200 shadow-xs flex items-center justify-between"
              >
                <div>
                  <p className="font-bold text-gray-900 text-sm">{ing.name}</p>
                  <p className="text-xs text-gray-500">
                    Threshold: {ing.lowStockThreshold} {ing.baseUnit}
                  </p>
                </div>
                <div className="text-right">
                  <span className="inline-block px-2.5 py-1 bg-rose-100 text-rose-800 font-extrabold text-xs rounded-lg">
                    {ing.currentStock} {ing.baseUnit}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <Link
          to="/admin/menu"
          className="bg-white p-5 rounded-3xl border border-gray-200/80 shadow-xs hover:border-amber-500 hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="p-3 bg-amber-50 text-amber-600 rounded-2xl group-hover:scale-105 transition-transform">
              <UtensilsCrossed className="w-6 h-6" />
            </span>
            <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" />
          </div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{STRINGS.nav.menu}</p>
          <p className="text-2xl font-black text-gray-900 mt-1">{stats.menuCount}</p>
        </Link>

        <Link
          to="/admin/ingredients"
          className="bg-white p-5 rounded-3xl border border-gray-200/80 shadow-xs hover:border-amber-500 hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl group-hover:scale-105 transition-transform">
              <Boxes className="w-6 h-6" />
            </span>
            <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" />
          </div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{STRINGS.nav.ingredients}</p>
          <p className="text-2xl font-black text-gray-900 mt-1">{stats.ingredientCount}</p>
        </Link>

        <Link
          to="/admin/tables"
          className="bg-white p-5 rounded-3xl border border-gray-200/80 shadow-xs hover:border-amber-500 hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="p-3 bg-blue-50 text-blue-600 rounded-2xl group-hover:scale-105 transition-transform">
              <Grid className="w-6 h-6" />
            </span>
            <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" />
          </div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{STRINGS.nav.tables}</p>
          <p className="text-2xl font-black text-gray-900 mt-1">{stats.tableCount}</p>
        </Link>

        <Link
          to="/admin/users"
          className="bg-white p-5 rounded-3xl border border-gray-200/80 shadow-xs hover:border-amber-500 hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="p-3 bg-purple-50 text-purple-600 rounded-2xl group-hover:scale-105 transition-transform">
              <Users className="w-6 h-6" />
            </span>
            <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" />
          </div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{STRINGS.nav.users}</p>
          <p className="text-2xl font-black text-gray-900 mt-1">{stats.userCount}</p>
        </Link>
      </div>

      {/* Operational Portals Preview */}
      <div>
        <h3 className="text-base font-bold text-gray-900 mb-4">Quick Terminal Navigation</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            to="/waiter"
            className="flex items-center justify-between p-5 rounded-3xl bg-white border border-gray-200 hover:border-blue-500 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-gray-900">Waiter Ordering Terminal</h4>
                <p className="text-xs text-gray-500">Take orders, view table status, manage open tickets</p>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-gray-400" />
          </Link>

          <Link
            to="/kitchen"
            className="flex items-center justify-between p-5 rounded-3xl bg-white border border-gray-200 hover:border-orange-500 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-orange-100 text-orange-700 flex items-center justify-center font-bold">
                <ChefHat className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-gray-900">Kitchen Display Board</h4>
                <p className="text-xs text-gray-500">Live order tickets, elapsed preparation timers, status updates</p>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-gray-400" />
          </Link>

          <Link
            to="/inventory"
            className="flex items-center justify-between p-5 rounded-3xl bg-white border border-gray-200 hover:border-emerald-500 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                <ClipboardList className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-gray-900">Inventory Management Tools</h4>
                <p className="text-xs text-gray-500">Deliveries, waste log, physical counts, ledger audit & corrections</p>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-gray-400" />
          </Link>

          <Link
            to="/admin/reports"
            className="flex items-center justify-between p-5 rounded-3xl bg-white border border-gray-200 hover:border-purple-500 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                <BarChart3 className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-gray-900">Business & Wastage Reports</h4>
                <p className="text-xs text-gray-500">Sales revenue, top dishes, ingredient usage & audit</p>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-gray-400" />
          </Link>

          <Link
            to="/admin/expenses"
            className="flex items-center justify-between p-5 rounded-3xl bg-white border border-gray-200 hover:border-teal-500 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-teal-100 text-teal-700 flex items-center justify-center font-bold">
                <Receipt className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-gray-900">Operating Expenses</h4>
                <p className="text-xs text-gray-500">Utilities, premise rent, staff salaries & overhead logs</p>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-gray-400" />
          </Link>

          <Link
            to="/admin/notifications"
            className="flex items-center justify-between p-5 rounded-3xl bg-white border border-gray-200 hover:border-amber-500 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                <Mail className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-gray-900">Email Notifications (Resend)</h4>
                <p className="text-xs text-gray-500">Low-stock alerts, daily summaries, executive reports & audit</p>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-gray-400" />
          </Link>
        </div>
      </div>
    </div>
  );
}

