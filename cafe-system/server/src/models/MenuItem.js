import mongoose from 'mongoose';

const recipeItemSchema = new mongoose.Schema(
  {
    ingredient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ingredient',
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0.0001,
    },
  },
  { _id: false }
);

const menuItemSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    itemType: {
      type: String,
      enum: ['food', 'drink'],
      default: 'food',
      index: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    recipe: {
      type: [recipeItemSchema],
      default: [],
    },
    isAvailable: {
      type: Boolean,
      default: true,
      index: true,
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

menuItemSchema.index({ category: 1, isActive: 1 });

export const MenuItem = mongoose.model('MenuItem', menuItemSchema);

