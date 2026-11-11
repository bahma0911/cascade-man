import { notificationService } from '../services/notificationService.js';
import { reportEmailService } from '../services/reportEmailService.js';
import { NotificationLog } from '../models/NotificationLog.js';
import { config } from '../config/index.js';

export const notificationController = {
  /**
   * GET /api/notifications/settings
   */
  async getSettings(req, res, next) {
    try {
      const settings = await notificationService.getSettings();
      res.json({
        success: true,
        data: settings,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PUT /api/notifications/settings
   */
  async updateSettings(req, res, next) {
    try {
      const updated = await notificationService.updateSettings(req.body, req.user._id);
      res.json({
        success: true,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/notifications/test-email
   */
  async sendTestEmail(req, res, next) {
    try {
      const { email, name } = req.body;
      const settings = await notificationService.getSettings();
      const targetEmail = email || settings.restaurantEmail;

      if (!targetEmail) {
        return res.status(400).json({
          success: false,
          error: 'Please provide a recipient email or configure the restaurant notification email in settings.',
        });
      }

      const result = await notificationService.sendTestEmail(
        targetEmail,
        name || req.user.name || 'Administrator'
      );

      res.json({
        success: true,
        message: `Test email dispatched to ${targetEmail}`,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/notifications/history
   */
  async getHistory(req, res, next) {
    try {
      const { status, type, page = 1, limit = 50 } = req.query;
      const query = {};

      if (status) query.status = status;
      if (type) query.notificationType = type;

      const pageNum = Math.max(1, parseInt(page, 10));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
      const skip = (pageNum - 1) * limitNum;

      const [logs, total] = await Promise.all([
        NotificationLog.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .lean(),
        NotificationLog.countDocuments(query),
      ]);

      res.json({
        success: true,
        data: {
          logs,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            totalPages: Math.ceil(total / limitNum) || 1,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/notifications/email-status
   */
  async getEmailStatus(req, res, next) {
    try {
      const isConfigured = Boolean(config.resendApiKey && config.resendApiKey !== 'mock_resend_api_key_test');
      const [totalSent, totalFailed, lastLog] = await Promise.all([
        NotificationLog.countDocuments({ status: 'sent' }),
        NotificationLog.countDocuments({ status: 'failed' }),
        NotificationLog.findOne().sort({ createdAt: -1 }).lean(),
      ]);

      res.json({
        success: true,
        data: {
          configured: isConfigured,
          senderAddress: config.emailFrom,
          appName: config.appName,
          deliveryMode: isConfigured ? 'resend_live' : 'simulation_fallback',
          stats: {
            totalSent,
            totalFailed,
            lastDeliveryAt: lastLog?.sentAt || lastLog?.createdAt || null,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/notifications/trigger-report
   */
  async triggerReport(req, res, next) {
    try {
      const { reportType = 'daily', targetDate } = req.body;
      let result;

      if (reportType === 'daily') {
        result = await reportEmailService.sendDailyReportEmail({ targetDate, isManual: true });
      } else if (reportType === 'weekly') {
        result = await reportEmailService.sendWeeklyReportEmail({ targetDate, isManual: true });
      } else if (reportType === 'monthly') {
        result = await reportEmailService.sendMonthlyReportEmail({ targetDate, isManual: true });
      } else {
        return res.status(400).json({
          success: false,
          error: `Unknown reportType "${reportType}". Allowed values: daily, weekly, monthly.`,
        });
      }

      res.json({
        success: true,
        message: `${reportType.toUpperCase()} report email triggered successfully.`,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },
};

