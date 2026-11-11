import { z } from 'zod';
import { expenseService } from '../services/expenseService.js';

export const expenseCreateSchema = z.object({
  category: z.enum(['electricity', 'water', 'rent', 'salaries', 'gas', 'cleaning', 'other'], {
    errorMap: () => ({ message: 'Invalid expense category' }),
  }),
  amount: z.number().positive('Expense amount must be greater than zero'),
  description: z.string().trim().max(250).optional().default(''),
  date: z.string().datetime({ offset: true }).optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional()),
});

export const expenseQuerySchema = z.object({
  category: z.string().optional(),
  startDate: z.string().datetime({ offset: true }).optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional()),
  endDate: z.string().datetime({ offset: true }).optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional()),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const expenseController = {
  async create(req, res, next) {
    try {
      const data = expenseCreateSchema.parse(req.body);
      const expense = await expenseService.createExpense({
        ...data,
        userId: req.user._id,
      });
      res.status(201).json({
        success: true,
        data: { expense },
      });
    } catch (err) {
      next(err);
    }
  },

  async getAll(req, res, next) {
    try {
      const query = expenseQuerySchema.parse(req.query);
      const result = await expenseService.getExpenses(query);
      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },

  async getSummary(req, res, next) {
    try {
      const { startDate, endDate } = req.query;
      const result = await expenseService.getExpenseSummary({ startDate, endDate });
      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },

  async delete(req, res, next) {
    try {
      await expenseService.deleteExpense(req.params.id);
      res.json({
        success: true,
        message: 'Expense deleted successfully',
      });
    } catch (err) {
      next(err);
    }
  },
};

