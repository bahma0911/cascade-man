import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { seedDatabase } from '../src/seed.js';
import { StockMovement } from '../src/models/StockMovement.js';

describe('Tables, Ingredients, Menu + Recipes, and Users API', () => {
  let mongoServer;
  let adminToken;
  let waiterInvToken;
  let waiterToken;
  let kitchenToken;

  before(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await connectDB(uri);
    await seedDatabase(uri);

    // Get tokens for each role
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
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  // --- TABLES TESTS ---
  describe('Tables API', () => {
    test('All roles can list active tables', async () => {
      const res = await request(app).get('/api/tables').set('Authorization', `Bearer ${waiterToken}`);
      assert.equal(res.status, 200);
      assert.ok(res.body.data.tables.length >= 8);
    });

    test('Non-admin cannot create a table', async () => {
      const res = await request(app)
        .post('/api/tables')
        .set('Authorization', `Bearer ${waiterToken}`)
        .send({ name: 'Rooftop 1' });
      assert.equal(res.status, 403);
    });

    test('Admin can create, update, and soft delete a table', async () => {
      // Create
      const createRes = await request(app)
        .post('/api/tables')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Rooftop 1' });
      assert.equal(createRes.status, 201);
      const tableId = createRes.body.data.table._id;

      // Update
      const updateRes = await request(app)
        .patch(`/api/tables/${tableId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Rooftop VIP' });
      assert.equal(updateRes.status, 200);
      assert.equal(updateRes.body.data.table.name, 'Rooftop VIP');

      // Soft delete
      const delRes = await request(app)
        .delete(`/api/tables/${tableId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      assert.equal(delRes.status, 200);
      assert.equal(delRes.body.data.table.isActive, false);

      // Verify omitted from standard list
      const listRes = await request(app).get('/api/tables').set('Authorization', `Bearer ${waiterToken}`);
      assert.ok(!listRes.body.data.tables.some((t) => t._id === tableId));
    });
  });

  // --- INGREDIENTS TESTS ---
  describe('Ingredients & Preparation Wastage', () => {
    test('Standard waiter without inventory flag cannot add ingredients', async () => {
      const res = await request(app)
        .post('/api/ingredients')
        .set('Authorization', `Bearer ${waiterToken}`)
        .send({ name: 'Garlic', baseUnit: 'g', currentStock: 1000, lowStockThreshold: 200 });
      assert.equal(res.status, 403);
    });

    test('Waiter with canManageInventory can create ingredient and initial stock ledger entry is recorded', async () => {
      const res = await request(app)
        .post('/api/ingredients')
        .set('Authorization', `Bearer ${waiterInvToken}`)
        .send({
          name: 'Ginger Root',
          baseUnit: 'g',
          currentStock: 2500,
          lowStockThreshold: 500,
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.data.ingredient.name, 'Ginger Root');
      const ingId = res.body.data.ingredient._id;

      // Check StockMovement ledger
      const movement = await StockMovement.findOne({
        type: 'initial',
        'lines.ingredient': ingId,
      });
      assert.ok(movement);
      assert.equal(movement.lines[0].quantity, 2500);
      assert.equal(movement.lines[0].before, 0);
      assert.equal(movement.lines[0].after, 2500);
    });

    test('Admin can configure Preparation Wastage settings', async () => {
      const createRes = await request(app)
        .post('/api/ingredients')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Organic Carrots',
          baseUnit: 'g',
          currentStock: 10000,
          lowStockThreshold: 2000,
          referenceQty: 10000, // 10 kg
          expectedWastageQty: 1000, // 1 kg
          autoWastageEnabled: true,
        });

      assert.equal(createRes.status, 201);
      const ing = createRes.body.data.ingredient;
      assert.equal(ing.referenceQty, 10000);
      assert.equal(ing.expectedWastageQty, 1000);
      assert.equal(ing.wastageRate, 0.1); // 10%
      assert.equal(ing.autoWastageEnabled, true);

      // Admin updates wastage parameters
      const patchRes = await request(app)
        .patch(`/api/ingredients/${ing._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          expectedWastageQty: 1200, // Updated to 1.2 kg -> 12%
        });

      assert.equal(patchRes.status, 200);
      assert.equal(patchRes.body.data.ingredient.wastageRate, 0.12);
    });
  });

  // --- MENU & RECIPES TESTS ---
  describe('Menu & Recipes API', () => {
    test('Admin can create menu item with recipe linked to ingredients', async () => {
      // Find an ingredient ID (e.g. Red Onion)
      const ingRes = await request(app).get('/api/ingredients').set('Authorization', `Bearer ${adminToken}`);
      const onion = ingRes.body.data.ingredients.find((i) => i.name === 'Red Onion');
      assert.ok(onion);

      const menuRes = await request(app)
        .post('/api/menu')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Fresh Onion Salad',
          category: 'Salads',
          price: 150,
          recipe: [{ ingredient: onion._id, quantity: 200 }],
        });

      assert.equal(menuRes.status, 201);
      assert.equal(menuRes.body.data.item.name, 'Fresh Onion Salad');
      assert.equal(menuRes.body.data.item.recipe[0].ingredient.name, 'Red Onion');
    });

    test('All roles can view menu items and categories', async () => {
      const res = await request(app).get('/api/menu').set('Authorization', `Bearer ${kitchenToken}`);
      assert.equal(res.status, 200);
      assert.ok(res.body.data.items.length >= 6);
      assert.ok(res.body.data.categories.length >= 2);
    });
  });

  // --- USERS MANAGEMENT TESTS ---
  describe('Users Management API (Admin)', () => {
    test('Non-admin cannot access user management', async () => {
      const res = await request(app).get('/api/users').set('Authorization', `Bearer ${waiterToken}`);
      assert.equal(res.status, 403);
    });

    test('Admin can create new user, toggle permissions, reset password, and deactivate', async () => {
      // Create user
      const createRes = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Cashier Waiter',
          username: 'test_waiter',
          password: 'password123',
          role: 'waiter',
          canManageInventory: false,
        });

      assert.equal(createRes.status, 201);
      const userId = createRes.body.data.user._id;

      // Toggle inventory permission
      const updateRes = await request(app)
        .patch(`/api/users/${userId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ canManageInventory: true, password: 'newpassword123' });

      assert.equal(updateRes.status, 200);
      assert.equal(updateRes.body.data.user.canManageInventory, true);

      // Verify login with new password
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ username: 'test_waiter', password: 'newpassword123' });
      assert.equal(loginRes.status, 200);

      // Soft delete user
      const delRes = await request(app).delete(`/api/users/${userId}`).set('Authorization', `Bearer ${adminToken}`);
      assert.equal(delRes.status, 200);
      assert.equal(delRes.body.data.user.isActive, false);
    });
  });
});

