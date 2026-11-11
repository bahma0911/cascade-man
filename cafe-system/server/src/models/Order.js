import mongoose from 'mongoose';

const orderRecipeSnapshotSchema = new mongoose.Schema(
  {
    ingredient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ingredient',
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },
    // Optional metadata captured at order time for wastage tracking
    wastageRate: {
      type: Number,
      default: 0,
    },
    grossQuantity: {
      type: Number,
      default: 0,
    },
  },
  { _id: false }
);

const orderItemSchema = new mongoose.Schema({
  nameSnapshot: {
    type: String,
    required: true,
  },
  priceSnapshot: {
    type: Number,
    required: true,
    min: 0,
  },
  categorySnapshot: {
    type: String,
    default: '',
    trim: true,
  },
  itemType: {
    type: String,
    enum: ['food', 'drink'],
    default: 'food',
    index: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  note: {
    type: String,
    default: '',
    trim: true,
  },
  status: {
    type: String,
    enum: ['pending', 'preparing', 'ready', 'served', 'cancelled'],
    default: 'pending',
    index: true,
  },
  recipeSnapshot: {
    type: [orderRecipeSnapshotSchema],
    default: [],
  },
  addedAt: {
    type: Date,
    default: Date.now,
  },
  cancelReason: {
    type: String,
    default: '',
    trim: true,
  },
  cancelledAfterPrep: {
    type: Boolean,
    default: false,
  },
});

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: Number,
      required: true,
      index: true,
    },
    table: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Table',
      required: true,
    },
    waiter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['open', 'closed', 'cancelled'],
      default: 'open',
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'transfer'],
      default: null,
      index: true,
    },
    cancelReason: {
      type: String,
      default: '',
      trim: true,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    lateEntry: {
      type: Boolean,
      default: false,
    },
    closedAt: {
      type: Date,
      default: null,
    },
    items: {
      type: [orderItemSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Indexes specified in brief:
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ table: 1, status: 1 });
orderSchema.index({ waiter: 1, createdAt: -1 });
orderSchema.index({ createdAt: -1, status: 1 });

// Helper virtual to calculate non-cancelled total
orderSchema.virtual('totalAmount').get(function () {
  if (!this.items) return 0;
  return this.items
    .filter((item) => item.status !== 'cancelled')
    .reduce((sum, item) => sum + item.priceSnapshot * item.quantity, 0);
});

orderSchema.set('toJSON', { virtuals: true });
orderSchema.set('toObject', { virtuals: true });

export const Order = mongoose.model('Order', orderSchema);

