import { z } from 'zod';
import { Table } from '../models/Table.js';
import { Order } from '../models/Order.js';
import { escapeRegex } from '../utils/regex.js';

export const createTableSchema = z.object({
  name: z.string().trim().min(1, 'Table name is required').max(50),
});

export const updateTableSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  isActive: z.boolean().optional(),
});

export async function getTables(req, res, next) {
  try {
    const filter = req.query.all === 'true' && req.user.role === 'admin' ? {} : { isActive: true };
    const tables = await Table.find(filter).sort({ name: 1 });
    res.json({
      success: true,
      data: { tables },
    });
  } catch (err) {
    next(err);
  }
}

export async function createTable(req, res, next) {
  try {
    const { name } = req.body;
    const existing = await Table.findOne({ name: { $regex: new RegExp(`^${escapeRegex(name)}$`, 'i') } });
    if (existing) {
      if (!existing.isActive) {
        existing.isActive = true;
        await existing.save();
        return res.status(200).json({
          success: true,
          data: { table: existing, reactivated: true },
        });
      }
      return res.status(409).json({
        success: false,
        error: { message: 'Table with this name already exists', code: 'DUPLICATE_TABLE' },
      });
    }

    const table = await Table.create({ name });
    res.status(201).json({
      success: true,
      data: { table },
    });
  } catch (err) {
    next(err);
  }
}

export async function updateTable(req, res, next) {
  try {
    const { id } = req.params;
    const { name, isActive } = req.body;

    const table = await Table.findById(id);
    if (!table) {
      return res.status(404).json({
        success: false,
        error: { message: 'Table not found', code: 'NOT_FOUND' },
      });
    }

    if (name !== undefined) table.name = name;
    if (isActive !== undefined) table.isActive = isActive;

    await table.save();
    res.json({
      success: true,
      data: { table },
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteTable(req, res, next) {
  try {
    const { id } = req.params;
    const table = await Table.findById(id);
    if (!table) {
      return res.status(404).json({
        success: false,
        error: { message: 'Table not found', code: 'NOT_FOUND' },
      });
    }

    if (req.query.permanent === 'true' || req.query.force === 'true') {
      const openOrder = await Order.findOne({ table: id, status: 'open' });
      if (openOrder) {
        return res.status(400).json({
          success: false,
          error: { message: 'Cannot delete table with an active open order. Close or cancel the order first.', code: 'TABLE_HAS_OPEN_ORDER' },
        });
      }
      await Table.findByIdAndDelete(id);
      return res.json({
        success: true,
        data: { message: 'Table permanently deleted from database', hardDeleted: true },
      });
    }

    // Soft delete (deactivate)
    table.isActive = false;
    await table.save();

    res.json({
      success: true,
      data: { message: 'Table deleted successfully (soft delete)', table },
    });
  } catch (err) {
    next(err);
  }
}

