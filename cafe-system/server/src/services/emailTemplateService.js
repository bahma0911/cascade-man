import { config } from '../config/index.js';

/**
 * Base layout wrapper for all responsive HTML emails
 */
function wrapHtml({ title, preheader = '', content, actionUrl, actionText }) {
  const appName = config.appName;
  const currentYear = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${title}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #f1f5f9;
      margin: 0;
      padding: 0;
      color: #1e293b;
      -webkit-font-smoothing: antialiased;
      -webkit-text-size-adjust: 100%;
    }
    .wrapper {
      width: 100%;
      background-color: #f1f5f9;
      padding: 24px 12px;
      box-sizing: border-box;
    }
    .container {
      max-width: 580px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      border: 1px solid #e2e8f0;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
    }
    .header {
      background: linear-gradient(135deg, #78350f 0%, #b45309 50%, #d97706 100%);
      padding: 28px 24px;
      text-align: center;
      color: #ffffff;
    }
    .header h1 {
      margin: 0;
      font-size: 22px;
      font-weight: 800;
      letter-spacing: -0.5px;
      color: #ffffff;
    }
    .header p {
      margin: 6px 0 0;
      font-size: 12px;
      color: #fef3c7;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      font-weight: 600;
    }
    .content {
      padding: 28px 24px;
      box-sizing: border-box;
    }
    .footer {
      background-color: #f8fafc;
      padding: 20px 24px;
      text-align: center;
      font-size: 11px;
      color: #64748b;
      border-top: 1px solid #e2e8f0;
      line-height: 1.6;
    }
    .btn {
      display: inline-block;
      background-color: #d97706;
      color: #ffffff !important;
      padding: 13px 28px;
      font-size: 13px;
      font-weight: 700;
      text-decoration: none;
      border-radius: 10px;
      margin-top: 16px;
      box-shadow: 0 2px 4px rgba(217, 119, 6, 0.25);
    }
    .card {
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 16px;
      margin: 16px 0;
      box-sizing: border-box;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 800;
      border-radius: 6px;
      text-transform: uppercase;
    }
    .badge-amber { background-color: #fef3c7; color: #92400e; }
    .badge-rose { background-color: #ffe4e6; color: #9f1239; }
    .badge-emerald { background-color: #d1fae5; color: #065f46; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0;
      font-size: 12px;
    }
    th {
      text-align: left;
      padding: 9px 8px;
      background-color: #f1f5f9;
      color: #475569;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    td {
      padding: 9px 8px;
      border-bottom: 1px solid #f1f5f9;
      word-break: break-word;
    }
    .amount { font-weight: bold; color: #059669; }

    @media only screen and (max-width: 600px) {
      .wrapper {
        padding: 8px 6px !important;
      }
      .container {
        width: 100% !important;
        max-width: 100% !important;
        border-radius: 12px !important;
      }
      .header {
        padding: 22px 16px !important;
      }
      .header h1 {
        font-size: 20px !important;
      }
      .content {
        padding: 20px 16px !important;
      }
      .footer {
        padding: 16px 14px !important;
      }
      .card {
        padding: 14px 12px !important;
      }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <div style="font-size: 26px; line-height: 1; margin-bottom: 6px;">☕</div>
        <h1>${appName}</h1>
        <p>Management &amp; Inventory Operations</p>
      </div>
      <div class="content">
        ${content}
        ${
          actionUrl && actionText
            ? `<div style="text-align: center; margin: 24px 0 8px;">
                 <a href="${actionUrl}" class="btn" target="_blank">${actionText} &rarr;</a>
               </div>`
            : ''
        }
      </div>
      <div class="footer">
        <p style="margin: 0 0 4px 0; font-weight: 600; color: #475569;">&copy; ${currentYear} ${appName}. All rights reserved.</p>
        <p style="margin: 0; color: #94a3b8;">Timezone: Africa/Addis_Ababa &bull; Currency: ETB</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export const emailTemplateService = {
  /**
   * 1. Low-Stock Alert Template
   */
  getLowStockTemplate({ ingredient, timestamp = new Date() }) {
    const appName = config.appName;
    const clientUrl = config.clientUrl;
    const dateFormatted = new Intl.DateTimeFormat('en-GB', {
      timeZone: config.timezone,
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(timestamp));

    const subject = `⚠️ Low Stock Warning: ${ingredient.name} (${ingredient.currentStock} ${ingredient.baseUnit} remaining)`;

    const content = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
        <h2 style="margin: 0; font-size: 18px; color: #92400e;">Low Inventory Alert</h2>
        <span class="badge badge-amber">Action Recommended</span>
      </div>
      <p style="font-size: 13px; color: #475569; line-height: 1.5;">
        The stock level for <strong>${ingredient.name}</strong> has fallen at or below its configured safety threshold.
      </p>

      <div class="card">
        <table>
          <tr>
            <td><strong>Ingredient</strong></td>
            <td><strong>${ingredient.name}</strong></td>
          </tr>
          <tr>
            <td>Current Available Stock</td>
            <td style="color: #d97706; font-weight: bold;">${ingredient.currentStock} ${ingredient.baseUnit}</td>
          </tr>
          <tr>
            <td>Minimum Safety Threshold</td>
            <td>${ingredient.lowStockThreshold} ${ingredient.baseUnit}</td>
          </tr>
          <tr>
            <td>Deficit to Recover</td>
            <td>${Math.max(0, ingredient.lowStockThreshold - ingredient.currentStock)} ${ingredient.baseUnit}</td>
          </tr>
          <tr>
            <td>Timestamp</td>
            <td>${dateFormatted} (Addis Ababa)</td>
          </tr>
        </table>
      </div>
      <p style="font-size: 12px; color: #64748b;">
        Please arrange a supplier delivery to avoid kitchen service interruptions.
      </p>
    `;

    const text = `LOW STOCK ALERT: ${ingredient.name}\n` +
      `Current Stock: ${ingredient.currentStock} ${ingredient.baseUnit}\n` +
      `Threshold: ${ingredient.lowStockThreshold} ${ingredient.baseUnit}\n` +
      `Time: ${dateFormatted}\n\n` +
      `Log delivery at: ${clientUrl}/inventory`;

    return {
      subject,
      html: wrapHtml({
        title: subject,
        content,
        actionUrl: `${clientUrl}/inventory`,
        actionText: 'Open Inventory Tools',
      }),
      text,
    };
  },

  /**
   * 2. Critical Stock Alert Template (0 or negative)
   */
  getCriticalStockTemplate({ ingredient, timestamp = new Date() }) {
    const clientUrl = config.clientUrl;
    const dateFormatted = new Intl.DateTimeFormat('en-GB', {
      timeZone: config.timezone,
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(timestamp));

    const deficit = Math.max(0, ingredient.lowStockThreshold - ingredient.currentStock);
    const subject = `🚨 CRITICAL STOCK ALERT: ${ingredient.name} is DEPLETED (${ingredient.currentStock} ${ingredient.baseUnit})`;

    const content = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
        <h2 style="margin: 0; font-size: 18px; color: #9f1239;">Critical Stock Depletion</h2>
        <span class="badge badge-rose">Urgent Action Required</span>
      </div>
      <p style="font-size: 13px; color: #475569; line-height: 1.5;">
        The stock level for <strong>${ingredient.name}</strong> has reached <strong>${ingredient.currentStock} ${ingredient.baseUnit}</strong> (Zero or Negative Stock).
      </p>

      <div class="card" style="border-left: 4px solid #e11d48;">
        <table>
          <tr>
            <td><strong>Ingredient</strong></td>
            <td><strong style="color: #9f1239;">${ingredient.name}</strong></td>
          </tr>
          <tr>
            <td>Current Stock</td>
            <td style="color: #e11d48; font-weight: 800;">${ingredient.currentStock} ${ingredient.baseUnit}</td>
          </tr>
          <tr>
            <td>Required to Reach Threshold</td>
            <td style="font-weight: bold;">+${deficit} ${ingredient.baseUnit}</td>
          </tr>
          <tr>
            <td>Detected At</td>
            <td>${dateFormatted} (Addis Ababa)</td>
          </tr>
        </table>
      </div>
      <p style="font-size: 12px; color: #64748b;">
        Menu items relying on this ingredient cannot be prepared. Please record a delivery immediately.
      </p>
    `;

    const text = `CRITICAL STOCK ALERT: ${ingredient.name} IS DEPLETED!\n` +
      `Current Stock: ${ingredient.currentStock} ${ingredient.baseUnit}\n` +
      `Required to Recover: +${deficit} ${ingredient.baseUnit}\n` +
      `Time: ${dateFormatted}\n\n` +
      `Record delivery now: ${clientUrl}/inventory`;

    return {
      subject,
      html: wrapHtml({
        title: subject,
        content,
        actionUrl: `${clientUrl}/inventory`,
        actionText: 'Record Immediate Delivery',
      }),
      text,
    };
  },

  /**
   * 3. Daily Business Summary Template
   */
  getDailyReportTemplate({ dateStr, cards, metrics, topItems = [], lowStockCount = 0 }) {
    const clientUrl = config.clientUrl;
    const subject = `📊 Daily Business Summary - ${dateStr} (${cards.grossSalesRevenue.toLocaleString()} ETB Revenue)`;

    const content = `
      <h2 style="margin: 0 0 16px; font-size: 18px; color: #1e293b;">Daily Operations Summary: ${dateStr}</h2>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px;">
        <div class="card" style="margin: 0;">
          <div style="font-size: 11px; color: #64748b; font-weight: bold; text-transform: uppercase;">Gross Sales Revenue</div>
          <div style="font-size: 20px; font-weight: 900; color: #059669; margin-top: 4px;">
            ${cards.grossSalesRevenue.toLocaleString()} ETB
          </div>
        </div>
        <div class="card" style="margin: 0;">
          <div style="font-size: 11px; color: #64748b; font-weight: bold; text-transform: uppercase;">Estimated Net Profit</div>
          <div style="font-size: 20px; font-weight: 900; color: ${cards.estimatedNetProfit >= 0 ? '#059669' : '#dc2626'}; margin-top: 4px;">
            ${cards.estimatedNetProfit.toLocaleString()} ETB
          </div>
        </div>
      </div>

      <div class="card">
        <table>
          <tr><td>Total Tickets Processed</td><td style="font-weight: bold;">${cards.totalOrders} (${cards.completedOrders} completed, ${cards.cancelledOrders} cancelled)</td></tr>
          <tr><td>Total Items Sold</td><td style="font-weight: bold;">${cards.totalItemsSold} dishes</td></tr>
          <tr><td>Average Order Value (AOV)</td><td>${metrics.averageOrderValue} ETB</td></tr>
          <tr><td>Cost of Ingredients Sold</td><td style="color: #dc2626;">-${cards.estimatedIngredientCosts.toLocaleString()} ETB</td></tr>
          <tr><td>Gross Profit</td><td style="font-weight: bold; color: #059669;">${cards.estimatedGrossProfit.toLocaleString()} ETB</td></tr>
          <tr><td>Operating Expenses</td><td style="color: #dc2626;">-${cards.recordedOperatingExpenses.toLocaleString()} ETB</td></tr>
          <tr><td>Preparation Wastage Cost</td><td>${cards.totalPreparationWastageCost.toLocaleString()} ETB</td></tr>
          <tr><td>Recorded Spoilage / Waste</td><td>${cards.totalRecordedWasteCost.toLocaleString()} ETB</td></tr>
          <tr><td>Food Cost Percentage</td><td>${metrics.foodCostPercentage}%</td></tr>
          <tr><td>Net Profit Margin</td><td>${metrics.profitMarginPercentage}%</td></tr>
        </table>
      </div>

      ${
        topItems.length > 0
          ? `<h3 style="margin: 16px 0 8px; font-size: 14px;">Top Selling Menu Items</h3>
             <table>
               <tr><th>Dish Name</th><th>Qty Sold</th><th>Revenue</th></tr>
               ${topItems
                 .slice(0, 5)
                 .map((item) => `<tr><td>${item.name}</td><td>${item.quantitySold || item.totalQuantity}</td><td class="amount">${(item.totalRevenue || 0).toLocaleString()} ETB</td></tr>`)
                 .join('')}
             </table>`
          : ''
      }

      ${
        lowStockCount > 0
          ? `<div style="background-color: #fef2f2; border: 1px solid #fee2e2; padding: 12px; border-radius: 8px; margin-top: 12px; font-size: 12px; color: #991b1b;">
               ⚠️ <strong>${lowStockCount} ingredient(s)</strong> are currently low on stock and need restocking.
             </div>`
          : ''
      }
    `;

    const text = `DAILY BUSINESS SUMMARY: ${dateStr}\n` +
      `Gross Revenue: ${cards.grossSalesRevenue.toLocaleString()} ETB\n` +
      `Net Profit: ${cards.estimatedNetProfit.toLocaleString()} ETB\n` +
      `Total Orders: ${cards.totalOrders}\n` +
      `Ingredient Costs: ${cards.estimatedIngredientCosts.toLocaleString()} ETB\n` +
      `Expenses: ${cards.recordedOperatingExpenses.toLocaleString()} ETB\n\n` +
      `View reports at: ${clientUrl}/admin/reports`;

    return {
      subject,
      html: wrapHtml({
        title: subject,
        content,
        actionUrl: `${clientUrl}/admin/reports`,
        actionText: 'View Financial Dashboard',
      }),
      text,
    };
  },

  /**
   * 4. Weekly Business Report Template
   */
  getWeeklyReportTemplate({ dateRangeStr, currentWeek, previousWeek, topItems = [] }) {
    const clientUrl = config.clientUrl;
    const subject = `📈 Weekly Performance Report: ${dateRangeStr}`;

    const revDiff = currentWeek.revenue - (previousWeek?.revenue || 0);
    const profitDiff = currentWeek.netProfit - (previousWeek?.netProfit || 0);

    const content = `
      <h2 style="margin: 0 0 16px; font-size: 18px; color: #1e293b;">Weekly Performance Overview</h2>
      <p style="font-size: 12px; color: #64748b;">Reporting Period: ${dateRangeStr}</p>

      <div class="card">
        <table>
          <tr><th>Metric</th><th>This Week</th><th>vs Prev Week</th></tr>
          <tr>
            <td>Gross Revenue</td>
            <td style="font-weight: bold; color: #059669;">${currentWeek.revenue.toLocaleString()} ETB</td>
            <td style="font-weight: bold; color: ${revDiff >= 0 ? '#059669' : '#dc2626'};">
              ${revDiff >= 0 ? `+${revDiff.toLocaleString()}` : revDiff.toLocaleString()} ETB
            </td>
          </tr>
          <tr>
            <td>Net Profit</td>
            <td style="font-weight: bold; color: ${currentWeek.netProfit >= 0 ? '#059669' : '#dc2626'};">${currentWeek.netProfit.toLocaleString()} ETB</td>
            <td style="font-weight: bold; color: ${profitDiff >= 0 ? '#059669' : '#dc2626'};">
              ${profitDiff >= 0 ? `+${profitDiff.toLocaleString()}` : profitDiff.toLocaleString()} ETB
            </td>
          </tr>
          <tr>
            <td>Total Orders</td>
            <td>${currentWeek.totalOrders}</td>
            <td>${currentWeek.totalOrders - (previousWeek?.totalOrders || 0)}</td>
          </tr>
          <tr>
            <td>Ingredient Costs</td>
            <td>${currentWeek.ingredientCost.toLocaleString()} ETB</td>
            <td>—</td>
          </tr>
          <tr>
            <td>Wastage Costs</td>
            <td>${currentWeek.wasteCost.toLocaleString()} ETB</td>
            <td>—</td>
          </tr>
        </table>
      </div>

      ${
        topItems.length > 0
          ? `<h3 style="margin: 16px 0 8px; font-size: 14px;">Top Performing Dishes</h3>
             <table>
               <tr><th>Dish Name</th><th>Quantity</th><th>Revenue</th></tr>
               ${topItems
                 .slice(0, 5)
                 .map((item) => `<tr><td>${item.name}</td><td>${item.quantitySold || item.totalQuantity}</td><td class="amount">${(item.totalRevenue || 0).toLocaleString()} ETB</td></tr>`)
                 .join('')}
             </table>`
          : ''
      }
    `;

    const text = `WEEKLY PERFORMANCE REPORT: ${dateRangeStr}\n` +
      `Gross Revenue: ${currentWeek.revenue.toLocaleString()} ETB\n` +
      `Net Profit: ${currentWeek.netProfit.toLocaleString()} ETB\n` +
      `Total Orders: ${currentWeek.totalOrders}\n\n` +
      `View complete analytics at: ${clientUrl}/admin/reports`;

    return {
      subject,
      html: wrapHtml({
        title: subject,
        content,
        actionUrl: `${clientUrl}/admin/reports`,
        actionText: 'Open Business Analytics',
      }),
      text,
    };
  },

  /**
   * 5. Monthly Business Report Template
   */
  getMonthlyReportTemplate({ monthStr, currentMonth, previousMonth, topItems = [], leastItems = [] }) {
    const clientUrl = config.clientUrl;
    const subject = `📑 Monthly Business Review - ${monthStr}`;

    const content = `
      <h2 style="margin: 0 0 16px; font-size: 18px; color: #1e293b;">Executive Monthly Review: ${monthStr}</h2>

      <div class="card">
        <table>
          <tr><th>Financial Headline</th><th>Amount (ETB)</th></tr>
          <tr><td>Total Gross Sales Revenue</td><td style="font-weight: 800; color: #059669;">${currentMonth.revenue.toLocaleString()} ETB</td></tr>
          <tr><td>Cost of Ingredients Sold</td><td style="color: #dc2626;">-${currentMonth.ingredientCost.toLocaleString()} ETB</td></tr>
          <tr><td>Gross Profit</td><td style="font-weight: bold;">${currentMonth.grossProfit.toLocaleString()} ETB</td></tr>
          <tr><td>Operating Expenses</td><td style="color: #dc2626;">-${currentMonth.operatingExpenses.toLocaleString()} ETB</td></tr>
          <tr><td><strong>Estimated Net Profit</strong></td><td style="font-weight: 900; font-size: 14px; color: ${currentMonth.netProfit >= 0 ? '#059669' : '#dc2626'};">${currentMonth.netProfit.toLocaleString()} ETB</td></tr>
          <tr><td>Profit Margin</td><td>${currentMonth.profitMargin}%</td></tr>
          <tr><td>Food Cost Percentage</td><td>${currentMonth.foodCostPercentage}%</td></tr>
          <tr><td>Total Tickets Closed</td><td>${currentMonth.totalOrders}</td></tr>
        </table>
      </div>

      <div style="margin-top: 16px;">
        <h3 style="font-size: 13px; margin: 0 0 8px;">Best Performing Dishes</h3>
        <table>
          <tr><th>Dish Name</th><th>Units Sold</th><th>Revenue</th></tr>
          ${topItems
            .slice(0, 3)
            .map((item) => `<tr><td>${item.name}</td><td>${item.quantitySold || item.totalQuantity}</td><td class="amount">${(item.totalRevenue || 0).toLocaleString()} ETB</td></tr>`)
            .join('')}
        </table>
      </div>
    `;

    const text = `MONTHLY BUSINESS REVIEW: ${monthStr}\n` +
      `Gross Revenue: ${currentMonth.revenue.toLocaleString()} ETB\n` +
      `Net Profit: ${currentMonth.netProfit.toLocaleString()} ETB\n` +
      `Profit Margin: ${currentMonth.profitMargin}%\n` +
      `Food Cost %: ${currentMonth.foodCostPercentage}%\n\n` +
      `View full reports at: ${clientUrl}/admin/reports`;

    return {
      subject,
      html: wrapHtml({
        title: subject,
        content,
        actionUrl: `${clientUrl}/admin/reports`,
        actionText: 'Review Full Monthly P&L',
      }),
      text,
    };
  },

  /**
   * 6. Excessive Preparation Wastage Alert Template (Section 13 / 15.C.6)
   */
  getExcessiveWastageTemplate({ ingredient, expectedWastage, actualWastage, difference, percentageExcess, employeeName = 'Kitchen Station', timestamp = new Date() }) {
    const clientUrl = config.clientUrl;
    const dateFormatted = new Intl.DateTimeFormat('en-GB', {
      timeZone: config.timezone,
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(timestamp));

    const subject = `⚠️ Excessive Prep Wastage Alert: ${ingredient.name} (+${difference} ${ingredient.baseUnit} over baseline)`;

    const content = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
        <h2 style="margin: 0; font-size: 18px; color: #9a3412;">Excessive Preparation Wastage</h2>
        <span class="badge badge-amber">+${percentageExcess}% Over Expected</span>
      </div>
      <p style="font-size: 13px; color: #475569; line-height: 1.5;">
        Preparation wastage recorded for <strong>${ingredient.name}</strong> has significantly exceeded the configured baseline model.
      </p>

      <div class="card" style="border-left: 4px solid #ea580c;">
        <table>
          <tr><td><strong>Ingredient</strong></td><td><strong>${ingredient.name}</strong></td></tr>
          <tr><td>Expected Preparation Trim</td><td>${expectedWastage} ${ingredient.baseUnit}</td></tr>
          <tr><td>Actual Recorded Wastage</td><td style="color: #ea580c; font-weight: bold;">${actualWastage} ${ingredient.baseUnit}</td></tr>
          <tr><td>Variance Discrepancy</td><td style="color: #dc2626; font-weight: 800;">+${difference} ${ingredient.baseUnit}</td></tr>
          <tr><td>Responsible Staff</td><td>${employeeName}</td></tr>
          <tr><td>Date & Time</td><td>${dateFormatted} (Addis Ababa)</td></tr>
        </table>
      </div>
      <p style="font-size: 12px; color: #64748b;">
        Review prep trim techniques at the kitchen prep station to minimize unnecessary food loss.
      </p>
    `;

    const text = `EXCESSIVE PREPARATION WASTAGE ALERT: ${ingredient.name}\n` +
      `Expected: ${expectedWastage} ${ingredient.baseUnit}\n` +
      `Actual: ${actualWastage} ${ingredient.baseUnit}\n` +
      `Discrepancy: +${difference} ${ingredient.baseUnit} (+${percentageExcess}%)\n` +
      `Staff: ${employeeName}\n` +
      `Time: ${dateFormatted}\n\n` +
      `Audit wastage logs at: ${clientUrl}/admin/reports`;

    return {
      subject,
      html: wrapHtml({
        title: subject,
        content,
        actionUrl: `${clientUrl}/admin/reports`,
        actionText: 'Audit Wastage Ledger',
      }),
      text,
    };
  },

  /**
   * 7. System Alert Template
   */
  getSystemAlertTemplate({ alertTitle, alertMessage, details = '', timestamp = new Date() }) {
    const clientUrl = config.clientUrl;
    const dateFormatted = new Intl.DateTimeFormat('en-GB', {
      timeZone: config.timezone,
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(timestamp));

    const subject = `⚠️ System Alert: ${alertTitle}`;

    const content = `
      <h2 style="margin: 0 0 12px; font-size: 18px; color: #dc2626;">System Operational Alert</h2>
      <p style="font-size: 13px; color: #1e293b; font-weight: bold;">${alertMessage}</p>

      ${
        details
          ? `<div class="card" style="font-family: monospace; font-size: 11px; color: #475569; white-space: pre-wrap;">
               ${details}
             </div>`
          : ''
      }

      <p style="font-size: 11px; color: #64748b; margin-top: 12px;">
        Timestamp: ${dateFormatted} (Addis Ababa)
      </p>
    `;

    const text = `SYSTEM ALERT: ${alertTitle}\n` +
      `${alertMessage}\n` +
      (details ? `Details: ${details}\n` : '') +
      `Time: ${dateFormatted}\n`;

    return {
      subject,
      html: wrapHtml({
        title: subject,
        content,
        actionUrl: `${clientUrl}/admin`,
        actionText: 'Open Admin Dashboard',
      }),
      text,
    };
  },

  /**
   * 8. Test Email Template
   */
  getTestEmailTemplate({ recipientEmail, recipientName = 'Administrator' }) {
    const appName = config.appName;
    const clientUrl = config.clientUrl;
    const dateFormatted = new Intl.DateTimeFormat('en-GB', {
      timeZone: config.timezone,
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date());

    const subject = `☕ Cascade Coffee - Resend Configuration Verified`;

    const content = `
      <div style="margin-bottom: 20px;">
        <div style="display: inline-block; background-color: #ecfdf5; color: #047857; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.5px; border: 1px solid #a7f3d0; margin-bottom: 10px;">
          ✓ System Online
        </div>
        <h2 style="margin: 0 0 8px; font-size: 20px; font-weight: 800; color: #0f172a; line-height: 1.3;">Email Delivery Gateway Verified</h2>
        <p style="font-size: 13px; color: #475569; line-height: 1.6; margin: 0;">
          Hello <strong>${recipientName}</strong>, this test message confirms that real-time operational notifications and automated stock alerts are fully active and connected for <strong>${appName}</strong>.
        </p>
      </div>

      <!-- Mobile-First Stacked Details Card -->
      <div class="card" style="margin: 18px 0; padding: 18px 16px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px;">
        <!-- Establishment -->
        <div style="padding-bottom: 12px; margin-bottom: 12px; border-bottom: 1px solid #edf2f7;">
          <div style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 4px;">Establishment</div>
          <div style="font-size: 14px; font-weight: 700; color: #0f172a;">${appName}</div>
        </div>

        <!-- Recipient -->
        <div style="padding-bottom: 12px; margin-bottom: 12px; border-bottom: 1px solid #edf2f7;">
          <div style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 4px;">Recipient</div>
          <div style="font-size: 14px; font-weight: 600; color: #0f172a; word-break: break-all;">${recipientEmail}</div>
        </div>

        <!-- Sender Address -->
        <div style="padding-bottom: 12px; margin-bottom: 12px; border-bottom: 1px solid #edf2f7;">
          <div style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 4px;">Sender's Address</div>
          <div style="font-size: 14px; font-weight: 600; color: #0f172a; word-break: break-all;">${config.emailFrom}</div>
        </div>

        <!-- Delivery Gateway -->
        <div style="padding-bottom: 12px; margin-bottom: 12px; border-bottom: 1px solid #edf2f7;">
          <div style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 4px;">Delivery Gateway</div>
          <div style="font-size: 14px; font-weight: 600; color: #0f172a;">Resend REST API</div>
        </div>

        <!-- Gateway Status -->
        <div style="padding-bottom: 12px; margin-bottom: 12px; border-bottom: 1px solid #edf2f7;">
          <div style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px;">Gateway Status</div>
          <div>
            <span style="display: inline-block; background-color: #d1fae5; color: #065f46; font-size: 12px; font-weight: 800; padding: 4px 12px; border-radius: 9999px; border: 1px solid #a7f3d0;">
              ● Verified &amp; Operational
            </span>
          </div>
        </div>

        <!-- System Timezone -->
        <div>
          <div style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 4px;">System Timezone</div>
          <div style="font-size: 13px; font-weight: 600; color: #475569;">${config.timezone} &bull; ${dateFormatted}</div>
        </div>
      </div>

      <div style="background-color: #fffbeb; border: 1px solid #fef3c7; border-radius: 10px; padding: 12px 14px; font-size: 12px; color: #92400e; line-height: 1.5;">
        💡 <strong>Tip:</strong> Automated email notifications for low ingredient stock, end-of-day revenue summaries, and preparation wastage variances are sent to this address.
      </div>
    `;

    const text = `TEST EMAIL: Resend Email Delivery Verified for ${appName}!\n` +
      `Establishment: ${appName}\n` +
      `Recipient: ${recipientEmail}\n` +
      `Sender: ${config.emailFrom}\n` +
      `Gateway Status: Verified & Operational\n` +
      `Timezone: ${config.timezone} (${dateFormatted})\n\n` +
      `Dashboard: ${clientUrl}/admin/notifications`;

    return {
      subject,
      html: wrapHtml({
        title: subject,
        content,
        actionUrl: `${clientUrl}/admin/notifications`,
        actionText: 'Notification Preferences',
      }),
      text,
    };
  },
};

