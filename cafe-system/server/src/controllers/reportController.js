import { z } from 'zod';
import mongoose from 'mongoose';
import { reportService } from '../services/reportService.js';

const baseDateQuerySchema = z.object({
  period: z.enum(['day', 'week', 'month']).default('day'),
  startDate: z.string().datetime({ offset: true }).optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional()),
  endDate: z.string().datetime({ offset: true }).optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional()),
  waiterId: z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), { message: 'Invalid waiter ID' }).optional(),
  tableId: z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), { message: 'Invalid table ID' }).optional(),
  status: z.string().optional(),
  ingredientId: z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), { message: 'Invalid ingredient ID' }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export const reportController = {
  /**
   * Section 14.A / 14.F: Dashboard KPI Cards & Executive Financial Summary
   */
  async getDashboard(req, res, next) {
    try {
      const query = baseDateQuerySchema.parse(req.query);
      const result = await reportService.getDashboardSummary(query);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Section 14.B: Detailed Order Reports & Ordering Analytics
   */
  async getOrders(req, res, next) {
    try {
      const query = baseDateQuerySchema.parse(req.query);
      const result = await reportService.getOrderReports(query);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Section 14.C: Revenue Breakdown & Periodic Trends
   */
  async getRevenue(req, res, next) {
    try {
      const query = baseDateQuerySchema.parse(req.query);
      const result = await reportService.getRevenueReports(query);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Section 14.D: Ingredient Consumption & Recipe Costings
   */
  async getIngredientCosts(req, res, next) {
    try {
      const query = baseDateQuerySchema.parse(req.query);
      const result = await reportService.getIngredientCostReports(query);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Section 14.E: Wastage Cost Reports
   */
  async getWastageCosts(req, res, next) {
    try {
      const query = baseDateQuerySchema.parse(req.query);
      const result = await reportService.getWastageCostReports(query);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Section 14.F: Profit & Loss Periodic Timelines
   */
  async getProfitLoss(req, res, next) {
    try {
      const query = baseDateQuerySchema.parse(req.query);
      const result = await reportService.getProfitLossReports(query);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Backward-compatible endpoints
   */
  async getSales(req, res, next) {
    try {
      const query = baseDateQuerySchema.parse(req.query);
      const result = await reportService.getSalesReport(query);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async getTopSelling(req, res, next) {
    try {
      const query = baseDateQuerySchema.parse(req.query);
      const result = await reportService.getTopSellingItems(query);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async getIngredientUsage(req, res, next) {
    try {
      const query = baseDateQuerySchema.parse(req.query);
      const result = await reportService.getIngredientUsage(query);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async getLowStock(req, res, next) {
    try {
      const result = await reportService.getLowStockList();
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async getPreparationWastage(req, res, next) {
    try {
      const query = baseDateQuerySchema.parse(req.query);
      const result = await reportService.getPreparationWastageReport(query);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
};
