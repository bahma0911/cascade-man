import React, { useState, useEffect } from 'react';
import { usersApi } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { STRINGS } from '../../locales/strings.js';
import Modal from '../../components/common/Modal.jsx';
import {
  Users,
  Plus,
  KeyRound,
  ShieldCheck,
  UserCheck,
  ChefHat,
  Coffee,
  Boxes,
  Trash2,
  AlertCircle,
  Check,
  Eye,
  EyeOff,
} from 'lucide-react';

export default function UsersAdminPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Create User Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [createData, setCreateData] = useState({
    name: '',
    username: '',
    password: '',
    role: 'waiter',
    canManageInventory: false,
  });
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  // Reset Password Modal
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetTargetUser, setResetTargetUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const res = await usersApi.getAll();
      setUsers(res.data?.data?.users || []);
    } catch (err) {
      console.error('Failed to load users', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleInventoryPermission = async (user) => {
    try {
      const updatedVal = !user.canManageInventory;
      await usersApi.update(user._id, { canManageInventory: updatedVal });
      setUsers((prev) =>
        prev.map((u) => (u._id === user._id ? { ...u, canManageInventory: updatedVal } : u))
      );
    } catch (err) {
      console.error('Failed to toggle permission', err);
    }
  };

  const handleToggleActive = async (user) => {
    try {
      const updatedVal = !user.isActive;
      await usersApi.update(user._id, { isActive: updatedVal });
      setUsers((prev) =>
        prev.map((u) => (u._id === user._id ? { ...u, isActive: updatedVal } : u))
      );
    } catch (err) {
      console.error('Failed to toggle user status', err);
    }
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!createData.name.trim() || !createData.username.trim() || !createData.password) {
      setCreateError('All fields are required');
      return;
    }
    if (createData.password.length < 6) {
      setCreateError('Password must be at least 6 characters');
      return;
    }

    try {
      setCreating(true);
      setCreateError('');
      await usersApi.create({
        name: createData.name.trim(),
        username: createData.username.trim(),
        password: createData.password,
        role: createData.role,
        canManageInventory: createData.role === 'admin' ? true : createData.canManageInventory,
      });

      setIsCreateOpen(false);
      await loadUsers();
    } catch (err) {
      setCreateError(err.response?.data?.error?.message || err.message || 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const handleOpenReset = (u) => {
    setResetTargetUser(u);
    setNewPassword('');
    setResetError('');
    setResetSuccess(false);
    setIsResetOpen(true);
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      setResetError('Password must be at least 6 characters');
      return;
    }

    try {
      setResetting(true);
      setResetError('');
      await usersApi.update(resetTargetUser._id, { password: newPassword });
      setResetSuccess(true);
      setTimeout(() => {
        setIsResetOpen(false);
      }, 1000);
    } catch (err) {
      setResetError(err.response?.data?.error?.message || err.message || 'Failed to reset password');
    } finally {
      setResetting(false);
    }
  };

  const handleDeleteUser = async (targetUser) => {
    if (targetUser._id === currentUser?._id) {
      alert('Cannot delete your own account');
      return;
    }

    const confirmMsg = `Are you sure you want to permanently delete staff member "${targetUser.name}" (@${targetUser.username})?\n\nThis will remove their login and credentials completely.`;
    if (!window.confirm(confirmMsg)) return;

    try {
      await usersApi.delete(targetUser._id, true);
      setUsers((prev) => prev.filter((u) => u._id !== targetUser._id));
    } catch (err) {
      alert(err.response?.data?.error?.message || err.message || 'Failed to delete staff member');
    }
  };

  const getRoleBadge = (role) => {
    switch (role) {
      case 'admin':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800">
            <ShieldCheck className="w-3.5 h-3.5" />
            {STRINGS.roles.admin}
          </span>
        );
      case 'kitchen':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-800">
            <ChefHat className="w-3.5 h-3.5" />
            {STRINGS.roles.kitchen}
          </span>
        );
      case 'barista':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900">
            <Coffee className="w-3.5 h-3.5" />
            {STRINGS.roles.barista}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
            <UserCheck className="w-3.5 h-3.5" />
            {STRINGS.roles.waiter}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight">{STRINGS.users.title}</h2>
          <p className="text-xs text-gray-500 font-medium">
            Manage staff credentials, role-based terminal access, and inventory permission flags
          </p>
        </div>
        <button
          onClick={() => {
            setCreateData({
              name: '',
              username: '',
              password: '',
              role: 'waiter',
              canManageInventory: false,
            });
            setCreateError('');
            setIsCreateOpen(true);
          }}
          className="inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold rounded-2xl shadow-lg shadow-amber-600/25 transition-all text-sm"
        >
          <Plus className="w-5 h-5" />
          {STRINGS.users.addNew}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-3 border-amber-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-gray-200/90 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/70 text-gray-500 text-[11px] font-bold uppercase tracking-wider">
                  <th className="py-4 px-6">{STRINGS.users.name}</th>
                  <th className="py-4 px-4">{STRINGS.users.username}</th>
                  <th className="py-4 px-4">{STRINGS.users.role}</th>
                  <th className="py-4 px-4">{STRINGS.users.inventoryPermission}</th>
                  <th className="py-4 px-4">Account Status</th>
                  <th className="py-4 px-6 text-right">{STRINGS.common.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                {users.map((u) => (
                  <tr key={u._id} className="hover:bg-amber-50/30 transition-colors">
                    <td className="py-4 px-6">
                      <span className="font-bold text-gray-900 block">{u.name}</span>
                    </td>
                    <td className="py-4 px-4">
                      <span className="font-mono text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded-md">
                        @{u.username}
                      </span>
                    </td>
                    <td className="py-4 px-4">{getRoleBadge(u.role)}</td>
                    <td className="py-4 px-4">
                      {u.role === 'admin' ? (
                        <span className="text-xs text-purple-700 font-bold">Always Granted (Admin)</span>
                      ) : u.role === 'kitchen' || u.role === 'barista' ? (
                        <span className="text-xs text-gray-400 italic">Not applicable</span>
                      ) : (
                        <label className="inline-flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={u.canManageInventory}
                            onChange={() => handleToggleInventoryPermission(u)}
                            className="w-4 h-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500"
                          />
                          <span
                            className={`text-xs font-bold ${
                              u.canManageInventory ? 'text-emerald-700' : 'text-gray-400'
                            }`}
                          >
                            {u.canManageInventory ? 'Granted' : 'Restricted'}
                          </span>
                        </label>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      <button
                        onClick={() => handleToggleActive(u)}
                        className={`text-xs font-bold px-3 py-1 rounded-full transition-colors ${
                          u.isActive
                            ? 'bg-emerald-50 text-emerald-700 hover:bg-rose-50 hover:text-rose-700'
                            : 'bg-rose-50 text-rose-700 hover:bg-emerald-50 hover:text-emerald-700'
                        }`}
                      >
                        {u.isActive ? 'Active' : 'Disabled'}
                      </button>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenReset(u)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors active:scale-95"
                          title="Reset Password"
                        >
                          <KeyRound className="w-3.5 h-3.5 text-gray-500" />
                          <span>Reset Password</span>
                        </button>
                        <button
                          onClick={() => handleDeleteUser(u)}
                          disabled={u._id === currentUser?._id}
                          className={`p-2 rounded-xl transition-colors ${
                            u._id === currentUser?._id
                              ? 'text-gray-300 cursor-not-allowed'
                              : 'text-gray-400 hover:text-rose-600 hover:bg-rose-50 active:scale-95'
                          }`}
                          title={u._id === currentUser?._id ? 'Cannot delete your own account' : `Delete ${u.name}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title={STRINGS.users.addNew}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          {createError && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{createError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              {STRINGS.users.name}
            </label>
            <input
              type="text"
              required
              value={createData.name}
              onChange={(e) => setCreateData({ ...createData, name: e.target.value })}
              placeholder="e.g. Almaz Kebede"
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              {STRINGS.users.username}
            </label>
            <input
              type="text"
              required
              value={createData.username}
              onChange={(e) => setCreateData({ ...createData, username: e.target.value.toLowerCase() })}
              placeholder="e.g. almaz"
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              Initial Password (min 6 chars)
            </label>
            <div className="relative">
              <input
                type={showCreatePassword ? 'text' : 'password'}
                required
                value={createData.password}
                onChange={(e) => setCreateData({ ...createData, password: e.target.value })}
                placeholder="••••••••"
                className="w-full pl-3.5 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
              <button
                type="button"
                onClick={() => setShowCreatePassword((prev) => !prev)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none"
                aria-label={showCreatePassword ? 'Hide password' : 'Show password'}
              >
                {showCreatePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              {STRINGS.users.role}
            </label>
            <select
              value={createData.role}
              onChange={(e) => setCreateData({ ...createData, role: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            >
              <option value="waiter">Waiter (Order Taking)</option>
              <option value="kitchen">Kitchen Staff (Food Preparation)</option>
              <option value="barista">Barista (Beverages & Bar)</option>
              <option value="admin">Administrator (Full Access)</option>
            </select>
          </div>

          {createData.role === 'waiter' && (
            <div className="pt-2">
              <label className="inline-flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createData.canManageInventory}
                  onChange={(e) =>
                    setCreateData({ ...createData, canManageInventory: e.target.checked })
                  }
                  className="w-5 h-5 text-amber-600 rounded-lg border-gray-300 focus:ring-amber-500"
                />
                <div>
                  <span className="text-sm font-semibold text-gray-900 block">
                    {STRINGS.users.inventoryPermission}
                  </span>
                  <span className="text-[11px] text-gray-500 block">
                    {STRINGS.users.inventoryPermissionHelp}
                  </span>
                </div>
              </label>
            </div>
          )}

          <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
              className="px-4 py-2.5 text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
            >
              {STRINGS.common.cancel}
            </button>
            <button
              type="submit"
              disabled={creating}
              className="px-5 py-2.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-md shadow-amber-600/20 transition-all disabled:opacity-50"
            >
              {creating ? STRINGS.common.saving : 'Create Staff Member'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        isOpen={isResetOpen}
        onClose={() => setIsResetOpen(false)}
        title={`Reset Password for @${resetTargetUser?.username}`}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleResetSubmit} className="space-y-4">
          {resetError && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{resetError}</span>
            </div>
          )}

          {resetSuccess && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2">
              <Check className="w-4 h-4 flex-shrink-0" />
              <span>Password updated successfully!</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              {STRINGS.users.newPassword}
            </label>
            <div className="relative">
              <input
                type={showResetPassword ? 'text' : 'password'}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-3.5 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
              <button
                type="button"
                onClick={() => setShowResetPassword((prev) => !prev)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none"
                aria-label={showResetPassword ? 'Hide password' : 'Show password'}
              >
                {showResetPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsResetOpen(false)}
              className="px-4 py-2.5 text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
            >
              {STRINGS.common.cancel}
            </button>
            <button
              type="submit"
              disabled={resetting || resetSuccess}
              className="px-5 py-2.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-md shadow-amber-600/20 transition-all disabled:opacity-50"
            >
              {resetting ? STRINGS.common.saving : 'Update Password'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

