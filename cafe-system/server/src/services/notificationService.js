import { NotificationSettings } from '../models/NotificationSettings.js';
import { Ingredient } from '../models/Ingredient.js';
import { emailService } from './emailService.js';
import { emailTemplateService } from './emailTemplateService.js';

export const notificationService = {
  /**
   * Retrieves singleton NotificationSettings document, creating defaults if not yet present.
   */
  async getSettings() {
    let settings = await NotificationSettings.findOne();
    if (!settings) {
      settings = await NotificationSettings.create({});
    }
    return settings;
  },

  /**
   * Updates notification preferences and recipient list
   */
  async updateSettings(data, userId) {
    let settings = await this.getSettings();

    if (data.restaurantEmail !== undefined) settings.restaurantEmail = data.restaurantEmail;
    if (data.recipients !== undefined) settings.recipients = data.recipients;
    if (data.enabledTypes !== undefined) {
      settings.enabledTypes = { ...settings.enabledTypes, ...data.enabledTypes };
    }
    if (data.dailyReportTime !== undefined) settings.dailyReportTime = data.dailyReportTime;
    if (data.excessiveWastageThreshold !== undefined) {
      settings.excessiveWastageThreshold = Number(data.excessiveWastageThreshold);
    }
    if (userId) settings.updatedBy = userId;

    await settings.save();
    return settings;
  },

  /**
   * Helper to retrieve list of recipient email addresses configured for a specific alert type
   */
  async getRecipientsForType(alertType) {
    const settings = await this.getSettings();

    // Check if the overall alert type is enabled in preferences
    const typeMapping = {
      low_stock: settings.enabledTypes?.lowStock,
      critical_stock: settings.enabledTypes?.criticalStock,
      daily_report: settings.enabledTypes?.dailyReport,
      weekly_report: settings.enabledTypes?.weeklyReport,
      monthly_report: settings.enabledTypes?.monthlyReport,
      excessive_wastage: settings.enabledTypes?.excessiveWastage,
      system_alert: settings.enabledTypes?.systemAlerts,
      test: true,
    };

    if (typeMapping[alertType] === false) {
      return [];
    }

    const eligible = [];
    for (const r of settings.recipients || []) {
      if (r.email && (!r.alertTypes || r.alertTypes.includes(alertType))) {
        eligible.push(r.email);
      }
    }

    // Fallback to restaurant email if no specific recipients configured
    if (eligible.length === 0 && settings.restaurantEmail) {
      eligible.push(settings.restaurantEmail);
    }

    return [...new Set(eligible)];
  },

  /**
   * 1. Low-Stock Alert with De-duplication (Section 15.C.1)
   */
  async notifyLowStock(ingredient) {
    if (!ingredient) return;

    // De-duplication rule: Only send once per continuous low-stock condition
    if (ingredient.isLowStockAlertActive) {
      return;
    }

    const recipients = await this.getRecipientsForType('low_stock');
    if (recipients.length === 0) return;

    // Flag as active immediately to prevent concurrent duplicate sends
    await Ingredient.findByIdAndUpdate(ingredient._id, {
      isLowStockAlertActive: true,
      lastAlertSentAt: new Date(),
    });

    const template = emailTemplateService.getLowStockTemplate({ ingredient });

    // Send asynchronously without blocking order or inventory transactions
    setImmediate(async () => {
      try {
        await emailService.sendEmail({
          to: recipients,
          subject: template.subject,
          html: template.html,
          text: template.text,
          notificationType: 'low_stock',
          metadata: { ingredientId: ingredient._id, currentStock: ingredient.currentStock },
        });
      } catch (err) {
        console.error('[NotificationService] Failed to dispatch low-stock email:', err.message);
      }
    });
  },

  /**
   * 2. Critical Stock Alert (<= 0 Stock) (Section 15.C.2)
   */
  async notifyCriticalStock(ingredient) {
    if (!ingredient) return;

    if (ingredient.isCriticalStockAlertActive) {
      return;
    }

    const recipients = await this.getRecipientsForType('critical_stock');
    if (recipients.length === 0) return;

    await Ingredient.findByIdAndUpdate(ingredient._id, {
      isCriticalStockAlertActive: true,
      lastAlertSentAt: new Date(),
    });

    const template = emailTemplateService.getCriticalStockTemplate({ ingredient });

    setImmediate(async () => {
      try {
        await emailService.sendEmail({
          to: recipients,
          subject: template.subject,
          html: template.html,
          text: template.text,
          notificationType: 'critical_stock',
          metadata: { ingredientId: ingredient._id, currentStock: ingredient.currentStock },
        });
      } catch (err) {
        console.error('[NotificationService] Failed to dispatch critical-stock email:', err.message);
      }
    });
  },

  /**
   * Reset alert flags when ingredient stock recovers above threshold
   */
  async resetAlertFlagsOnRestock(ingredientId, newStock, threshold) {
    if (newStock > threshold) {
      await Ingredient.findByIdAndUpdate(ingredientId, {
        isLowStockAlertActive: false,
        isCriticalStockAlertActive: false,
      });
    } else if (newStock > 0) {
      // Recovered above 0, reset critical alert only
      await Ingredient.findByIdAndUpdate(ingredientId, {
        isCriticalStockAlertActive: false,
      });
    }
  },

  /**
   * 3. Excessive Preparation Wastage Alert (Section 13 / 15.C.6)
   */
  async notifyExcessiveWastage({ ingredient, expectedWastage, actualWastage, employeeName = 'Kitchen Station' }) {
    if (!ingredient || expectedWastage <= 0) return;

    const diff = Number((actualWastage - expectedWastage).toFixed(2));
    if (diff <= 0) return;

    const settings = await this.getSettings();
    const thresholdPct = settings.excessiveWastageThreshold || 15;
    const excessPct = Number(((diff / expectedWastage) * 100).toFixed(1));

    if (excessPct < thresholdPct) {
      return; // Below threshold for triggering alert
    }

    const recipients = await this.getRecipientsForType('excessive_wastage');
    if (recipients.length === 0) return;

    const template = emailTemplateService.getExcessiveWastageTemplate({
      ingredient,
      expectedWastage,
      actualWastage,
      difference: diff,
      percentageExcess: excessPct,
      employeeName,
    });

    setImmediate(async () => {
      try {
        await emailService.sendEmail({
          to: recipients,
          subject: template.subject,
          html: template.html,
          text: template.text,
          notificationType: 'excessive_wastage',
          metadata: {
            ingredientId: ingredient._id,
            difference: diff,
            percentageExcess: excessPct,
          },
        });
      } catch (err) {
        console.error('[NotificationService] Failed to dispatch excessive wastage email:', err.message);
      }
    });
  },

  /**
   * 4. System Operational Alert (Section 15.C.7)
   */
  async notifySystemAlert({ alertTitle, alertMessage, details = '' }) {
    const recipients = await this.getRecipientsForType('system_alert');
    if (recipients.length === 0) return;

    const template = emailTemplateService.getSystemAlertTemplate({
      alertTitle,
      alertMessage,
      details,
    });

    setImmediate(async () => {
      try {
        await emailService.sendEmail({
          to: recipients,
          subject: template.subject,
          html: template.html,
          text: template.text,
          notificationType: 'system_alert',
          metadata: { alertTitle },
        });
      } catch (err) {
        console.error('[NotificationService] Failed to dispatch system alert email:', err.message);
      }
    });
  },

  /**
   * 5. Send Test Email (Section 15.B)
   */
  async sendTestEmail(recipientEmail, recipientName = 'Administrator') {
    const template = emailTemplateService.getTestEmailTemplate({
      recipientEmail,
      recipientName,
    });

    return await emailService.sendEmail({
      to: recipientEmail,
      subject: template.subject,
      html: template.html,
      text: template.text,
      notificationType: 'test',
      metadata: { test: true },
    });
  },
};

