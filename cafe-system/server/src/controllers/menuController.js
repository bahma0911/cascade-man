import { z } from 'zod';
import mongoose from 'mongoose';
import { MenuItem } from '../models/MenuItem.js';
import { Ingredient } from '../models/Ingredient.js';

export function determineItemType(item) {
  if (item?.itemType === 'drink' || item?.itemType === 'food') {
    return item.itemType;
  }
  const cat = (item?.category || '').toLowerCase();
  const name = (item?.name || '').toLowerCase();
  const drinkKeywords = [
    'drink',
    'beverage',
    'coffee',
    'tea',
    'juice',
    'smoothie',
    'macchiato',
    'latte',
    'espresso',
    'cappuccino',
    'water',
    'soda',
    'cocktail',
    'mocktail',
    'milk',
    'shake',
  ];
  if (drinkKeywords.some((k) => cat.includes(k) || name.includes(k))) {
    return 'drink';
  }
  return 'food';
}

const recipeItemSchema = z.object({
  ingredient: z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
    message: 'Invalid ingredient ID',
  }),
  quantity: z.number().positive('Quantity must be greater than 0'),
});

export const createMenuItemSchema = z.object({
  name: z.string().trim().min(1, 'Item name is required').max(100),
  category: z.string().trim().min(1, 'Category is required').max(50),
  itemType: z.enum(['food', 'drink']).optional(),
  price: z.number().min(0, 'Price must be positive'),
  recipe: z.array(recipeItemSchema).default([]),
  isAvailable: z.boolean().default(true),
});

export const updateMenuItemSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  category: z.string().trim().min(1).max(50).optional(),
  itemType: z.enum(['food', 'drink']).optional(),
  price: z.number().min(0).optional(),
  recipe: z.array(recipeItemSchema).optional(),
  isAvailable: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export async function getMenuItems(req, res, next) {
  try {
    const filter = req.query.all === 'true' && req.user.role === 'admin' ? {} : { isActive: true };
    if (req.query.category) {
      filter.category = req.query.category;
    }

    const items = await MenuItem.find(filter)
      .populate('recipe.ingredient', 'name baseUnit currentStock lowStockThreshold autoWastageEnabled wastageRate costPerBaseUnit')
      .sort({ category: 1, name: 1 });

    // Distinct categories for filtering
    const categories = await MenuItem.distinct('category', { isActive: true });

    res.json({
      success: true,
      data: {
        items,
        categories,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function createMenuItem(req, res, next) {
  try {
    const { name, category, price, recipe = [], isAvailable = true, itemType } = req.body;

    // Validate that all recipe ingredients exist
    if (recipe.length > 0) {
      const ingredientIds = recipe.map((r) => r.ingredient);
      const existingIngredients = await Ingredient.find({
        _id: { $in: ingredientIds },
        isActive: true,
      });

      if (existingIngredients.length !== ingredientIds.length) {
        return res.status(400).json({
          success: false,
          error: { message: 'One or more ingredients in recipe do not exist or are inactive', code: 'INVALID_INGREDIENT' },
        });
      }
    }

    const resolvedItemType = itemType || determineItemType({ name, category, itemType });

    const menuItem = await MenuItem.create({
      name,
      category,
      itemType: resolvedItemType,
      price,
      recipe,
      isAvailable,
      isActive: true,
    });

    const populated = await menuItem.populate(
      'recipe.ingredient',
      'name baseUnit currentStock lowStockThreshold autoWastageEnabled wastageRate costPerBaseUnit'
    );

    res.status(201).json({
      success: true,
      data: { item: populated },
    });
  } catch (err) {
    next(err);
  }
}

export async function updateMenuItem(req, res, next) {
  try {
    const { id } = req.params;
    const menuItem = await MenuItem.findById(id);
    if (!menuItem) {
      return res.status(404).json({
        success: false,
        error: { message: 'Menu item not found', code: 'NOT_FOUND' },
      });
    }

    const { name, category, price, recipe, isAvailable, isActive, itemType } = req.body;

    if (name !== undefined) menuItem.name = name;
    if (category !== undefined) menuItem.category = category;
    if (itemType !== undefined) menuItem.itemType = itemType;
    if (price !== undefined) menuItem.price = price;
    if (isAvailable !== undefined) menuItem.isAvailable = isAvailable;
    if (isActive !== undefined) menuItem.isActive = isActive;

    if (recipe !== undefined) {
      // Validate ingredients
      if (recipe.length > 0) {
        const ingredientIds = recipe.map((r) => r.ingredient);
        const count = await Ingredient.countDocuments({ _id: { $in: ingredientIds }, isActive: true });
        if (count !== ingredientIds.length) {
          return res.status(400).json({
            success: false,
            error: { message: 'One or more ingredients in recipe do not exist or are inactive', code: 'INVALID_INGREDIENT' },
          });
        }
      }
      menuItem.recipe = recipe;
    }

    await menuItem.save();

    const populated = await menuItem.populate(
      'recipe.ingredient',
      'name baseUnit currentStock lowStockThreshold autoWastageEnabled wastageRate costPerBaseUnit'
    );

    res.json({
      success: true,
      data: { item: populated },
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteMenuItem(req, res, next) {
  try {
    const { id } = req.params;
    const menuItem = await MenuItem.findById(id);
    if (!menuItem) {
      return res.status(404).json({
        success: false,
        error: { message: 'Menu item not found', code: 'NOT_FOUND' },
      });
    }

    if (req.query.permanent === 'true' || req.query.force === 'true') {
      await MenuItem.findByIdAndDelete(id);
      return res.json({
        success: true,
        data: { message: 'Menu item permanently deleted from database', hardDeleted: true },
      });
    }

    // Soft delete
    menuItem.isActive = false;
    await menuItem.save();

    res.json({
      success: true,
      data: { message: 'Menu item deactivated successfully (soft delete)', item: menuItem },
    });
  } catch (err) {
    next(err);
  }
}

