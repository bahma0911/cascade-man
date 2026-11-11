import React from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { STRINGS } from '../../locales/strings.js';
import { Coffee, LogOut, ShieldCheck, UserCheck, ChefHat, Boxes } from 'lucide-react';

export default function Header() {
  const { user, logout, isAdmin, isWaiter, isKitchen, canManageInventory } = useAuth();

  const getRoleBadge = () => {
    if (isAdmin) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">
          <ShieldCheck className="w-3.5 h-3.5" />
          {STRINGS.roles.admin}
        </span>
      );
    }
    if (isKitchen) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-800 border border-orange-200">
          <ChefHat className="w-3.5 h-3.5" />
          {STRINGS.roles.kitchen}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
        <UserCheck className="w-3.5 h-3.5" />
        {STRINGS.roles.waiter}
      </span>
    );
  };

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-600 flex items-center justify-center text-white shadow-md shadow-amber-600/20">
            <Coffee className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900 leading-tight">
              {STRINGS.appName}
            </h1>
            <p className="text-xs text-gray-500 font-medium">Addis Ababa • ETB</p>
          </div>
        </div>

        {/* User Info & Actions */}
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-2">
            {getRoleBadge()}
            {isWaiter && canManageInventory && (
              <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                <Boxes className="w-3 h-3" />
                + Inventory
              </span>
            )}
          </div>

          <div className="hidden md:block text-right">
            <p className="text-xs font-medium text-gray-900">{user?.name}</p>
            <p className="text-[11px] text-gray-500">@{user?.username}</p>
          </div>

          <button
            onClick={logout}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 active:scale-95 rounded-xl transition-all"
            title={STRINGS.auth.logout}
          >
            <LogOut className="w-4 h-4 text-gray-600" />
            <span className="hidden sm:inline">{STRINGS.auth.logout}</span>
          </button>
        </div>
      </div>
    </header>
  );
}

