import mongoose from 'mongoose';
import { Ingredient } from '../models/Ingredient.js';
import { StockMovement } from '../models/StockMovement.js';
import { notificationService } from './notificationService.js';

/**
 * Runs a transaction with retry on transient write conflicts.
 */
async function executeTransactionWithRetry(fn, maxRetries = 5) {
  let attempts = 0;
  while (attempts < maxRetries) {
    attempts++;
    const session = await mongoose.startSession();
    try {
      let result;
      await session.withTransaction(async () => {
        result = await fn(session);
      });
      return result;
    } catch (err) {
      const isTransient =
        (err.hasErrorLabel && err.hasErrorLabel('TransientTransactionError')) ||
        (err.errorLabels && err.errorLabels.includes('TransientTransactionError'));
      const isWriteConflict = err.code === 112 || err.codeName === 'WriteConflict';

      if ((isTransient || isWriteConflict) && attempts < maxRetries) {
        const delay = Math.floor(Math.random() * 40) + 20;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    } finally {
      await session.endSession();
    }
  }
}

export const inventoryService = {
  /**
   * Records an incoming stock delivery (Rule 8).
   * Adds quantity to ingredient currentStock and writes one 'delivery' StockMovement.
   */
  async recordDelivery({ lines, note = '', userId }) {
    if (!lines || lines.length === 0) {
      throw new Error('Delivery must contain at least one ingredient');
    }

    const result = await executeTransactionWithRetry(async (session) => {
      const movementLines = [];

      for (const line of lines) {
        const ing = await Ingredient.findById(line.ingredientId).session(session);
        if (!ing || !ing.isActive) {
          throw new Error(`Ingredient ${line.ingredientId} not found or inactive`);
        }

        const qtyToAdd = Number(line.quantity);
        if (qtyToAdd <= 0) {
          throw new Error(`Delivery quantity for ${ing.name} must be greater than 0`);
        }

        const beforeStock = ing.currentStock;
        const prevUnitCost = ing.costPerBaseUnit || 0;

        // Section 14.D: Weighted Average Costing
        // Determine unit cost of the delivery
        const deliveredUnitCost =
          line.unitPrice !== undefined && line.unitPrice !== null
            ? Number(line.unitPrice)
            : line.totalCost !== undefined && line.totalCost !== null
            ? Number((line.totalCost / qtyToAdd).toFixed(4))
            : prevUnitCost;

        const deliveredTotalCost = Number(
          (line.totalCost !== undefined && line.totalCost !== null
            ? Number(line.totalCost)
            : deliveredUnitCost * qtyToAdd
          ).toFixed(2)
        );

        let newWeightedAverageCost = deliveredUnitCost;
        if (beforeStock > 0) {
          const prevTotalValue = beforeStock * prevUnitCost;
          const totalNewStock = beforeStock + qtyToAdd;
          newWeightedAverageCost = Number(
            ((prevTotalValue + deliveredTotalCost) / totalNewStock).toFixed(4)
          );
        }

        const updated = await Ingredient.findByIdAndUpdate(
          ing._id,
          {
            $inc: { currentStock: qtyToAdd },
            $set: {
              costPerBaseUnit: newWeightedAverageCost,
              lastPurchasePrice: deliveredUnitCost,
              lastPurchaseDate: new Date(),
            },
          },
          { session, new: true }
        );

        movementLines.push({
          ingredient: ing._id,
          quantity: qtyToAdd, // Signed positive delta
          before: beforeStock,
          after: updated.currentStock,
          unitCost: deliveredUnitCost,
          totalCost: deliveredTotalCost,
        });
      }

      const [movement] = await StockMovement.create(
        [
          {
            type: 'delivery',
            lines: movementLines,
            reasonCode: 'delivery',
            note: note.trim() || 'Supplier delivery receipt',
            performedBy: userId,
          },
        ],
        { session }
      );

      return movement;
    });

    // Reset alert flags for restocked ingredients
    if (result?.lines) {
      for (const line of result.lines) {
        Ingredient.findById(line.ingredient)
          .then((ing) => {
            if (ing && ing.currentStock > ing.lowStockThreshold) {
              notificationService.resetAlertFlagsOnRestock(ing._id, ing.currentStock, ing.lowStockThreshold);
            }
          })
          .catch(() => {});
      }
    }

    return result;
  },

  /**
   * Records ingredient waste (Rule 8 & Section 13).
   * reasonCode: 'spoilage' | 'expired' | 'spill' | 'prep_waste' | 'other'
   * Deducts quantity from ingredient currentStock and writes one 'waste' StockMovement.
   */
  async recordWaste({ lines, reasonCode, note = '', userId }) {
    if (!lines || lines.length === 0) {
      throw new Error('Waste record must contain at least one ingredient');
    }

    const validReasons = ['spoilage', 'expired', 'spill', 'prep_waste', 'other'];
    if (!validReasons.includes(reasonCode)) {
      throw new Error(`Invalid waste reasonCode: ${reasonCode}`);
    }

    const result = await executeTransactionWithRetry(async (session) => {
      const movementLines = [];

      for (const line of lines) {
        const ing = await Ingredient.findById(line.ingredientId).session(session);
        if (!ing || !ing.isActive) {
          throw new Error(`Ingredient ${line.ingredientId} not found or inactive`);
        }

        const qtyToDeduct = Number(line.quantity);
        if (qtyToDeduct <= 0) {
          throw new Error(`Wasted quantity for ${ing.name} must be greater than 0`);
        }

        const beforeStock = ing.currentStock;
        const updated = await Ingredient.findByIdAndUpdate(
          ing._id,
          { $inc: { currentStock: -qtyToDeduct } },
          { session, new: true }
        );

        movementLines.push({
          ingredient: ing._id,
          quantity: -qtyToDeduct, // Signed negative delta
          before: beforeStock,
          after: updated.currentStock,
          // Section 13 preparation waste tracking
          actualWastageQty: qtyToDeduct,
          usableQty: line.preparedQty ? Number(line.preparedQty) : 0,
          // Section 14.D/E Cost snapshot
          unitCost: ing.costPerBaseUnit || 0,
          totalCost: Number(((ing.costPerBaseUnit || 0) * qtyToDeduct).toFixed(2)),
        });
      }

      const [movement] = await StockMovement.create(
        [
          {
            type: 'waste',
            lines: movementLines,
            reasonCode,
            note: note.trim() || `Waste record: ${reasonCode}`,
            performedBy: userId,
          },
        ],
        { session }
      );

      return movement;
    });

    // Trigger low-stock and critical-stock alerts
    if (result?.lines) {
      for (const line of result.lines) {
        Ingredient.findById(line.ingredient)
          .then((ing) => {
            if (!ing) return;
            if (ing.currentStock <= 0) {
              notificationService.notifyCriticalStock(ing);
            } else if (ing.currentStock <= ing.lowStockThreshold) {
              notificationService.notifyLowStock(ing);
            }
          })
          .catch(() => {});
      }
    }

    // Section 13 / 15.C.6: Excessive Preparation Wastage Alerts
    if (reasonCode === 'prep_waste') {
      for (const line of lines) {
        const exp = line.expectedWastageQty !== undefined ? line.expectedWastageQty : line.expectedWastage;
        if (exp !== undefined && exp !== null && Number(line.quantity) > Number(exp)) {
          Ingredient.findById(line.ingredientId)
            .then((ing) => {
              if (ing) {
                notificationService.notifyExcessiveWastage({
                  ingredient: ing,
                  expectedWastage: Number(exp),
                  actualWastage: Number(line.quantity),
                  employeeName: note || 'Kitchen Station',
                });
              }
            })
            .catch(() => {});
        }
      }
    }

    return result;
  },

  /**
   * Records physical stock count reconciliation (Rule 7).
   * For each ingredient that differs from system figure, records a 'count_adjustment' line.
   */
  async recordStockCount({ counts, note = '', userId }) {
    if (!counts || counts.length === 0) {
      throw new Error('Stock count must contain at least one item');
    }

    const result = await executeTransactionWithRetry(async (session) => {
      const movementLines = [];

      for (const item of counts) {
        const ing = await Ingredient.findById(item.ingredientId).session(session);
        if (!ing || !ing.isActive) continue;

        const countedQty = Number(item.countedQuantity);
        const systemQty = ing.currentStock;
        const diff = Number((countedQty - systemQty).toFixed(4));

        // Only record adjustment if there is an actual variance
        if (diff !== 0) {
          const updated = await Ingredient.findByIdAndUpdate(
            ing._id,
            { currentStock: countedQty },
            { session, new: true }
          );

          movementLines.push({
            ingredient: ing._id,
            quantity: diff, // Signed difference (+ if counted > system, - if counted < system)
            before: systemQty,
            after: updated.currentStock,
            unitCost: ing.costPerBaseUnit || 0,
            totalCost: Number(((ing.costPerBaseUnit || 0) * Math.abs(diff)).toFixed(2)),
          });
        }
      }

      if (movementLines.length === 0) {
        return { message: 'Stock count verified: No variance found', countAdjusted: false };
      }

      const [movement] = await StockMovement.create(
        [
          {
            type: 'count_adjustment',
            lines: movementLines,
            reasonCode: 'count_reconciliation',
            note: note.trim() || 'Physical inventory stock count reconciliation',
            performedBy: userId,
          },
        ],
        { session }
      );

      return { movement, countAdjusted: true, lineCount: movementLines.length };
    });

    if (result.movement?.lines) {
      for (const line of result.movement.lines) {
        Ingredient.findById(line.ingredient)
          .then((ing) => {
            if (!ing) return;
            if (ing.currentStock > ing.lowStockThreshold) {
              notificationService.resetAlertFlagsOnRestock(ing._id, ing.currentStock, ing.lowStockThreshold);
            } else if (ing.currentStock <= 0) {
              notificationService.notifyCriticalStock(ing);
            } else if (ing.currentStock <= ing.lowStockThreshold) {
              notificationService.notifyLowStock(ing);
            }
          })
          .catch(() => {});
      }
    }

    return result;
  },

  /**
   * Records an admin correction movement to fix mistakes in the ledger (Rule 9).
   */
  async recordCorrection({ lines, reasonCode = 'ledger_correction', note = '', userId }) {
    if (!lines || lines.length === 0) {
      throw new Error('Correction must contain at least one line');
    }

    const result = await executeTransactionWithRetry(async (session) => {
      const movementLines = [];

      for (const line of lines) {
        const ing = await Ingredient.findById(line.ingredientId).session(session);
        if (!ing) {
          throw new Error(`Ingredient ${line.ingredientId} not found`);
        }

        const delta = Number(line.quantity); // Can be positive or negative
        if (delta === 0) continue;

        const beforeStock = ing.currentStock;
        const updated = await Ingredient.findByIdAndUpdate(
          ing._id,
          { $inc: { currentStock: delta } },
          { session, new: true }
        );

        movementLines.push({
          ingredient: ing._id,
          quantity: delta,
          before: beforeStock,
          after: updated.currentStock,
          unitCost: ing.costPerBaseUnit || 0,
          totalCost: Number(((ing.costPerBaseUnit || 0) * Math.abs(delta)).toFixed(2)),
        });
      }

      if (movementLines.length === 0) {
        throw new Error('Correction delta cannot be 0');
      }

      const [movement] = await StockMovement.create(
        [
          {
            type: 'correction',
            lines: movementLines,
            reasonCode,
            note: note.trim() || 'Administrator ledger correction',
            performedBy: userId,
          },
        ],
        { session }
      );

      return movement;
    });

    // Check alert flags after correction
    if (result?.lines) {
      for (const line of result.lines) {
        Ingredient.findById(line.ingredient)
          .then((ing) => {
            if (!ing) return;
            if (ing.currentStock > ing.lowStockThreshold) {
              notificationService.resetAlertFlagsOnRestock(ing._id, ing.currentStock, ing.lowStockThreshold);
            } else if (ing.currentStock <= 0) {
              notificationService.notifyCriticalStock(ing);
            } else if (ing.currentStock <= ing.lowStockThreshold) {
              notificationService.notifyLowStock(ing);
            }
          })
          .catch(() => {});
      }
    }

    return result;
  },

  /**
   * Retrieves paginated stock movement audit trail with filters (Section 6).
   */
  async getMovements({
    ingredientId,
    type,
    reasonCode,
    userId,
    startDate,
    endDate,
    page = 1,
    limit = 25,
  }) {
    const query = {};

    if (type) query.type = type;
    if (reasonCode) query.reasonCode = reasonCode;
    if (userId) query.performedBy = userId;
    if (ingredientId) query['lines.ingredient'] = ingredientId;

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;

    const [movements, total] = await Promise.all([
      StockMovement.find(query)
        .populate('performedBy', 'name username role')
        .populate('lines.ingredient', 'name baseUnit')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      StockMovement.countDocuments(query),
    ]);

    return {
      movements,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  },
};

