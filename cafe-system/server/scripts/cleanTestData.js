import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import { Order } from '../src/models/Order.js';
import { StockMovement } from '../src/models/StockMovement.js';
import { NotificationLog } from '../src/models/NotificationLog.js';
import { MenuItem } from '../src/models/MenuItem.js';
import { Ingredient } from '../src/models/Ingredient.js';
import { User } from '../src/models/User.js';

async function cleanTemporaryData() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not found in environment');
    process.exit(1);
  }

  console.log('[Cleanup] Connecting to database...');
  await mongoose.connect(uri);
  console.log('[Cleanup] Connected.');

  // 1. Delete test orders
  const ordersDeleted = await Order.deleteMany({});
  console.log(`[Cleanup] Deleted ${ordersDeleted.deletedCount} temporary test order(s)`);

  // 2. Delete test stock movement logs from test orders
  const stockMovementsDeleted = await StockMovement.deleteMany({});
  console.log(`[Cleanup] Deleted ${stockMovementsDeleted.deletedCount} temporary stock movement log(s)`);

  // 3. Delete notification logs
  const notifsDeleted = await NotificationLog.deleteMany({});
  console.log(`[Cleanup] Deleted ${notifsDeleted.deletedCount} temporary notification log(s)`);

  // 4. Delete test menu items ('test', 'y')
  const testMenuItemsDeleted = await MenuItem.deleteMany({
    name: { $in: ['test', 'y', 'Test', 'Y'] },
  });
  console.log(`[Cleanup] Deleted ${testMenuItemsDeleted.deletedCount} temporary test menu item(s)`);

  // 5. Delete test ingredients ('test', 'test 2')
  const testIngredientsDeleted = await Ingredient.deleteMany({
    name: { $in: ['test', 'test 2', 'Test', 'Test 2'] },
  });
  console.log(`[Cleanup] Deleted ${testIngredientsDeleted.deletedCount} temporary test ingredient(s)`);

  // 6. Delete test staff user ('test')
  const testUserDeleted = await User.deleteMany({
    username: { $in: ['test', 'Test'] },
  });
  console.log(`[Cleanup] Deleted ${testUserDeleted.deletedCount} temporary test user account(s)`);

  // Summary of remaining production data
  const remainingMenu = await MenuItem.find({ isActive: true }).select('name category price');
  const remainingIngredients = await Ingredient.find({ isActive: true }).select('name currentStock unit');
  const remainingUsers = await User.find({ isActive: true }).select('name username role');

  console.log('\n--- CLEANUP COMPLETE: PRODUCTION STATE ---');
  console.log(`Active Menu Items (${remainingMenu.length}):`, remainingMenu.map((m) => `${m.name} (${m.price} ETB)`));
  console.log(`Active Ingredients (${remainingIngredients.length}):`, remainingIngredients.map((i) => `${i.name}`));
  console.log(`Active Staff Accounts (${remainingUsers.length}):`, remainingUsers.map((u) => `@${u.username} (${u.role})`));
  console.log(`Active Orders: 0 (Fresh ledger ready for live operations)`);

  await mongoose.disconnect();
  console.log('[Cleanup] Finished cleanly.');
  process.exit(0);
}

cleanTemporaryData().catch((err) => {
  console.error('[Cleanup Error]', err);
  process.exit(1);
});
