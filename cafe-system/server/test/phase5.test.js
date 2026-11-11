import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { seedDatabase } from '../src/seed.js';
import { Ingredient } from '../src/models/Ingredient.js';
import { StockMovement } from '../src/models/StockMovement.js';

describe('PInventory Tools, Ledger Audit & Prep Wastage', () => {
  let replSet;
  let adminToken;
  let waiterInvToken;
  let waiterToken;
  let kitchenToken;

  before(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const uri = replSet.getUri();
    await connectDB(uri);
    await seedDatabase(uri);

    const adminLogin = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    adminToken = adminLogin.body.data.token;

    const waiterInvLogin = await request(app).post('/api/auth/login').send({ username: 'waiter_inv', password: 'waiter123' });
    waiterInvToken = waiterInvLogin.body.data.token;

    const waiterLogin = await request(app).post('/api/auth/login').send({ username: 'waiter', password: 'waiter123' });
    waiterToken = waiterLogin.body.data.token;

    const kitchenLogin = await request(app).post('/api/auth/login').send({ username: 'kitchen', password: 'kitchen123' });
    kitchenToken = kitchenLogin.body.data.token;
  });

  after(async () => {
    await disconnectDB();
    if (replSet) {
      await replSet.stop();
    }
  });

  // --- 1. DELIVERIES ---
  test('Standard waiter cannot record delivery, but waiter with permission adds stock cleanly', async () => {
    const milk = await Ingredient.findOne({ name: 'Fresh Whole Milk' });
    const stockBefore = milk.currentStock;

    // Standard waiter rejected
    const rejRes = await request(app)
      .post('/api/inventory/deliveries')
      .set('Authorization', `Bearer ${waiterToken}`)
      .send({
        lines: [{ ingredientId: milk._id, quantity: 5000 }],
      });
    assert.equal(rejRes.status, 403);

    // Waiter with inventory permission succeeds
    const succRes = await request(app)
      .post('/api/inventory/deliveries')
      .set('Authorization', `Bearer ${waiterInvToken}`)
      .send({
        lines: [{ ingredientId: milk._id, quantity: 5000 }],
        note: 'Fresh morning dairy supplier receipt #1042',
      });

    assert.equal(succRes.status, 201);
    const updatedMilk = await Ingredient.findById(milk._id);
    assert.equal(updatedMilk.currentStock, stockBefore + 5000);

    // Verify StockMovement recorded
    const movement = await StockMovement.findOne({
      type: 'delivery',
      'lines.ingredient': milk._id,
      note: 'Fresh morning dairy supplier receipt #1042',
    });
    assert.ok(movement);
    assert.equal(movement.lines[0].quantity, 5000);
    assert.equal(movement.lines[0].before, stockBefore);
    assert.equal(movement.lines[0].after, stockBefore + 5000);
  });

  // --- 2. GENERAL WASTE LOG ---
  test('Recording waste deducts stock and records movement with reasonCode', async () => {
    const tomato = await Ingredient.findOne({ name: 'Fresh Tomato' });
    const stockBefore = tomato.currentStock;

    const res = await request(app)
      .post('/api/inventory/waste')
      .set('Authorization', `Bearer ${waiterInvToken}`)
      .send({
        lines: [{ ingredientId: tomato._id, quantity: 1200 }],
        reasonCode: 'spoilage',
        note: 'Damaged tomatoes discovered in walk-in chiller',
      });

    assert.equal(res.status, 201);
    const updatedTomato = await Ingredient.findById(tomato._id);
    assert.equal(updatedTomato.currentStock, stockBefore - 1200);

    const movement = await StockMovement.findOne({
      type: 'waste',
      reasonCode: 'spoilage',
      'lines.ingredient': tomato._id,
    });
    assert.ok(movement);
    assert.equal(movement.lines[0].quantity, -1200);
  });

  // --- 3. SECTION 13 KITCHEN PREPARATION WASTAGE ---
  test('Kitchen staff can record actual preparation wastage with batch quantity and reason prep_waste', async () => {
    const onion = await Ingredient.findOne({ name: 'Red Onion' });
    const stockBefore = onion.currentStock;

    // Kitchen staff logs prep trim waste
    const res = await request(app)
      .post('/api/inventory/waste')
      .set('Authorization', `Bearer ${kitchenToken}`)
      .send({
        lines: [
          {
            ingredientId: onion._id,
            quantity: 580, // Actual wasted quantity
            preparedQty: 10000, // Batch quantity processed
          },
        ],
        reasonCode: 'prep_waste',
        note: 'Morning doro wat onion peeling & trimming',
      });

    assert.equal(res.status, 201);
    const updatedOnion = await Ingredient.findById(onion._id);
    assert.equal(updatedOnion.currentStock, stockBefore - 580);

    const movement = await StockMovement.findOne({
      type: 'waste',
      reasonCode: 'prep_waste',
      'lines.ingredient': onion._id,
    });
    assert.ok(movement);
    assert.equal(movement.lines[0].actualWastageQty, 580);
    assert.equal(movement.lines[0].usableQty, 10000);
    assert.equal(movement.lines[0].quantity, -580);
  });

  // --- 4. PHYSICAL STOCK COUNT RECONCILIATION ---
  test('Stock count updates inventory to counted amount and logs count_adjustment variance', async () => {
    const beef = await Ingredient.findOne({ name: 'Beef Tenderloin' });
    const systemFigure = beef.currentStock;
    const countedFigure = systemFigure - 450; // Variance: -450g

    const res = await request(app)
      .post('/api/inventory/counts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        counts: [{ ingredientId: beef._id, countedQuantity: countedFigure }],
        note: 'End-of-week physical count audit',
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.data.countAdjusted, true);

    const updatedBeef = await Ingredient.findById(beef._id);
    assert.equal(updatedBeef.currentStock, countedFigure);

    const movement = await StockMovement.findOne({
      type: 'count_adjustment',
      'lines.ingredient': beef._id,
    });
    assert.ok(movement);
    assert.equal(movement.lines[0].quantity, -450);
    assert.equal(movement.lines[0].before, systemFigure);
    assert.equal(movement.lines[0].after, countedFigure);
  });

  // --- 5. LEDGER CORRECTIONS (ADMIN ONLY) ---
  test('Only administrator can create a ledger correction movement', async () => {
    const chicken = await Ingredient.findOne({ name: 'Chicken Breast' });
    const stockBefore = chicken.currentStock;

    // Waiter rejected
    const rejRes = await request(app)
      .post('/api/inventory/corrections')
      .set('Authorization', `Bearer ${waiterInvToken}`)
      .send({
        lines: [{ ingredientId: chicken._id, quantity: 300 }],
        note: 'Fixing typo on delivery ticket #102',
      });
    assert.equal(rejRes.status, 403);

    // Admin succeeds
    const succRes = await request(app)
      .post('/api/inventory/corrections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        lines: [{ ingredientId: chicken._id, quantity: 300 }],
        note: 'Fixing typo on delivery ticket #102',
      });

    assert.equal(succRes.status, 201);
    const updatedChicken = await Ingredient.findById(chicken._id);
    assert.equal(updatedChicken.currentStock, stockBefore + 300);

    const movement = await StockMovement.findOne({
      type: 'correction',
      'lines.ingredient': chicken._id,
    });
    assert.ok(movement);
    assert.equal(movement.lines[0].quantity, 300);
  });

  // --- 6. MOVEMENTS AUDIT TRAIL QUERY ---
  test('Audit trail endpoint returns paginated stock movements with populates', async () => {
    const res = await request(app)
      .get('/api/inventory/movements')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    assert.ok(res.body.data.movements.length > 0);
    assert.ok(res.body.data.pagination.total > 0);

    const sample = res.body.data.movements[0];
    assert.ok(sample.performedBy.username);
    assert.ok(sample.lines[0].ingredient.name);
  });
});

