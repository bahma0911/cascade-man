import React, { useState, useEffect } from 'react';
import { ingredientsApi, inventoryApi } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { STRINGS } from '../../locales/strings.js';
import Modal from '../../components/common/Modal.jsx';
import {
  Boxes,
  Truck,
  Trash2,
  ClipboardCheck,
  History,
  Plus,
  AlertTriangle,
  CheckCircle2,
  Search,
  Scale,
  Wrench,
  Check,
} from 'lucide-react';

export default function InventoryToolsPage() {
  const { user, isAdmin } = useAuth();

  // Active sub-tab: 'delivery' | 'waste' | 'count' | 'movements'
  const [activeTab, setActiveTab] = useState('delivery');

  const [ingredients, setIngredients] = useState([]);
  const [loading, setLoading] = useState(true);

  // Delivery Form State
  const [deliveryData, setDeliveryData] = useState({
    ingredientId: '',
    quantity: '',
    unitMultiplier: 1, // 1 for g/ml, 1000 for kg/L
    note: '',
  });
  const [deliverySubmitting, setDeliverySubmitting] = useState(false);
  const [deliverySuccess, setDeliverySuccess] = useState('');

  // Waste Form State
  const [wasteData, setWasteData] = useState({
    ingredientId: '',
    quantity: '',
    unitMultiplier: 1,
    reasonCode: 'spoilage',
    note: '',
  });
  const [wasteSubmitting, setWasteSubmitting] = useState(false);
  const [wasteSuccess, setWasteSuccess] = useState('');

  // Physical Stock Count State
  const [countInputs, setCountInputs] = useState({}); // { [ingredientId]: countedQty }
  const [countSubmitting, setCountSubmitting] = useState(false);
  const [countSuccess, setCountSuccess] = useState('');

  // Movements Audit History State
  const [movements, setMovements] = useState([]);
  const [movementFilterType, setMovementFilterType] = useState('');
  const [movementPage, setMovementPage] = useState(1);
  const [movementPagination, setMovementPagination] = useState({ total: 0, pages: 1 });
  const [movementsLoading, setMovementsLoading] = useState(false);

  // Admin Correction Modal State
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
  const [correctionData, setCorrectionData] = useState({
    ingredientId: '',
    quantity: '', // signed (+ or -)
    note: '',
  });
  const [correctionSubmitting, setCorrectionSubmitting] = useState(false);

  useEffect(() => {
    loadIngredients();
  }, []);

  useEffect(() => {
    if (activeTab === 'movements') {
      loadMovements();
    }
  }, [activeTab, movementFilterType, movementPage]);

  const loadIngredients = async () => {
    try {
      setLoading(true);
      const res = await ingredientsApi.getAll();
      const list = res.data?.data?.ingredients || [];
      setIngredients(list);
      if (list.length > 0) {
        setDeliveryData((prev) => ({ ...prev, ingredientId: list[0]._id }));
        setWasteData((prev) => ({ ...prev, ingredientId: list[0]._id }));
        setCorrectionData((prev) => ({ ...prev, ingredientId: list[0]._id }));

        // Init count inputs with current system stock
        const initialCounts = {};
        list.forEach((ing) => {
          initialCounts[ing._id] = ing.currentStock;
        });
        setCountInputs(initialCounts);
      }
    } catch (err) {
      console.error('Failed to load ingredients', err);
    } finally {
      setLoading(false);
    }
  };

  const loadMovements = async () => {
    try {
      setMovementsLoading(true);
      const res = await inventoryApi.getMovements({
        type: movementFilterType || undefined,
        page: movementPage,
        limit: 20,
      });
      setMovements(res.data?.data?.movements || []);
      setMovementPagination(res.data?.data?.pagination || { total: 0, pages: 1 });
    } catch (err) {
      console.error('Failed to load movements', err);
    } finally {
      setMovementsLoading(false);
    }
  };

  // 1. Submit Delivery
  const handleDeliverySubmit = async (e) => {
    e.preventDefault();
    if (!deliveryData.quantity || Number(deliveryData.quantity) <= 0) {
      alert('Please enter a valid positive quantity');
      return;
    }

    try {
      setDeliverySubmitting(true);
      const baseQty = Number(deliveryData.quantity) * deliveryData.unitMultiplier;

      await inventoryApi.recordDelivery({
        lines: [{ ingredientId: deliveryData.ingredientId, quantity: baseQty }],
        note: deliveryData.note.trim() || 'Supplier delivery receipt',
      });

      setDeliverySuccess('Delivery recorded and stock added successfully!');
      setDeliveryData((prev) => ({ ...prev, quantity: '', note: '' }));
      await loadIngredients();
      setTimeout(() => setDeliverySuccess(''), 4000);
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to record delivery');
    } finally {
      setDeliverySubmitting(false);
    }
  };

  // 2. Submit Waste
  const handleWasteSubmit = async (e) => {
    e.preventDefault();
    if (!wasteData.quantity || Number(wasteData.quantity) <= 0) {
      alert('Please enter a valid positive wasted quantity');
      return;
    }

    try {
      setWasteSubmitting(true);
      const baseQty = Number(wasteData.quantity) * wasteData.unitMultiplier;

      await inventoryApi.recordWaste({
        lines: [{ ingredientId: wasteData.ingredientId, quantity: baseQty }],
        reasonCode: wasteData.reasonCode,
        note: wasteData.note.trim(),
      });

      setWasteSuccess('Waste logged and stock reduced successfully!');
      setWasteData((prev) => ({ ...prev, quantity: '', note: '' }));
      await loadIngredients();
      setTimeout(() => setWasteSuccess(''), 4000);
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to record waste');
    } finally {
      setWasteSubmitting(false);
    }
  };

  // 3. Submit Stock Count
  const handleStockCountSubmit = async (e) => {
    e.preventDefault();
    if (!window.confirm('Apply physical stock count adjustments to inventory?')) return;

    try {
      setCountSubmitting(true);
      const countsPayload = ingredients.map((ing) => ({
        ingredientId: ing._id,
        countedQuantity: Number(countInputs[ing._id] ?? ing.currentStock),
      }));

      const res = await inventoryApi.recordCount({
        counts: countsPayload,
        note: 'Physical inventory audit reconciliation',
      });

      setCountSuccess(
        res.data?.data?.countAdjusted
          ? `Stock count committed! ${res.data.data.lineCount} variance(s) recorded in ledger.`
          : 'Stock count verified: All quantities matched system figures.'
      );
      await loadIngredients();
      setTimeout(() => setCountSuccess(''), 5000);
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to commit stock count');
    } finally {
      setCountSubmitting(false);
    }
  };

  // 4. Admin Correction Submit
  const handleCorrectionSubmit = async (e) => {
    e.preventDefault();
    const qty = Number(correctionData.quantity);
    if (!qty || qty === 0) {
      alert('Correction quantity delta cannot be 0');
      return;
    }
    if (!correctionData.note.trim()) {
      alert('Explanation note is required for ledger corrections');
      return;
    }

    try {
      setCorrectionSubmitting(true);
      await inventoryApi.recordCorrection({
        lines: [{ ingredientId: correctionData.ingredientId, quantity: qty }],
        reasonCode: 'admin_correction',
        note: correctionData.note.trim(),
      });

      setIsCorrectionModalOpen(false);
      setCorrectionData((prev) => ({ ...prev, quantity: '', note: '' }));
      await loadIngredients();
      if (activeTab === 'movements') await loadMovements();
      alert('Ledger correction recorded successfully.');
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to record correction');
    } finally {
      setCorrectionSubmitting(false);
    }
  };

  const selectedDeliveryIng = ingredients.find((i) => i._id === deliveryData.ingredientId);
  const selectedWasteIng = ingredients.find((i) => i._id === wasteData.ingredientId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight">Inventory Management</h2>
          <p className="text-xs text-gray-500 font-medium">
            Record supplier deliveries, waste logs, physical stock counts, and audit append-only movements
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={() => setIsCorrectionModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-gray-900 hover:bg-black active:scale-95 text-white font-bold rounded-2xl shadow-sm text-xs transition-all"
          >
            <Wrench className="w-3.5 h-3.5" />
            Admin Ledger Correction
          </button>
        )}
      </div>

      {/* Sub-Tabs */}
      <div className="flex space-x-2 border-b border-gray-200 pb-3 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab('delivery')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'delivery'
              ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
              : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
          }`}
        >
          <Truck className="w-4 h-4" />
          Record Delivery (+Stock)
        </button>

        <button
          onClick={() => setActiveTab('waste')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'waste'
              ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
              : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
          }`}
        >
          <Trash2 className="w-4 h-4" />
          Log Waste (-Stock)
        </button>

        <button
          onClick={() => setActiveTab('count')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'count'
              ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
              : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
          }`}
        >
          <ClipboardCheck className="w-4 h-4" />
          Physical Stock Count
        </button>

        <button
          onClick={() => setActiveTab('movements')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'movements'
              ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
              : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
          }`}
        >
          <History className="w-4 h-4" />
          Movement History Ledger
        </button>
      </div>

      {/* --- TAB 1: RECORD DELIVERY --- */}
      {activeTab === 'delivery' && (
        <div className="max-w-xl mx-auto bg-white rounded-3xl p-6 sm:p-8 border border-gray-200 shadow-sm space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-50 text-emerald-700 rounded-2xl">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Record Incoming Delivery</h3>
              <p className="text-xs text-gray-500">
                Incoming supplier goods increase stock atomically and write a 'delivery' ledger record
              </p>
            </div>
          </div>

          {deliverySuccess && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{deliverySuccess}</span>
            </div>
          )}

          <form onSubmit={handleDeliverySubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                Select Ingredient
              </label>
              <select
                required
                value={deliveryData.ingredientId}
                onChange={(e) => setDeliveryData({ ...deliveryData, ingredientId: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              >
                {ingredients.map((ing) => (
                  <option key={ing._id} value={ing._id}>
                    {ing.name} (Current: {ing.currentStock.toLocaleString()} {ing.baseUnit})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Delivered Quantity
                </label>
                <input
                  type="number"
                  required
                  min="0.001"
                  step="any"
                  value={deliveryData.quantity}
                  onChange={(e) => setDeliveryData({ ...deliveryData, quantity: e.target.value })}
                  placeholder="e.g. 10"
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Input Unit
                </label>
                <select
                  value={deliveryData.unitMultiplier}
                  onChange={(e) =>
                    setDeliveryData({ ...deliveryData, unitMultiplier: Number(e.target.value) })
                  }
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                >
                  {selectedDeliveryIng?.baseUnit === 'g' && (
                    <>
                      <option value={1000}>Kilograms (kg) → x1,000 g</option>
                      <option value={1}>Grams (g)</option>
                    </>
                  )}
                  {selectedDeliveryIng?.baseUnit === 'ml' && (
                    <>
                      <option value={1000}>Liters (L) → x1,000 ml</option>
                      <option value={1}>Milliliters (ml)</option>
                    </>
                  )}
                  {selectedDeliveryIng?.baseUnit === 'pcs' && (
                    <option value={1}>Pieces (pcs)</option>
                  )}
                </select>
              </div>
            </div>

            {deliveryData.quantity && (
              <p className="text-xs text-emerald-700 font-bold bg-emerald-50 p-2.5 rounded-xl border border-emerald-200/60">
                Will add: +{(Number(deliveryData.quantity) * deliveryData.unitMultiplier).toLocaleString()}{' '}
                {selectedDeliveryIng?.baseUnit} to current stock
              </p>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                Supplier / Invoice / Batch Note
              </label>
              <input
                type="text"
                value={deliveryData.note}
                onChange={(e) => setDeliveryData({ ...deliveryData, note: e.target.value })}
                placeholder="e.g. Invoice #2938 from Mercato Wholesale"
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>

            <button
              type="submit"
              disabled={deliverySubmitting}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold rounded-2xl shadow-lg shadow-emerald-600/20 transition-all text-sm disabled:opacity-50"
            >
              {deliverySubmitting ? 'Recording Delivery...' : 'Confirm Delivery & Add Stock'}
            </button>
          </form>
        </div>
      )}

      {/* --- TAB 2: LOG WASTE --- */}
      {activeTab === 'waste' && (
        <div className="max-w-xl mx-auto bg-white rounded-3xl p-6 sm:p-8 border border-gray-200 shadow-sm space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-rose-50 text-rose-700 rounded-2xl">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Record Stock Waste</h3>
              <p className="text-xs text-gray-500">
                Log spoilage, expired items, spills, or prep loss with reason codes
              </p>
            </div>
          </div>

          {wasteSuccess && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{wasteSuccess}</span>
            </div>
          )}

          <form onSubmit={handleWasteSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                Select Ingredient
              </label>
              <select
                required
                value={wasteData.ingredientId}
                onChange={(e) => setWasteData({ ...wasteData, ingredientId: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              >
                {ingredients.map((ing) => (
                  <option key={ing._id} value={ing._id}>
                    {ing.name} (Current: {ing.currentStock.toLocaleString()} {ing.baseUnit})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Wasted Quantity
                </label>
                <input
                  type="number"
                  required
                  min="0.001"
                  step="any"
                  value={wasteData.quantity}
                  onChange={(e) => setWasteData({ ...wasteData, quantity: e.target.value })}
                  placeholder="e.g. 1.5"
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Input Unit
                </label>
                <select
                  value={wasteData.unitMultiplier}
                  onChange={(e) =>
                    setWasteData({ ...wasteData, unitMultiplier: Number(e.target.value) })
                  }
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                >
                  {selectedWasteIng?.baseUnit === 'g' && (
                    <>
                      <option value={1000}>Kilograms (kg) → x1,000 g</option>
                      <option value={1}>Grams (g)</option>
                    </>
                  )}
                  {selectedWasteIng?.baseUnit === 'ml' && (
                    <>
                      <option value={1000}>Liters (L) → x1,000 ml</option>
                      <option value={1}>Milliliters (ml)</option>
                    </>
                  )}
                  {selectedWasteIng?.baseUnit === 'pcs' && <option value={1}>Pieces (pcs)</option>}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                Waste Reason Code (Rule 8)
              </label>
              <select
                value={wasteData.reasonCode}
                onChange={(e) => setWasteData({ ...wasteData, reasonCode: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              >
                <option value="spoilage">Spoilage (decay, rot, odor)</option>
                <option value="expired">Expired (passed shelf-life date)</option>
                <option value="spill">Spill / Physical Drop Damage</option>
                <option value="prep_waste">Preparation Wastage</option>
                <option value="other">Other reason</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                Explanation Note
              </label>
              <input
                type="text"
                value={wasteData.note}
                onChange={(e) => setWasteData({ ...wasteData, note: e.target.value })}
                placeholder="Brief reason for waste record..."
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>

            <button
              type="submit"
              disabled={wasteSubmitting}
              className="w-full py-3.5 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold rounded-2xl shadow-lg shadow-rose-600/20 transition-all text-sm disabled:opacity-50"
            >
              {wasteSubmitting ? 'Recording Waste...' : 'Log Waste & Deduct Stock'}
            </button>
          </form>
        </div>
      )}

      {/* --- TAB 3: PHYSICAL STOCK COUNT --- */}
      {activeTab === 'count' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-5 rounded-3xl border border-gray-200">
            <div>
              <h3 className="text-base font-bold text-gray-900">Physical Stock Count Reconciliation</h3>
              <p className="text-xs text-gray-500">
                Enter actual shelf counts in base units. The ledger automatically writes 'count_adjustment' lines for any differences.
              </p>
            </div>

            <button
              onClick={handleStockCountSubmit}
              disabled={countSubmitting}
              className="px-6 py-3 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold rounded-2xl shadow-md shadow-amber-600/20 text-xs transition-all disabled:opacity-50"
            >
              {countSubmitting ? 'Committing...' : 'Commit Count Adjustments'}
            </button>
          </div>

          {countSuccess && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{countSuccess}</span>
            </div>
          )}

          <div className="bg-white rounded-3xl border border-gray-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/70 text-gray-500 text-[11px] font-bold uppercase tracking-wider">
                    <th className="py-4 px-6">Ingredient</th>
                    <th className="py-4 px-4">Base Unit</th>
                    <th className="py-4 px-4">System Stock</th>
                    <th className="py-4 px-6">Physical Counted Figure</th>
                    <th className="py-4 px-6 text-right">Variance (Difference)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                  {ingredients.map((ing) => {
                    const counted = Number(countInputs[ing._id] ?? ing.currentStock);
                    const diff = Number((counted - ing.currentStock).toFixed(4));
                    return (
                      <tr key={ing._id} className="hover:bg-amber-50/30 transition-colors">
                        <td className="py-4 px-6 font-bold text-gray-900">{ing.name}</td>
                        <td className="py-4 px-4">
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-md text-xs font-bold">
                            {ing.baseUnit}
                          </span>
                        </td>
                        <td className="py-4 px-4 font-semibold text-gray-600">
                          {ing.currentStock.toLocaleString()} {ing.baseUnit}
                        </td>
                        <td className="py-4 px-6">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={countInputs[ing._id] ?? ''}
                            onChange={(e) =>
                              setCountInputs({ ...countInputs, [ing._id]: e.target.value })
                            }
                            className="w-36 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                          />
                        </td>
                        <td className="py-4 px-6 text-right">
                          {diff === 0 ? (
                            <span className="text-xs text-gray-400 font-semibold">Matched (0)</span>
                          ) : (
                            <span
                              className={`inline-block px-2.5 py-1 rounded-lg text-xs font-black ${
                                diff > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {diff > 0 ? `+${diff}` : diff} {ing.baseUnit}
                            </span>
                          )}
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

      {/* --- TAB 4: MOVEMENT HISTORY LEDGER --- */}
      {activeTab === 'movements' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 rounded-3xl border border-gray-200">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
              {['', 'sale', 'sale_reversal', 'delivery', 'waste', 'count_adjustment', 'initial', 'correction'].map(
                (t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setMovementFilterType(t);
                      setMovementPage(1);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                      movementFilterType === t
                        ? 'bg-gray-900 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {t ? t.replace('_', ' ').toUpperCase() : 'ALL EVENTS'}
                  </button>
                )
              )}
            </div>

            <span className="text-xs text-gray-500 font-semibold">
              Total Records: {movementPagination.total}
            </span>
          </div>

          {movementsLoading ? (
            <div className="flex justify-center py-20">
              <div className="w-8 h-8 border-3 border-amber-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : movements.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-3xl border border-dashed border-gray-300">
              <History className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium text-sm">No stock movements found</p>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-gray-200 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/70 text-gray-500 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-3.5 px-6">Timestamp</th>
                      <th className="py-3.5 px-4">Event Type</th>
                      <th className="py-3.5 px-6">Lines (Ingredient, Delta & Levels)</th>
                      <th className="py-3.5 px-4">Reason & Note</th>
                      <th className="py-3.5 px-6 text-right">Performed By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                    {movements.map((m) => (
                      <tr key={m._id} className="hover:bg-amber-50/20 transition-colors">
                        <td className="py-3.5 px-6 whitespace-nowrap text-gray-500 font-mono text-[11px]">
                          {new Date(m.createdAt).toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span
                            className={`px-2.5 py-1 rounded-md font-extrabold text-[10px] uppercase ${
                              m.type === 'delivery'
                                ? 'bg-emerald-100 text-emerald-800'
                                : m.type === 'sale'
                                ? 'bg-blue-100 text-blue-800'
                                : m.type === 'sale_reversal'
                                ? 'bg-purple-100 text-purple-800'
                                : m.type === 'waste'
                                ? 'bg-rose-100 text-rose-800'
                                : m.type === 'correction'
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {m.type}
                          </span>
                        </td>
                        <td className="py-3.5 px-6">
                          <div className="space-y-1">
                            {m.lines.map((l, i) => (
                              <div key={i} className="flex items-center gap-2">
                                <span className="font-bold text-gray-900">
                                  {l.ingredient?.name || 'Item'}:
                                </span>
                                <span
                                  className={`font-mono font-bold ${
                                    l.quantity > 0 ? 'text-emerald-600' : 'text-rose-600'
                                  }`}
                                >
                                  {l.quantity > 0 ? `+${l.quantity}` : l.quantity}{' '}
                                  {l.ingredient?.baseUnit}
                                </span>
                                <span className="text-gray-400 text-[10px]">
                                  ({l.before} → {l.after})
                                </span>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <p className="font-semibold text-gray-900">{m.reasonCode || '-'}</p>
                          {m.note && <p className="text-[11px] text-gray-500 italic">{m.note}</p>}
                        </td>
                        <td className="py-3.5 px-6 text-right whitespace-nowrap">
                          <span className="font-bold text-gray-900 block">
                            {m.performedBy?.name || 'Staff'}
                          </span>
                          <span className="text-[10px] text-gray-400">
                            @{m.performedBy?.username} ({m.performedBy?.role})
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {movementPagination.pages > 1 && (
                <div className="p-4 border-t border-gray-100 flex items-center justify-between text-xs">
                  <button
                    disabled={movementPage <= 1}
                    onClick={() => setMovementPage((p) => p - 1)}
                    className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-40 font-bold"
                  >
                    Previous
                  </button>
                  <span className="font-bold text-gray-600">
                    Page {movementPage} of {movementPagination.pages}
                  </span>
                  <button
                    disabled={movementPage >= movementPagination.pages}
                    onClick={() => setMovementPage((p) => p + 1)}
                    className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-40 font-bold"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* --- MODAL: ADMIN LEDGER CORRECTION (RULE 9) --- */}
      <Modal
        isOpen={isCorrectionModalOpen}
        onClose={() => setIsCorrectionModalOpen(false)}
        title="Create Admin Ledger Correction"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleCorrectionSubmit} className="space-y-4">
          <p className="text-xs text-amber-800 bg-amber-50 p-3 rounded-xl border border-amber-200">
            Rule 9: Mistakes in the immutable ledger are fixed only by an administrator-created
            'correction' movement with signed quantity and explanation.
          </p>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              Target Ingredient
            </label>
            <select
              required
              value={correctionData.ingredientId}
              onChange={(e) =>
                setCorrectionData({ ...correctionData, ingredientId: e.target.value })
              }
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            >
              {ingredients.map((ing) => (
                <option key={ing._id} value={ing._id}>
                  {ing.name} (Current: {ing.currentStock.toLocaleString()} {ing.baseUnit})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              Adjustment Quantity Delta (in Base Unit)
            </label>
            <input
              type="number"
              step="any"
              required
              value={correctionData.quantity}
              onChange={(e) => setCorrectionData({ ...correctionData, quantity: e.target.value })}
              placeholder="e.g. +500 to add, or -300 to reduce"
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              Auditor Reason & Explanation Note
            </label>
            <input
              type="text"
              required
              value={correctionData.note}
              onChange={(e) => setCorrectionData({ ...correctionData, note: e.target.value })}
              placeholder="Explain error being corrected..."
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
          </div>

          <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsCorrectionModalOpen(false)}
              className="px-4 py-2 text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={correctionSubmitting}
              className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl disabled:opacity-50"
            >
              {correctionSubmitting ? 'Recording...' : 'Record Correction'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
