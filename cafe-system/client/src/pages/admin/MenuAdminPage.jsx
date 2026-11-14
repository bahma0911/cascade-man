import React, { useState, useEffect } from 'react';
import { menuApi, ingredientsApi } from '../../api/client.js';
import { STRINGS } from '../../locales/strings.js';
import Modal from '../../components/common/Modal.jsx';
import {
  UtensilsCrossed,
  Plus,
  Edit2,
  Trash2,
  Search,
  CheckCircle2,
  XCircle,
  AlertCircle,
  PlusCircle,
  MinusCircle,
  RotateCcw,
  ChefHat,
  Coffee,
  Coins,
  TrendingUp,
  Tag,
} from 'lucide-react';

export default function MenuAdminPage() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [tabFilter, setTabFilter] = useState('active'); // 'active' | 'archived'

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    price: '',
    isAvailable: true,
    recipe: [],
  });
  const [modalError, setModalError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, [selectedCategory]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [menuRes, ingRes] = await Promise.all([
        menuApi.getAll({ all: true, category: selectedCategory || undefined }),
        ingredientsApi.getAll(),
      ]);

      setItems(menuRes.data?.data?.items || []);
      setCategories(menuRes.data?.data?.categories || []);
      setIngredients(ingRes.data?.data?.ingredients || []);
    } catch (err) {
      console.error('Failed to load menu data', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAdd = () => {
    setEditingItem(null);
    setFormData({
      name: '',
      category: categories[0] || 'Hot Dishes',
      itemType: 'food',
      price: '',
      isAvailable: true,
      recipe: [],
    });
    setModalError('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item) => {
    setEditingItem(item);
    const resolvedType =
      item.itemType ||
      (['beverage', 'drink', 'coffee', 'tea', 'juice', 'smoothie'].some((k) =>
        (item.category || '').toLowerCase().includes(k)
      )
        ? 'drink'
        : 'food');

    setFormData({
      name: item.name,
      category: item.category,
      itemType: resolvedType,
      price: item.price,
      isAvailable: item.isAvailable,
      recipe: (item.recipe || []).map((r) => ({
        ingredient: r.ingredient?._id || r.ingredient,
        quantity: r.quantity,
      })),
    });
    setModalError('');
    setIsModalOpen(true);
  };

  const handleAddRecipeLine = () => {
    if (ingredients.length === 0) return;
    setFormData((prev) => ({
      ...prev,
      recipe: [...prev.recipe, { ingredient: ingredients[0]._id, quantity: 100 }],
    }));
  };

  const handleRemoveRecipeLine = (index) => {
    setFormData((prev) => ({
      ...prev,
      recipe: prev.recipe.filter((_, i) => i !== index),
    }));
  };

  const handleRecipeChange = (index, field, value) => {
    setFormData((prev) => {
      const updated = [...prev.recipe];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, recipe: updated };
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setModalError('Item name is required');
      return;
    }
    if (!formData.category.trim()) {
      setModalError('Category is required');
      return;
    }
    if (formData.price === '' || Number(formData.price) < 0) {
      setModalError('Valid price is required');
      return;
    }

    try {
      setSaving(true);
      setModalError('');

      const payload = {
        name: formData.name.trim(),
        category: formData.category.trim(),
        itemType: formData.itemType || 'food',
        price: Number(formData.price),
        isAvailable: formData.isAvailable,
        recipe: formData.recipe.map((r) => ({
          ingredient: r.ingredient,
          quantity: Number(r.quantity),
        })),
      };

      if (editingItem) {
        await menuApi.update(editingItem._id, payload);
      } else {
        await menuApi.create(payload);
      }

      setIsModalOpen(false);
      await loadData();
    } catch (err) {
      setModalError(err.response?.data?.error?.message || err.message || 'Failed to save menu item');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAvailability = async (item) => {
    try {
      await menuApi.update(item._id, { isAvailable: !item.isAvailable });
      setItems((prev) =>
        prev.map((i) => (i._id === item._id ? { ...i, isAvailable: !i.isAvailable } : i))
      );
    } catch (err) {
      console.error('Failed to toggle availability', err);
    }
  };

  const handleDelete = async (item) => {
    if (item.isActive !== false) {
      if (!window.confirm(`Deactivate "${item.name}"? It will be archived and hidden from waiter ordering terminals.`)) return;
      try {
        await menuApi.delete(item._id);
        await loadData();
      } catch (err) {
        console.error('Failed to deactivate item', err);
      }
    } else {
      if (!window.confirm(`Permanently delete "${item.name}" from the database? This cannot be undone.`)) return;
      try {
        await menuApi.delete(item._id, true);
        await loadData();
      } catch (err) {
        console.error('Failed to permanently delete item', err);
      }
    }
  };

  const handleRestore = async (item) => {
    try {
      await menuApi.update(item._id, { isActive: true });
      await loadData();
    } catch (err) {
      console.error('Failed to restore item', err);
    }
  };

  // Calculate cost of preparing a menu item from its recipe
  const calculateRecipeCost = (recipeList) => {
    if (!recipeList || recipeList.length === 0) return 0;
    return recipeList.reduce((sum, line) => {
      const ingId = line.ingredient?._id || line.ingredient;
      const ingDoc =
        ingredients.find((i) => i._id === ingId) ||
        (typeof line.ingredient === 'object' ? line.ingredient : null);
      if (!ingDoc) return sum;

      const unitCost = ingDoc.costPerBaseUnit || 0;
      const usableQty = Number(line.quantity) || 0;
      const wastageRate = ingDoc.autoWastageEnabled ? ingDoc.wastageRate || 0 : 0;
      const grossQty =
        wastageRate > 0 && wastageRate < 1 ? usableQty / (1 - wastageRate) : usableQty;

      return sum + grossQty * unitCost;
    }, 0);
  };

  const modalRecipeCost = calculateRecipeCost(formData.recipe);
  const modalSellingPrice = Math.max(0, Number(formData.price) || 0);
  const modalGrossProfit = modalSellingPrice - modalRecipeCost;
  const modalMarginPercent =
    modalSellingPrice > 0
      ? ((modalGrossProfit / modalSellingPrice) * 100).toFixed(1)
      : '0.0';

  const activeItems = items.filter((item) => item.isActive !== false);
  const archivedItems = items.filter((item) => item.isActive === false);
  const targetItems = tabFilter === 'active' ? activeItems : archivedItems;

  const filteredItems = targetItems.filter((item) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight">{STRINGS.menu.title}</h2>
          <p className="text-xs text-gray-500 font-medium">
            Define menu offerings, pricing in ETB, and ingredient recipes for automatic deduction
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold rounded-2xl shadow-lg shadow-amber-600/25 transition-all text-sm"
        >
          <Plus className="w-5 h-5" />
          {STRINGS.menu.addNew}
        </button>
      </div>

      {/* Tabs: Active vs Archived */}
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
          Active Menu Dishes ({activeItems.length})
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
          Archived / Deactivated ({archivedItems.length})
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3.5">
        <div className="relative w-full">
          <Search className="w-5 h-5 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search menu items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
          />
        </div>

        {/* Category Pills */}
        <div className="flex flex-wrap items-center gap-2 pb-1">
          <button
            onClick={() => setSelectedCategory('')}
            className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all whitespace-nowrap ${
              selectedCategory === ''
                ? 'bg-gray-900 text-white'
                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {STRINGS.menu.allCategories}
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all whitespace-nowrap ${
                selectedCategory === cat
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Items List */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-3 border-amber-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-gray-300">
          <UtensilsCrossed className="w-12 h-12 text-gray-400 mx-auto mb-3 opacity-40" />
          <p className="text-gray-500 font-medium text-sm">{STRINGS.common.noData}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map((item) => (
            <div
              key={item._id}
              className={`bg-white rounded-3xl p-5 border transition-all flex flex-col justify-between ${
                item.isAvailable ? 'border-gray-200/90 shadow-xs' : 'border-gray-200 bg-gray-50/70 opacity-75'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                      <span className="inline-block text-[11px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-md">
                        {item.category}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md ${
                          item.itemType === 'drink'
                            ? 'bg-amber-100 text-amber-900 border border-amber-200'
                            : 'bg-orange-100 text-orange-900 border border-orange-200'
                        }`}
                      >
                        {item.itemType === 'drink' ? (
                          <>
                            <Coffee className="w-3 h-3" /> Barista Bar
                          </>
                        ) : (
                          <>
                            <ChefHat className="w-3 h-3" /> Kitchen
                          </>
                        )}
                      </span>
                    </div>
                    <h3 className="font-bold text-gray-900 text-base leading-snug">{item.name}</h3>
                  </div>
                  <span className="text-base font-black text-amber-600 whitespace-nowrap">
                    {item.price} {STRINGS.currency}
                  </span>
                </div>

                {/* Recipe Breakdown */}
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                    {STRINGS.menu.recipe}
                  </p>
                  {item.recipe && item.recipe.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {item.recipe.map((r, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded-lg font-medium"
                        >
                          {r.ingredient?.name || 'Ingredient'}: {r.quantity} {r.ingredient?.baseUnit || ''}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 italic">{STRINGS.menu.noRecipe}</p>
                  )}
                </div>

                {/* Production Cost vs Selling Price Strip */}
                {(() => {
                  const itemCost = calculateRecipeCost(item.recipe);
                  const sellingPrice = Number(item.price) || 0;
                  const grossProfit = sellingPrice - itemCost;
                  const profitMargin =
                    sellingPrice > 0 ? ((grossProfit / sellingPrice) * 100).toFixed(1) : '0.0';

                  return (
                    <div className="mt-3 p-3 rounded-2xl bg-amber-50/60 border border-amber-200/70 text-xs">
                      <div className="flex items-center justify-between font-bold text-gray-700">
                        <span className="flex items-center gap-1.5 text-gray-600">
                          <Coins className="w-3.5 h-3.5 text-amber-700" />
                          Cost to Make:
                        </span>
                        <span className="font-black text-gray-900">
                          {itemCost.toFixed(2)} {STRINGS.currency}
                        </span>
                      </div>
                      <div className="flex items-center justify-between font-bold text-gray-700 mt-1">
                        <span className="text-gray-600">Selling Price:</span>
                        <span className="font-black text-amber-900">
                          {sellingPrice.toFixed(2)} {STRINGS.currency}
                        </span>
                      </div>
                      <div className="flex items-center justify-between font-extrabold pt-1.5 mt-1.5 border-t border-amber-200/60">
                        <span className="text-gray-600">Gross Margin:</span>
                        <span className={grossProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                          {grossProfit >= 0 ? '+' : ''}
                          {grossProfit.toFixed(2)} {STRINGS.currency} ({profitMargin}%)
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Card Footer Actions */}
              <div className="mt-5 pt-4 border-t border-gray-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => handleToggleAvailability(item)}
                  className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl transition-colors ${
                    item.isAvailable
                      ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {item.isAvailable ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" /> {STRINGS.menu.available}
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3.5 h-3.5" /> {STRINGS.menu.unavailable}
                    </>
                  )}
                </button>

                <div className="flex items-center gap-1">
                  {item.isActive !== false ? (
                    <>
                      <button
                        onClick={() => handleOpenEdit(item)}
                        className="p-2 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-colors active:scale-95"
                        title={STRINGS.menu.editItem}
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(item)}
                        className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors active:scale-95"
                        title="Deactivate / Archive Menu Item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => handleRestore(item)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors"
                        title="Restore Menu Item"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Restore
                      </button>
                      <button
                        onClick={() => handleDelete(item)}
                        className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                        title="Delete Permanently from Database"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingItem ? STRINGS.menu.editItem : STRINGS.menu.addNew}
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleSave} className="space-y-5">
          {modalError && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{modalError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                {STRINGS.menu.name}
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Special Beef Tibs"
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                {STRINGS.menu.category}
              </label>
              <input
                type="text"
                required
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="e.g. Hot Dishes, Beverages"
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                Station Destination
              </label>
              <select
                value={formData.itemType || 'food'}
                onChange={(e) => setFormData({ ...formData, itemType: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              >
                <option value="food">🍽️ Kitchen (Food)</option>
                <option value="drink">☕ Barista (Beverage)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                {STRINGS.menu.price} ({STRINGS.currency})
              </label>
              <input
                type="number"
                required
                min="0"
                step="any"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                placeholder="450"
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>

            <div className="flex items-center pt-6">
              <label className="inline-flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isAvailable}
                  onChange={(e) => setFormData({ ...formData, isAvailable: e.target.checked })}
                  className="w-5 h-5 text-amber-600 rounded-lg border-gray-300 focus:ring-amber-500"
                />
                <span className="text-sm font-semibold text-gray-900">Active & In Stock for Orders</span>
              </label>
            </div>
          </div>

          {/* Dynamic Recipe Builder */}
          <div className="pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="text-sm font-bold text-gray-900">{STRINGS.menu.recipe}</h4>
                <p className="text-xs text-gray-500">
                  Ingredients automatically deducted from stock when an order is placed
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddRecipeLine}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 hover:bg-amber-100 text-xs font-bold rounded-xl transition-colors"
              >
                <PlusCircle className="w-4 h-4" />
                Add Ingredient
              </button>
            </div>

            {formData.recipe.length === 0 ? (
              <p className="text-xs text-gray-400 italic p-4 bg-gray-50 rounded-2xl text-center">
                No ingredients specified. Click "+ Add Ingredient" above to attach recipe items.
              </p>
            ) : (
              <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                {formData.recipe.map((line, idx) => {
                  const selectedIng = ingredients.find((i) => i._id === line.ingredient);
                  return (
                    <div
                      key={idx}
                      className="flex items-center gap-3 p-3 bg-gray-50 rounded-2xl border border-gray-200/70"
                    >
                      {/* Ingredient Selector */}
                      <div className="flex-1">
                        <select
                          value={line.ingredient}
                          onChange={(e) => handleRecipeChange(idx, 'ingredient', e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                        >
                          {ingredients.map((ing) => (
                            <option key={ing._id} value={ing._id}>
                              {ing.name} ({ing.baseUnit})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Quantity Input */}
                      <div className="w-32 flex items-center gap-1.5">
                        <input
                          type="number"
                          min="0.1"
                          step="any"
                          required
                          value={line.quantity}
                          onChange={(e) => handleRecipeChange(idx, 'quantity', e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                        />
                        <span className="text-xs font-bold text-gray-500 w-8">
                          {selectedIng?.baseUnit || ''}
                        </span>
                      </div>

                      {/* Line Cost Display */}
                      <div className="text-right min-w-[70px]">
                        <span className="text-[11px] font-bold text-gray-600 block">
                          ETB {(() => {
                            const unitCost = selectedIng?.costPerBaseUnit || 0;
                            const usableQty = Number(line.quantity) || 0;
                            const wastageRate = selectedIng?.autoWastageEnabled ? (selectedIng.wastageRate || 0) : 0;
                            const grossQty = wastageRate > 0 && wastageRate < 1 ? usableQty / (1 - wastageRate) : usableQty;
                            return (grossQty * unitCost).toFixed(2);
                          })()}
                        </span>
                        <span className="text-[9px] text-gray-400">
                          @{selectedIng?.costPerBaseUnit ? `${selectedIng.costPerBaseUnit.toFixed(2)}/${selectedIng.baseUnit}` : 'no price'}
                        </span>
                      </div>

                      {/* Remove Line Button */}
                      <button
                        type="button"
                        onClick={() => handleRemoveRecipeLine(idx)}
                        className="p-1.5 text-gray-400 hover:text-rose-600 rounded-lg hover:bg-white transition-colors"
                      >
                        <MinusCircle className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recipe Cost vs Selling Price Live Breakdown */}
          <div className="p-4 bg-gradient-to-br from-amber-500/5 via-amber-500/10 to-orange-500/5 border border-amber-200/80 rounded-2xl">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-amber-600" />
                Live Cost & Profit Breakdown
              </span>
              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                modalGrossProfit >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
              }`}>
                {modalGrossProfit >= 0 ? `+${modalMarginPercent}% Margin` : 'Operating at Loss'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-white/80 p-2.5 rounded-xl border border-amber-100">
                <p className="text-[10px] uppercase font-bold text-gray-500">Production Cost</p>
                <p className="text-sm font-black text-rose-700 mt-0.5">
                  ETB {modalRecipeCost.toFixed(2)}
                </p>
                <p className="text-[9px] text-gray-400">incl. wastage rates</p>
              </div>

              <div className="bg-white/80 p-2.5 rounded-xl border border-amber-100">
                <p className="text-[10px] uppercase font-bold text-gray-500">Selling Price</p>
                <p className="text-sm font-black text-gray-900 mt-0.5">
                  ETB {modalSellingPrice.toFixed(2)}
                </p>
                <p className="text-[9px] text-gray-400">menu listing rate</p>
              </div>

              <div className={`p-2.5 rounded-xl border ${
                modalGrossProfit >= 0
                  ? 'bg-emerald-50/90 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50/90 border-rose-200 text-rose-900'
              }`}>
                <p className="text-[10px] uppercase font-bold text-gray-500">Est. Gross Profit</p>
                <p className="text-sm font-black mt-0.5">
                  ETB {modalGrossProfit.toFixed(2)}
                </p>
                <p className="text-[9px] opacity-75">per serving</p>
              </div>
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

