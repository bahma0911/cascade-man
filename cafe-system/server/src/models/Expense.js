import mongoose from 'mongoose';

const expenseSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      enum: ['electricity', 'water', 'rent', 'salaries', 'gas', 'cleaning', 'other'],
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: [0.01, 'Expense amount must be greater than zero'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: 250,
      default: '',
    },
    date: {
      type: Date,
      default: Date.now,
      index: true,
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for filtering expenses by date range and category
expenseSchema.index({ date: -1, category: 1 });

export const Expense = mongoose.model('Expense', expenseSchema);

