import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { seedDatabase } from '../src/seed.js';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MenuItem } from '../src/models/MenuItem.js';
import { Table } from '../src/models/Table.js';
import { User } from '../src/models/User.js';

describe('Barista Role, Food vs Drink Separation & Order Routing', () => {
  let replSet;
  let adminToken;
  let waiterToken;
  let kitchenToken;
  let baristaToken;

  before(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const uri = replSet.getUri();
    await connectDB(uri);
    await seedDatabase(uri);

    // Login Admin
    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    adminToken = adminRes.body.data.token;

    // Login Waiter
    const waiterRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'waiter', password: 'waiter123' });
    waiterToken = waiterRes.body.data.token;

    // Login Kitchen
    const kitchenRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'kitchen', password: 'kitchen123' });
    kitchenToken = kitchenRes.body.data.token;

    // Login Barista
    const baristaRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'barista', password: 'barista123' });
    baristaToken = baristaRes.body.data.token;
  });

  after(async () => {
    await disconnectDB();
    if (replSet) await replSet.stop();
  });

  it('Default barista user can log in and has role "barista"', async () => {
    assert.ok(baristaToken, 'Barista token should exist');

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${baristaToken}`);

    assert.equal(meRes.status, 200);
    assert.equal(meRes.body.data.user.role, 'barista');
    assert.equal(meRes.body.data.user.username, 'barista');
  });

  it('Admin can create a new barista user via user management API', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Kalkidan Barista',
        username: 'kalkidan_barista',
        password: 'password123',
        role: 'barista',
        canManageInventory: false,
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.data.user.role, 'barista');
    assert.equal(res.body.data.user.username, 'kalkidan_barista');

    // Verify login with new barista account
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'kalkidan_barista', password: 'password123' });

    assert.equal(loginRes.status, 200);
    assert.equal(loginRes.body.data.user.role, 'barista');
  });

  it('Menu items support itemType ("food" vs "drink") with intelligent inference', async () => {
    // 1. Explicit food item
    const foodRes = await request(app)
      .post('/api/menu')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Kitfo Special',
        category: 'Traditional',
        itemType: 'food',
        price: 500,
        isAvailable: true,
      });
    assert.equal(foodRes.status, 201);
    assert.equal(foodRes.body.data.item.itemType, 'food');

    // 2. Explicit drink item
    const drinkRes = await request(app)
      .post('/api/menu')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Avocado Juice',
        category: 'Juices & Smoothies',
        itemType: 'drink',
        price: 120,
        isAvailable: true,
      });
    assert.equal(drinkRes.status, 201);
    assert.equal(drinkRes.body.data.item.itemType, 'drink');

    // 3. Fallback inference: category includes "beverage"
    const inferredDrinkRes = await request(app)
      .post('/api/menu')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Spiced Ethiopian Tea',
        category: 'Hot Beverages',
        price: 40,
        isAvailable: true,
      });
    assert.equal(inferredDrinkRes.status, 201);
    assert.equal(inferredDrinkRes.body.data.item.itemType, 'drink');
  });

  it('Order placement snapshots itemType and allows barista to update drink status', async () => {
    const table = await Table.findOne({ name: 'Table 1' });
    const foodItem = await MenuItem.findOne({ name: 'Ethiopian Beef Tibs' });
    const drinkItem = await MenuItem.findOne({ name: 'Ethiopian Macchiato' });

    assert.ok(table && foodItem && drinkItem, 'Required seed records must exist');

    // Waiter places combined ticket (food + drink)
    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${waiterToken}`)
      .send({
        tableId: table._id.toString(),
        items: [
          { menuItemId: foodItem._id.toString(), quantity: 1, note: 'Medium rare' },
          { menuItemId: drinkItem._id.toString(), quantity: 2, note: 'Less sugar' },
        ],
      });

    assert.equal(orderRes.status, 201);
    const order = orderRes.body.data.order;
    assert.equal(order.items.length, 2);

    const foodOrderItem = order.items.find((i) => i.nameSnapshot === 'Ethiopian Beef Tibs');
    const drinkOrderItem = order.items.find((i) => i.nameSnapshot === 'Ethiopian Macchiato');

    assert.equal(foodOrderItem.itemType, 'food');
    assert.equal(drinkOrderItem.itemType, 'drink');
    assert.equal(foodOrderItem.status, 'pending');
    assert.equal(drinkOrderItem.status, 'pending');

    // Barista updates drink to 'preparing'
    const prepRes = await request(app)
      .patch(`/api/orders/${order._id}/items/${drinkOrderItem._id}/status`)
      .set('Authorization', `Bearer ${baristaToken}`)
      .send({ status: 'preparing' });

    assert.equal(prepRes.status, 200);

    // Barista updates drink to 'ready'
    const readyRes = await request(app)
      .patch(`/api/orders/${order._id}/items/${drinkOrderItem._id}/status`)
      .set('Authorization', `Bearer ${baristaToken}`)
      .send({ status: 'ready' });

    assert.equal(readyRes.status, 200);

    // Barista cannot mark drink as 'served' (Rule 5: Waiters only)
    const servedFailRes = await request(app)
      .patch(`/api/orders/${order._id}/items/${drinkOrderItem._id}/status`)
      .set('Authorization', `Bearer ${baristaToken}`)
      .send({ status: 'served' });

    assert.equal(servedFailRes.body.success, false);
    assert.match(
      servedFailRes.body.error.message,
      /Kitchen and barista staff can only set status to preparing or ready/
    );

    // Kitchen updates food item to 'preparing' then 'ready'
    const kitchenPrepRes = await request(app)
      .patch(`/api/orders/${order._id}/items/${foodOrderItem._id}/status`)
      .set('Authorization', `Bearer ${kitchenToken}`)
      .send({ status: 'preparing' });
    assert.equal(kitchenPrepRes.status, 200);

    const kitchenReadyRes = await request(app)
      .patch(`/api/orders/${order._id}/items/${foodOrderItem._id}/status`)
      .set('Authorization', `Bearer ${kitchenToken}`)
      .send({ status: 'ready' });
    assert.equal(kitchenReadyRes.status, 200);

    // Waiter marks both ready items as 'served'
    const waiterDrinkServed = await request(app)
      .patch(`/api/orders/${order._id}/items/${drinkOrderItem._id}/status`)
      .set('Authorization', `Bearer ${waiterToken}`)
      .send({ status: 'served' });
    assert.equal(waiterDrinkServed.status, 200);

    const waiterFoodServed = await request(app)
      .patch(`/api/orders/${order._id}/items/${foodOrderItem._id}/status`)
      .set('Authorization', `Bearer ${waiterToken}`)
      .send({ status: 'served' });
    assert.equal(waiterFoodServed.status, 200);

    // Waiter closes the order
    const closeRes = await request(app)
      .patch(`/api/orders/${order._id}/close`)
      .set('Authorization', `Bearer ${waiterToken}`);

    assert.equal(closeRes.status, 200);
    assert.equal(closeRes.body.data.order.status, 'closed');
  });
});
