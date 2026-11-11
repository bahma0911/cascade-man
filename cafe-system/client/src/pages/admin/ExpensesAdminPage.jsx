import React, { useState, useEffect } from 'react';
import { expensesApi } from '../../api/client.js';
import { STRINGS } from '../../locales/strings.js';
import Modal from '../../components/common/Modal.jsx';
import {
  DollarSign,
  Plus,
  Trash2,
  Calendar,
  Layers,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  TrendingDown,
  RefreshCw,
} from 'lucide-react';

const EXPENSE_CATEGORIES = [
  { value: 'electricity', label: 'Electricity / Power', color: 'bg-amber-100 text-amber-800' },
  { value: 'water', label: 'Water Utility', color: 'bg-blue-100 text-blue-800' },
  { value: 'rent', label: 'Premise Rent', color: 'bg-purple-100 text-purple-800' },
  { value: 'salaries', label: 'Employee Salaries', color: 'bg-emerald-100 text-emerald-800' },
  { value: 'gas', label: 'Cooking Butane Gas', color: 'bg-orange-100 text-orange-800' },
  { value: 'cleaning', label: 'Cleaning & Sanitizers', color: 'bg-teal-100 text-teal-800' },
  { value: 'other', label: 'Other Operating Expense', color: 'bg-gray-100 text-gray-800' },
];

export default function ExpensesAdminPage() {
  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState({ totalOperatingExpenses: 0, byCategory: [] });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    category: 'electricity',
    amount: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
  });

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const params = { page, limit: 15 };
      if (categoryFilter && categoryFilter !== 'all') params.category = categoryFilter;
      if (startDate) params.startDate = `${startDate}T00:00:00.000Z`;
      if (endDate) params.endDate = `${endDate}T23:59:59.999Z`;

      const [listRes, summaryRes] = await Promise.all([
        expensesApi.getAll(params),
        expensesApi.getSummary({
          startDate: params.startDate,
          endDate: params.endDate,
        }),
      ]);

      setExpenses(listRes.data.data.expenses || []);
      setTotalPages(listRes.data.data.pagination.pages || 1);
      setSummary(listRes.data.data.summary || summaryRes.data.data || { totalOperatingExpenses: 0, byCategory: [] });
    } catch (err) {
      console.error('Failed to load operating expenses:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, [page, categoryFilter, startDate, endDate]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await expensesApi.create({
        category: formData.category,
        amount: Number(formData.amount),
        description: formData.description,
        date: formData.date ? new Date(formData.date).toISOString() : new Date().toISOString(),
      });
      setIsCreateModalOpen(false);
      setFormData({
        category: 'electricity',
        amount: '',
        description: '',
        date: new Date().toISOString().split('T')[0],
      });
      fetchExpenses();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to record expense');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this operating expense entry?')) return;
    try {
      await expensesApi.delete(id);
      fetchExpenses();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to delete expense');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
            Operating Expenses Management
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Track utilities, rent, employee salaries, and overhead deducted in Net Profit & Loss reports (Section 14.G)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchExpenses}
            className="p-2.5 bg-white border border-gray-200 text-gray-700 font-semibold rounded-2xl hover:bg-gray-50 shadow-xs"
            title="Refresh list"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-600' : ''}`} />
          </button>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-2xl shadow-md shadow-amber-600/20 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Record Expense
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Total Expenses In Period</span>
            <span className="p-2 bg-rose-50 text-rose-600 rounded-xl">
              <TrendingDown className="w-5 h-5" />
            </span>
          </div>
          <p className="text-3xl font-black text-gray-900">
            {summary.totalOperatingExpenses?.toLocaleString()}{' '}
            <span className="text-sm font-semibold text-gray-500">{STRINGS.currency}</span>
          </p>
          <p className="text-xs text-gray-400 mt-1">Deducted from Gross Profit</p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Top Cost Category</span>
            <span className="p-2 bg-purple-50 text-purple-600 rounded-xl">
              <Layers className="w-5 h-5" />
            </span>
          </div>
          <p className="text-xl font-black text-gray-900 capitalize">
            {summary.byCategory?.[0]?.category || 'None'}
          </p>
          <p className="text-xs text-gray-500 mt-1 font-semibold">
            {summary.byCategory?.[0]?.totalAmount?.toLocaleString() || 0} {STRINGS.currency}
          </p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Categories Tracked</span>
            <span className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <CheckCircle2 className="w-5 h-5" />
            </span>
          </div>
          <p className="text-3xl font-black text-gray-900">
            {summary.byCategory?.length || 0} active
          </p>
          <p className="text-xs text-gray-400 mt-1">Electricity, water, rent, salaries, etc.</p>
        </div>
      </div>

      {/* Filter Ribbon */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
        {/* Category Pill Filters */}
        <div className="flex space-x-1.5 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setCategoryFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              categoryFilter === 'all'
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All Categories
          </button>
          {EXPENSE_CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setCategoryFilter(cat.value)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize whitespace-nowrap transition-all ${
                categoryFilter === cat.value
                  ? 'bg-amber-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat.value}
            </button>
          ))}
        </div>

        {/* Date Filter */}
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <Calendar className="w-4 h-4 text-gray-400" />
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border border-gray-200 rounded-lg px-2.5 py-1 text-xs focus:ring-2 focus:ring-amber-500"
          />
          <span>to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border border-gray-200 rounded-lg px-2.5 py-1 text-xs focus:ring-2 focus:ring-amber-500"
          />
          {(startDate || endDate) && (
            <button
              onClick={() => {
                setStartDate('');
                setEndDate('');
              }}
              className="text-xs text-rose-600 font-bold hover:underline"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-3xl border border-gray-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="w-8 h-8 border-4 border-amber-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : expenses.length === 0 ? (
          <div className="p-12 text-center text-gray-400 text-sm font-medium">
            No expense records matching the selected criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">Expense Date</th>
                  <th className="px-6 py-4">Category</th>
                  <th className="px-6 py-4">Description</th>
                  <th className="px-6 py-4 text-right">Amount ({STRINGS.currency})</th>
                  <th className="px-6 py-4">Recorded By</th>
                  <th className="px-6 py-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {expenses.map((item) => {
                  const catConfig = EXPENSE_CATEGORIES.find((c) => c.value === item.category);
                  return (
                    <tr key={item._id} className="hover:bg-amber-50/40 transition-colors">
                      <td className="px-6 py-4 text-xs font-semibold text-gray-700">
                        {new Date(item.date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold capitalize ${
                            catConfig?.color || 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {item.category}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs font-medium text-gray-800">
                        {item.description || '—'}
                      </td>
                      <td className="px-6 py-4 text-right font-black text-rose-600">
                        {item.amount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-500">
                        {item.recordedBy?.name || item.recordedBy?.username || 'Admin'}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => handleDelete(item._id)}
                          title="Delete record"
                          className="p-1.5 text-gray-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-600">
            <span>
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* CREATE MODAL */}
      {isCreateModalOpen && (
        <Modal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          title="Record Operating Expense"
        >
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                Expense Category
              </label>
              <select
                required
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full text-xs border border-gray-200 rounded-xl p-2.5 focus:ring-2 focus:ring-amber-500 bg-white"
              >
                {EXPENSE_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                Amount ({STRINGS.currency})
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="e.g. 2500"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className="w-full text-xs border border-gray-200 rounded-xl p-2.5 focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                Description / Details
              </label>
              <input
                type="text"
                maxLength={250}
                placeholder="e.g. November electricity bill for main kitchen"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full text-xs border border-gray-200 rounded-xl p-2.5 focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                Date of Expense
              </label>
              <input
                type="date"
                required
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full text-xs border border-gray-200 rounded-xl p-2.5 focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 text-xs font-bold rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs"
              >
                {submitting ? 'Saving...' : 'Save Expense'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

