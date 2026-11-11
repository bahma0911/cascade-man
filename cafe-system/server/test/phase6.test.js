import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { seedDatabase } from '../src/seed.js';
import { Table } from '../src/models/Table.js';
import { MenuItem } from '../src/models/MenuItem.js';
import { Ingredient } from '../src/models/Ingredient.js';

describe('Reporting Engine, Low Stock Alerts & Audit', () => {
  let replSet;
  let adminToken;
  let waiterToken;
  let kitchenToken;

  before(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const uri = replSet.getUri();
    await connectDB(uri);
    await seedDatabase(uri);

    const adminLogin = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    adminToken = adminLogin.body.data.token;

    const waiterLogin = await request(app).post('/api/auth/login').send({ username: 'waiter', password: 'waiter123' });
    waiterToken = waiterLogin.body.data.token;

    const kitchenLogin = await request(app).post('/api/auth/login').send({ username: 'kitchen', password: 'kitchen123' });
    kitchenToken = kitchenLogin.body.data.token;

    // Place an order to populate sales and stock movements
    const table = await Table.findOne({ name: 'Table 1' });
    const burger = await MenuItem.findOne({ name: 'Classic Beef Burger' });
    const macchiato = await MenuItem.findOne({ name: 'Ethiopian Macchiato' });

    await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${waiterToken}`)
      .send({
        tableId: table._id.toString(),
        items: [
          { menuItemId: burger._id.toString(), quantity: 2 },
          { menuItemId: macchiato._id.toString(), quantity: 3 },
        ],
      });

    // Record kitchen prep waste for Onion
    const onion = await Ingredient.findOne({ name: 'Red Onion' });
    await request(app)
      .post('/api/inventory/waste')
      .set('Authorization', `Bearer ${kitchenToken}`)
      .send({
        lines: [{ ingredientId: onion._id.toString(), quantity: 60, preparedQty: 450 }],
        reasonCode: 'prep_waste',
        note: 'Burger batch prep test',
      });
  });

  after(async () => {
    await disconnectDB();
    if (replSet) {
      await replSet.stop();
    }
  });

  test('Access Control: Non-admin users cannot access reports', async () => {
    const waiterRes = await request(app)
      .get('/api/reports/sales')
      .set('Authorization', `Bearer ${waiterToken}`);
    assert.equal(waiterRes.status, 403);

    const kitchenRes = await request(app)
      .get('/api/reports/low-stock')
      .set('Authorization', `Bearer ${kitchenToken}`);
    assert.equal(kitchenRes.status, 403);
  });

  test('GET /api/reports/sales: Aggregates revenue and order counts by period', async () => {
    const res = await request(app)
      .get('/api/reports/sales?period=day')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.summary.totalRevenue > 0);
    assert.ok(res.body.data.summary.totalOrders >= 1);
    assert.ok(Array.isArray(res.body.data.sales));
    assert.ok(res.body.data.sales.length >= 1);
  });

  test('GET /api/reports/top-selling: Ranks dishes by sales volume', async () => {
    const res = await request(app)
      .get('/api/reports/top-selling?limit=5')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    const items = res.body.data.items;
    assert.ok(items.length >= 2);
    assert.equal(items[0].name, 'Ethiopian Macchiato');
    assert.equal(items[0].totalQuantity, 3);
  });

  test('GET /api/reports/ingredient-usage: Tracks deducted raw & usable ingredients', async () => {
    const res = await request(app)
      .get('/api/reports/ingredient-usage')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    const usage = res.body.data.usage;
    assert.ok(usage.length > 0);
    const onionUsage = usage.find((u) => u.name === 'Red Onion');
    assert.ok(onionUsage);
    assert.ok(onionUsage.totalGrossDeducted > 0);
    assert.ok(onionUsage.totalExpectedWastage > 0);
  });

  test('GET /api/reports/low-stock: Returns ingredients at or below threshold', async () => {
    // Force an ingredient into low stock
    const bun = await Ingredient.findOne({ name: 'Burger Bun' });
    bun.currentStock = 10; // threshold is 20
    await bun.save();

    const res = await request(app)
      .get('/api/reports/low-stock')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.lowStockItems.length > 0);
    const bunLow = res.body.data.lowStockItems.find((i) => i.name === 'Burger Bun');
    assert.ok(bunLow);
    assert.equal(bunLow.currentStock, 10);
    assert.equal(bunLow.deficit, 10);
  });

  test('GET /api/reports/preparation-wastage: Compares expected vs actual kitchen wastage', async () => {
    const res = await request(app)
      .get('/api/reports/preparation-wastage')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data.summary));
    assert.ok(Array.isArray(res.body.data.detailedLogs));

    const onionSummary = res.body.data.summary.find((s) => s.ingredientName === 'Red Onion');
    assert.ok(onionSummary);
    assert.equal(onionSummary.configuredRatePercent, 5.0);
    assert.ok(onionSummary.expectedWastage > 0);
    assert.equal(onionSummary.actualRecordedWastage, 60);

    const onionLog = res.body.data.detailedLogs.find((l) => l.ingredientName === 'Red Onion');
    assert.ok(onionLog);
    assert.equal(onionLog.actualWastageQty, 60);
    assert.equal(onionLog.employee.role, 'kitchen');
  });
});
