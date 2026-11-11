import mongoose from 'mongoose';

const notificationLogSchema = new mongoose.Schema(
  {
    recipient: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    notificationType: {
      type: String,
      enum: [
        'low_stock',
        'critical_stock',
        'daily_report',
        'weekly_report',
        'monthly_report',
        'excessive_wastage',
        'system_alert',
        'test',
        'test_email',
      ],
      required: true,
      index: true,
    },
    subject: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'sent', 'failed'],
      default: 'pending',
      index: true,
    },
    attemptCount: {
      type: Number,
      default: 1,
    },
    error: {
      type: String,
      default: null,
    },
    resendId: {
      type: String,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    sentAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

notificationLogSchema.index({ createdAt: -1 });
notificationLogSchema.index({ notificationType: 1, createdAt: -1 });
notificationLogSchema.index({ status: 1, createdAt: -1 });

export const NotificationLog = mongoose.model('NotificationLog', notificationLogSchema);

