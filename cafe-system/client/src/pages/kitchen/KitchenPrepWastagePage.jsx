import React, { useState, useEffect } from 'react';
import { ingredientsApi, inventoryApi } from '../../api/client.js';
import { STRINGS } from '../../locales/strings.js';
import {
  Scale,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  History,
  Send,
  RotateCcw,
  Percent,
} from 'lucide-react';

export default function KitchenPrepWastagePage() {
  const [ingredients, setIngredients] = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [selectedIngId, setSelectedIngId] = useState('');
  const [preparedQty, setPreparedQty] = useState('');
  const [actualWasteQty, setActualWasteQty] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [ingRes, movRes] = await Promise.all([
        ingredientsApi.getAll(),
        inventoryApi.getMovements({ reasonCode: 'prep_waste', limit: 10 }),
      ]);

      const list = (ingRes.data?.data?.ingredients || []).filter(
        (i) => i.autoWastageEnabled && i.wastageRate > 0
      );
      setIngredients(list);
      if (list.length > 0 && !selectedIngId) {
        setSelectedIngId(list[0]._id);
      }
      setRecentLogs(movRes.data?.data?.movements || []);
    } catch (err) {
      console.error('Failed to load prep wastage data', err);
    } finally {
      setLoading(false);
    }
  };

  const selectedIng = ingredients.find((i) => i._id === selectedIngId);

  // Live calculation of expected vs actual
  const prepAmount = Number(preparedQty) || 0;
  const actualWasteAmount = Number(actualWasteQty) || 0;
  const expectedWasteAmount =
    selectedIng && prepAmount > 0
      ? Number((prepAmount * (selectedIng.wastageRate || 0)).toFixed(2))
      : 0;

  const discrepancy = Number((actualWasteAmount - expectedWasteAmount).toFixed(2));
  const isOverExpected = discrepancy > 0;
  const actualWastageRatePercent =
    prepAmount > 0 ? ((actualWasteAmount / prepAmount) * 100).toFixed(2) : '0.00';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedIngId || prepAmount <= 0 || actualWasteAmount <= 0) {
      alert('Please enter valid positive prepared and wasted quantities');
      return;
    }

    try {
      setSubmitting(true);
      await inventoryApi.recordWaste({
        lines: [
          {
            ingredientId: selectedIngId,
            quantity: actualWasteAmount,
            preparedQty: prepAmount,
          },
        ],
        reasonCode: 'prep_waste',
        note: note.trim() || `Kitchen batch prep waste: ${selectedIng.name}`,
      });

      setSuccessMsg(
        `Actual preparation wastage of ${actualWasteAmount} ${selectedIng.baseUnit} logged and deducted from stock.`
      );
      setPreparedQty('');
      setActualWasteQty('');
      setNote('');
      await loadData();
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to submit wastage record');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight">
            Kitchen Preparation & Wastage Terminal
          </h2>
          <p className="text-xs text-gray-500 font-medium">
            Log actual peeling, trimming, and prep waste against expected baseline rates
          </p>
        </div>
        <button
          onClick={loadData}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold self-start sm:self-auto"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {successMsg && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2.5">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Record Actual Wastage Form (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-3xl p-6 sm:p-8 border border-gray-200 shadow-sm space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-50 text-amber-700 rounded-2xl">
              <Scale className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Record Preparation Batch</h3>
              <p className="text-xs text-gray-500">
                Log actual batch processed and wasted trim/peel quantities
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                Select Prepared Ingredient
              </label>
              <select
                required
                value={selectedIngId}
                onChange={(e) => setSelectedIngId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              >
                {ingredients.map((ing) => (
                  <option key={ing._id} value={ing._id}>
                    {ing.name} (Expected Rate: {((ing.wastageRate || 0) * 100).toFixed(1)}%)
                  </option>
                ))}
              </select>
            </div>

            {selectedIng && (
              <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/60 text-xs flex items-center justify-between">
                <div>
                  <span className="text-gray-500 font-medium">Configured Expected Rate: </span>
                  <span className="font-black text-amber-900">
                    {((selectedIng.wastageRate || 0) * 100).toFixed(1)}%
                  </span>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Ref: {selectedIng.referenceQty} {selectedIng.baseUnit} →{' '}
                    {selectedIng.expectedWastageQty} {selectedIng.baseUnit} expected waste
                  </p>
                </div>
                <span className="text-[10px] text-gray-400 uppercase font-bold bg-white/80 px-2 py-1 rounded-md">
                  Admin Gated
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Quantity Processed ({selectedIng?.baseUnit || 'base unit'})
                </label>
                <input
                  type="number"
                  required
                  min="0.1"
                  step="any"
                  value={preparedQty}
                  onChange={(e) => setPreparedQty(e.target.value)}
                  placeholder="e.g. 10000"
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Actual Wasted Quantity ({selectedIng?.baseUnit || 'base unit'})
                </label>
                <input
                  type="number"
                  required
                  min="0.1"
                  step="any"
                  value={actualWasteQty}
                  onChange={(e) => setActualWasteQty(e.target.value)}
                  placeholder="e.g. 580"
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>
            </div>

            {/* Real-time Discrepancy Comparison Card */}
            {prepAmount > 0 && actualWasteAmount > 0 && selectedIng && (
              <div
                className={`p-4 rounded-2xl border text-xs space-y-2 ${
                  isOverExpected
                    ? 'bg-rose-50 border-rose-200 text-rose-900'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                }`}
              >
                <div className="flex items-center justify-between font-bold">
                  <span>Variance Comparison:</span>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[11px] font-black ${
                      isOverExpected ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'
                    }`}
                  >
                    {isOverExpected ? `+${discrepancy} over expected` : `${discrepancy} under expected`}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] font-medium pt-1 border-t border-black/5">
                  <p>Expected Waste: {expectedWasteAmount} {selectedIng.baseUnit}</p>
                  <p>Actual Waste: {actualWasteAmount} {selectedIng.baseUnit}</p>
                  <p>Baseline Rate: {((selectedIng.wastageRate || 0) * 100).toFixed(1)}%</p>
                  <p>Actual Rate: {actualWastageRatePercent}%</p>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                Batch Notes & Explanation
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Batch #3 trimming, heavy outer skin"
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold rounded-2xl shadow-lg shadow-amber-600/20 transition-all text-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              {submitting ? 'Recording...' : 'Submit Preparation Wastage Record'}
            </button>
          </form>
        </div>

        {/* Right: Configured Ingredients List & Recent Logs (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Configured Baseline Rates Overview */}
          <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm space-y-3">
            <h4 className="font-bold text-gray-900 text-sm">Configured Ingredients</h4>
            <p className="text-[11px] text-gray-500">
              Only ingredients with active expected wastage enabled:
            </p>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {ingredients.map((ing) => (
                <div
                  key={ing._id}
                  className="flex items-center justify-between p-3 rounded-2xl bg-gray-50 border border-gray-100 text-xs"
                >
                  <div>
                    <p className="font-bold text-gray-900">{ing.name}</p>
                    <p className="text-[10px] text-gray-400">
                      Stock: {ing.currentStock.toLocaleString()} {ing.baseUnit}
                    </p>
                  </div>
                  <span className="px-2.5 py-1 bg-amber-100 text-amber-900 font-extrabold rounded-lg text-xs">
                    {((ing.wastageRate || 0) * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Kitchen Prep Logs */}
          <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm space-y-3">
            <h4 className="font-bold text-gray-900 text-sm">Recent Prep Wastage Logs</h4>
            {recentLogs.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No prep logs recorded yet today</p>
            ) : (
              <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                {recentLogs.map((log) => (
                  <div
                    key={log._id}
                    className="p-3 rounded-2xl bg-gray-50 border border-gray-100 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-gray-900">
                        {log.lines[0]?.ingredient?.name || 'Item'}
                      </span>
                      <span className="font-black text-rose-700">
                        {log.lines[0]?.actualWastageQty || Math.abs(log.lines[0]?.quantity)}{' '}
                        {log.lines[0]?.ingredient?.baseUnit}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-gray-400">
                      <span>By @{log.performedBy?.username}</span>
                      <span>{new Date(log.createdAt).toLocaleTimeString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
