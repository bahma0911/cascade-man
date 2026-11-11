import React, { useState, useEffect } from 'react';
import { ingredientsApi } from '../../api/client.js';
import { STRINGS } from '../../locales/strings.js';
import Modal from '../../components/common/Modal.jsx';
import {
  Boxes,
  Plus,
  Edit2,
  Trash2,
  Search,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Percent,
  Layers,
  Sparkles,
  RotateCcw,
  Coins,
  Tag,
  Check,
  TrendingUp,
} from 'lucide-react';

export default function IngredientsAdminPage() {
  const [ingredients, setIngredients] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [tabFilter, setTabFilter] = useState('active'); // 'active' | 'pricing' | 'archived'

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingIng, setEditingIng] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    baseUnit: 'g',
    currentStock: '',
    lowStockThreshold: '',
    costPerBaseUnit: '',
    referenceQty: '',
    expectedWastageQty: '',
    autoWastageEnabled: false,
  });
  const [modalError, setModalError] = useState('');
  const [saving, setSaving] = useState(false);

  // Quick inline price updating state: { [ingId]: cost }
  const [priceDrafts, setPriceDrafts] = useState({});
  const [savingPriceId, setSavingPriceId] = useState(null);
  const [savedSuccessId, setSavedSuccessId] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await ingredientsApi.getAll(true);
      const list = res.data?.data?.ingredients || [];
      setIngredients(list);

      // Initialize price drafts
      const drafts = {};
      list.forEach((ing) => {
        drafts[ing._id] = ing.costPerBaseUnit !== undefined ? ing.costPerBaseUnit : 0;
      });
      setPriceDrafts(drafts);
    } catch (err) {
      console.error('Failed to load ingredients', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAdd = () => {
    setEditingIng(null);
    setFormData({
      name: '',
      baseUnit: 'g',
      currentStock: '0',
      lowStockThreshold: '1000',
      costPerBaseUnit: '0.10',
      referenceQty: '10000',
      expectedWastageQty: '500',
      autoWastageEnabled: false,
    });
    setModalError('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (ing) => {
    setEditingIng(ing);
    setFormData({
      name: ing.name,
      baseUnit: ing.baseUnit,
      currentStock: ing.currentStock,
      lowStockThreshold: ing.lowStockThreshold,
      costPerBaseUnit: ing.costPerBaseUnit !== undefined ? ing.costPerBaseUnit : '',
      referenceQty: ing.referenceQty || '',
      expectedWastageQty: ing.expectedWastageQty || '',
      autoWastageEnabled: ing.autoWastageEnabled || false,
    });
    setModalError('');
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setModalError('Ingredient name is required');
      return;
    }

    try {
      setSaving(true);
      setModalError('');

      const ref = Number(formData.referenceQty) || 0;
      const waste = Number(formData.expectedWastageQty) || 0;
      const unitCost = Math.max(0, Number(formData.costPerBaseUnit) || 0);

      const payload = {
        name: formData.name.trim(),
        baseUnit: formData.baseUnit,
        lowStockThreshold: Number(formData.lowStockThreshold) || 0,
        costPerBaseUnit: unitCost,
        referenceQty: ref,
        expectedWastageQty: waste,
        autoWastageEnabled: formData.autoWastageEnabled,
      };

      if (!editingIng) {
        payload.currentStock = Number(formData.currentStock) || 0;
        await ingredientsApi.create(payload);
      } else {
        await ingredientsApi.update(editingIng._id, payload);
      }

      setIsModalOpen(false);
      await loadData();
    } catch (err) {
      setModalError(err.response?.data?.error?.message || err.message || 'Failed to save ingredient');
    } finally {
      setSaving(false);
    }
  };

  const handleQuickPriceSave = async (ing) => {
    const newPrice = Math.max(0, Number(priceDrafts[ing._id]) || 0);
    try {
      setSavingPriceId(ing._id);
      await ingredientsApi.update(ing._id, { costPerBaseUnit: newPrice });
      setSavedSuccessId(ing._id);
      setIngredients((prev) =>
        prev.map((i) => (i._id === ing._id ? { ...i, costPerBaseUnit: newPrice } : i))
      );
      setTimeout(() => setSavedSuccessId(null), 2000);
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to update price');
    } finally {
      setSavingPriceId(null);
    }
  };

  const handleDelete = async (ing) => {
    if (ing.isActive) {
      if (
        !window.confirm(
          `Deactivate "${ing.name}"? It will be archived and hidden from active inventory tools.`
        )
      )
        return;
      try {
        await ingredientsApi.delete(ing._id);
        await loadData();
      } catch (err) {
        alert(err.response?.data?.error?.message || 'Failed to deactivate ingredient');
      }
    } else {
      if (
        !window.confirm(
          `Permanently delete "${ing.name}" from database? This cannot be undone.`
        )
      )
        return;
      try {
        await ingredientsApi.delete(ing._id, true);
        await loadData();
      } catch (err) {
        alert(err.response?.data?.error?.message || 'Failed to permanently delete ingredient');
      }
    }
  };

  const handleRestore = async (ing) => {
    try {
      await ingredientsApi.update(ing._id, { isActive: true });
      await loadData();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to restore ingredient');
    }
  };

  // Unit cost formatting helper
  const formatCostHelper = (cost, baseUnit) => {
    const num = Number(cost) || 0;
    if (baseUnit === 'g') {
      const perKg = (num * 1000).toFixed(2);
      return `${num.toFixed(4)} ETB/g (${perKg} ETB/kg)`;
    }
    if (baseUnit === 'ml') {
      const perLiter = (num * 1000).toFixed(2);
      return `${num.toFixed(4)} ETB/ml (${perLiter} ETB/L)`;
    }
    return `${num.toFixed(2)} ETB/pc`;
  };

  // Commercial equivalent rate helper
  const getCommercialRate = (cost, baseUnit) => {
    const num = Number(cost) || 0;
    if (baseUnit === 'g') {
      return `${(num * 1000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB / kg`;
    }
    if (baseUnit === 'ml') {
      return `${(num * 1000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB / Liter`;
    }
    return `${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB / piece`;
  };

  // Live calculation of wastage rate for modal preview
  const previewRef = Number(formData.referenceQty) || 0;
  const previewWaste = Number(formData.expectedWastageQty) || 0;
  const previewRatePercent =
    previewRef > 0 && previewWaste >= 0 ? ((previewWaste / previewRef) * 100).toFixed(2) : '0.00';
  const previewYieldPercent =
    previewRef > 0 && previewWaste >= 0 ? (100 - Number(previewRatePercent)).toFixed(2) : '100.00';

  const activeIngredients = ingredients.filter((ing) => ing.isActive);
  const archivedIngredients = ingredients.filter((ing) => !ing.isActive);
  const targetIngredients =
    tabFilter === 'archived' ? archivedIngredients : activeIngredients;

  const filtered = targetIngredients.filter((ing) =>
    ing.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Total inventory valuation
  const totalInventoryValue = activeIngredients.reduce(
    (sum, ing) => sum + (ing.currentStock || 0) * (ing.costPerBaseUnit || 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* Header and Add Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight">
            {STRINGS.ingredients.title}
          </h2>
          <p className="text-xs text-gray-500 font-medium">
            Manage raw ingredient inventory, unit purchase costs in ETB, and automatic preparation wastage
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold rounded-2xl shadow-lg shadow-amber-600/25 transition-all text-sm"
        >
          <Plus className="w-5 h-5" />
          {STRINGS.ingredients.addNew}
        </button>
      </div>

      {/* Tabs: Active Stock vs Ingredient Pricing vs Archived */}
      <div className="flex items-center gap-2 border-b border-gray-200 pb-2 flex-wrap">
        <button
          type="button"
          onClick={() => setTabFilter('active')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            tabFilter === 'active'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <Boxes className="w-4 h-4" />
          Active Inventory ({activeIngredients.length})
        </button>

        <button
          type="button"
          onClick={() => setTabFilter('pricing')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            tabFilter === 'pricing'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <Coins className="w-4 h-4" />
          Ingredient Pricing & Unit Costs (ETB)
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
              tabFilter === 'pricing' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-900'
            }`}
          >
            Pricing Page
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTabFilter('archived')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            tabFilter === 'archived'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Archived / Deactivated ({archivedIngredients.length})
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="w-5 h-5 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Search ingredients by name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
        />
      </div>

      {/* ===================== TAB 1: ACTIVE INVENTORY & STOCK ===================== */}
      {tabFilter === 'active' && (
        <>
          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-8 h-8 border-3 border-amber-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-gray-300">
              <Boxes className="w-12 h-12 text-gray-400 mx-auto mb-3 opacity-40" />
              <p className="text-gray-500 font-medium text-sm">{STRINGS.common.noData}</p>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-gray-200/90 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/70 text-gray-500 text-[11px] font-bold uppercase tracking-wider">
                      <th className="py-4 px-6">{STRINGS.ingredients.name}</th>
                      <th className="py-4 px-4">{STRINGS.ingredients.baseUnit}</th>
                      <th className="py-4 px-4">{STRINGS.ingredients.currentStock}</th>
                      <th className="py-4 px-4">{STRINGS.ingredients.lowStockThreshold}</th>
                      <th className="py-4 px-4">Unit Cost (ETB)</th>
                      <th className="py-4 px-4">Prep Wastage Rate</th>
                      <th className="py-4 px-4">{STRINGS.ingredients.status}</th>
                      <th className="py-4 px-6 text-right">{STRINGS.common.actions}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                    {filtered.map((ing) => {
                      const isLow = ing.currentStock <= ing.lowStockThreshold;
                      const unitCost = ing.costPerBaseUnit || 0;

                      return (
                        <tr key={ing._id} className="hover:bg-amber-50/30 transition-colors">
                          <td className="py-4 px-6">
                            <span className="font-bold text-gray-900 block">{ing.name}</span>
                          </td>
                          <td className="py-4 px-4">
                            <span className="font-mono text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-md font-bold">
                              {ing.baseUnit}
                            </span>
                          </td>
                          <td className="py-4 px-4">
                            <span
                              className={`font-black ${
                                isLow ? 'text-rose-600' : 'text-gray-900'
                              }`}
                            >
                              {ing.currentStock.toLocaleString()} {ing.baseUnit}
                            </span>
                          </td>
                          <td className="py-4 px-4">
                            <span className="text-gray-500 font-medium">
                              {ing.lowStockThreshold.toLocaleString()} {ing.baseUnit}
                            </span>
                          </td>
                          <td className="py-4 px-4">
                            <div>
                              <span className="font-black text-gray-900 block text-xs">
                                {formatCostHelper(unitCost, ing.baseUnit)}
                              </span>
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            {ing.autoWastageEnabled ? (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                                {((ing.wastageRate || 0) * 100).toFixed(1)}% Waste
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400 italic">Disabled</span>
                            )}
                          </td>
                          <td className="py-4 px-4">
                            {isLow ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                {STRINGS.ingredients.lowStock}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                {STRINGS.ingredients.inStock}
                              </span>
                            )}
                          </td>
                          <td className="py-4 px-6 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleOpenEdit(ing)}
                                className="p-2 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-colors active:scale-95"
                                title={STRINGS.ingredients.edit}
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(ing)}
                                className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors active:scale-95"
                                title="Deactivate / Archive Ingredient"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ===================== TAB 2: INGREDIENT PRICING PAGE ===================== */}
      {tabFilter === 'pricing' && (
        <div className="space-y-4">
          {/* Pricing Summary Card */}
          <div className="bg-gradient-to-r from-stone-900 to-amber-950 text-white p-6 rounded-3xl shadow-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Coins className="w-6 h-6 text-amber-400" />
                <h3 className="text-lg font-black tracking-tight">
                  Ingredient Unit Costs & Pricing Management
                </h3>
              </div>
              <p className="text-xs text-amber-200/70 mt-1 max-w-xl">
                Prices entered here directly compute recipe manufacturing costs for all menu items.
                When waiters take orders, exact costs are deducted from inventory based on these prices.
              </p>
            </div>
            <div className="text-left sm:text-right">
              <span className="text-[11px] uppercase tracking-wider text-amber-300 font-extrabold block">
                Total Inventory Value
              </span>
              <span className="text-2xl font-black text-amber-400">
                {totalInventoryValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {STRINGS.currency}
              </span>
            </div>
          </div>

          {/* Pricing Table with 1-Click Quick Update */}
          <div className="bg-white rounded-3xl border border-gray-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/70 text-gray-500 text-[11px] font-bold uppercase tracking-wider">
                    <th className="py-4 px-6">Ingredient</th>
                    <th className="py-4 px-4">Base Unit</th>
                    <th className="py-4 px-6">Cost per Base Unit (ETB)</th>
                    <th className="py-4 px-6">Commercial Rate (kg / L / pc)</th>
                    <th className="py-4 px-4">Current Stock</th>
                    <th className="py-4 px-4">Inventory Valuation</th>
                    <th className="py-4 px-6 text-right">Quick Save</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                  {filtered.map((ing) => {
                    const draftVal =
                      priceDrafts[ing._id] !== undefined
                        ? priceDrafts[ing._id]
                        : ing.costPerBaseUnit || 0;
                    const stockVal = (ing.currentStock || 0) * Number(draftVal);
                    const isSaving = savingPriceId === ing._id;
                    const isSuccess = savedSuccessId === ing._id;

                    return (
                      <tr key={ing._id} className="hover:bg-amber-50/30 transition-colors">
                        <td className="py-4 px-6">
                          <span className="font-extrabold text-gray-900 block">{ing.name}</span>
                          <span className="text-[11px] text-gray-400">
                            {ing.lastPurchaseDate
                              ? `Last updated: ${new Date(ing.lastPurchaseDate).toLocaleDateString()}`
                              : 'Standard baseline'}
                          </span>
                        </td>
                        <td className="py-4 px-4">
                          <span className="font-mono text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-md font-bold">
                            {ing.baseUnit}
                          </span>
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={draftVal}
                              onChange={(e) =>
                                setPriceDrafts({
                                  ...priceDrafts,
                                  [ing._id]: e.target.value,
                                })
                              }
                              className="w-32 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-black text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                            />
                            <span className="text-xs text-gray-500 font-bold">
                              ETB / {ing.baseUnit}
                            </span>
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <span className="font-black text-amber-900 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200/70 text-xs">
                            {getCommercialRate(draftVal, ing.baseUnit)}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-xs font-bold text-gray-700">
                          {ing.currentStock.toLocaleString()} {ing.baseUnit}
                        </td>
                        <td className="py-4 px-4 text-xs font-black text-gray-900">
                          {stockVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB
                        </td>
                        <td className="py-4 px-6 text-right">
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => handleQuickPriceSave(ing)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                              isSuccess
                                ? 'bg-emerald-600 text-white'
                                : 'bg-amber-600 hover:bg-amber-700 text-white shadow-xs'
                            }`}
                          >
                            {isSuccess ? (
                              <>
                                <Check className="w-3.5 h-3.5" /> Saved!
                              </>
                            ) : isSaving ? (
                              'Saving...'
                            ) : (
                              'Update Price'
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================== TAB 3: ARCHIVED INGREDIENTS ===================== */}
      {tabFilter === 'archived' && (
        <div className="bg-white rounded-3xl border border-gray-200/90 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/70 text-gray-500 text-[11px] font-bold uppercase tracking-wider">
                  <th className="py-4 px-6">{STRINGS.ingredients.name}</th>
                  <th className="py-4 px-4">{STRINGS.ingredients.baseUnit}</th>
                  <th className="py-4 px-4">Stock on Archive</th>
                  <th className="py-4 px-4">Unit Cost (ETB)</th>
                  <th className="py-4 px-6 text-right">{STRINGS.common.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                {filtered.map((ing) => (
                  <tr key={ing._id} className="hover:bg-amber-50/30 transition-colors">
                    <td className="py-4 px-6">
                      <span className="font-bold text-gray-900 block">{ing.name}</span>
                    </td>
                    <td className="py-4 px-4">
                      <span className="font-mono text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-md font-bold">
                        {ing.baseUnit}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-xs font-semibold text-gray-700">
                      {ing.currentStock.toLocaleString()} {ing.baseUnit}
                    </td>
                    <td className="py-4 px-4 font-mono text-xs text-gray-600">
                      {ing.costPerBaseUnit || 0} ETB/{ing.baseUnit}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleRestore(ing)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-colors"
                          title="Restore Ingredient"
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> Restore
                        </button>
                        <button
                          onClick={() => handleDelete(ing)}
                          className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Permanently Delete"
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

      {/* ===================== ADD / EDIT MODAL ===================== */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingIng ? STRINGS.ingredients.edit : STRINGS.ingredients.addNew}
        maxWidth="max-w-xl"
      >
        <form onSubmit={handleSave} className="space-y-4">
          {modalError && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{modalError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                {STRINGS.ingredients.name}
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Red Onion, Sidamo Coffee"
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                {STRINGS.ingredients.baseUnit}
              </label>
              <select
                value={formData.baseUnit}
                onChange={(e) => setFormData({ ...formData, baseUnit: e.target.value })}
                disabled={Boolean(editingIng)}
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 disabled:opacity-60"
              >
                <option value="g">Grams (g) [Weight / kg smaller size]</option>
                <option value="ml">Milliliters (ml) [Liquid / Liter smaller size]</option>
                <option value="pcs">Pieces (pcs) [Count items]</option>
              </select>
            </div>
          </div>

          {/* Unit Cost / Price Section */}
          <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200/80">
            <div className="flex items-center gap-2 mb-2">
              <Coins className="w-4 h-4 text-amber-700" />
              <label className="block text-xs font-black text-amber-950 uppercase tracking-wider">
                Unit Purchase Price / Cost ({STRINGS.currency})
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
              <div>
                <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block">
                  Price per Base Unit (ETB / {formData.baseUnit})
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  required
                  value={formData.costPerBaseUnit}
                  onChange={(e) =>
                    setFormData({ ...formData, costPerBaseUnit: e.target.value })
                  }
                  placeholder="0.12"
                  className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-sm font-black text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>
              {formData.baseUnit !== 'pcs' ? (
                <div>
                  <label className="text-[10px] uppercase font-bold text-amber-900 mb-1 block">
                    Quick Rate per Commercial Unit (ETB / {formData.baseUnit === 'g' ? 'kg' : 'Liter'})
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={formData.costPerBaseUnit !== '' ? (Number(formData.costPerBaseUnit) * 1000) : ''}
                    onChange={(e) => {
                      const commVal = Number(e.target.value) || 0;
                      setFormData({ ...formData, costPerBaseUnit: (commVal / 1000).toString() });
                    }}
                    placeholder={formData.baseUnit === 'g' ? '120.00' : '95.00'}
                    className="w-full px-3.5 py-2.5 bg-white border border-amber-300 rounded-xl text-sm font-black text-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  />
                </div>
              ) : (
                <div className="text-xs text-amber-900 font-bold bg-white/80 p-2.5 rounded-xl border border-amber-200">
                  <span>Unit Rate: </span>
                  <span className="font-extrabold text-amber-800">
                    {getCommercialRate(formData.costPerBaseUnit, formData.baseUnit)}
                  </span>
                </div>
              )}
            </div>
            <p className="text-[11px] text-amber-800/80 mt-2">
              Used to calculate exact manufacturing costs and profit margins for menu items and recipes.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {!editingIng && (
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Opening Stock ({formData.baseUnit})
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={formData.currentStock}
                  onChange={(e) => setFormData({ ...formData, currentStock: e.target.value })}
                  placeholder="25000"
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
                <p className="text-[11px] text-gray-500 mt-1">Records an 'initial' movement in ledger</p>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                {STRINGS.ingredients.lowStockThreshold} ({formData.baseUnit})
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={formData.lowStockThreshold}
                onChange={(e) => setFormData({ ...formData, lowStockThreshold: e.target.value })}
                placeholder="5000"
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>
          </div>

          {/* Automatic Preparation Wastage Configuration */}
          <div className="pt-4 border-t border-gray-100 bg-amber-50/50 -mx-6 px-6 py-4 rounded-2xl border border-amber-200/50">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-amber-600" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900">
                {STRINGS.ingredients.prepWastageSection}
              </h4>
            </div>
            <p className="text-xs text-amber-800 mb-4">
              Configures expected loss so gross raw ingredient consumption is accurately costed:
              <span className="font-mono bg-white/70 px-1 py-0.5 rounded text-[11px] ml-1">
                Gross = Usable / (1 - WastageRate)
              </span>
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Reference Quantity ({formData.baseUnit})
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={formData.referenceQty}
                  onChange={(e) => setFormData({ ...formData, referenceQty: e.target.value })}
                  placeholder="10000"
                  className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Expected Wastage ({formData.baseUnit})
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={formData.expectedWastageQty}
                  onChange={(e) => setFormData({ ...formData, expectedWastageQty: e.target.value })}
                  placeholder="500"
                  className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>
            </div>

            {/* Live Calculation Preview Banner */}
            <div className="mt-4 p-3 bg-white rounded-xl border border-amber-200 flex items-center justify-between text-xs">
              <div>
                <span className="text-gray-500 font-medium">Calculated Wastage Rate: </span>
                <span className="font-bold text-amber-700">{previewRatePercent}%</span>
                <span className="text-gray-400 mx-2">•</span>
                <span className="text-gray-500 font-medium">Usable Yield: </span>
                <span className="font-bold text-emerald-700">{previewYieldPercent}%</span>
              </div>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.autoWastageEnabled}
                  onChange={(e) => setFormData({ ...formData, autoWastageEnabled: e.target.checked })}
                  className="w-4 h-4 text-amber-600 rounded border-gray-300 focus:ring-amber-500"
                />
                <span className="font-bold text-gray-800 text-xs">Enable Auto-Wastage</span>
              </label>
            </div>
          </div>

          {/* Modal Footer */}
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
