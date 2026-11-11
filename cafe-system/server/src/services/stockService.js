import { Ingredient } from '../models/Ingredient.js';
import { StockMovement } from '../models/StockMovement.js';

export const stockService = {
  /**
   * Deducts raw ingredients for ordered items inside a MongoDB transaction.
   * Calculates gross ingredient quantity including Section 13 Automatic Preparation Wastage:
   * Gross = Usable / (1 - WastageRate)
   */
  async deductStockForOrderItems(items, performedByUserId, session, orderId = null) {
    if (!items || items.length === 0) return { stockMovement: null, lowStockAlerts: [] };

    // Aggregate ingredient requirements across all items
    const ingredientDeductions = new Map();

    for (const item of items) {
      const itemQty = item.quantity || 1;
      const recipe = item.recipeSnapshot || [];

      for (const ingredientLine of recipe) {
        const ingId = ingredientLine.ingredient.toString();
        const usableQty = Number((ingredientLine.quantity * itemQty).toFixed(4));
        const wastageRate = ingredientLine.wastageRate || 0;

        let grossQty = usableQty;
        let expectedWaste = 0;

        if (wastageRate > 0 && wastageRate < 1) {
          grossQty = Number((usableQty / (1 - wastageRate)).toFixed(4));
          expectedWaste = Number((grossQty - usableQty).toFixed(4));
        }

        if (!ingredientDeductions.has(ingId)) {
          ingredientDeductions.set(ingId, {
            ingredientId: ingId,
            grossQuantity: 0,
            usableQuantity: 0,
            expectedWastageQuantity: 0,
          });
        }

        const currentAgg = ingredientDeductions.get(ingId);
        currentAgg.grossQuantity = Number((currentAgg.grossQuantity + grossQty).toFixed(4));
        currentAgg.usableQuantity = Number((currentAgg.usableQuantity + usableQty).toFixed(4));
        currentAgg.expectedWastageQuantity = Number((currentAgg.expectedWastageQuantity + expectedWaste).toFixed(4));
      }
    }

    if (ingredientDeductions.size === 0) {
      return { stockMovement: null, lowStockAlerts: [] };
    }

    const movementLines = [];
    const lowStockAlerts = [];

    // Atomically decrement stock in MongoDB using $inc inside transaction
    for (const [ingId, req] of ingredientDeductions.entries()) {
      // Find current stock before update
      const ingredient = await Ingredient.findById(ingId).session(session);
      if (!ingredient) {
        throw new Error(`Ingredient ${ingId} not found during stock deduction`);
      }

      const beforeStock = ingredient.currentStock;
      const deductAmount = req.grossQuantity;

      // Rule 2: Never block an order because of low stock; allow negative stock
      const updated = await Ingredient.findByIdAndUpdate(
        ingId,
        { $inc: { currentStock: -deductAmount } },
        { session, new: true }
      );

      const afterStock = updated.currentStock;

      movementLines.push({
        ingredient: ingredient._id,
        quantity: -deductAmount, // Signed negative delta
        before: beforeStock,
        after: afterStock,
        usableQty: req.usableQuantity,
        expectedWastageQty: req.expectedWastageQuantity,
        unitCost: ingredient.costPerBaseUnit || 0,
        totalCost: Number(((ingredient.costPerBaseUnit || 0) * deductAmount).toFixed(2)),
      });

      // Rule 3: Flag low stock if current stock <= lowStockThreshold
      if (afterStock <= updated.lowStockThreshold) {
        lowStockAlerts.push({
          ingredientId: updated._id,
          name: updated.name,
          currentStock: afterStock,
          threshold: updated.lowStockThreshold,
          baseUnit: updated.baseUnit,
          isNegative: afterStock < 0,
        });
      }
    }

    // Write one append-only StockMovement ledger document
    const [movement] = await StockMovement.create(
      [
        {
          type: 'sale',
          lines: movementLines,
          reasonCode: 'sale',
          note: orderId ? `Stock deduction for order #${orderId}` : 'Stock deduction for order sale',
          performedBy: performedByUserId,
          order: orderId,
        },
      ],
      { session }
    );

    return { stockMovement: movement, lowStockAlerts };
  },

  /**
   * Restores raw stock when an item is cancelled while in 'pending' status.
   * Records a 'sale_reversal' StockMovement ledger document.
   */
  async restoreStockForCancelledItem(item, performedByUserId, session, orderId = null) {
    const recipe = item.recipeSnapshot || [];
    if (recipe.length === 0) return { stockMovement: null };

    const itemQty = item.quantity || 1;
    const movementLines = [];

    for (const ingredientLine of recipe) {
      const ingId = ingredientLine.ingredient.toString();
      const usableQty = Number((ingredientLine.quantity * itemQty).toFixed(4));
      const wastageRate = ingredientLine.wastageRate || 0;

      let grossQty = usableQty;
      if (wastageRate > 0 && wastageRate < 1) {
        grossQty = Number((usableQty / (1 - wastageRate)).toFixed(4));
      }

      const ingredient = await Ingredient.findById(ingId).session(session);
      if (!ingredient) continue;

      const beforeStock = ingredient.currentStock;

      const updated = await Ingredient.findByIdAndUpdate(
        ingId,
        { $inc: { currentStock: grossQty } },
        { session, new: true }
      );

      movementLines.push({
        ingredient: ingredient._id,
        quantity: grossQty, // Signed positive restoration
        before: beforeStock,
        after: updated.currentStock,
        usableQty,
        expectedWastageQty: Number((grossQty - usableQty).toFixed(4)),
        unitCost: ingredient.costPerBaseUnit || 0,
        totalCost: Number(((ingredient.costPerBaseUnit || 0) * grossQty).toFixed(2)),
      });
    }

    if (movementLines.length === 0) return { stockMovement: null };

    const [reversalMovement] = await StockMovement.create(
      [
        {
          type: 'sale_reversal',
          lines: movementLines,
          reasonCode: 'sale_reversal',
          note: `Restored stock for cancelled item: ${item.nameSnapshot}`,
          performedBy: performedByUserId,
          order: orderId,
        },
      ],
      { session }
    );

    return { stockMovement: reversalMovement };
  },
};

