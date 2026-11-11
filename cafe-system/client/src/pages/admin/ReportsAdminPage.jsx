import React, { useState, useEffect } from 'react';
import { reportsApi } from '../../api/client.js';
import { STRINGS } from '../../locales/strings.js';
import {
  SimpleLineChart,
  SimpleBarChart,
  HorizontalBarChart,
  DoughnutCategoryChart,
} from '../../components/charts/ReportCharts.jsx';
import {
  TrendingUp,
  BarChart3,
  Calendar,
  Layers,
  Scale,
  AlertTriangle,
  AlertCircle,
  Flame,
  CheckCircle2,
  RefreshCw,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  Package,
  Printer,
  Download,
  Clock,
  User,
  PieChart,
  Receipt,
  FileText,
} from 'lucide-react';

export default function ReportsAdminPage() {
  // Navigation tabs: 'dashboard' | 'orders' | 'revenue' | 'costs' | 'pnl' | 'wastage' | 'lowstock'
  const [activeTab, setActiveTab] = useState('dashboard');
  const [period, setPeriod] = useState('day'); // 'day' | 'week' | 'month'
  const [datePreset, setDatePreset] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(false);

  // Data states
  const [dashboardData, setDashboardData] = useState({
    cards: {
      totalOrders: 0,
      completedOrders: 0,
      cancelledOrders: 0,
      totalItemsSold: 0,
      grossSalesRevenue: 0,
      estimatedIngredientCosts: 0,
      totalPreparationWastageCost: 0,
      totalRecordedWasteCost: 0,
      estimatedGrossProfit: 0,
      recordedOperatingExpenses: 0,
      estimatedNetProfit: 0,
    },
    metrics: {
      averageOrderValue: 0,
      averageItemsPerOrder: 0,
      profitMarginPercentage: 0,
      foodCostPercentage: 0,
      wastageCostPercentage: 0,
    },
  });

  const [orderReports, setOrderReports] = useState({
    mostPopular: [],
    leastPopular: [],
    categorySales: [],
    dishSales: [],
    waiterOrders: [],
    tableOrders: [],
    peakHours: [],
  });

  const [revenueData, setRevenueData] = useState({ totalRevenue: 0, trends: [] });
  const [ingredientCostData, setIngredientCostData] = useState({ consumption: [], recipeCostings: [] });
  const [pnlData, setPnlData] = useState({ timeline: [] });
  const [prepWastageData, setPrepWastageData] = useState({ summary: [], detailedLogs: [] });
  const [lowStockData, setLowStockData] = useState([]);

  // Search filter inside tables
  const [searchTerm, setSearchTerm] = useState('');

  const handlePresetChange = (preset) => {
    setDatePreset(preset);
    const now = new Date();

    if (preset === 'today') {
      const todayStr = now.toISOString().split('T')[0];
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === 'week') {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(now.getDate() - 7);
      setStartDate(oneWeekAgo.toISOString().split('T')[0]);
      setEndDate(now.toISOString().split('T')[0]);
    } else if (preset === 'month') {
      const oneMonthAgo = new Date();
      oneMonthAgo.setDate(now.getDate() - 30);
      setStartDate(oneMonthAgo.toISOString().split('T')[0]);
      setEndDate(now.toISOString().split('T')[0]);
    } else {
      setStartDate('');
      setEndDate('');
    }
  };

  const fetchActiveReport = async () => {
    setLoading(true);
    try {
      const params = {};
      if (startDate) params.startDate = `${startDate}T00:00:00.000Z`;
      if (endDate) params.endDate = `${endDate}T23:59:59.999Z`;

      if (activeTab === 'dashboard') {
        const [dashRes, pnlRes, revRes] = await Promise.all([
          reportsApi.getDashboard(params),
          reportsApi.getProfitLoss({ ...params, period }),
          reportsApi.getRevenue({ ...params, period }),
        ]);
        setDashboardData(dashRes.data.data);
        setPnlData(pnlRes.data.data);
        setRevenueData(revRes.data.data);
      } else if (activeTab === 'orders') {
        const res = await reportsApi.getOrders(params);
        const data = res.data?.data || {};
        setOrderReports({
          mostPopular: data.mostPopular || [],
          leastPopular: data.leastPopular || [],
          categorySales: data.categorySales || [],
          dishSales: data.dishSales || [],
          waiterOrders: data.waiterOrders || [],
          tableOrders: data.tableOrders || [],
          peakHours: data.peakHours || [],
        });
      } else if (activeTab === 'revenue') {
        const res = await reportsApi.getRevenue({ ...params, period });
        setRevenueData(res.data.data);
      } else if (activeTab === 'costs') {
        const res = await reportsApi.getIngredientCosts(params);
        setIngredientCostData(res.data.data);
      } else if (activeTab === 'pnl') {
        const res = await reportsApi.getProfitLoss({ ...params, period });
        setPnlData(res.data.data);
      } else if (activeTab === 'wastage') {
        const res = await reportsApi.getPreparationWastage(params);
        setPrepWastageData(res.data.data);
      } else if (activeTab === 'lowstock') {
        const res = await reportsApi.getLowStock();
        setLowStockData(res.data.data.lowStockItems);
      }
    } catch (err) {
      console.error('Failed to load report:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActiveReport();
  }, [activeTab, period, startDate, endDate]);

  // Section 14.I: CSV Export helper
  const exportToCSV = (rows, filename) => {
    if (!rows || rows.length === 0) {
      alert('No data available to export');
      return;
    }
    const headers = Object.keys(rows[0]);
    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        headers
          .map((h) => {
            const val = row[h];
            if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
            return val;
          })
          .join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${filename}-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
            Financial Analytics & Executive Reports
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Daily, weekly & monthly profit, revenue, weighted-average recipe costs & wastage audit
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 font-bold text-xs shadow-xs"
          >
            <Printer className="w-4 h-4 text-gray-500" />
            Print / PDF
          </button>
          <button
            onClick={fetchActiveReport}
            className="p-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 shadow-xs"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tabs Ribbon */}
      <div className="bg-white p-2 rounded-2xl border border-gray-200 shadow-xs flex flex-wrap gap-1.5 print:hidden">
        {[
          { id: 'dashboard', label: 'Executive P&L Summary', icon: TrendingUp },
          { id: 'orders', label: 'Order Analytics & Peak Hours', icon: BarChart3 },
          { id: 'revenue', label: 'Revenue Trends', icon: DollarSign },
          { id: 'costs', label: 'Ingredient & Recipe Costs', icon: Layers },
          { id: 'pnl', label: 'P&L Statement Timeline', icon: FileText },
          { id: 'wastage', label: 'Wastage Audit', icon: Scale },
          { id: 'lowstock', label: 'Safety Watchlist', icon: AlertTriangle },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === tab.id
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Global Filter Ribbon */}
      {activeTab !== 'lowstock' && (
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex flex-wrap items-center justify-between gap-4 print:hidden">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider mr-1">Period:</span>
            {['today', 'week', 'month', 'all'].map((p) => (
              <button
                key={p}
                onClick={() => handlePresetChange(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                  datePreset === p ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {p === 'all' ? 'All Time' : p === 'week' ? 'Last 7 Days' : p === 'month' ? 'Last 30 Days' : 'Today'}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <Calendar className="w-4 h-4 text-gray-400" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setDatePreset('custom');
                  setStartDate(e.target.value);
                }}
                className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:ring-2 focus:ring-amber-500"
              />
              <span>to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setDatePreset('custom');
                  setEndDate(e.target.value);
                }}
                className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {(activeTab === 'dashboard' || activeTab === 'revenue' || activeTab === 'pnl') && (
              <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
                <span className="text-xs font-semibold text-gray-500 px-1.5">Group:</span>
                {['day', 'week', 'month'].map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold capitalize transition-all ${
                      period === p ? 'bg-white text-amber-700 shadow-xs' : 'text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {loading && (
        <div className="flex justify-center items-center py-20">
          <div className="w-10 h-10 border-4 border-amber-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* --- TAB 1: EXECUTIVE DASHBOARD SUMMARY (14.A / 14.F) --- */}
      {!loading && activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* 10 Executive Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
            <div className="bg-white p-4 rounded-3xl border border-gray-200 shadow-xs">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">1. Total Orders</span>
              <p className="text-2xl font-black text-gray-900 mt-1">{dashboardData.cards.totalOrders}</p>
              <p className="text-[11px] text-gray-400">{dashboardData.cards.openOrders} tickets open</p>
            </div>

            <div className="bg-white p-4 rounded-3xl border border-gray-200 shadow-xs">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">2. Completed Orders</span>
              <p className="text-2xl font-black text-emerald-600 mt-1">{dashboardData.cards.completedOrders}</p>
              <p className="text-[11px] text-gray-400">Successfully closed</p>
            </div>

            <div className="bg-white p-4 rounded-3xl border border-gray-200 shadow-xs">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">3. Cancelled Orders</span>
              <p className="text-2xl font-black text-rose-600 mt-1">{dashboardData.cards.cancelledOrders}</p>
              <p className="text-[11px] text-gray-400">Voided / returned</p>
            </div>

            <div className="bg-white p-4 rounded-3xl border border-gray-200 shadow-xs">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">4. Total Items Sold</span>
              <p className="text-2xl font-black text-blue-600 mt-1">{dashboardData.cards.totalItemsSold}</p>
              <p className="text-[11px] text-gray-400">Avg {dashboardData.metrics.averageItemsPerOrder} / order</p>
            </div>

            <div className="bg-white p-4 rounded-3xl border border-gray-200 shadow-xs bg-gradient-to-br from-white to-amber-50/50">
              <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider block">5. Gross Sales Revenue</span>
              <p className="text-2xl font-black text-amber-600 mt-1">
                {dashboardData.cards.grossSalesRevenue?.toLocaleString()}{' '}
                <span className="text-xs font-semibold">{STRINGS.currency}</span>
              </p>
              <p className="text-[11px] text-gray-500">AOV: {dashboardData.metrics.averageOrderValue} {STRINGS.currency}</p>
            </div>

            <div className="bg-white p-4 rounded-3xl border border-gray-200 shadow-xs">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">6. Ingredient Costs</span>
              <p className="text-2xl font-black text-rose-600 mt-1">
                {dashboardData.cards.estimatedIngredientCosts?.toLocaleString()}{' '}
                <span className="text-xs font-semibold">{STRINGS.currency}</span>
              </p>
              <p className="text-[11px] text-gray-400">Food Cost: {dashboardData.metrics.foodCostPercentage}%</p>
            </div>

            <div className="bg-white p-4 rounded-3xl border border-gray-200 shadow-xs">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">7. Prep Wastage Cost</span>
              <p className="text-2xl font-black text-amber-700 mt-1">
                {dashboardData.cards.totalPreparationWastageCost?.toLocaleString()}{' '}
                <span className="text-xs font-semibold">{STRINGS.currency}</span>
              </p>
              <p className="text-[11px] text-gray-400">trim model</p>
            </div>

            <div className="bg-white p-4 rounded-3xl border border-gray-200 shadow-xs">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">8. Recorded Waste</span>
              <p className="text-2xl font-black text-orange-600 mt-1">
                {dashboardData.cards.totalRecordedWasteCost?.toLocaleString()}{' '}
                <span className="text-xs font-semibold">{STRINGS.currency}</span>
              </p>
              <p className="text-[11px] text-gray-400">Manual + station logs</p>
            </div>

            <div className="bg-white p-4 rounded-3xl border border-gray-200 shadow-xs bg-emerald-50/40">
              <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block">9. Gross Profit</span>
              <p className="text-2xl font-black text-emerald-700 mt-1">
                {dashboardData.cards.estimatedGrossProfit?.toLocaleString()}{' '}
                <span className="text-xs font-semibold">{STRINGS.currency}</span>
              </p>
              <p className="text-[11px] text-emerald-600 font-semibold">Revenue - Ingredients</p>
            </div>

            <div className="bg-white p-4 rounded-3xl border-2 border-emerald-400 shadow-sm bg-gradient-to-br from-emerald-500 to-emerald-600 text-white">
              <span className="text-[11px] font-black uppercase tracking-wider block text-emerald-100">10. Net Profit / Loss</span>
              <p className="text-2xl font-black mt-1">
                {dashboardData.cards.estimatedNetProfit?.toLocaleString()}{' '}
                <span className="text-xs font-medium">{STRINGS.currency}</span>
              </p>
              <p className="text-[11px] text-emerald-100">Margin: {dashboardData.metrics.profitMarginPercentage}%</p>
            </div>
          </div>

          {/* Visual Charts: Revenue & P&L Trend */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-gray-900 text-sm">Revenue Over Time</h3>
                  <p className="text-xs text-gray-400">Periodic trend in Ethiopian Birr</p>
                </div>
                <span className="text-xs font-black text-amber-600">
                  {revenueData.totalRevenue?.toLocaleString()} {STRINGS.currency}
                </span>
              </div>
              <SimpleLineChart data={revenueData.trends} xKey="date" yKey="grossRevenue" strokeColor="#d97706" />
            </div>

            <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-gray-900 text-sm">Net Profit Trend</h3>
                  <p className="text-xs text-gray-400">Gross profit minus operating expenses</p>
                </div>
                <span className="text-xs font-black text-emerald-600">
                  {dashboardData.cards.estimatedNetProfit?.toLocaleString()} {STRINGS.currency}
                </span>
              </div>
              <SimpleLineChart data={pnlData.timeline} xKey="date" yKey="netProfit" strokeColor="#059669" />
            </div>
          </div>
        </div>
      )}

      {/* --- TAB 2: ORDER REPORTS & PEAK HOURS (14.B) --- */}
      {!loading && activeTab === 'orders' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Peak Ordering Hours Chart */}
            <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-xs space-y-3">
              <div>
                <h3 className="font-extrabold text-gray-900 text-base">Peak Ordering Hours</h3>
                <p className="text-xs text-gray-400">Distribution of customer orders by hour of day (Addis Ababa Time)</p>
              </div>
              <SimpleBarChart data={orderReports.peakHours} xKey="formattedHour" yKey="orderCount" barColor="#3b82f6" />
            </div>

            {/* Sales by Menu Category Doughnut */}
            <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-xs space-y-3">
              <div>
                <h3 className="font-extrabold text-gray-900 text-base">Sales Volume by Category</h3>
                <p className="text-xs text-gray-400">Revenue contribution per culinary section</p>
              </div>
              <DoughnutCategoryChart data={orderReports.categorySales} />
            </div>
          </div>

          {/* Popular & Least Popular Menu Items */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold text-gray-900 text-sm flex items-center gap-1.5">
                  <Flame className="w-4 h-4 text-amber-600" />
                  Most Popular Menu Items
                </h3>
                <button
                  onClick={() => exportToCSV(orderReports.mostPopular, 'most-popular-dishes')}
                  className="text-xs text-amber-600 font-bold hover:underline inline-flex items-center gap-1"
                >
                  <Download className="w-3 h-3" /> CSV
                </button>
              </div>
              <HorizontalBarChart data={orderReports.mostPopular} nameKey="name" valKey="quantitySold" unit="units" />
            </div>

            <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold text-gray-900 text-sm flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-gray-400" />
                  Least Popular Menu Items
                </h3>
              </div>
              <HorizontalBarChart data={orderReports.leastPopular} nameKey="name" valKey="quantitySold" unit="units" />
            </div>
          </div>

          {/* Sales by Waiter & Orders by Table */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-3xl border border-gray-200 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-extrabold text-gray-900 text-sm">Staff Waiter Performance</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 text-gray-500 font-bold uppercase">
                    <tr>
                      <th className="px-4 py-3">Waiter Name</th>
                      <th className="px-4 py-3 text-center">Orders Served</th>
                      <th className="px-4 py-3 text-right">Revenue ({STRINGS.currency})</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(orderReports.waiterOrders || []).map((w) => (
                      <tr key={w._id} className="hover:bg-amber-50/30">
                        <td className="px-4 py-3 font-bold text-gray-900">{w.waiterName || w.username}</td>
                        <td className="px-4 py-3 text-center font-bold text-gray-700">{w.orderCount}</td>
                        <td className="px-4 py-3 text-right font-black text-emerald-600">{w.revenue?.toLocaleString()}</td>
                      </tr>
                    ))}
                    {(!orderReports.waiterOrders || orderReports.waiterOrders.length === 0) && (
                      <tr>
                        <td colSpan="3" className="px-4 py-6 text-center text-xs text-gray-400 italic">
                          No waiter order activity found for this period
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-gray-200 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-extrabold text-gray-900 text-sm">Dining Table Occupancy</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 text-gray-500 font-bold uppercase">
                    <tr>
                      <th className="px-4 py-3">Table</th>
                      <th className="px-4 py-3 text-center">Total Turns / Orders</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(orderReports.tableOrders || []).map((t) => (
                      <tr key={t._id} className="hover:bg-amber-50/30">
                        <td className="px-4 py-3 font-bold text-gray-900">{t.tableName}</td>
                        <td className="px-4 py-3 text-center font-black text-amber-700">{t.orderCount}</td>
                      </tr>
                    ))}
                    {(!orderReports.tableOrders || orderReports.tableOrders.length === 0) && (
                      <tr>
                        <td colSpan="2" className="px-4 py-6 text-center text-xs text-gray-400 italic">
                          No table occupancy data found for this period
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- TAB 3: REVENUE REPORTS (14.C) --- */}
      {!loading && activeTab === 'revenue' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-gray-900 text-base">Revenue Timeline</h3>
                <p className="text-xs text-gray-400">Based on historical item price snapshots from completed tickets</p>
              </div>
              <button
                onClick={() => exportToCSV(revenueData.trends, 'revenue-trends')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50"
              >
                <Download className="w-3.5 h-3.5 text-amber-600" /> Export CSV
              </button>
            </div>
            <SimpleLineChart data={revenueData.trends} xKey="date" yKey="grossRevenue" strokeColor="#d97706" />
          </div>

          <div className="bg-white rounded-3xl border border-gray-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <h3 className="font-extrabold text-gray-900 text-sm">Periodic Revenue Ledger</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 font-bold uppercase">
                  <tr>
                    <th className="px-6 py-4">Period / Date</th>
                    <th className="px-6 py-4">Orders Completed</th>
                    <th className="px-6 py-4 text-right">Gross Revenue ({STRINGS.currency})</th>
                    <th className="px-6 py-4 text-right">Average Order Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {revenueData.trends.map((row) => (
                    <tr key={row.date} className="hover:bg-amber-50/40">
                      <td className="px-6 py-4 font-bold text-gray-900">{row.date}</td>
                      <td className="px-6 py-4 font-bold text-gray-700">{row.ordersCount} tickets</td>
                      <td className="px-6 py-4 text-right font-black text-emerald-600">{row.grossRevenue?.toLocaleString()}</td>
                      <td className="px-6 py-4 text-right font-semibold text-gray-600">{row.averageTicket?.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --- TAB 4: INGREDIENT & RECIPE COSTS (14.D) --- */}
      {!loading && activeTab === 'costs' && (
        <div className="space-y-6">
          {/* Estimated Preparation Cost per Menu Item Table */}
          <div className="bg-white rounded-3xl border border-gray-200 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-gray-900 text-base">Menu Dish Costings & Profit Margins</h3>
                <p className="text-xs text-gray-400">
                  Calculated using current Weighted Average Costs (WAC) including preparation wastage
                </p>
              </div>
              <button
                onClick={() => exportToCSV(ingredientCostData.recipeCostings, 'recipe-costings')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50"
              >
                <Download className="w-3.5 h-3.5 text-amber-600" /> Export CSV
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 font-bold uppercase">
                  <tr>
                    <th className="px-6 py-4">Dish Name</th>
                    <th className="px-6 py-4">Category</th>
                    <th className="px-6 py-4 text-right">Menu Price</th>
                    <th className="px-6 py-4 text-right">Prep Cost</th>
                    <th className="px-6 py-4 text-right">Gross Margin</th>
                    <th className="px-6 py-4 text-center">Food Cost %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {ingredientCostData.recipeCostings.map((dish) => (
                    <tr key={dish.menuItemId} className="hover:bg-amber-50/40">
                      <td className="px-6 py-4 font-bold text-gray-900">{dish.name}</td>
                      <td className="px-6 py-4 text-xs font-semibold text-gray-500 capitalize">{dish.category}</td>
                      <td className="px-6 py-4 text-right font-black text-gray-900">{dish.price} {STRINGS.currency}</td>
                      <td className="px-6 py-4 text-right font-bold text-rose-600">{dish.estimatedPreparationCost} {STRINGS.currency}</td>
                      <td className="px-6 py-4 text-right font-black text-emerald-600">+{dish.grossMargin} {STRINGS.currency}</td>
                      <td className="px-6 py-4 text-center font-bold">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs ${
                            dish.foodCostPercentage > 35
                              ? 'bg-rose-100 text-rose-800'
                              : dish.foodCostPercentage > 25
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {dish.foodCostPercentage}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Raw Ingredient Consumption Table */}
          <div className="bg-white rounded-3xl border border-gray-200 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-gray-900 text-base">Ingredient Consumption Ledger</h3>
                <p className="text-xs text-gray-400">Total gross inventory consumed and historical cost value</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 font-bold uppercase">
                  <tr>
                    <th className="px-6 py-4">Ingredient</th>
                    <th className="px-6 py-4 text-right">Current Unit Cost (WAC)</th>
                    <th className="px-6 py-4 text-right">Gross Qty Consumed</th>
                    <th className="px-6 py-4 text-right">Total Cost ({STRINGS.currency})</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {ingredientCostData.consumption.map((ing) => (
                    <tr key={ing.ingredientId} className="hover:bg-amber-50/40">
                      <td className="px-6 py-4 font-bold text-gray-900">{ing.name}</td>
                      <td className="px-6 py-4 text-right font-medium text-gray-600">{ing.currentUnitCost} ETB/{ing.baseUnit}</td>
                      <td className="px-6 py-4 text-right font-bold text-gray-800">{ing.totalGrossConsumed} {ing.baseUnit}</td>
                      <td className="px-6 py-4 text-right font-black text-rose-600">{ing.totalCost?.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --- TAB 5: P&L TIMELINE STATEMENT (14.F) --- */}
      {!loading && activeTab === 'pnl' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-gray-900 text-base">Periodic Profit & Loss Timeline</h3>
                <p className="text-xs text-gray-400">Gross Sales Revenue - Ingredient Costs - Operating Expenses</p>
              </div>
              <button
                onClick={() => exportToCSV(pnlData.timeline, 'pnl-statement')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50"
              >
                <Download className="w-3.5 h-3.5 text-amber-600" /> Export CSV
              </button>
            </div>
            <SimpleLineChart data={pnlData.timeline} xKey="date" yKey="netProfit" strokeColor="#059669" />
          </div>

          <div className="bg-white rounded-3xl border border-gray-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <h3 className="font-extrabold text-gray-900 text-sm">P&L Detailed Periodic Breakdown</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 font-bold uppercase">
                  <tr>
                    <th className="px-6 py-4">Period</th>
                    <th className="px-6 py-4 text-right">Revenue</th>
                    <th className="px-6 py-4 text-right">Ingredient Cost</th>
                    <th className="px-6 py-4 text-right">Gross Profit</th>
                    <th className="px-6 py-4 text-right">Operating Expenses</th>
                    <th className="px-6 py-4 text-right font-black">Net Profit / Loss</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pnlData.timeline.map((row) => (
                    <tr key={row.date} className="hover:bg-amber-50/40">
                      <td className="px-6 py-4 font-bold text-gray-900">{row.date}</td>
                      <td className="px-6 py-4 text-right font-black text-gray-900">{row.revenue?.toLocaleString()}</td>
                      <td className="px-6 py-4 text-right font-bold text-rose-600">{row.ingredientCost?.toLocaleString()}</td>
                      <td className="px-6 py-4 text-right font-bold text-emerald-600">{row.grossProfit?.toLocaleString()}</td>
                      <td className="px-6 py-4 text-right font-bold text-gray-600">{row.operatingExpenses?.toLocaleString()}</td>
                      <td className="px-6 py-4 text-right font-black">
                        <span className={row.netProfit >= 0 ? 'text-emerald-700 font-extrabold' : 'text-rose-700 font-extrabold'}>
                          {row.netProfit >= 0 ? `+${row.netProfit.toLocaleString()}` : row.netProfit.toLocaleString()} {STRINGS.currency}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --- TAB 6:  WASTAGE AUDIT --- */}
      {!loading && activeTab === 'wastage' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-gray-200 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-gray-900 text-base">Preparation Wastage Discrepancy Audit</h3>
                <p className="text-xs text-gray-400">Compares expected model trim vs actual recorded waste</p>
              </div>
              <button
                onClick={() => exportToCSV(prepWastageData.summary, 'wastage-audit')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50"
              >
                <Download className="w-3.5 h-3.5 text-amber-600" /> Export CSV
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 font-bold uppercase">
                  <tr>
                    <th className="px-6 py-4">Ingredient</th>
                    <th className="px-6 py-4 text-center">Wastage Rate</th>
                    <th className="px-6 py-4 text-right">Gross Consumed</th>
                    <th className="px-6 py-4 text-right">Expected Waste</th>
                    <th className="px-6 py-4 text-right">Actual Waste</th>
                    <th className="px-6 py-4 text-right">Variance ($\Delta$)</th>
                    <th className="px-6 py-4 text-center">Audit Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {prepWastageData.summary.map((row) => (
                    <tr key={row.ingredientId} className="hover:bg-amber-50/40">
                      <td className="px-6 py-4 font-bold text-gray-900">{row.ingredientName}</td>
                      <td className="px-6 py-4 text-center font-bold text-gray-600">{row.configuredRatePercent}%</td>
                      <td className="px-6 py-4 text-right font-medium text-gray-600">{row.totalQuantityConsumed} {row.baseUnit}</td>
                      <td className="px-6 py-4 text-right font-bold text-amber-600">{row.expectedWastage} {row.baseUnit}</td>
                      <td className="px-6 py-4 text-right font-black text-gray-900">{row.actualRecordedWastage} {row.baseUnit}</td>
                      <td className="px-6 py-4 text-right font-black">
                        <span className={row.difference > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                          {row.difference > 0 ? `+${row.difference}` : row.difference} {row.baseUnit}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-black ${
                            row.isOverExpected ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {row.isOverExpected ? 'Excess Waste' : 'Normal'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --- TAB 7: LOW STOCK SAFETY WATCHLIST --- */}
      {!loading && activeTab === 'lowstock' && (
        <div className="bg-white rounded-3xl border border-gray-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-gray-100">
            <h3 className="font-extrabold text-gray-900 text-base">Low Stock Safety Alerts</h3>
            <p className="text-xs text-gray-400">Ingredients currently at or below their safety re-order threshold</p>
          </div>
          {lowStockData.length === 0 ? (
            <div className="p-12 text-center text-emerald-600">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-emerald-500" />
              <p className="font-bold">All Stock Levels Normal</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 font-bold uppercase">
                  <tr>
                    <th className="px-6 py-4">Ingredient</th>
                    <th className="px-6 py-4 text-right">Current Stock</th>
                    <th className="px-6 py-4 text-right">Threshold</th>
                    <th className="px-6 py-4 text-right">Deficit</th>
                    <th className="px-6 py-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lowStockData.map((item) => (
                    <tr key={item.ingredientId} className="hover:bg-rose-50/40">
                      <td className="px-6 py-4 font-bold text-gray-900">{item.name}</td>
                      <td className="px-6 py-4 text-right font-black text-rose-600">{item.currentStock} {item.baseUnit}</td>
                      <td className="px-6 py-4 text-right font-medium text-gray-500">{item.threshold} {item.baseUnit}</td>
                      <td className="px-6 py-4 text-right font-black text-rose-700">-{item.deficit} {item.baseUnit}</td>
                      <td className="px-6 py-4 text-center">
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                          Low Stock Warning
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
