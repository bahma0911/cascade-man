import mongoose from 'mongoose';

const recipientSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    name: {
      type: String,
      trim: true,
      default: '',
    },
    role: {
      type: String,
      trim: true,
      default: 'admin',
    },
    alertTypes: {
      type: [String],
      default: [
        'low_stock',
        'critical_stock',
        'daily_report',
        'weekly_report',
        'monthly_report',
        'excessive_wastage',
        'system_alert',
      ],
    },
  },
  { _id: false }
);

const notificationSettingsSchema = new mongoose.Schema(
  {
    restaurantEmail: {
      type: String,
      trim: true,
      default: 'admin@cascade.com',
    },
    recipients: {
      type: [recipientSchema],
      default: [
        {
          email: 'admin@cascade.com',
          name: 'Restaurant Owner',
          role: 'admin',
          alertTypes: [
            'low_stock',
            'critical_stock',
            'daily_report',
            'weekly_report',
            'monthly_report',
            'excessive_wastage',
            'system_alert',
          ],
        },
      ],
    },
    enabledTypes: {
      lowStock: { type: Boolean, default: true },
      criticalStock: { type: Boolean, default: true },
      dailyReport: { type: Boolean, default: true },
      weeklyReport: { type: Boolean, default: true },
      monthlyReport: { type: Boolean, default: true },
      excessiveWastage: { type: Boolean, default: true },
      systemAlerts: { type: Boolean, default: true },
    },
    dailyReportTime: {
      type: String,
      default: '08:00', // Africa/Addis_Ababa local time
    },
    excessiveWastageThreshold: {
      type: Number,
      default: 15, // 15% discrepancy
      min: 1,
      max: 100,
    },
    lastDailyReportSentAt: {
      type: Date,
      default: null,
    },
    lastWeeklyReportSentAt: {
      type: Date,
      default: null,
    },
    lastMonthlyReportSentAt: {
      type: Date,
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export const NotificationSettings = mongoose.model(
  'NotificationSettings',
  notificationSettingsSchema
);

