import { z } from 'zod';
import { Ingredient } from '../models/Ingredient.js';
import { StockMovement } from '../models/StockMovement.js';
import { MenuItem } from '../models/MenuItem.js';
import { escapeRegex } from '../utils/regex.js';

export const createIngredientSchema = z.object({
  name: z.string().trim().min(1, 'Ingredient name is required').max(100),
  baseUnit: z.enum(['g', 'ml', 'pcs']),
  currentStock: z.number().min(0).default(0),
  lowStockThreshold: z.number().min(0).default(0),
  costPerBaseUnit: z.number().min(0).default(0),
  // Section 13: Automatic Preparation Wastage
  referenceQty: z.number().min(0).default(0),
  expectedWastageQty: z.number().min(0).default(0),
  autoWastageEnabled: z.boolean().default(false),
});

export const updateIngredientSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  baseUnit: z.enum(['g', 'ml', 'pcs']).optional(),
  lowStockThreshold: z.number().min(0).optional(),
  costPerBaseUnit: z.number().min(0).optional(),
  isActive: z.boolean().optional(),
  // Section 13: Preparation Wastage (Admin only)
  referenceQty: z.number().min(0).optional(),
  expectedWastageQty: z.number().min(0).optional(),
  wastageRate: z.number().min(0).max(0.9999).optional(),
  autoWastageEnabled: z.boolean().optional(),
});

export async function getIngredients(req, res, next) {
  try {
    const filter = req.query.all === 'true' && req.user.role === 'admin' ? {} : { isActive: true };
    const ingredients = await Ingredient.find(filter).sort({ name: 1 });
    res.json({
      success: true,
      data: { ingredients },
    });
  } catch (err) {
    next(err);
  }
}

export async function createIngredient(req, res, next) {
  try {
    const {
      name,
      baseUnit,
      currentStock = 0,
      lowStockThreshold = 0,
      costPerBaseUnit = 0,
      referenceQty = 0,
      expectedWastageQty = 0,
      autoWastageEnabled = false,
    } = req.body;

    const existing = await Ingredient.findOne({ name: { $regex: new RegExp(`^${escapeRegex(name)}$`, 'i') } });
    if (existing) {
      if (!existing.isActive) {
        existing.isActive = true;
        existing.baseUnit = baseUnit;
        existing.lowStockThreshold = lowStockThreshold;
        await existing.save();
        return res.status(200).json({
          success: true,
          data: { ingredient: existing, reactivated: true },
        });
      }
      return res.status(409).json({
        success: false,
        error: { message: 'Ingredient with this name already exists', code: 'DUPLICATE_INGREDIENT' },
      });
    }

    // Section 13: Calculate wastage rate if configured
    let calculatedRate = 0;
    if (req.user.role === 'admin' && referenceQty > 0 && expectedWastageQty > 0) {
      calculatedRate = Number((expectedWastageQty / referenceQty).toFixed(4));
    }

    const unitCost = Number(costPerBaseUnit) || 0;
    const ingredient = await Ingredient.create({
      name,
      baseUnit,
      currentStock,
      lowStockThreshold,
      costPerBaseUnit: unitCost,
      lastPurchasePrice: unitCost,
      lastPurchaseDate: unitCost > 0 ? new Date() : null,
      referenceQty: req.user.role === 'admin' ? referenceQty : 0,
      expectedWastageQty: req.user.role === 'admin' ? expectedWastageQty : 0,
      wastageRate: calculatedRate,
      autoWastageEnabled: req.user.role === 'admin' ? autoWastageEnabled : false,
      isActive: true,
    });

    // Rule 8: Opening stock creates an 'initial' stock movement
    if (currentStock > 0) {
      await StockMovement.create({
        type: 'initial',
        lines: [
          {
            ingredient: ingredient._id,
            quantity: currentStock,
            before: 0,
            after: currentStock,
          },
        ],
        reasonCode: 'initial_stock',
        note: 'Opening stock for newly added ingredient',
        performedBy: req.user._id,
      });
    }

    res.status(201).json({
      success: true,
      data: { ingredient },
    });
  } catch (err) {
    next(err);
  }
}

export async function updateIngredient(req, res, next) {
  try {
    const { id } = req.params;
    const ingredient = await Ingredient.findById(id);
    if (!ingredient) {
      return res.status(404).json({
        success: false,
        error: { message: 'Ingredient not found', code: 'NOT_FOUND' },
      });
    }

    const {
      name,
      baseUnit,
      lowStockThreshold,
      isActive,
      referenceQty,
      expectedWastageQty,
      wastageRate,
      autoWastageEnabled,
    } = req.body;

    if (name !== undefined) ingredient.name = name;
    if (baseUnit !== undefined) ingredient.baseUnit = baseUnit;
    if (lowStockThreshold !== undefined) ingredient.lowStockThreshold = lowStockThreshold;
    if (isActive !== undefined) ingredient.isActive = isActive;
    if (req.body.costPerBaseUnit !== undefined) {
      const newCost = Math.max(0, Number(req.body.costPerBaseUnit) || 0);
      ingredient.costPerBaseUnit = newCost;
      if (newCost > 0) {
        ingredient.lastPurchasePrice = newCost;
        ingredient.lastPurchaseDate = new Date();
      }
    }

    // Section 13.F: Only admin can change wastage settings
    if (req.user.role === 'admin') {
      if (referenceQty !== undefined) ingredient.referenceQty = referenceQty;
      if (expectedWastageQty !== undefined) ingredient.expectedWastageQty = expectedWastageQty;
      if (autoWastageEnabled !== undefined) ingredient.autoWastageEnabled = autoWastageEnabled;

      if (referenceQty !== undefined || expectedWastageQty !== undefined) {
        const ref = referenceQty !== undefined ? referenceQty : ingredient.referenceQty;
        const waste = expectedWastageQty !== undefined ? expectedWastageQty : ingredient.expectedWastageQty;
        if (ref > 0 && waste >= 0) {
          ingredient.wastageRate = Number((waste / ref).toFixed(4));
        }
      } else if (wastageRate !== undefined) {
        ingredient.wastageRate = wastageRate;
      }
    }

    await ingredient.save();
    res.json({
      success: true,
      data: { ingredient },
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteIngredient(req, res, next) {
  try {
    const { id } = req.params;
    const ingredient = await Ingredient.findById(id);
    if (!ingredient) {
      return res.status(404).json({
        success: false,
        error: { message: 'Ingredient not found', code: 'NOT_FOUND' },
      });
    }

    if (req.query.permanent === 'true' || req.query.force === 'true') {
      const inRecipe = await MenuItem.findOne({ 'recipe.ingredient': id, isActive: true });
      if (inRecipe) {
        return res.status(400).json({
          success: false,
          error: {
            message: `Cannot delete ingredient: it is used in the recipe for active menu dish "${inRecipe.name}". Remove it from recipes first.`,
            code: 'INGREDIENT_IN_USE',
          },
        });
      }

      await Ingredient.findByIdAndDelete(id);
      return res.json({
        success: true,
        data: { message: 'Ingredient permanently deleted from database', hardDeleted: true },
      });
    }

    // Soft delete
    ingredient.isActive = false;
    await ingredient.save();

    res.json({
      success: true,
      data: { message: 'Ingredient deactivated successfully (soft delete)', ingredient },
    });
  } catch (err) {
    next(err);
  }
}

