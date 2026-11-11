import mongoose from 'mongoose';
import { Order } from '../models/Order.js';
import { Ingredient } from '../models/Ingredient.js';
import { MenuItem } from '../models/MenuItem.js';
import { StockMovement } from '../models/StockMovement.js';
import { Expense } from '../models/Expense.js';
import { config } from '../config/index.js';

export const reportService = {
  /**
   * Helper to format date matching in Africa/Addis_Ababa
   */
  getDateFormat(period) {
    if (period === 'month') return '%Y-%m';
    if (period === 'week') return '%Y-W%V';
    return '%Y-%m-%d';
  },

  /**
   * Section 14.A & 14.F: Comprehensive Reporting Dashboard Summary & P&L Cards
   */
  async getDashboardSummary({ period = 'day', startDate, endDate }) {
    const orderMatch = {};
    const movementMatch = {};
    const expenseMatch = {};

    if (startDate || endDate) {
      const dateFilter = {};
      if (startDate) dateFilter.$gte = new Date(startDate);
      if (endDate) dateFilter.$lte = new Date(endDate);
      orderMatch.createdAt = dateFilter;
      movementMatch.createdAt = dateFilter;
      expenseMatch.date = dateFilter;
    }

    // 1. Order metrics (Total, Completed, Cancelled, Total Items Sold, Gross Revenue)
    const orderStatsAgg = await Order.aggregate([
      { $match: orderMatch },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          completedOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'closed'] }, 1, 0] },
          },
          cancelledOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] },
          },
          openOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] },
          },
        },
      },
    ]);

    const orderStats = orderStatsAgg[0] || {
      totalOrders: 0,
      completedOrders: 0,
      cancelledOrders: 0,
      openOrders: 0,
    };

    // Gross Revenue & Items Sold: closed orders, non-cancelled items (Section 14.C formula)
    const revenueAgg = await Order.aggregate([
      { $match: { ...orderMatch, status: 'closed' } },
      { $unwind: '$items' },
      { $match: { 'items.status': { $ne: 'cancelled' } } },
      {
        $group: {
          _id: null,
          grossSalesRevenue: {
            $sum: { $multiply: ['$items.priceSnapshot', '$items.quantity'] },
          },
          totalItemsSold: { $sum: '$items.quantity' },
        },
      },
    ]);

    const grossSalesRevenue = Number((revenueAgg[0]?.grossSalesRevenue || 0).toFixed(2));
    const totalItemsSold = revenueAgg[0]?.totalItemsSold || 0;

    // 2. Ingredient Costs Sold: sale movements minus sale_reversal movements (Section 14.D/F)
    const ingredientCostAgg = await StockMovement.aggregate([
      { $match: { ...movementMatch, type: { $in: ['sale', 'sale_reversal'] } } },
      { $unwind: '$lines' },
      {
        $lookup: {
          from: 'ingredients',
          localField: 'lines.ingredient',
          foreignField: '_id',
          as: 'ing',
        },
      },
      { $unwind: { path: '$ing', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          type: 1,
          lineCost: {
            $cond: [
              { $gt: ['$lines.totalCost', 0] },
              '$lines.totalCost',
              {
                $multiply: [
                  { $abs: '$lines.quantity' },
                  { $ifNull: ['$ing.costPerBaseUnit', 0] },
                ],
              },
            ],
          },
          prepWastageCost: {
            $multiply: [
              { $ifNull: ['$lines.expectedWastageQty', 0] },
              {
                $cond: [
                  { $gt: ['$lines.unitCost', 0] },
                  '$lines.unitCost',
                  { $ifNull: ['$ing.costPerBaseUnit', 0] },
                ],
              },
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          saleCost: {
            $sum: { $cond: [{ $eq: ['$type', 'sale'] }, '$lineCost', 0] },
          },
          reversalCost: {
            $sum: { $cond: [{ $eq: ['$type', 'sale_reversal'] }, '$lineCost', 0] },
          },
          prepWastageCost: {
            $sum: { $cond: [{ $eq: ['$type', 'sale'] }, '$prepWastageCost', 0] },
          },
        },
      },
    ]);

    const estimatedIngredientCosts = Number(
      Math.max(0, (ingredientCostAgg[0]?.saleCost || 0) - (ingredientCostAgg[0]?.reversalCost || 0)).toFixed(2)
    );
    const totalPreparationWastageCost = Number((ingredientCostAgg[0]?.prepWastageCost || 0).toFixed(2));

    // 3. Total Recorded Waste Cost (Manual & Kitchen prep waste)
    const wasteCostAgg = await StockMovement.aggregate([
      { $match: { ...movementMatch, type: 'waste' } },
      { $unwind: '$lines' },
      {
        $lookup: {
          from: 'ingredients',
          localField: 'lines.ingredient',
          foreignField: '_id',
          as: 'ing',
        },
      },
      { $unwind: { path: '$ing', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: null,
          totalWasteCost: {
            $sum: {
              $cond: [
                { $gt: ['$lines.totalCost', 0] },
                '$lines.totalCost',
                {
                  $multiply: [
                    { $abs: '$lines.quantity' },
                    { $ifNull: ['$ing.costPerBaseUnit', 0] },
                  ],
                },
              ],
            },
          },
        },
      },
    ]);

    const totalRecordedWasteCost = Number((wasteCostAgg[0]?.totalWasteCost || 0).toFixed(2));

    // 4. Operating Expenses (Section 14.G)
    const expenseAgg = await Expense.aggregate([
      { $match: expenseMatch },
      { $group: { _id: null, totalOperatingExpenses: { $sum: '$amount' } } },
    ]);
    const recordedOperatingExpenses = Number((expenseAgg[0]?.totalOperatingExpenses || 0).toFixed(2));

    // 5. Profit & Loss Formulas (Section 14.F)
    // Gross Profit = Gross Sales Revenue - Cost of Ingredients Sold
    // (Note: Prep wastage is already included in gross ingredient consumption, NOT subtracted again)
    const estimatedGrossProfit = Number((grossSalesRevenue - estimatedIngredientCosts).toFixed(2));
    // Estimated Net Profit = Gross Profit - Recorded Operating Expenses
    const estimatedNetProfit = Number((estimatedGrossProfit - recordedOperatingExpenses).toFixed(2));

    // Margins & Percentages
    const profitMarginPercentage =
      grossSalesRevenue > 0
        ? Number(((estimatedNetProfit / grossSalesRevenue) * 100).toFixed(2))
        : 0;
    const foodCostPercentage =
      grossSalesRevenue > 0
        ? Number(((estimatedIngredientCosts / grossSalesRevenue) * 100).toFixed(2))
        : 0;
    const wastageCostPercentage =
      grossSalesRevenue > 0
        ? Number(((totalRecordedWasteCost / grossSalesRevenue) * 100).toFixed(2))
        : 0;
    const averageOrderValue =
      orderStats.completedOrders > 0
        ? Number((grossSalesRevenue / orderStats.completedOrders).toFixed(2))
        : 0;
    const averageItemsPerOrder =
      orderStats.completedOrders > 0
        ? Number((totalItemsSold / orderStats.completedOrders).toFixed(1))
        : 0;

    return {
      period,
      cards: {
        totalOrders: orderStats.totalOrders,
        completedOrders: orderStats.completedOrders,
        cancelledOrders: orderStats.cancelledOrders,
        openOrders: orderStats.openOrders,
        totalItemsSold,
        grossSalesRevenue,
        estimatedIngredientCosts,
        totalPreparationWastageCost,
        totalRecordedWasteCost,
        estimatedGrossProfit,
        recordedOperatingExpenses,
        estimatedNetProfit,
      },
      metrics: {
        averageOrderValue,
        averageItemsPerOrder,
        profitMarginPercentage,
        foodCostPercentage,
        wastageCostPercentage,
      },
    };
  },

  /**
   * Section 14.B: Detailed Order Reports & Ordering Analytics
   */
  async getOrderReports({ startDate, endDate, waiterId, tableId, status }) {
    const match = {};

    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = new Date(startDate);
      if (endDate) match.createdAt.$lte = new Date(endDate);
    }

    if (status && status !== 'all') {
      match.status = status;
    }

    if (waiterId) {
      match.waiter = new mongoose.Types.ObjectId(waiterId);
    }

    if (tableId) {
      match.table = new mongoose.Types.ObjectId(tableId);
    }

    // 1. Order Volume by Status
    const [statusSummary, tableOrders, waiterOrders, hourlyOrders] = await Promise.all([
      Order.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]),
      // Orders by Dining Table
      Order.aggregate([
        { $match: match },
        {
          $lookup: {
            from: 'tables',
            localField: 'table',
            foreignField: '_id',
            as: 'tableData',
          },
        },
        { $unwind: { path: '$tableData', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: '$table',
            tableName: { $first: '$tableData.name' },
            orderCount: { $sum: 1 },
          },
        },
        { $sort: { orderCount: -1 } },
      ]),
      // Orders & Sales by Waiter
      Order.aggregate([
        { $match: match },
        {
          $lookup: {
            from: 'users',
            localField: 'waiter',
            foreignField: '_id',
            as: 'waiterData',
          },
        },
        { $unwind: { path: '$waiterData', preserveNullAndEmptyArrays: true } },
        { $unwind: { path: '$items', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: '$waiter',
            waiterName: { $first: '$waiterData.name' },
            username: { $first: '$waiterData.username' },
            orderIds: { $addToSet: '$_id' },
            revenue: {
              $sum: {
                $cond: [
                  { $and: [{ $ne: ['$status', 'cancelled'] }, { $ne: ['$items.status', 'cancelled'] }] },
                  { $multiply: ['$items.priceSnapshot', '$items.quantity'] },
                  0,
                ],
              },
            },
          },
        },
        {
          $project: {
            _id: 1,
            waiterName: 1,
            username: 1,
            orderCount: { $size: '$orderIds' },
            revenue: { $round: ['$revenue', 2] },
          },
        },
        { $sort: { revenue: -1 } },
      ]),
      // Peak Ordering Hours (group by hour 0-23 in Africa/Addis_Ababa)
      Order.aggregate([
        { $match: match },
        {
          $group: {
            _id: {
              $hour: {
                date: '$createdAt',
                timezone: config.timezone,
              },
            },
            orderCount: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            hour: '$_id',
            orderCount: 1,
            formattedHour: {
              $concat: [{ $toString: '$_id' }, ':00'],
            },
          },
        },
        { $sort: { hour: 1 } },
      ]),
    ]);

    // Popular & Least Popular Menu Items
    const dishSales = await Order.aggregate([
      { $match: { ...match, status: { $ne: 'cancelled' } } },
      { $unwind: '$items' },
      { $match: { 'items.status': { $ne: 'cancelled' } } },
      {
        $group: {
          _id: '$items.nameSnapshot',
          quantitySold: { $sum: '$items.quantity' },
          totalRevenue: { $sum: { $multiply: ['$items.priceSnapshot', '$items.quantity'] } },
        },
      },
      {
        $project: {
          _id: 0,
          name: '$_id',
          quantitySold: 1,
          totalRevenue: { $round: ['$totalRevenue', 2] },
        },
      },
      { $sort: { quantitySold: -1 } },
    ]);

    const mostPopular = dishSales.slice(0, 10);
    const leastPopular = dishSales.slice(-10).reverse();

    // Sales by Category
    const categorySales = await Order.aggregate([
      { $match: { ...match, status: { $ne: 'cancelled' } } },
      { $unwind: '$items' },
      { $match: { 'items.status': { $ne: 'cancelled' } } },
      {
        $lookup: {
          from: 'menuitems',
          let: { itemName: '$items.nameSnapshot' },
          pipeline: [{ $match: { $expr: { $eq: ['$name', '$$itemName'] } } }],
          as: 'menuInfo',
        },
      },
      {
        $group: {
          _id: { $ifNull: [{ $arrayElemAt: ['$menuInfo.category', 0] }, 'Uncategorized'] },
          quantitySold: { $sum: '$items.quantity' },
          totalRevenue: { $sum: { $multiply: ['$items.priceSnapshot', '$items.quantity'] } },
        },
      },
      {
        $project: {
          _id: 0,
          category: '$_id',
          quantitySold: 1,
          totalRevenue: { $round: ['$totalRevenue', 2] },
        },
      },
      { $sort: { totalRevenue: -1 } },
    ]);

    return {
      statusSummary,
      mostPopular,
      leastPopular,
      categorySales,
      dishSales,
      waiterOrders,
      tableOrders,
      peakHours: hourlyOrders,
    };
  },

  /**
   * Section 14.C: Revenue Reports & Trend Aggregations
   */
  async getRevenueReports({ period = 'day', startDate, endDate }) {
    const dateFormat = this.getDateFormat(period);
    const match = { status: 'closed' };

    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = new Date(startDate);
      if (endDate) match.createdAt.$lte = new Date(endDate);
    }

    const trends = await Order.aggregate([
      { $match: match },
      { $unwind: '$items' },
      { $match: { 'items.status': { $ne: 'cancelled' } } },
      {
        $group: {
          _id: {
            date: {
              $dateToString: {
                format: dateFormat,
                date: '$createdAt',
                timezone: config.timezone,
              },
            },
            orderId: '$_id',
          },
          orderTotal: { $sum: { $multiply: ['$items.priceSnapshot', '$items.quantity'] } },
        },
      },
      {
        $group: {
          _id: '$_id.date',
          ordersCount: { $sum: 1 },
          grossRevenue: { $sum: '$orderTotal' },
        },
      },
      {
        $project: {
          _id: 0,
          date: '$_id',
          ordersCount: 1,
          grossRevenue: { $round: ['$grossRevenue', 2] },
          averageTicket: {
            $round: [{ $divide: ['$grossRevenue', '$ordersCount'] }, 2],
          },
        },
      },
      { $sort: { date: 1 } },
    ]);

    const totalRevenue = Number(
      trends.reduce((acc, curr) => acc + curr.grossRevenue, 0).toFixed(2)
    );

    return {
      period,
      totalRevenue,
      trends,
    };
  },

  /**
   * Section 14.D: Ingredient Cost Reports & Recipe Costing
   */
  async getIngredientCostReports({ startDate, endDate }) {
    const match = { type: { $in: ['sale', 'sale_reversal'] } };

    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = new Date(startDate);
      if (endDate) match.createdAt.$lte = new Date(endDate);
    }

    // 1. Ingredient consumption by ingredient with total costs
    const consumptionAgg = await StockMovement.aggregate([
      { $match: match },
      { $unwind: '$lines' },
      {
        $lookup: {
          from: 'ingredients',
          localField: 'lines.ingredient',
          foreignField: '_id',
          as: 'ing',
        },
      },
      { $unwind: '$ing' },
      {
        $project: {
          type: 1,
          ingredientId: '$ing._id',
          name: '$ing.name',
          baseUnit: '$ing.baseUnit',
          costPerBaseUnit: '$ing.costPerBaseUnit',
          qty: { $abs: '$lines.quantity' },
          usableQty: '$lines.usableQty',
          cost: {
            $cond: [
              { $gt: ['$lines.totalCost', 0] },
              '$lines.totalCost',
              { $multiply: [{ $abs: '$lines.quantity' }, { $ifNull: ['$ing.costPerBaseUnit', 0] }] },
            ],
          },
        },
      },
      {
        $group: {
          _id: '$ingredientId',
          name: { $first: '$name' },
          baseUnit: { $first: '$baseUnit' },
          currentUnitCost: { $first: '$costPerBaseUnit' },
          totalGrossConsumed: {
            $sum: { $cond: [{ $eq: ['$type', 'sale'] }, '$qty', { $multiply: ['$qty', -1] }] },
          },
          totalCost: {
            $sum: { $cond: [{ $eq: ['$type', 'sale'] }, '$cost', { $multiply: ['$cost', -1] }] },
          },
        },
      },
      {
        $project: {
          _id: 0,
          ingredientId: '$_id',
          name: 1,
          baseUnit: 1,
          currentUnitCost: { $round: ['$currentUnitCost', 4] },
          totalGrossConsumed: { $round: ['$totalGrossConsumed', 2] },
          totalCost: { $round: ['$totalCost', 2] },
        },
      },
      { $sort: { totalCost: -1 } },
    ]);

    // 2. Estimated cost of preparing each active menu item based on current weighted average costs
    const menuItems = await MenuItem.find({ isActive: true })
      .populate('recipe.ingredient')
      .lean();

    const recipeCostings = menuItems.map((item) => {
      let recipeCost = 0;
      const ingredientsBreakdown = [];

      for (const r of item.recipe || []) {
        if (!r.ingredient) continue;
        const ing = r.ingredient;
        const wastageRate = ing.autoWastageEnabled ? ing.wastageRate || 0 : 0;
        const grossQty = wastageRate > 0 && wastageRate < 1
          ? r.quantity / (1 - wastageRate)
          : r.quantity;
        const unitCost = ing.costPerBaseUnit || 0;
        const cost = grossQty * unitCost;
        recipeCost += cost;

        ingredientsBreakdown.push({
          ingredientName: ing.name,
          usableQty: r.quantity,
          grossQty: Number(grossQty.toFixed(2)),
          baseUnit: ing.baseUnit,
          unitCost: Number(unitCost.toFixed(4)),
          cost: Number(cost.toFixed(2)),
        });
      }

      recipeCost = Number(recipeCost.toFixed(2));
      const margin = Number((item.price - recipeCost).toFixed(2));
      const foodCostPercent =
        item.price > 0 ? Number(((recipeCost / item.price) * 100).toFixed(1)) : 0;

      return {
        menuItemId: item._id,
        name: item.name,
        category: item.category,
        price: item.price,
        estimatedPreparationCost: recipeCost,
        grossMargin: margin,
        foodCostPercentage: foodCostPercent,
        ingredients: ingredientsBreakdown,
      };
    });

    recipeCostings.sort((a, b) => b.estimatedPreparationCost - a.estimatedPreparationCost);

    return {
      consumption: consumptionAgg,
      recipeCostings,
    };
  },

  /**
   * Section 14.E: Wastage Cost Reports
   */
  async getWastageCostReports({ startDate, endDate, ingredientId }) {
    const match = {};
    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = new Date(startDate);
      if (endDate) match.createdAt.$lte = new Date(endDate);
    }

    // 1. Manual / Recorded Waste Breakdown
    const wasteMatch = { ...match, type: 'waste' };
    if (ingredientId) {
      wasteMatch['lines.ingredient'] = new mongoose.Types.ObjectId(ingredientId);
    }

    const recordedWasteAgg = await StockMovement.aggregate([
      { $match: wasteMatch },
      { $unwind: '$lines' },
      {
        $lookup: {
          from: 'ingredients',
          localField: 'lines.ingredient',
          foreignField: '_id',
          as: 'ing',
        },
      },
      { $unwind: '$ing' },
      {
        $lookup: {
          from: 'users',
          localField: 'performedBy',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          reasonCode: 1,
          createdAt: 1,
          ingredientName: '$ing.name',
          baseUnit: '$ing.baseUnit',
          quantity: { $abs: '$lines.quantity' },
          unitCost: {
            $cond: [
              { $gt: ['$lines.unitCost', 0] },
              '$lines.unitCost',
              { $ifNull: ['$ing.costPerBaseUnit', 0] },
            ],
          },
          cost: {
            $cond: [
              { $gt: ['$lines.totalCost', 0] },
              '$lines.totalCost',
              {
                $multiply: [
                  { $abs: '$lines.quantity' },
                  { $ifNull: ['$ing.costPerBaseUnit', 0] },
                ],
              },
            ],
          },
          employee: {
            name: '$user.name',
            username: '$user.username',
            role: '$user.role',
          },
        },
      },
      {
        $group: {
          _id: '$ingredientName',
          baseUnit: { $first: '$baseUnit' },
          totalQuantityWasted: { $sum: '$quantity' },
          totalCost: { $sum: '$cost' },
          eventsCount: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          ingredientName: '$_id',
          baseUnit: 1,
          totalQuantityWasted: { $round: ['$totalQuantityWasted', 2] },
          totalCost: { $round: ['$totalCost', 2] },
          eventsCount: 1,
        },
      },
      { $sort: { totalCost: -1 } },
    ]);

    // Wastage by Employee
    const employeeWasteAgg = await StockMovement.aggregate([
      { $match: wasteMatch },
      { $unwind: '$lines' },
      {
        $lookup: {
          from: 'ingredients',
          localField: 'lines.ingredient',
          foreignField: '_id',
          as: 'ing',
        },
      },
      { $unwind: '$ing' },
      {
        $lookup: {
          from: 'users',
          localField: 'performedBy',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$performedBy',
          name: { $first: '$user.name' },
          username: { $first: '$user.username' },
          role: { $first: '$user.role' },
          totalCost: {
            $sum: {
              $cond: [
                { $gt: ['$lines.totalCost', 0] },
                '$lines.totalCost',
                { $multiply: [{ $abs: '$lines.quantity' }, { $ifNull: ['$ing.costPerBaseUnit', 0] }] },
              ],
            },
          },
          eventsCount: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          userId: '$_id',
          name: 1,
          username: 1,
          role: 1,
          totalCost: { $round: ['$totalCost', 2] },
          eventsCount: 1,
        },
      },
      { $sort: { totalCost: -1 } },
    ]);

    return {
      recordedWaste: recordedWasteAgg,
      byEmployee: employeeWasteAgg,
    };
  },

  /**
   * Section 14.F: Profit & Loss Periodic Trend Breakdown
   */
  async getProfitLossReports({ period = 'day', startDate, endDate }) {
    const dateFormat = this.getDateFormat(period);
    const dateMatch = {};

    if (startDate || endDate) {
      dateMatch.$gte = startDate ? new Date(startDate) : new Date(0);
      if (endDate) dateMatch.$lte = new Date(endDate);
    }

    const orderFilter = { status: 'closed' };
    const movementFilter = { type: { $in: ['sale', 'sale_reversal'] } };
    const expenseFilter = {};

    if (Object.keys(dateMatch).length > 0) {
      orderFilter.createdAt = dateMatch;
      movementFilter.createdAt = dateMatch;
      expenseFilter.date = dateMatch;
    }

    // Revenue grouped by period
    const revenueByPeriod = await Order.aggregate([
      { $match: orderFilter },
      { $unwind: '$items' },
      { $match: { 'items.status': { $ne: 'cancelled' } } },
      {
        $group: {
          _id: {
            $dateToString: {
              format: dateFormat,
              date: '$createdAt',
              timezone: config.timezone,
            },
          },
          revenue: { $sum: { $multiply: ['$items.priceSnapshot', '$items.quantity'] } },
        },
      },
    ]);

    // Ingredient cost grouped by period
    const costByPeriod = await StockMovement.aggregate([
      { $match: movementFilter },
      { $unwind: '$lines' },
      {
        $lookup: {
          from: 'ingredients',
          localField: 'lines.ingredient',
          foreignField: '_id',
          as: 'ing',
        },
      },
      { $unwind: { path: '$ing', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          date: {
            $dateToString: {
              format: dateFormat,
              date: '$createdAt',
              timezone: config.timezone,
            },
          },
          cost: {
            $cond: [
              { $eq: ['$type', 'sale'] },
              {
                $cond: [
                  { $gt: ['$lines.totalCost', 0] },
                  '$lines.totalCost',
                  { $multiply: [{ $abs: '$lines.quantity' }, { $ifNull: ['$ing.costPerBaseUnit', 0] }] },
                ],
              },
              {
                $multiply: [
                  -1,
                  {
                    $cond: [
                      { $gt: ['$lines.totalCost', 0] },
                      '$lines.totalCost',
                      { $multiply: [{ $abs: '$lines.quantity' }, { $ifNull: ['$ing.costPerBaseUnit', 0] }] },
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
      {
        $group: {
          _id: '$date',
          ingredientCost: { $sum: '$cost' },
        },
      },
    ]);

    // Operating expenses grouped by period
    const expensesByPeriod = await Expense.aggregate([
      { $match: expenseFilter },
      {
        $group: {
          _id: {
            $dateToString: {
              format: dateFormat,
              date: '$date',
              timezone: config.timezone,
            },
          },
          operatingExpenses: { $sum: '$amount' },
        },
      },
    ]);

    // Merge into combined timelines
    const dateMap = new Map();

    for (const r of revenueByPeriod) {
      dateMap.set(r._id, {
        date: r._id,
        revenue: Number(r.revenue.toFixed(2)),
        ingredientCost: 0,
        operatingExpenses: 0,
      });
    }

    for (const c of costByPeriod) {
      if (!dateMap.has(c._id)) {
        dateMap.set(c._id, { date: c._id, revenue: 0, ingredientCost: 0, operatingExpenses: 0 });
      }
      dateMap.get(c._id).ingredientCost = Number(c.ingredientCost.toFixed(2));
    }

    for (const e of expensesByPeriod) {
      if (!dateMap.has(e._id)) {
        dateMap.set(e._id, { date: e._id, revenue: 0, ingredientCost: 0, operatingExpenses: 0 });
      }
      dateMap.get(e._id).operatingExpenses = Number(e.operatingExpenses.toFixed(2));
    }

    const timeline = Array.from(dateMap.values())
      .map((entry) => {
        const grossProfit = Number((entry.revenue - entry.ingredientCost).toFixed(2));
        const netProfit = Number((grossProfit - entry.operatingExpenses).toFixed(2));
        return {
          ...entry,
          grossProfit,
          netProfit,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      period,
      timeline,
    };
  },

  /**
   * Compatibility methods for Phase 6 endpoints
   */
  async getSalesReport({ period = 'day', startDate, endDate }) {
    const match = { status: { $ne: 'cancelled' } };

    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = new Date(startDate);
      if (endDate) match.createdAt.$lte = new Date(endDate);
    }

    const dateFormat = this.getDateFormat(period);

    const sales = await Order.aggregate([
      { $match: match },
      { $unwind: '$items' },
      { $match: { 'items.status': { $ne: 'cancelled' } } },
      {
        $group: {
          _id: {
            date: {
              $dateToString: {
                format: dateFormat,
                date: '$createdAt',
                timezone: config.timezone,
              },
            },
            orderId: '$_id',
          },
          orderTotal: { $sum: { $multiply: ['$items.priceSnapshot', '$items.quantity'] } },
        },
      },
      {
        $group: {
          _id: '$_id.date',
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: '$orderTotal' },
        },
      },
      {
        $project: {
          _id: 0,
          date: '$_id',
          totalOrders: 1,
          totalRevenue: { $round: ['$totalRevenue', 2] },
          averageOrderValue: {
            $round: [{ $divide: ['$totalRevenue', '$totalOrders'] }, 2],
          },
        },
      },
      { $sort: { date: -1 } },
    ]);

    const summary = sales.reduce(
      (acc, curr) => ({
        totalRevenue: Number((acc.totalRevenue + curr.totalRevenue).toFixed(2)),
        totalOrders: acc.totalOrders + curr.totalOrders,
      }),
      { totalRevenue: 0, totalOrders: 0 }
    );

    return {
      period,
      summary,
      sales,
    };
  },

  async getTopSellingItems({ limit = 10, startDate, endDate }) {
    const match = { status: { $ne: 'cancelled' } };

    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = new Date(startDate);
      if (endDate) match.createdAt.$lte = new Date(endDate);
    }

    const items = await Order.aggregate([
      { $match: match },
      { $unwind: '$items' },
      { $match: { 'items.status': { $ne: 'cancelled' } } },
      {
        $group: {
          _id: '$items.nameSnapshot',
          totalQuantity: { $sum: '$items.quantity' },
          totalRevenue: { $sum: { $multiply: ['$items.priceSnapshot', '$items.quantity'] } },
        },
      },
      {
        $project: {
          _id: 0,
          name: '$_id',
          totalQuantity: 1,
          totalRevenue: { $round: ['$totalRevenue', 2] },
        },
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: limit },
    ]);

    return { items };
  },

  async getIngredientUsage({ startDate, endDate, ingredientId }) {
    const match = { type: 'sale' };

    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = new Date(startDate);
      if (endDate) match.createdAt.$lte = new Date(endDate);
    }

    const pipeline = [
      { $match: match },
      { $unwind: '$lines' },
    ];

    if (ingredientId) {
      pipeline.push({
        $match: { 'lines.ingredient': new mongoose.Types.ObjectId(ingredientId) },
      });
    }

    pipeline.push(
      {
        $group: {
          _id: '$lines.ingredient',
          totalGrossDeducted: { $sum: { $abs: '$lines.quantity' } },
          totalUsableQuantity: { $sum: '$lines.usableQty' },
          totalExpectedWastage: { $sum: '$lines.expectedWastageQty' },
          saleEventsCount: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: 'ingredients',
          localField: '_id',
          foreignField: '_id',
          as: 'ingredient',
        },
      },
      { $unwind: '$ingredient' },
      {
        $project: {
          _id: 0,
          ingredientId: '$ingredient._id',
          name: '$ingredient.name',
          baseUnit: '$ingredient.baseUnit',
          totalGrossDeducted: { $round: ['$totalGrossDeducted', 2] },
          totalUsableQuantity: { $round: ['$totalUsableQuantity', 2] },
          totalExpectedWastage: { $round: ['$totalExpectedWastage', 2] },
          saleEventsCount: 1,
        },
      },
      { $sort: { totalGrossDeducted: -1 } }
    );

    const usage = await StockMovement.aggregate(pipeline);
    return { usage };
  },

  async getLowStockList() {
    const ingredients = await Ingredient.find({
      isActive: true,
      $expr: { $lte: ['$currentStock', '$lowStockThreshold'] },
    }).sort({ currentStock: 1 });

    const formatted = ingredients.map((ing) => ({
      ingredientId: ing._id,
      name: ing.name,
      baseUnit: ing.baseUnit,
      currentStock: ing.currentStock,
      threshold: ing.lowStockThreshold,
      deficit: ing.lowStockThreshold - ing.currentStock,
      isNegative: ing.currentStock < 0,
      autoWastageEnabled: ing.autoWastageEnabled,
    }));

    return { lowStockItems: formatted, count: formatted.length };
  },

  async getPreparationWastageReport({ startDate, endDate, ingredientId }) {
    const dateMatch = {};
    if (startDate) dateMatch.$gte = new Date(startDate);
    if (endDate) dateMatch.$lte = new Date(endDate);
    const matchCreatedAt = Object.keys(dateMatch).length > 0 ? { createdAt: dateMatch } : {};

    const saleMatch = { type: 'sale', ...matchCreatedAt };
    const saleLinesPipeline = [
      { $match: saleMatch },
      { $unwind: '$lines' },
    ];
    if (ingredientId) {
      saleLinesPipeline.push({
        $match: { 'lines.ingredient': new mongoose.Types.ObjectId(ingredientId) },
      });
    }
    saleLinesPipeline.push({
      $group: {
        _id: '$lines.ingredient',
        totalConsumed: { $sum: { $abs: '$lines.quantity' } },
        expectedWastage: { $sum: '$lines.expectedWastageQty' },
      },
    });

    const expectedAgg = await StockMovement.aggregate(saleLinesPipeline);
    const expectedMap = new Map(expectedAgg.map((e) => [e._id.toString(), e]));

    const wasteMatch = { type: 'waste', reasonCode: 'prep_waste', ...matchCreatedAt };
    const wasteLinesPipeline = [
      { $match: wasteMatch },
      { $unwind: '$lines' },
    ];
    if (ingredientId) {
      wasteLinesPipeline.push({
        $match: { 'lines.ingredient': new mongoose.Types.ObjectId(ingredientId) },
      });
    }
    wasteLinesPipeline.push({
      $group: {
        _id: '$lines.ingredient',
        actualRecordedWastage: { $sum: '$lines.actualWastageQty' },
        totalPreparedBatchQty: { $sum: '$lines.usableQty' },
      },
    });

    const actualAgg = await StockMovement.aggregate(wasteLinesPipeline);
    const actualMap = new Map(actualAgg.map((a) => [a._id.toString(), a]));

    const detailedLogsPipeline = [
      { $match: wasteMatch },
      { $unwind: '$lines' },
    ];
    if (ingredientId) {
      detailedLogsPipeline.push({
        $match: { 'lines.ingredient': new mongoose.Types.ObjectId(ingredientId) },
      });
    }
    detailedLogsPipeline.push(
      {
        $lookup: {
          from: 'ingredients',
          localField: 'lines.ingredient',
          foreignField: '_id',
          as: 'ing',
        },
      },
      { $unwind: '$ing' },
      {
        $lookup: {
          from: 'users',
          localField: 'performedBy',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: '$user' },
      {
        $project: {
          _id: 1,
          createdAt: 1,
          ingredientName: '$ing.name',
          baseUnit: '$ing.baseUnit',
          batchPreparedQty: '$lines.usableQty',
          actualWastageQty: '$lines.actualWastageQty',
          note: 1,
          employee: {
            name: '$user.name',
            username: '$user.username',
            role: '$user.role',
          },
        },
      },
      { $sort: { createdAt: -1 } }
    );

    const detailedLogs = await StockMovement.aggregate(detailedLogsPipeline);

    const ingFilter = ingredientId
      ? { _id: new mongoose.Types.ObjectId(ingredientId) }
      : { autoWastageEnabled: true };

    const configuredIngredients = await Ingredient.find(ingFilter);

    const report = configuredIngredients.map((ing) => {
      const idStr = ing._id.toString();
      const exp = expectedMap.get(idStr) || { totalConsumed: 0, expectedWastage: 0 };
      const act = actualMap.get(idStr) || { actualRecordedWastage: 0, totalPreparedBatchQty: 0 };

      const totalConsumed = Number(exp.totalConsumed.toFixed(2));
      const expectedWaste = Number(exp.expectedWastage.toFixed(2));
      const actualWaste = Number(act.actualRecordedWastage.toFixed(2));
      const diff = Number((actualWaste - expectedWaste).toFixed(2));

      const wastageRatePercent =
        totalConsumed > 0
          ? Number(((expectedWaste / totalConsumed) * 100).toFixed(2))
          : Number(((ing.wastageRate || 0) * 100).toFixed(2));

      return {
        ingredientId: ing._id,
        ingredientName: ing.name,
        baseUnit: ing.baseUnit,
        configuredRatePercent: Number(((ing.wastageRate || 0) * 100).toFixed(1)),
        totalQuantityConsumed: totalConsumed,
        expectedWastage: expectedWaste,
        actualRecordedWastage: actualWaste,
        difference: diff,
        wastagePercentage: wastageRatePercent,
        isOverExpected: diff > 0,
      };
    });

    return {
      summary: report,
      detailedLogs,
    };
  },
};
