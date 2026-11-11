import React, { useState, useEffect } from 'react';
import { tablesApi } from '../../api/client.js';
import { STRINGS } from '../../locales/strings.js';
import Modal from '../../components/common/Modal.jsx';
import { Grid, Plus, Edit2, Trash2, CheckCircle2, XCircle, AlertCircle, RotateCcw } from 'lucide-react';

export default function TablesAdminPage() {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tabFilter, setTabFilter] = useState('active'); // 'active' | 'archived'
  const [feedback, setFeedback] = useState(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTable, setEditingTable] = useState(null);
  const [name, setName] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [modalError, setModalError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadTables();
  }, []);

  const loadTables = async () => {
    try {
      setLoading(true);
      const res = await tablesApi.getAll(true);
      setTables(res.data?.data?.tables || []);
    } catch (err) {
      console.error('Failed to load tables', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAdd = () => {
    setEditingTable(null);
    setName('');
    setIsActive(true);
    setModalError('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (t) => {
    setEditingTable(t);
    setName(t.name);
    setIsActive(t.isActive);
    setModalError('');
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setModalError('Table name is required');
      return;
    }

    try {
      setSaving(true);
      setModalError('');

      if (!editingTable) {
        await tablesApi.create({ name: name.trim() });
      } else {
        await tablesApi.update(editingTable._id, { name: name.trim(), isActive });
      }

      setIsModalOpen(false);
      await loadTables();
    } catch (err) {
      setModalError(err.response?.data?.error?.message || err.message || 'Failed to save table');
    } finally {
      setSaving(false);
    }
  };

  const showToast = (type, message) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleDelete = async (t) => {
    if (t.isActive) {
      if (!window.confirm(`Deactivate table "${t.name}"? It will be archived and removed from waiter active ordering.`)) return;
      try {
        await tablesApi.delete(t._id);
        showToast('success', `Table "${t.name}" deactivated and archived.`);
        await loadTables();
      } catch (err) {
        showToast('error', err.response?.data?.error?.message || 'Failed to deactivate table');
      }
    } else {
      if (!window.confirm(`Permanently delete table "${t.name}" from database? This cannot be undone.`)) return;
      try {
        await tablesApi.delete(t._id, true);
        showToast('success', `Table "${t.name}" permanently deleted.`);
        await loadTables();
      } catch (err) {
        showToast('error', err.response?.data?.error?.message || 'Failed to permanently delete table');
      }
    }
  };

  const handleRestore = async (t) => {
    try {
      await tablesApi.update(t._id, { isActive: true });
      showToast('success', `Table "${t.name}" restored and activated.`);
      await loadTables();
    } catch (err) {
      showToast('error', err.response?.data?.error?.message || 'Failed to restore table');
    }
  };

  const activeTables = tables.filter((t) => t.isActive);
  const archivedTables = tables.filter((t) => !t.isActive);
  const displayedTables = tabFilter === 'active' ? activeTables : archivedTables;

  return (
    <div className="space-y-6">
      {/* Toast Feedback */}
      {feedback && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between shadow-xs ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2 text-sm font-semibold">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-xs font-bold hover:underline">
            Dismiss
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight">{STRINGS.tables.title}</h2>
          <p className="text-xs text-gray-500 font-medium">
            Configure dining tables and seating areas available for waiter order placement
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold rounded-2xl shadow-lg shadow-amber-600/25 transition-all text-sm"
        >
          <Plus className="w-5 h-5" />
          {STRINGS.tables.addNew}
        </button>
      </div>

      {/* Tabs Filter */}
      <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
        <button
          type="button"
          onClick={() => setTabFilter('active')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            tabFilter === 'active'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Active Tables ({activeTables.length})
        </button>
        <button
          type="button"
          onClick={() => setTabFilter('archived')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            tabFilter === 'archived'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Archived / Inactive ({archivedTables.length})
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-3 border-amber-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : displayedTables.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-gray-300">
          <Grid className="w-12 h-12 text-gray-400 mx-auto mb-3 opacity-40" />
          <p className="text-gray-500 font-medium text-sm">
            {tabFilter === 'active' ? 'No active tables found.' : 'No archived tables.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {displayedTables.map((t) => (
            <div
              key={t._id}
              className={`bg-white rounded-3xl p-5 border transition-all flex flex-col justify-between ${
                t.isActive
                  ? 'border-gray-200/90 shadow-xs hover:border-amber-500'
                  : 'border-dashed border-gray-300 bg-gray-50/70'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span
                    className={`w-3 h-3 rounded-full ${
                      t.isActive ? 'bg-emerald-500 ring-4 ring-emerald-100' : 'bg-gray-400'
                    }`}
                  />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    {t.isActive ? STRINGS.tables.active : STRINGS.tables.inactive}
                  </span>
                </div>
                <h3 className="font-bold text-gray-900 text-lg leading-tight mb-4">{t.name}</h3>
              </div>

              <div className="flex items-center justify-end gap-1 pt-3 border-t border-gray-100">
                {t.isActive ? (
                  <>
                    <button
                      onClick={() => handleOpenEdit(t)}
                      className="p-2 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-colors active:scale-95"
                      title="Edit Table"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(t)}
                      className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors active:scale-95"
                      title="Deactivate / Archive Table"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => handleRestore(t)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors"
                      title="Reactivate Table"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Restore
                    </button>
                    <button
                      onClick={() => handleDelete(t)}
                      className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                      title="Delete Permanently from Database"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Table Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingTable ? 'Edit Table' : STRINGS.tables.addNew}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleSave} className="space-y-4">
          {modalError && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{modalError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              {STRINGS.tables.tableName}
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Table 12 or Patio 3"
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
          </div>

          {editingTable && (
            <div className="pt-2">
              <label className="inline-flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-5 h-5 text-amber-600 rounded-lg border-gray-300 focus:ring-amber-500"
                />
                <span className="text-sm font-semibold text-gray-900">Table Active for Ordering</span>
              </label>
            </div>
          )}

          <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2.5 text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
            >
              {STRINGS.common.cancel}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-md shadow-amber-600/20 transition-all disabled:opacity-50"
            >
              {saving ? STRINGS.common.saving : STRINGS.common.save}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

