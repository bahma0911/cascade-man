import { reportService } from './reportService.js';
import { emailService } from './emailService.js';
import { emailTemplateService } from './emailTemplateService.js';
import { notificationService } from './notificationService.js';
import { NotificationSettings } from '../models/NotificationSettings.js';
import { config } from '../config/index.js';

/**
 * Returns ISO strings for the start and end of a given day in Africa/Addis_Ababa (UTC+3)
 */
function getDayBoundsAddis(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timezone || 'Africa/Addis_Ababa',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.format(date); // YYYY-MM-DD
  const [year, month, day] = parts.split('-');

  // Africa/Addis_Ababa is UTC+3 (no DST)
  const start = new Date(`${year}-${month}-${day}T00:00:00.000+03:00`);
  const end = new Date(`${year}-${month}-${day}T23:59:59.999+03:00`);

  return {
    dateStr: `${day}/${month}/${year}`,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    yearMonthDay: parts,
  };
}

export const reportEmailService = {
  /**
   * 1. Send Daily Business Summary Report
   */
  async sendDailyReportEmail({ targetDate = null, isManual = false } = {}) {
    const settings = await notificationService.getSettings();
    if (!isManual && settings.enabledTypes?.dailyReport === false) {
      return { skipped: true, reason: 'Daily report disabled in settings' };
    }

    const recipients = await notificationService.getRecipientsForType('daily_report');
    if (recipients.length === 0) {
      return { skipped: true, reason: 'No recipients configured for daily report' };
    }

    // Default to yesterday if not specified
    const refDate = targetDate ? new Date(targetDate) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const { dateStr, startDate, endDate, yearMonthDay } = getDayBoundsAddis(refDate);

    // Fetch metrics from reportService
    const [summary, topItems, lowStockList] = await Promise.all([
      reportService.getDashboardSummary({ period: 'day', startDate, endDate }),
      reportService.getTopSellingItems({ limit: 5, startDate, endDate }),
      reportService.getLowStockList(),
    ]);

    const template = emailTemplateService.getDailyReportTemplate({
      dateStr,
      cards: summary.cards,
      metrics: summary.metrics,
      topItems,
      lowStockCount: lowStockList.length,
    });

    const result = await emailService.sendEmail({
      to: recipients,
      subject: template.subject,
      html: template.html,
      text: template.text,
      notificationType: 'daily_report',
      metadata: { targetDate: yearMonthDay, totalOrders: summary.cards.totalOrders },
    });

    // Update settings timestamp
    await NotificationSettings.updateOne({}, { $set: { lastDailyReportSentAt: new Date() } });

    return {
      success: true,
      recipients,
      dateStr,
      result,
    };
  },

  /**
   * 2. Send Weekly Business Performance Report
   */
  async sendWeeklyReportEmail({ targetDate = null, isManual = false } = {}) {
    const settings = await notificationService.getSettings();
    if (!isManual && settings.enabledTypes?.weeklyReport === false) {
      return { skipped: true, reason: 'Weekly report disabled in settings' };
    }

    const recipients = await notificationService.getRecipientsForType('weekly_report');
    if (recipients.length === 0) {
      return { skipped: true, reason: 'No recipients configured for weekly report' };
    }

    const endMs = targetDate ? new Date(targetDate).getTime() : Date.now();
    const startMs = endMs - 7 * 24 * 60 * 60 * 1000;
    const prevStartMs = startMs - 7 * 24 * 60 * 60 * 1000;

    const startDate = new Date(startMs).toISOString();
    const endDate = new Date(endMs).toISOString();
    const prevStartDate = new Date(prevStartMs).toISOString();
    const prevEndDate = new Date(startMs).toISOString();

    const [currentSummary, prevSummary, topItems] = await Promise.all([
      reportService.getDashboardSummary({ period: 'week', startDate, endDate }),
      reportService.getDashboardSummary({ period: 'week', startDate: prevStartDate, endDate: prevEndDate }),
      reportService.getTopSellingItems({ limit: 5, startDate, endDate }),
    ]);

    const dateRangeStr = `${new Date(startDate).toLocaleDateString('en-GB')} – ${new Date(endDate).toLocaleDateString('en-GB')}`;

    const currentWeek = {
      revenue: currentSummary.cards.grossSalesRevenue,
      netProfit: currentSummary.cards.estimatedNetProfit,
      totalOrders: currentSummary.cards.totalOrders,
      ingredientCost: currentSummary.cards.estimatedIngredientCosts,
      wasteCost: currentSummary.cards.totalRecordedWasteCost,
    };

    const previousWeek = {
      revenue: prevSummary.cards.grossSalesRevenue,
      netProfit: prevSummary.cards.estimatedNetProfit,
      totalOrders: prevSummary.cards.totalOrders,
      ingredientCost: prevSummary.cards.estimatedIngredientCosts,
      wasteCost: prevSummary.cards.totalRecordedWasteCost,
    };

    const template = emailTemplateService.getWeeklyReportTemplate({
      dateRangeStr,
      currentWeek,
      previousWeek,
      topItems,
    });

    const result = await emailService.sendEmail({
      to: recipients,
      subject: template.subject,
      html: template.html,
      text: template.text,
      notificationType: 'weekly_report',
      metadata: { dateRangeStr },
    });

    await NotificationSettings.updateOne({}, { $set: { lastWeeklyReportSentAt: new Date() } });

    return {
      success: true,
      recipients,
      dateRangeStr,
      result,
    };
  },

  /**
   * 3. Send Monthly Business Review Report
   */
  async sendMonthlyReportEmail({ targetDate = null, isManual = false } = {}) {
    const settings = await notificationService.getSettings();
    if (!isManual && settings.enabledTypes?.monthlyReport === false) {
      return { skipped: true, reason: 'Monthly report disabled in settings' };
    }

    const recipients = await notificationService.getRecipientsForType('monthly_report');
    if (recipients.length === 0) {
      return { skipped: true, reason: 'No recipients configured for monthly report' };
    }

    const ref = targetDate ? new Date(targetDate) : new Date();
    // Default to last full calendar month or last 30 days
    const endMs = ref.getTime();
    const startMs = endMs - 30 * 24 * 60 * 60 * 1000;
    const prevStartMs = startMs - 30 * 24 * 60 * 60 * 1000;

    const startDate = new Date(startMs).toISOString();
    const endDate = new Date(endMs).toISOString();
    const prevStartDate = new Date(prevStartMs).toISOString();
    const prevEndDate = new Date(startMs).toISOString();

    const [currentSummary, prevSummary, orderReports] = await Promise.all([
      reportService.getDashboardSummary({ period: 'month', startDate, endDate }),
      reportService.getDashboardSummary({ period: 'month', startDate: prevStartDate, endDate: prevEndDate }),
      reportService.getOrderReports({ startDate, endDate }),
    ]);

    const monthStr = new Intl.DateTimeFormat('en-GB', {
      month: 'long',
      year: 'numeric',
      timeZone: config.timezone || 'Africa/Addis_Ababa',
    }).format(new Date(startMs));

    const currentMonth = {
      revenue: currentSummary.cards.grossSalesRevenue,
      ingredientCost: currentSummary.cards.estimatedIngredientCosts,
      grossProfit: currentSummary.cards.estimatedGrossProfit,
      operatingExpenses: currentSummary.cards.recordedOperatingExpenses,
      netProfit: currentSummary.cards.estimatedNetProfit,
      profitMargin: currentSummary.metrics.profitMarginPercentage,
      foodCostPercentage: currentSummary.metrics.foodCostPercentage,
    };

    const previousMonth = {
      revenue: prevSummary.cards.grossSalesRevenue,
      netProfit: prevSummary.cards.estimatedNetProfit,
    };

    const template = emailTemplateService.getMonthlyReportTemplate({
      monthStr,
      currentMonth,
      previousMonth,
      topItems: orderReports.mostPopularItems || [],
      leastItems: orderReports.leastPopularItems || [],
    });

    const result = await emailService.sendEmail({
      to: recipients,
      subject: template.subject,
      html: template.html,
      text: template.text,
      notificationType: 'monthly_report',
      metadata: { monthStr },
    });

    await NotificationSettings.updateOne({}, { $set: { lastMonthlyReportSentAt: new Date() } });

    return {
      success: true,
      recipients,
      monthStr,
      result,
    };
  },

  /**
   * 4. Scheduled Runner
   * Checks every 60 seconds if scheduled daily, weekly (Monday), or monthly (1st) reports are due
   */
  startScheduledJob() {
    let timer = null;

    const wasSentToday = (timestamp, dateFormatter, currentDateStr) =>
      Boolean(timestamp && dateFormatter.format(new Date(timestamp)) === currentDateStr);

    const checkAndRun = async () => {
      try {
        const settings = await notificationService.getSettings();
        if (!settings || !settings.dailyReportTime) return;

        const tz = config.timezone || 'Africa/Addis_Ababa';
        const now = new Date();
        const currentTimeStr = new Intl.DateTimeFormat('en-GB', {
          timeZone: tz,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(now);

        if (currentTimeStr !== settings.dailyReportTime) return;

        const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: tz });
        const currentDateStr = dateFormatter.format(now); // YYYY-MM-DD
        const weekday = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(now);
        const dayOfMonth = Number(currentDateStr.split('-')[2]);

        // 1. Daily Report
        if (settings.enabledTypes?.dailyReport && !wasSentToday(settings.lastDailyReportSentAt, dateFormatter, currentDateStr)) {
          console.log(`[ScheduledReports] Triggering Daily Business Summary for ${currentDateStr}...`);
          await reportEmailService.sendDailyReportEmail();
        }

        // 2. Weekly Report (every Monday)
        if (
          weekday === 'Mon' &&
          settings.enabledTypes?.weeklyReport &&
          !wasSentToday(settings.lastWeeklyReportSentAt, dateFormatter, currentDateStr)
        ) {
          console.log(`[ScheduledReports] Triggering Weekly Performance Report for ${currentDateStr}...`);
          await reportEmailService.sendWeeklyReportEmail();
        }

        // 3. Monthly Report (1st day of the month)
        if (
          dayOfMonth === 1 &&
          settings.enabledTypes?.monthlyReport &&
          !wasSentToday(settings.lastMonthlyReportSentAt, dateFormatter, currentDateStr)
        ) {
          console.log(`[ScheduledReports] Triggering Monthly Business Review for ${currentDateStr}...`);
          await reportEmailService.sendMonthlyReportEmail();
        }
      } catch (err) {
        console.error('[ScheduledReports] Error during scheduled check:', err.message);
      }
    };

    timer = setInterval(checkAndRun, 60000);
    // Return cleanup handle
    return () => clearInterval(timer);
  },
};

