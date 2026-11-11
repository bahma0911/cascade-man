import React, { useState, useEffect } from 'react';
import { notificationsApi } from '../../api/client.js';
import Modal from '../../components/common/Modal.jsx';
import {
  Bell,
  Mail,
  Send,
  Clock,
  ShieldAlert,
  AlertTriangle,
  FileText,
  Calendar,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Plus,
  Trash2,
  Settings2,
  Sliders,
  Users,
  History,
  Sparkles,
} from 'lucide-react';

const NOTIFICATION_TYPES = [
  {
    key: 'lowStock',
    label: 'Low-Stock Warnings',
    desc: 'When an ingredient drops to or below minimum threshold (strictly de-duplicated)',
    icon: AlertTriangle,
    badgeColor: 'bg-amber-100 text-amber-800',
  },
  {
    key: 'criticalStock',
    label: 'Critical Stock Alerts',
    desc: 'Immediate high-priority alert when stock is zero or depleted negative',
    icon: ShieldAlert,
    badgeColor: 'bg-rose-100 text-rose-800',
  },
  {
    key: 'dailyReport',
    label: 'Daily Business Summary',
    desc: 'Dispatched at configured time with previous day KPIs, sales, costs & profits',
    icon: FileText,
    badgeColor: 'bg-blue-100 text-blue-800',
  },
  {
    key: 'weeklyReport',
    label: 'Weekly Performance Report',
    desc: 'Weekly revenue, margins, best sellers, and week-over-week comparisons',
    icon: Calendar,
    badgeColor: 'bg-indigo-100 text-indigo-800',
  },
  {
    key: 'monthlyReport',
    label: 'Monthly Business Review',
    desc: 'Executive review with profit margins, food cost %, and category breakdowns',
    icon: Sparkles,
    badgeColor: 'bg-purple-100 text-purple-800',
  },
  {
    key: 'excessiveWastage',
    label: 'Excessive Wastage Alerts',
    desc: 'When preparation waste exceeds expected models by the configured tolerance %',
    icon: Sliders,
    badgeColor: 'bg-orange-100 text-orange-800',
  },
  {
    key: 'systemAlerts',
    label: 'System Technical Alerts',
    desc: 'Critical notices for database connection failures or persistent delivery issues',
    icon: ShieldAlert,
    badgeColor: 'bg-red-100 text-red-800',
  },
];

export default function NotificationsAdminPage() {
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [reportTriggering, setReportTriggering] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // Settings State
  const [settings, setSettings] = useState({
    restaurantEmail: '',
    recipients: [],
    enabledTypes: {
      lowStock: true,
      criticalStock: true,
      dailyReport: true,
      weeklyReport: true,
      monthlyReport: true,
      excessiveWastage: true,
      systemAlerts: true,
    },
    dailyReportTime: '08:00',
    excessiveWastageThreshold: 15,
  });

  // System Status State
  const [emailStatus, setEmailStatus] = useState({
    configured: false,
    senderAddress: '',
    appName: '',
    deliveryMode: 'simulation_fallback',
    stats: { totalSent: 0, totalFailed: 0, lastDeliveryAt: null },
  });

  // History State
  const [historyLogs, setHistoryLogs] = useState([]);
  const [historyPagination, setHistoryPagination] = useState({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  // Recipient Modal State
  const [isRecipientModalOpen, setIsRecipientModalOpen] = useState(false);
  const [recipientForm, setRecipientForm] = useState({
    name: '',
    email: '',
    role: 'Manager',
    alertTypes: ['low_stock', 'critical_stock', 'daily_report'],
  });

  // Test Email Modal State
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [settingsRes, statusRes, historyRes] = await Promise.all([
        notificationsApi.getSettings(),
        notificationsApi.getEmailStatus(),
        notificationsApi.getHistory({
          page: historyPagination.page,
          limit: historyPagination.limit,
          status: statusFilter !== 'all' ? statusFilter : undefined,
          type: typeFilter !== 'all' ? typeFilter : undefined,
        }),
      ]);

      if (settingsRes.data?.data) {
        setSettings(settingsRes.data.data);
        setTestEmailAddress(settingsRes.data.data.restaurantEmail || '');
      }
      if (statusRes.data?.data) {
        setEmailStatus(statusRes.data.data);
      }
      if (historyRes.data?.data) {
        setHistoryLogs(historyRes.data.data.logs || []);
        setHistoryPagination(historyRes.data.data.pagination);
      }
    } catch (err) {
      console.error('Failed to load notifications data:', err);
      showFeedback('error', err.response?.data?.error || 'Failed to load notification settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [historyPagination.page, statusFilter, typeFilter]);

  const showFeedback = (type, message) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 5000);
  };

  const handleSaveSettings = async (e) => {
    e?.preventDefault();
    setSavingSettings(true);
    try {
      const res = await notificationsApi.updateSettings({
        restaurantEmail: settings.restaurantEmail,
        recipients: settings.recipients,
        enabledTypes: settings.enabledTypes,
        dailyReportTime: settings.dailyReportTime,
        excessiveWastageThreshold: Number(settings.excessiveWastageThreshold),
      });
      setSettings(res.data.data);
      showFeedback('success', 'Notification settings saved successfully!');
    } catch (err) {
      showFeedback('error', err.response?.data?.error || 'Failed to update settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleToggleType = (key) => {
    setSettings((prev) => ({
      ...prev,
      enabledTypes: {
        ...prev.enabledTypes,
        [key]: !prev.enabledTypes[key],
      },
    }));
  };

  const handleSendTestEmail = async (e) => {
    e.preventDefault();
    if (!testEmailAddress) {
      showFeedback('error', 'Please enter a target recipient email');
      return;
    }
    setTestSending(true);
    try {
      await notificationsApi.sendTestEmail({ email: testEmailAddress });
      showFeedback('success', `Test email sent to ${testEmailAddress}`);
      setIsTestModalOpen(false);
      loadData();
    } catch (err) {
      showFeedback('error', err.response?.data?.error || 'Failed to send test email');
    } finally {
      setTestSending(false);
    }
  };

  const handleTriggerReport = async (reportType) => {
    setReportTriggering(true);
    try {
      await notificationsApi.triggerReport({ reportType });
      showFeedback('success', `${reportType.toUpperCase()} report email generated and dispatched!`);
      loadData();
    } catch (err) {
      showFeedback('error', err.response?.data?.error || `Failed to trigger ${reportType} report`);
    } finally {
      setReportTriggering(false);
    }
  };

  const handleAddRecipient = () => {
    if (!recipientForm.email.trim()) {
      showFeedback('error', 'Recipient email is required');
      return;
    }
    const updated = [...(settings.recipients || []), { ...recipientForm }];
    setSettings((prev) => ({ ...prev, recipients: updated }));
    setIsRecipientModalOpen(false);
    setRecipientForm({
      name: '',
      email: '',
      role: 'Manager',
      alertTypes: ['low_stock', 'critical_stock', 'daily_report'],
    });
    showFeedback('info', 'Recipient added. Remember to click "Save Changes" to persist.');
  };

  const handleRemoveRecipient = (index) => {
    const updated = settings.recipients.filter((_, i) => i !== index);
    setSettings((prev) => ({ ...prev, recipients: updated }));
    showFeedback('info', 'Recipient removed. Click "Save Changes" to persist.');
  };

  const handleToggleRecipientAlertType = (typeCode) => {
    setRecipientForm((prev) => {
      const exists = prev.alertTypes.includes(typeCode);
      return {
        ...prev,
        alertTypes: exists
          ? prev.alertTypes.filter((t) => t !== typeCode)
          : [...prev.alertTypes, typeCode],
      };
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 animate-spin text-amber-600" />
          <p className="text-gray-500 font-medium">Loading Email Notification System...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Banner & Feedback Alerts */}
      {feedback && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between shadow-sm animate-fadeIn ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : feedback.type === 'error'
              ? 'bg-rose-50 text-rose-800 border border-rose-200'
              : 'bg-blue-50 text-blue-800 border border-blue-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            ) : feedback.type === 'error' ? (
              <XCircle className="w-5 h-5 text-rose-600" />
            ) : (
              <Bell className="w-5 h-5 text-blue-600" />
            )}
            <span className="text-sm font-semibold">{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-xs font-bold hover:underline opacity-80"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-100 rounded-xl text-amber-700">
              <Mail className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Email Notification System</h1>
              <p className="text-sm text-gray-500">
                Automated business alerts, low-stock warnings, and scheduled executive reports via Resend
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsTestModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 font-medium text-sm transition-all shadow-xs"
          >
            <Send className="w-4 h-4 text-gray-500" />
            Send Test Email
          </button>
          <button
            onClick={handleSaveSettings}
            disabled={savingSettings}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-600 text-white rounded-xl hover:bg-amber-700 font-semibold text-sm transition-all shadow-sm disabled:opacity-50"
          >
            {savingSettings ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Settings2 className="w-4 h-4" />}
            Save Changes
          </button>
        </div>
      </div>

      {/* Section 15.A: Delivery Health & Engine Status */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs flex items-center gap-4">
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              emailStatus.configured ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
            }`}
          >
            <Mail className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">Delivery Gateway</div>
            <div className="text-base font-bold text-gray-900 mt-0.5">
              {emailStatus.configured ? 'Resend Live API' : 'Simulation Mode'}
            </div>
            <div className="text-xs text-gray-500 mt-0.5 truncate max-w-[160px]">
              {emailStatus.senderAddress || 'onboarding@resend.dev'}
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">Total Sent</div>
            <div className="text-2xl font-black text-gray-900 mt-0.5">{emailStatus.stats.totalSent}</div>
            <div className="text-xs text-gray-500 mt-0.5">Delivered without error</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
            <XCircle className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">Delivery Failures</div>
            <div className="text-2xl font-black text-rose-600 mt-0.5">{emailStatus.stats.totalFailed}</div>
            <div className="text-xs text-gray-500 mt-0.5">Non-blocking background retry</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">Timezone Context</div>
            <div className="text-base font-bold text-gray-900 mt-0.5">Africa/Addis_Ababa</div>
            <div className="text-xs text-gray-500 mt-0.5">Daily reports at {settings.dailyReportTime || '08:00'}</div>
          </div>
        </div>
      </div>

      {/* Main Settings Tabs / Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: General Settings & Enabled Notification Types */}
        <div className="lg:col-span-1 space-y-6">
          {/* General Config Card */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-5">
            <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
              <Settings2 className="w-5 h-5 text-amber-600" />
              <h2 className="text-lg font-bold text-gray-900">Email Configuration</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Restaurant Notification Email
                </label>
                <input
                  type="email"
                  value={settings.restaurantEmail}
                  onChange={(e) => setSettings({ ...settings, restaurantEmail: e.target.value })}
                  placeholder="management@restaurant.com"
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Default inbox for restaurant summaries and alert fallbacks.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Daily Report Delivery Time (Addis Ababa)
                </label>
                <input
                  type="time"
                  value={settings.dailyReportTime}
                  onChange={(e) => setSettings({ ...settings, dailyReportTime: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Time when the previous day's financial review is automatically emailed.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Excessive Wastage Threshold (%)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={settings.excessiveWastageThreshold}
                    onChange={(e) => setSettings({ ...settings, excessiveWastageThreshold: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  />
                  <span className="text-sm font-bold text-gray-600">%</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Trigger alert when kitchen prep waste exceeds expected model by this margin.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Columns: Active Notification Types & Recipients */}
        <div className="lg:col-span-2 space-y-6">
          {/* Notification Types Toggles */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-amber-600" />
                <h2 className="text-lg font-bold text-gray-900">Automated Notification Triggers</h2>
              </div>
              <span className="text-xs text-gray-400 font-medium">Toggle active channels</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {NOTIFICATION_TYPES.map((type) => {
                const IconComponent = type.icon;
                const isEnabled = settings.enabledTypes?.[type.key] !== false;

                return (
                  <div
                    key={type.key}
                    onClick={() => handleToggleType(type.key)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 select-none ${
                      isEnabled
                        ? 'border-amber-300 bg-amber-50/40 hover:bg-amber-50'
                        : 'border-gray-200 bg-gray-50/60 opacity-60 hover:opacity-80'
                    }`}
                  >
                    <div
                      className={`p-2 rounded-lg mt-0.5 ${
                        isEnabled ? 'bg-amber-100 text-amber-800' : 'bg-gray-200 text-gray-500'
                      }`}
                    >
                      <IconComponent className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-gray-900">{type.label}</span>
                        <input
                          type="checkbox"
                          checked={isEnabled}
                          onChange={() => {}} // Handled by parent click
                          className="h-4 w-4 text-amber-600 rounded-sm border-gray-300 focus:ring-amber-500"
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1 leading-snug">{type.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 15.B: Recipients Management */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-600" />
                <h2 className="text-lg font-bold text-gray-900">Notification Recipients</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsRecipientModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-xs font-semibold shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Recipient
              </button>
            </div>

            {(!settings.recipients || settings.recipients.length === 0) ? (
              <div className="py-8 text-center text-gray-400 text-sm">
                No specific recipients configured. Alerts are dispatched to the primary restaurant email address.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs font-bold uppercase tracking-wider text-gray-400">
                      <th className="py-2.5">Name</th>
                      <th className="py-2.5">Email</th>
                      <th className="py-2.5">Role</th>
                      <th className="py-2.5">Alert Subscriptions</th>
                      <th className="py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {settings.recipients.map((r, idx) => (
                      <tr key={idx} className="hover:bg-gray-50/50">
                        <td className="py-3 font-semibold text-gray-900">{r.name}</td>
                        <td className="py-3 text-gray-600 font-mono text-xs">{r.email}</td>
                        <td className="py-3">
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                            {r.role || 'Staff'}
                          </span>
                        </td>
                        <td className="py-3">
                          <div className="flex flex-wrap gap-1 max-w-[280px]">
                            {r.alertTypes?.map((t) => (
                              <span
                                key={t}
                                className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200"
                              >
                                {t.replace('_', ' ')}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveRecipient(idx)}
                            className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delivery Audit History Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-bold text-gray-900">Email Delivery Audit Trail</h2>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 font-medium"
            >
              <option value="all">All Delivery Statuses</option>
              <option value="sent">Sent Successfully</option>
              <option value="failed">Delivery Failed</option>
            </select>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 font-medium"
            >
              <option value="all">All Alert Types</option>
              <option value="low_stock">Low Stock</option>
              <option value="critical_stock">Critical Stock</option>
              <option value="daily_report">Daily Summary</option>
              <option value="weekly_report">Weekly Report</option>
              <option value="monthly_report">Monthly Review</option>
              <option value="excessive_wastage">Excessive Wastage</option>
              <option value="system_alert">System Alerts</option>
              <option value="test">Test Emails</option>
            </select>
          </div>
        </div>

        {historyLogs.length === 0 ? (
          <div className="py-10 text-center text-gray-400 text-sm">
            No email notifications logged yet. Trigger a test email to verify delivery.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs font-bold uppercase tracking-wider text-gray-400">
                  <th className="py-2.5">Date & Time</th>
                  <th className="py-2.5">Type</th>
                  <th className="py-2.5">Recipient</th>
                  <th className="py-2.5">Subject</th>
                  <th className="py-2.5">Status</th>
                  <th className="py-2.5">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {historyLogs.map((log) => (
                  <tr key={log._id} className="hover:bg-gray-50/50">
                    <td className="py-3 text-xs text-gray-500 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString('en-GB', {
                        timeZone: 'Africa/Addis_Ababa',
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="py-3">
                      <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-gray-100 text-gray-800 uppercase tracking-wider text-[10px]">
                        {log.notificationType?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 font-mono text-xs text-gray-700">{log.recipient}</td>
                    <td className="py-3 font-medium text-gray-900 max-w-[280px] truncate" title={log.subject}>
                      {log.subject}
                    </td>
                    <td className="py-3">
                      {log.status === 'sent' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Sent
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800">
                          <XCircle className="w-3 h-3 text-rose-600" />
                          Failed
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-xs text-gray-500 max-w-[200px] truncate">
                      {log.error ? (
                        <span className="text-rose-600" title={log.error}>
                          {log.error}
                        </span>
                      ) : log.resendId ? (
                        <span className="font-mono text-[11px] text-gray-400">ID: {log.resendId}</span>
                      ) : (
                        <span className="text-gray-400">Mock Simulated</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {historyPagination.totalPages > 1 && (
          <div className="flex items-center justify-between pt-4 border-t border-gray-100">
            <span className="text-xs text-gray-500">
              Page {historyPagination.page} of {historyPagination.totalPages} ({historyPagination.total} total)
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={historyPagination.page <= 1}
                onClick={() => setHistoryPagination((p) => ({ ...p, page: p.page - 1 }))}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={historyPagination.page >= historyPagination.totalPages}
                onClick={() => setHistoryPagination((p) => ({ ...p, page: p.page + 1 }))}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Recipient Modal */}
      <Modal
        isOpen={isRecipientModalOpen}
        onClose={() => setIsRecipientModalOpen(false)}
        title="Add Notification Recipient"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
              Full Name
            </label>
            <input
              type="text"
              value={recipientForm.name}
              onChange={(e) => setRecipientForm({ ...recipientForm, name: e.target.value })}
              placeholder="e.g. Abebe Bikila"
              className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
              Email Address
            </label>
            <input
              type="email"
              value={recipientForm.email}
              onChange={(e) => setRecipientForm({ ...recipientForm, email: e.target.value })}
              placeholder="e.g. abebe@cafe.com"
              className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
              Staff Role
            </label>
            <select
              value={recipientForm.role}
              onChange={(e) => setRecipientForm({ ...recipientForm, role: e.target.value })}
              className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 bg-white"
            >
              <option value="Owner">Owner / Executive</option>
              <option value="General Manager">General Manager</option>
              <option value="Head Chef">Head Chef</option>
              <option value="Kitchen Manager">Kitchen Manager</option>
              <option value="Inventory Clerk">Inventory Clerk</option>
              <option value="Accountant">Accountant / Finance</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
              Subscribed Notifications
            </label>
            <div className="space-y-2">
              {[
                { id: 'low_stock', label: 'Low-Stock Warnings' },
                { id: 'critical_stock', label: 'Critical Stock Alerts (Zero/Negative)' },
                { id: 'daily_report', label: 'Daily Business Summary' },
                { id: 'weekly_report', label: 'Weekly Performance Report' },
                { id: 'monthly_report', label: 'Monthly Business Review' },
                { id: 'excessive_wastage', label: 'Excessive Preparation Wastage' },
                { id: 'system_alert', label: 'Technical / System Alerts' },
              ].map((item) => (
                <label key={item.id} className="flex items-center gap-2.5 text-xs text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={recipientForm.alertTypes.includes(item.id)}
                    onChange={() => handleToggleRecipientAlertType(item.id)}
                    className="h-4 w-4 text-amber-600 rounded border-gray-300 focus:ring-amber-500"
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setIsRecipientModalOpen(false)}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAddRecipient}
              className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700"
            >
              Add Recipient
            </button>
          </div>
        </div>
      </Modal>

      {/* Test Email Modal */}
      <Modal
        isOpen={isTestModalOpen}
        onClose={() => setIsTestModalOpen(false)}
        title="Send Test Email via Resend"
      >
        <form onSubmit={handleSendTestEmail} className="space-y-4">
          <p className="text-xs text-gray-500">
            Verify email delivery configuration. This sends a formatted HTML sample email through Resend and logs the delivery attempt.
          </p>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
              Recipient Email Address
            </label>
            <input
              type="email"
              required
              value={testEmailAddress}
              onChange={(e) => setTestEmailAddress(e.target.value)}
              placeholder="you@domain.com"
              className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setIsTestModalOpen(false)}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={testSending}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 text-white rounded-xl text-sm font-semibold hover:bg-amber-700 disabled:opacity-50"
            >
              {testSending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send Test Now
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

