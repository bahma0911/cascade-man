import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { seedDatabase } from '../src/seed.js';
import { Ingredient } from '../src/models/Ingredient.js';
import { MenuItem } from '../src/models/MenuItem.js';
import { Table } from '../src/models/Table.js';
import { Order } from '../src/models/Order.js';
import { StockMovement } from '../src/models/StockMovement.js';

describe('Orders API, stockService Transactions & Concurrency', () => {
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
  });

  after(async () => {
    await disconnectDB();
    if (replSet) {
      await replSet.stop();
    }
  });

  // --- 1. DEDUCTION TEST ---
  test('Order placement atomically deducts stock with wastage and records sale movement', async () => {
    const table = await Table.findOne({ name: 'Table 1' });
    const macchiato = await MenuItem.findOne({ name: 'Ethiopian Macchiato' }); // Recipe: Sidamo Coffee (18g, 2% wastage), Milk (120ml, 2% wastage)
    const coffeeIng = await Ingredient.findOne({ name: 'Sidamo Coffee Beans' });

    const initialCoffeeStock = coffeeIng.currentStock;

    // Usable = 18g. Wastage rate = 0.02. Gross = 18 / 0.98 = 18.3673g
    const expectedGrossCoffee = Number((18 / (1 - coffeeIng.wastageRate)).toFixed(4));

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${waiterToken}`)
      .send({
        tableId: table._id,
        items: [{ menuItemId: macchiato._id, quantity: 1, note: 'Extra hot' }],
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.order.items.length, 1);
    assert.equal(res.body.data.order.orderNumber, 1);

    const orderId = res.body.data.order._id;

    // Verify stock deduction
    const updatedCoffee = await Ingredient.findById(coffeeIng._id);
    const actualDeducted = Number((initialCoffeeStock - updatedCoffee.currentStock).toFixed(4));
    assert.equal(actualDeducted, expectedGrossCoffee);

    // Verify StockMovement recorded
    const movement = await StockMovement.findOne({ order: orderId, type: 'sale' });
    assert.ok(movement);
    assert.equal(movement.lines.length, 2); // Coffee + Milk
    const coffeeLine = movement.lines.find((l) => l.ingredient.toString() === coffeeIng._id.toString());
    assert.ok(coffeeLine);
    assert.equal(coffeeLine.quantity, -expectedGrossCoffee);
    assert.equal(coffeeLine.usableQty, 18);
  });

  // --- 2. REVERSAL TEST ---
  test('Pending item cancellation restores stock via sale_reversal, while preparing cancellation flags waste', async () => {
    const table = await Table.findOne({ name: 'Table 2' });
    const espresso = await MenuItem.findOne({ name: 'Single Espresso' }); // 18g Coffee, 2% wastage
    const coffeeIng = await Ingredient.findOne({ name: 'Sidamo Coffee Beans' });

    // Create order
    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${waiterToken}`)
      .send({
        tableId: table._id,
        items: [{ menuItemId: espresso._id, quantity: 1 }],
      });

    const orderId = orderRes.body.data.order._id;
    const itemId = orderRes.body.data.order.items[0]._id;

    const stockBeforeCancel = (await Ingredient.findById(coffeeIng._id)).currentStock;

    // Cancel pending item
    const cancelRes = await request(app)
      .patch(`/api/orders/${orderId}/items/${itemId}/cancel`)
      .set('Authorization', `Bearer ${waiterToken}`)
      .send({ reason: 'Customer changed mind' });

    assert.equal(cancelRes.status, 200);
    assert.equal(cancelRes.body.data.restoredStock, true);

    // Stock should be restored
    const stockAfterCancel = (await Ingredient.findById(coffeeIng._id)).currentStock;
    assert.ok(stockAfterCancel > stockBeforeCancel);

    // Sale reversal movement recorded
    const reversal = await StockMovement.findOne({ order: orderId, type: 'sale_reversal' });
    assert.ok(reversal);

    // Add new item and set to preparing
    const addRes = await request(app)
      .post(`/api/orders/${orderId}/items`)
      .set('Authorization', `Bearer ${waiterToken}`)
      .send({ items: [{ menuItemId: espresso._id, quantity: 1 }] });

    const newItemId = addRes.body.data.addedItems[0]._id;

    // Kitchen marks preparing
    await request(app)
      .patch(`/api/orders/${orderId}/items/${newItemId}/status`)
      .set('Authorization', `Bearer ${kitchenToken}`)
      .send({ status: 'preparing' });

    const stockBeforePrepCancel = (await Ingredient.findById(coffeeIng._id)).currentStock;

    // Admin cancels item in preparing (requires reason)
    const prepCancelRes = await request(app)
      .patch(`/api/orders/${orderId}/items/${newItemId}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Kitchen burnt beans' });

    assert.equal(prepCancelRes.status, 200);
    assert.equal(prepCancelRes.body.data.restoredStock, false);

    // Stock must NOT be restored
    const stockAfterPrepCancel = (await Ingredient.findById(coffeeIng._id)).currentStock;
    assert.equal(stockAfterPrepCancel, stockBeforePrepCancel);

    // cancelledAfterPrep must be true
    const updatedOrder = await Order.findById(orderId);
    const itemDoc = updatedOrder.items.id(newItemId);
    assert.equal(itemDoc.cancelledAfterPrep, true);
    assert.equal(itemDoc.status, 'cancelled');
  });

  // --- 3. TWO SIMULTANEOUS ORDERS ON SAME INGREDIENT (CONCURRENCY) ---
  test('Two simultaneous orders on the same ingredient deduct atomically without race condition', async () => {
    const table3 = await Table.findOne({ name: 'Table 3' });
    const table4 = await Table.findOne({ name: 'Table 4' });
    const burger = await MenuItem.findOne({ name: 'Classic Beef Burger' });
    const bunIng = await Ingredient.findOne({ name: 'Burger Bun' }); // 1 bun per burger, no wastage

    const startingBuns = bunIng.currentStock;

    // Concurrently place 2 orders of 2 burgers each (total 4 buns)
    const [res1, res2] = await Promise.all([
      request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${waiterToken}`)
        .send({
          tableId: table3._id,
          items: [{ menuItemId: burger._id, quantity: 2 }],
        }),
      request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${waiterToken}`)
        .send({
          tableId: table4._id,
          items: [{ menuItemId: burger._id, quantity: 2 }],
        }),
    ]);

    assert.equal(res1.status, 201);
    assert.equal(res2.status, 201);

    const endingBuns = (await Ingredient.findById(bunIng._id)).currentStock;
    assert.equal(endingBuns, startingBuns - 4);
  });

  // --- 4. ITEM STATUS FORWARD PROGRESSION & ORDER CLOSING ---
  test('Status progression (pending -> preparing -> ready -> served) and table liberation upon closing', async () => {
    const table5 = await Table.findOne({ name: 'Table 5' });
    const latte = await MenuItem.findOne({ name: 'Cafe Latte' });

    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${waiterToken}`)
      .send({
        tableId: table5._id,
        items: [{ menuItemId: latte._id, quantity: 1 }],
      });

    const orderId = orderRes.body.data.order._id;
    const itemId = orderRes.body.data.order.items[0]._id;

    // Kitchen marks preparing
    const prepRes = await request(app)
      .patch(`/api/orders/${orderId}/items/${itemId}/status`)
      .set('Authorization', `Bearer ${kitchenToken}`)
      .send({ status: 'preparing' });
    assert.equal(prepRes.status, 200);

    // Kitchen marks ready
    const readyRes = await request(app)
      .patch(`/api/orders/${orderId}/items/${itemId}/status`)
      .set('Authorization', `Bearer ${kitchenToken}`)
      .send({ status: 'ready' });
    assert.equal(readyRes.status, 200);

    // Cannot close before served
    const earlyCloseRes = await request(app)
      .patch(`/api/orders/${orderId}/close`)
      .set('Authorization', `Bearer ${waiterToken}`);
    assert.equal(earlyCloseRes.status, 500);

    // Waiter marks served
    const servedRes = await request(app)
      .patch(`/api/orders/${orderId}/items/${itemId}/status`)
      .set('Authorization', `Bearer ${waiterToken}`)
      .send({ status: 'served' });
    assert.equal(servedRes.status, 200);

    // Close order
    const closeRes = await request(app)
      .patch(`/api/orders/${orderId}/close`)
      .set('Authorization', `Bearer ${waiterToken}`);
    assert.equal(closeRes.status, 200);
    assert.equal(closeRes.body.data.order.status, 'closed');
    assert.ok(closeRes.body.data.order.closedAt);

    // Table 5 is now free for new orders
    const newOrderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${waiterToken}`)
      .send({
        tableId: table5._id,
        items: [{ menuItemId: latte._id, quantity: 1 }],
      });
    assert.equal(newOrderRes.status, 201);
  });

  test('Complete order with paymentMethod (cash vs transfer) and autoServeReady frees table', async () => {
    const tablePay = await Table.create({ name: 'Table Pay Test' });
    const burger = await MenuItem.findOne({ name: 'Classic Beef Burger' });
    // Create order on Table Pay Test
    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${waiterToken}`)
      .send({
        tableId: tablePay._id,
        items: [{ menuItemId: burger._id, quantity: 1 }],
      });
    assert.equal(orderRes.status, 201);
    const orderId = orderRes.body.data.order._id;
    const itemId = orderRes.body.data.order.items[0]._id;

    // Kitchen marks preparing then ready
    await request(app)
      .patch(`/api/orders/${orderId}/items/${itemId}/status`)
      .set('Authorization', `Bearer ${kitchenToken}`)
      .send({ status: 'preparing' });
    await request(app)
      .patch(`/api/orders/${orderId}/items/${itemId}/status`)
      .set('Authorization', `Bearer ${kitchenToken}`)
      .send({ status: 'ready' });

    // Complete order directly with paymentMethod: 'transfer' and autoServeReady: true
    const completeRes = await request(app)
      .patch(`/api/orders/${orderId}/close`)
      .set('Authorization', `Bearer ${waiterToken}`)
      .send({ paymentMethod: 'transfer', autoServeReady: true });

    assert.equal(completeRes.status, 200);
    assert.equal(completeRes.body.data.order.status, 'closed');
    assert.equal(completeRes.body.data.order.paymentMethod, 'transfer');
    assert.equal(completeRes.body.data.order.items[0].status, 'served');

    // Verify table is now free
    const activeOrdersRes = await request(app)
      .get('/api/orders/active')
      .set('Authorization', `Bearer ${waiterToken}`);
    const tableHasActive = activeOrdersRes.body.data.orders.some(
      (o) => String(o.table._id || o.table) === String(tablePay._id)
    );
    assert.equal(tableHasActive, false);
  });

  test('Cancel entire order releases table and restores inventory for pending items', async () => {
    const tableCancel = await Table.create({ name: 'Table Cancel Test' });
    const burger = await MenuItem.findOne({ name: 'Classic Beef Burger' });
    // Create new order on Table Cancel Test
    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${waiterToken}`)
      .send({
        tableId: tableCancel._id,
        items: [{ menuItemId: burger._id, quantity: 1 }],
      });
    assert.equal(orderRes.status, 201);
    const orderId = orderRes.body.data.order._id;

    // Cancel order
    const cancelRes = await request(app)
      .patch(`/api/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${waiterToken}`)
      .send({ reason: 'Customer changed their mind' });

    assert.equal(cancelRes.status, 200);
    assert.equal(cancelRes.body.data.order.status, 'cancelled');
    assert.equal(cancelRes.body.data.order.cancelReason, 'Customer changed their mind');

    // Table is free
    const activeOrdersRes = await request(app)
      .get('/api/orders/active')
      .set('Authorization', `Bearer ${waiterToken}`);
    const tableHasActive = activeOrdersRes.body.data.orders.some(
      (o) => String(o.table._id || o.table) === String(tableCancel._id)
    );
    assert.equal(tableHasActive, false);
  });
});

