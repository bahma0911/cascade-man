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
import { Expense } from '../src/models/Expense.js';

describe('Comprehensive Financial Reports, P&L, Operating Expenses & WAC Costing', () => {
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

  test('Access Control: Waiter and kitchen staff cannot access financial reports or expenses', async () => {
    const waiterReports = await request(app)
      .get('/api/reports/dashboard')
      .set('Authorization', `Bearer ${waiterToken}`);
    assert.equal(waiterReports.status, 403);

    const kitchenExpenses = await request(app)
      .get('/api/expenses')
      .set('Authorization', `Bearer ${kitchenToken}`);
    assert.equal(kitchenExpenses.status, 403);
  });

  test('Weighted Average Costing (WAC) recalculates accurately on deliveries', async () => {
    const milk = await Ingredient.findOne({ name: 'Fresh Whole Milk' });
    const prevStock = milk.currentStock; // 40,000 ml
    const prevCost = milk.costPerBaseUnit; // 0.08 ETB/ml

    // New delivery: 10,000 ml at 0.12 ETB/ml (Total cost: 1,200 ETB)
    const deliverQty = 10000;
    const deliverPrice = 0.12;

    const expectedNewWAC = Number(
      ((prevStock * prevCost + deliverQty * deliverPrice) / (prevStock + deliverQty)).toFixed(4)
    );

    const deliveryRes = await request(app)
      .post('/api/inventory/deliveries')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        lines: [{ ingredientId: milk._id.toString(), quantity: deliverQty, unitPrice: deliverPrice }],
        note: 'Fresh morning milk batch',
      });

    assert.equal(deliveryRes.status, 201);

    const updatedMilk = await Ingredient.findById(milk._id);
    assert.equal(updatedMilk.currentStock, prevStock + deliverQty);
    assert.equal(updatedMilk.costPerBaseUnit, expectedNewWAC);
    assert.equal(updatedMilk.lastPurchasePrice, deliverPrice);
    assert.ok(updatedMilk.lastPurchaseDate);
  });

  test('Operating Expenses management (Create, List, Summarize, Delete)', async () => {
    // 1. Create new expense
    const createRes = await request(app)
      .post('/api/expenses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        category: 'rent',
        amount: 15000,
        description: 'Monthly cafe premise lease',
      });

    assert.equal(createRes.status, 201);
    const createdExpense = createRes.body.data.expense;
    assert.equal(createdExpense.category, 'rent');
    assert.equal(createdExpense.amount, 15000);

    // 2. List expenses
    const listRes = await request(app)
      .get('/api/expenses?category=rent')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(listRes.status, 200);
    assert.ok(listRes.body.data.expenses.length >= 1);

    // 3. Summary
    const summaryRes = await request(app)
      .get('/api/expenses/summary')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(summaryRes.status, 200);
    assert.ok(summaryRes.body.data.totalOperatingExpenses >= 15000);

    // 4. Delete expense
    const deleteRes = await request(app)
      .delete(`/api/expenses/${createdExpense._id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(deleteRes.status, 200);
  });

  test('Reporting Dashboard & P&L Statement calculates profit accurately without double-counting waste', async () => {
    const table = await Table.findOne({ name: 'Table 2' });
    const burger = await MenuItem.findOne({ name: 'Classic Beef Burger' });
    const espresso = await MenuItem.findOne({ name: 'Single Espresso' });

    // Place an order
    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${waiterToken}`)
      .send({
        tableId: table._id.toString(),
        items: [
          { menuItemId: burger._id.toString(), quantity: 2 },
          { menuItemId: espresso._id.toString(), quantity: 1 },
        ],
      });
    const orderId = orderRes.body.data.order._id;
    const items = orderRes.body.data.order.items;

    // Progress items through kitchen: pending -> preparing -> ready -> served
    for (const item of items) {
      await request(app)
        .patch(`/api/orders/${orderId}/items/${item._id}/status`)
        .set('Authorization', `Bearer ${kitchenToken}`)
        .send({ status: 'preparing' });

      await request(app)
        .patch(`/api/orders/${orderId}/items/${item._id}/status`)
        .set('Authorization', `Bearer ${kitchenToken}`)
        .send({ status: 'ready' });

      await request(app)
        .patch(`/api/orders/${orderId}/items/${item._id}/status`)
        .set('Authorization', `Bearer ${waiterToken}`)
        .send({ status: 'served' });
    }

    // Close the order
    const closeRes = await request(app)
      .patch(`/api/orders/${orderId}/close`)
      .set('Authorization', `Bearer ${waiterToken}`);
    assert.equal(closeRes.status, 200);

    // Fetch dashboard report
    const dashRes = await request(app)
      .get('/api/reports/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(dashRes.status, 200);
    const { cards, metrics } = dashRes.body.data;

    assert.ok(cards.totalOrders >= 1);
    assert.ok(cards.completedOrders >= 1);
    assert.ok(cards.totalItemsSold >= 3);
    assert.ok(cards.grossSalesRevenue > 0);
    assert.ok(cards.estimatedIngredientCosts > 0);

    // Verify P&L Formulas:
    // Gross Profit = Gross Revenue - Ingredient Costs
    const expectedGrossProfit = Number((cards.grossSalesRevenue - cards.estimatedIngredientCosts).toFixed(2));
    assert.equal(cards.estimatedGrossProfit, expectedGrossProfit);

    // Net Profit = Gross Profit - Operating Expenses
    const expectedNetProfit = Number((cards.estimatedGrossProfit - cards.recordedOperatingExpenses).toFixed(2));
    assert.equal(cards.estimatedNetProfit, expectedNetProfit);

    assert.ok(metrics.averageOrderValue > 0);
    assert.ok(metrics.foodCostPercentage > 0);
  });

  test('Detailed Order Analytics returns peak hours, waiter & table breakdowns', async () => {
    const ordersRes = await request(app)
      .get('/api/reports/orders')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(ordersRes.status, 200);
    const data = ordersRes.body.data;

    assert.ok(Array.isArray(data.mostPopular));
    assert.ok(Array.isArray(data.categorySales));
    assert.ok(Array.isArray(data.waiterOrders));
    assert.ok(Array.isArray(data.tableOrders));
    assert.ok(Array.isArray(data.peakHours));

    // Confirm Classic Beef Burger is present in dish sales
    const burgerStat = data.mostPopular.find((d) => d.name === 'Classic Beef Burger');
    assert.ok(burgerStat);
    assert.ok(burgerStat.quantitySold >= 2);
  });

  test('Recipe costings calculates food cost margins for each menu item', async () => {
    const costsRes = await request(app)
      .get('/api/reports/ingredient-costs')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(costsRes.status, 200);
    const { recipeCostings, consumption } = costsRes.body.data;

    assert.ok(Array.isArray(recipeCostings));
    assert.ok(Array.isArray(consumption));

    const burgerRecipe = recipeCostings.find((r) => r.name === 'Classic Beef Burger');
    assert.ok(burgerRecipe);
    assert.ok(burgerRecipe.estimatedPreparationCost > 0);
    assert.ok(burgerRecipe.grossMargin > 0);
    assert.ok(burgerRecipe.foodCostPercentage > 0);
    assert.ok(burgerRecipe.ingredients.length > 0);
  });
});

