import { Expense } from '../models/Expense.js';

export const expenseService = {
  /**
   * Records a new operating expense (Section 14.G)
   */
  async createExpense({ category, amount, description = '', date, userId }) {
    if (!category || !amount || Number(amount) <= 0) {
      throw new Error('Valid category and positive expense amount are required');
    }

    const expense = await Expense.create({
      category,
      amount: Number(Number(amount).toFixed(2)),
      description: description.trim(),
      date: date ? new Date(date) : new Date(),
      recordedBy: userId,
    });

    return await expense.populate('recordedBy', 'name username role');
  },

  /**
   * Retrieves paginated list of expenses with optional category and date range filter
   */
  async getExpenses({ startDate, endDate, category, page = 1, limit = 20 }) {
    const filter = {};

    if (category && category !== 'all') {
      filter.category = category;
    }

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [expenses, total] = await Promise.all([
      Expense.find(filter)
        .populate('recordedBy', 'name username role')
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Expense.countDocuments(filter),
    ]);

    return {
      expenses,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    };
  },

  /**
   * Aggregates total operating expenses and expenses by category within date range
   */
  async getExpenseSummary({ startDate, endDate }) {
    const match = {};

    if (startDate || endDate) {
      match.date = {};
      if (startDate) match.date.$gte = new Date(startDate);
      if (endDate) match.date.$lte = new Date(endDate);
    }

    const aggregation = await Expense.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$category',
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          category: '$_id',
          totalAmount: { $round: ['$totalAmount', 2] },
          count: 1,
        },
      },
      { $sort: { totalAmount: -1 } },
    ]);

    const totalOperatingExpenses = Number(
      aggregation.reduce((acc, curr) => acc + curr.totalAmount, 0).toFixed(2)
    );

    return {
      totalOperatingExpenses,
      byCategory: aggregation,
    };
  },

  /**
   * Deletes an expense record
   */
  async deleteExpense(id) {
    const deleted = await Expense.findByIdAndDelete(id);
    if (!deleted) {
      throw new Error('Expense record not found');
    }
    return deleted;
  },
};

