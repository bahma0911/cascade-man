import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { connectDB, disconnectDB } from './config/db.js';
import { User } from './models/User.js';
import { Table } from './models/Table.js';
import { Ingredient } from './models/Ingredient.js';
import { MenuItem } from './models/MenuItem.js';
import { StockMovement } from './models/StockMovement.js';
import { Expense } from './models/Expense.js';

export async function seedDatabase(customUri, { includeSampleData = true } = {}) {
  console.log(`[Seed] Starting database seed process (includeSampleData: ${includeSampleData})...`);
  if (mongoose.connection.readyState !== 1) {
    await connectDB(customUri);
  }

  // Clear existing data
  console.log('[Seed] Clearing existing collections...');
  await Promise.all([
    User.deleteMany({}),
    Table.deleteMany({}),
    Ingredient.deleteMany({}),
    MenuItem.deleteMany({}),
    StockMovement.deleteMany({}),
    Expense.deleteMany({}),
  ]);

  // 1. Seed Users
  console.log('[Seed] Seeding users...');
  const saltRounds = 10;
  const adminPasswordHash = await bcrypt.hash('admin123', saltRounds);
  const waiterPasswordHash = await bcrypt.hash('waiter123', saltRounds);
  const kitchenPasswordHash = await bcrypt.hash('kitchen123', saltRounds);
  const baristaPasswordHash = await bcrypt.hash('barista123', saltRounds);

  const users = await User.create([
    {
      name: 'System Administrator',
      username: 'admin',
      passwordHash: adminPasswordHash,
      role: 'admin',
      canManageInventory: true,
      isActive: true,
    },
    {
      name: 'Abebe Bikila (Waiter + Inventory)',
      username: 'waiter_inv',
      passwordHash: waiterPasswordHash,
      role: 'waiter',
      canManageInventory: true,
      isActive: true,
    },
    {
      name: 'Chaltu Tola (Waiter)',
      username: 'waiter',
      passwordHash: waiterPasswordHash,
      role: 'waiter',
      canManageInventory: false,
      isActive: true,
    },
    {
      name: 'Chef Dawit (Kitchen)',
      username: 'kitchen',
      passwordHash: kitchenPasswordHash,
      role: 'kitchen',
      canManageInventory: false,
      isActive: true,
    },
    {
      name: 'Sara Alem (Barista)',
      username: 'barista',
      passwordHash: baristaPasswordHash,
      role: 'barista',
      canManageInventory: false,
      isActive: true,
    },
  ]);

  const adminUser = users[0];

  if (!includeSampleData) {
    console.log('[Seed] Minimal seed complete: Admin & Staff logins created. No sample data seeded.');
    return { users };
  }

  // 2. Seed Tables
  console.log('[Seed] Seeding tables...');
  const tables = await Table.create([
    { name: 'Table 1', isActive: true },
    { name: 'Table 2', isActive: true },
    { name: 'Table 3', isActive: true },
    { name: 'Table 4', isActive: true },
    { name: 'Table 5', isActive: true },
    { name: 'VIP Lounge', isActive: true },
    { name: 'Patio 1', isActive: true },
    { name: 'Patio 2', isActive: true },
  ]);

  // 3. Seed Ingredients (with Preparation Wastage configuration)
  console.log('[Seed] Seeding ingredients with preparation wastage configs & costs...');
  const now = new Date();
  const ingredientsData = [
    {
      name: 'Red Onion',
      baseUnit: 'g',
      currentStock: 25000, // 25 kg
      lowStockThreshold: 5000,
      referenceQty: 10000, // 10 kg
      expectedWastageQty: 500, // 500 g
      wastageRate: 0.05, // 5%
      autoWastageEnabled: true,
      costPerBaseUnit: 0.12, // 120 ETB/kg
      lastPurchasePrice: 0.12,
      lastPurchaseDate: now,
      isActive: true,
    },
    {
      name: 'Fresh Tomato',
      baseUnit: 'g',
      currentStock: 20000, // 20 kg
      lowStockThreshold: 4000,
      referenceQty: 5000, // 5 kg
      expectedWastageQty: 250, // 250 g
      wastageRate: 0.05, // 5%
      autoWastageEnabled: true,
      costPerBaseUnit: 0.10, // 100 ETB/kg
      lastPurchasePrice: 0.10,
      lastPurchaseDate: now,
      isActive: true,
    },
    {
      name: 'Beef Tenderloin',
      baseUnit: 'g',
      currentStock: 30000, // 30 kg
      lowStockThreshold: 6000,
      referenceQty: 10000, // 10 kg
      expectedWastageQty: 1000, // 1000 g
      wastageRate: 0.1, // 10% trim wastage
      autoWastageEnabled: true,
      costPerBaseUnit: 0.85, // 850 ETB/kg
      lastPurchasePrice: 0.85,
      lastPurchaseDate: now,
      isActive: true,
    },
    {
      name: 'Chicken Breast',
      baseUnit: 'g',
      currentStock: 25000, // 25 kg
      lowStockThreshold: 5000,
      referenceQty: 10000, // 10 kg
      expectedWastageQty: 800, // 800 g
      wastageRate: 0.08, // 8%
      autoWastageEnabled: true,
      costPerBaseUnit: 0.60, // 600 ETB/kg
      lastPurchasePrice: 0.60,
      lastPurchaseDate: now,
      isActive: true,
    },
    {
      name: 'Sidamo Coffee Beans',
      baseUnit: 'g',
      currentStock: 15000, // 15 kg
      lowStockThreshold: 3000,
      referenceQty: 1000,
      expectedWastageQty: 20,
      wastageRate: 0.02, // 2% grind retention
      autoWastageEnabled: true,
      costPerBaseUnit: 0.90, // 900 ETB/kg
      lastPurchasePrice: 0.90,
      lastPurchaseDate: now,
      isActive: true,
    },
    {
      name: 'Fresh Whole Milk',
      baseUnit: 'ml',
      currentStock: 40000, // 40 L
      lowStockThreshold: 10000,
      referenceQty: 1000,
      expectedWastageQty: 20,
      wastageRate: 0.02, // 2% steam pitch residue
      autoWastageEnabled: true,
      costPerBaseUnit: 0.08, // 80 ETB/L
      lastPurchasePrice: 0.08,
      lastPurchaseDate: now,
      isActive: true,
    },
    {
      name: 'Burger Bun',
      baseUnit: 'pcs',
      currentStock: 100,
      lowStockThreshold: 20,
      referenceQty: 0,
      expectedWastageQty: 0,
      wastageRate: 0,
      autoWastageEnabled: false,
      costPerBaseUnit: 25.0, // 25 ETB/pc
      lastPurchasePrice: 25.0,
      lastPurchaseDate: now,
      isActive: true,
    },
    {
      name: 'Cheese Slice',
      baseUnit: 'pcs',
      currentStock: 150,
      lowStockThreshold: 30,
      referenceQty: 0,
      expectedWastageQty: 0,
      wastageRate: 0,
      autoWastageEnabled: false,
      costPerBaseUnit: 15.0, // 15 ETB/pc
      lastPurchasePrice: 15.0,
      lastPurchaseDate: now,
      isActive: true,
    },
    {
      name: 'Berbere Spice',
      baseUnit: 'g',
      currentStock: 5000, // 5 kg
      lowStockThreshold: 1000,
      referenceQty: 0,
      expectedWastageQty: 0,
      wastageRate: 0,
      autoWastageEnabled: false,
      costPerBaseUnit: 0.35, // 350 ETB/kg
      lastPurchasePrice: 0.35,
      lastPurchaseDate: now,
      isActive: true,
    },
    {
      name: 'Cooking Oil',
      baseUnit: 'ml',
      currentStock: 20000, // 20 L
      lowStockThreshold: 4000,
      referenceQty: 0,
      expectedWastageQty: 0,
      wastageRate: 0,
      autoWastageEnabled: false,
      costPerBaseUnit: 0.22, // 220 ETB/L
      lastPurchasePrice: 0.22,
      lastPurchaseDate: now,
      isActive: true,
    },
    {
      name: 'Fresh Injera',
      baseUnit: 'pcs',
      currentStock: 80,
      lowStockThreshold: 20,
      referenceQty: 0,
      expectedWastageQty: 0,
      wastageRate: 0,
      autoWastageEnabled: false,
      costPerBaseUnit: 15.0, // 15 ETB/pc
      lastPurchasePrice: 15.0,
      lastPurchaseDate: now,
      isActive: true,
    },
  ];

  const ingredients = await Ingredient.create(ingredientsData);
  const ingredientMap = {};
  ingredients.forEach((ing) => {
    ingredientMap[ing.name] = ing;
  });

  // 4. Record Initial Stock Movement for opening inventory
  console.log('[Seed] Recording initial stock movement ledger entry...');
  const initialLines = ingredients.map((ing) => ({
    ingredient: ing._id,
    quantity: ing.currentStock,
    before: 0,
    after: ing.currentStock,
  }));

  await StockMovement.create({
    type: 'initial',
    lines: initialLines,
    reasonCode: 'initial_stock',
    note: 'System initialization stock seeding',
    performedBy: adminUser._id,
  });

  // 5. Seed Menu Items with Recipes
  console.log('[Seed] Seeding menu items and recipes...');
  const menuItemsData = [
    {
      name: 'Ethiopian Beef Tibs',
      category: 'Hot Dishes',
      itemType: 'food',
      price: 450, // 450 ETB
      recipe: [
        { ingredient: ingredientMap['Beef Tenderloin']._id, quantity: 250 },
        { ingredient: ingredientMap['Red Onion']._id, quantity: 100 },
        { ingredient: ingredientMap['Fresh Tomato']._id, quantity: 50 },
        { ingredient: ingredientMap['Cooking Oil']._id, quantity: 30 },
        { ingredient: ingredientMap['Berbere Spice']._id, quantity: 15 },
        { ingredient: ingredientMap['Fresh Injera']._id, quantity: 2 },
      ],
      isAvailable: true,
      isActive: true,
    },
    {
      name: 'Special Doro Wat',
      category: 'Traditional',
      itemType: 'food',
      price: 550, // 550 ETB
      recipe: [
        { ingredient: ingredientMap['Chicken Breast']._id, quantity: 300 },
        { ingredient: ingredientMap['Red Onion']._id, quantity: 150 },
        { ingredient: ingredientMap['Berbere Spice']._id, quantity: 30 },
        { ingredient: ingredientMap['Cooking Oil']._id, quantity: 40 },
        { ingredient: ingredientMap['Fresh Injera']._id, quantity: 2 },
      ],
      isAvailable: true,
      isActive: true,
    },
    {
      name: 'Classic Beef Burger',
      category: 'Burgers',
      itemType: 'food',
      price: 380, // 380 ETB
      recipe: [
        { ingredient: ingredientMap['Burger Bun']._id, quantity: 1 },
        { ingredient: ingredientMap['Beef Tenderloin']._id, quantity: 180 },
        { ingredient: ingredientMap['Red Onion']._id, quantity: 30 },
        { ingredient: ingredientMap['Fresh Tomato']._id, quantity: 40 },
        { ingredient: ingredientMap['Cheese Slice']._id, quantity: 1 },
        { ingredient: ingredientMap['Cooking Oil']._id, quantity: 10 },
      ],
      isAvailable: true,
      isActive: true,
    },
    {
      name: 'Ethiopian Macchiato',
      category: 'Hot Beverages',
      itemType: 'drink',
      price: 60, // 60 ETB
      recipe: [
        { ingredient: ingredientMap['Sidamo Coffee Beans']._id, quantity: 18 },
        { ingredient: ingredientMap['Fresh Whole Milk']._id, quantity: 120 },
      ],
      isAvailable: true,
      isActive: true,
    },
    {
      name: 'Single Espresso',
      category: 'Hot Beverages',
      itemType: 'drink',
      price: 45, // 45 ETB
      recipe: [
        { ingredient: ingredientMap['Sidamo Coffee Beans']._id, quantity: 18 },
      ],
      isAvailable: true,
      isActive: true,
    },
    {
      name: 'Cafe Latte',
      category: 'Hot Beverages',
      itemType: 'drink',
      price: 75, // 75 ETB
      recipe: [
        { ingredient: ingredientMap['Sidamo Coffee Beans']._id, quantity: 18 },
        { ingredient: ingredientMap['Fresh Whole Milk']._id, quantity: 220 },
      ],
      isAvailable: true,
      isActive: true,
    },
  ];

  await MenuItem.create(menuItemsData);

  // 6. Seed Operating Expenses (Section 14.G)
  console.log('[Seed] Seeding sample operating expenses...');
  await Expense.create([
    {
      category: 'electricity',
      amount: 3500,
      description: 'Monthly electricity bill for kitchen equipment',
      date: new Date(),
      recordedBy: adminUser._id,
    },
    {
      category: 'water',
      amount: 1200,
      description: 'Monthly water supply bill',
      date: new Date(),
      recordedBy: adminUser._id,
    },
    {
      category: 'gas',
      amount: 2400,
      description: 'Two commercial butane gas refill cylinders',
      date: new Date(),
      recordedBy: adminUser._id,
    },
    {
      category: 'cleaning',
      amount: 850,
      description: 'Dishwashing detergent and kitchen surface sanitizers',
      date: new Date(),
      recordedBy: adminUser._id,
    },
  ]);

  console.log('[Seed] Database seeded successfully!');
  console.log('--- Default User Credentials ---');
  console.log('Admin:       username: admin       | password: admin123');
  console.log('Waiter+Inv:  username: waiter_inv  | password: waiter123');
  console.log('Waiter:      username: waiter      | password: waiter123');
  console.log('Kitchen:     username: kitchen     | password: kitchen123');
  console.log('Barista:     username: barista     | password: barista123');
  console.log('--------------------------------');

  return { users, tables, ingredients, menuItemsCount: menuItemsData.length };
}

export async function seedMinimal(customUri) {
  return seedDatabase(customUri, { includeSampleData: false });
}

// Allow direct CLI execution: `node src/seed.js [--sample]`
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  const includeSample = process.argv.includes('--sample');
  seedDatabase(null, { includeSampleData: includeSample })
    .then(async () => {
      await disconnectDB();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('[Seed Error] Seeding failed:', err);
      await disconnectDB();
      process.exit(1);
    });
}

