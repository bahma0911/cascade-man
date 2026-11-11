import { z } from 'zod';
import mongoose from 'mongoose';
import { inventoryService } from '../services/inventoryService.js';

const deliveryLineSchema = z.object({
  ingredientId: z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
    message: 'Invalid ingredient ID',
  }),
  quantity: z.number().positive('Quantity must be greater than 0'),
  unitPrice: z.number().min(0, 'Unit price cannot be negative').optional(),
  totalCost: z.number().min(0, 'Total cost cannot be negative').optional(),
});

export const deliverySchema = z.object({
  lines: z.array(deliveryLineSchema).min(1, 'At least one line is required'),
  note: z.string().trim().max(250).optional().default(''),
});

const wasteLineSchema = z.object({
  ingredientId: z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
    message: 'Invalid ingredient ID',
  }),
  quantity: z.number().positive('Wasted quantity must be greater than 0'),
  preparedQty: z.number().min(0).optional(),
  expectedWastageQty: z.number().min(0).optional(),
});

export const wasteSchema = z.object({
  lines: z.array(wasteLineSchema).min(1, 'At least one line is required'),
  reasonCode: z.enum(['spoilage', 'expired', 'spill', 'prep_waste', 'other']),
  note: z.string().trim().max(250).optional().default(''),
});

const countItemSchema = z.object({
  ingredientId: z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
    message: 'Invalid ingredient ID',
  }),
  countedQuantity: z.number().min(0, 'Counted quantity cannot be negative'),
});

export const countSchema = z.object({
  counts: z.array(countItemSchema).min(1, 'At least one count entry is required'),
  note: z.string().trim().max(250).optional().default(''),
});

const correctionLineSchema = z.object({
  ingredientId: z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
    message: 'Invalid ingredient ID',
  }),
  quantity: z.number().refine((val) => val !== 0, {
    message: 'Correction quantity cannot be 0',
  }),
});

export const correctionSchema = z.object({
  lines: z.array(correctionLineSchema).min(1, 'At least one line is required'),
  reasonCode: z.string().trim().min(1).default('ledger_correction'),
  note: z.string().trim().min(1, 'Explanation note is required for audit trail').max(250),
});

export async function recordDelivery(req, res, next) {
  try {
    const { lines, note } = req.body;
    const movement = await inventoryService.recordDelivery({
      lines,
      note,
      userId: req.user._id,
    });

    res.status(201).json({
      success: true,
      data: { movement },
    });
  } catch (err) {
    next(err);
  }
}

export async function recordWaste(req, res, next) {
  try {
    const { lines, reasonCode, note } = req.body;
    const movement = await inventoryService.recordWaste({
      lines,
      reasonCode,
      note,
      userId: req.user._id,
    });

    res.status(201).json({
      success: true,
      data: { movement },
    });
  } catch (err) {
    next(err);
  }
}

export async function recordStockCount(req, res, next) {
  try {
    const { counts, note } = req.body;
    const result = await inventoryService.recordStockCount({
      counts,
      note,
      userId: req.user._id,
    });

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

export async function recordCorrection(req, res, next) {
  try {
    const { lines, reasonCode, note } = req.body;
    const movement = await inventoryService.recordCorrection({
      lines,
      reasonCode,
      note,
      userId: req.user._id,
    });

    res.status(201).json({
      success: true,
      data: { movement },
    });
  } catch (err) {
    next(err);
  }
}

export async function getMovements(req, res, next) {
  try {
    const { ingredientId, type, reasonCode, userId, startDate, endDate, page, limit } = req.query;

    const result = await inventoryService.getMovements({
      ingredientId,
      type,
      reasonCode,
      userId,
      startDate,
      endDate,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 25,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

