import mongoose from 'mongoose';

const stockMovementLineSchema = new mongoose.Schema(
  {
    ingredient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ingredient',
      required: true,
      index: true,
    },
    // Signed delta in base unit (e.g. -500 for sale/waste, +1000 for delivery)
    quantity: {
      type: Number,
      required: true,
    },
    before: {
      type: Number,
      required: true,
    },
    after: {
      type: Number,
      required: true,
    },
    // Section 13 & breakdown fields
    usableQty: {
      type: Number,
      default: 0,
    },
    expectedWastageQty: {
      type: Number,
      default: 0,
    },
    actualWastageQty: {
      type: Number,
      default: 0,
    },
    // Section 14.D: Unit and Total Cost Snapshot at Event Time (ETB)
    unitCost: {
      type: Number,
      default: 0,
    },
    totalCost: {
      type: Number,
      default: 0,
    },
  },
  { _id: false }
);

const stockMovementSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        'sale',
        'sale_reversal',
        'delivery',
        'waste',
        'count_adjustment',
        'initial',
        'correction',
      ],
      required: true,
      index: true,
    },
    lines: {
      type: [stockMovementLineSchema],
      required: true,
      validate: [(val) => val.length > 0, 'Movement must have at least one line'],
    },
    reasonCode: {
      type: String,
      trim: true,
      default: '',
    },
    note: {
      type: String,
      trim: true,
      maxlength: 250,
      default: '',
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
      index: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Append-only, no updates
  }
);

// Indexes
stockMovementSchema.index({ createdAt: -1 });
stockMovementSchema.index({ type: 1, createdAt: -1 });
stockMovementSchema.index({ 'lines.ingredient': 1, createdAt: -1 });

export const StockMovement = mongoose.model('StockMovement', stockMovementSchema);

