import mongoose from 'mongoose';

const ingredientSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    baseUnit: {
      type: String,
      enum: ['g', 'ml', 'pcs'],
      required: true,
    },
    currentStock: {
      type: Number,
      required: true,
      default: 0,
    },
    lowStockThreshold: {
      type: Number,
      required: true,
      default: 0,
    },
    // Section 13: Automatic Preparation Wastage Management
    expectedWastageQty: {
      type: Number,
      default: 0,
      min: 0,
    },
    referenceQty: {
      type: Number,
      default: 0,
      min: 0,
    },
    wastageRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 0.9999, // Rate between 0 and < 1.0 (e.g. 0.05 for 5%)
    },
    autoWastageEnabled: {
      type: Boolean,
      default: false,
    },
    // Section 14.D: Weighted Average Costing & Purchasing
    costPerBaseUnit: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastPurchasePrice: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastPurchaseDate: {
      type: Date,
      default: null,
    },
    // Section 15.C: De-duplication alert tracking flags
    isLowStockAlertActive: {
      type: Boolean,
      default: false,
    },
    isCriticalStockAlertActive: {
      type: Boolean,
      default: false,
    },
    lastAlertSentAt: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
ingredientSchema.index({ isActive: 1, currentStock: 1 });

export const Ingredient = mongoose.model('Ingredient', ingredientSchema);

