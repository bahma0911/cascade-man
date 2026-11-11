import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import { Table } from '../src/models/Table.js';
import { Ingredient } from '../src/models/Ingredient.js';
import { MenuItem } from '../src/models/MenuItem.js';
import { StockMovement } from '../src/models/StockMovement.js';
import { Order } from '../src/models/Order.js';
import { Expense } from '../src/models/Expense.js';
import { User } from '../src/models/User.js';

async function wipeHardcodedData() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not found in environment');
    process.exit(1);
  }

  console.log('[Wipe] Connecting to MongoDB Atlas database...');
  await mongoose.connect(uri);
  console.log('[Wipe] Connected successfully.');

  // Remove all hardcoded tables
  const tablesResult = await Table.deleteMany({});
  console.log(`[Wipe] Removed ${tablesResult.deletedCount} table(s).`);

  // Remove all hardcoded ingredients
  const ingredientsResult = await Ingredient.deleteMany({});
  console.log(`[Wipe] Removed ${ingredientsResult.deletedCount} ingredient(s).`);

  // Remove all hardcoded menu items
  const menuResult = await MenuItem.deleteMany({});
  console.log(`[Wipe] Removed ${menuResult.deletedCount} menu item(s).`);

  // Remove any remaining stock movements or orders
  const stockResult = await StockMovement.deleteMany({});
  console.log(`[Wipe] Removed ${stockResult.deletedCount} stock movement log(s).`);

  const orderResult = await Order.deleteMany({});
  console.log(`[Wipe] Removed ${orderResult.deletedCount} order(s).`);

  const expenseResult = await Expense.deleteMany({});
  console.log(`[Wipe] Removed ${expenseResult.deletedCount} expense(s).`);

  // Verify users remain
  const usersCount = await User.countDocuments();
  console.log(`\n[Wipe Complete] Staff & Admin Accounts intact: ${usersCount} users.`);

  const tablesCount = await Table.countDocuments();
  const ingredientsCount = await Ingredient.countDocuments();
  const menuCount = await MenuItem.countDocuments();

  console.log('--- CURRENT PRODUCTION DATABASE STATUS ---');
  console.log(`Tables: ${tablesCount} (Ready for your custom tables)`);
  console.log(`Ingredients: ${ingredientsCount} (Ready for your real inventory)`);
  console.log(`Menu Items: ${menuCount} (Ready for your real cafe menu)`);
  console.log(`Users: ${usersCount} (Admin and staff logins preserved)`);

  await mongoose.disconnect();
  console.log('[Wipe] Disconnected.');
  process.exit(0);
}

wipeHardcodedData().catch((err) => {
  console.error('[Wipe Error]', err);
  process.exit(1);
});
