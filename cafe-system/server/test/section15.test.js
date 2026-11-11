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
import { NotificationSettings } from '../src/models/NotificationSettings.js';
import { NotificationLog } from '../src/models/NotificationLog.js';
import { notificationService } from '../src/services/notificationService.js';
import { reportEmailService } from '../src/services/reportEmailService.js';

describe('Email Notification System (Resend Integration & Automated Alerts)', () => {
  let replSet;
  let adminToken;
  let waiterToken;
  let kitchenToken;

  before(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const uri = replSet.getUri();
    await connectDB(uri);
    await seedDatabase(uri);

    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    adminToken = adminLogin.body.data.token;

    const waiterLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: 'waiter', password: 'waiter123' });
    waiterToken = waiterLogin.body.data.token;

    const kitchenLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: 'kitchen', password: 'kitchen123' });
    kitchenToken = kitchenLogin.body.data.token;
  });

  after(async () => {
    await disconnectDB();
    if (replSet) {
      await replSet.stop();
    }
  });

  test('Access Control: Non-admin users cannot manage email notification settings', async () => {
    const waiterRes = await request(app)
      .get('/api/notifications/settings')
      .set('Authorization', `Bearer ${waiterToken}`);
    assert.equal(waiterRes.status, 403);

    const kitchenRes = await request(app)
      .put('/api/notifications/settings')
      .set('Authorization', `Bearer ${kitchenToken}`)
      .send({ restaurantEmail: 'hack@restaurant.com' });
    assert.equal(kitchenRes.status, 403);

    const adminRes = await request(app)
      .get('/api/notifications/settings')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(adminRes.status, 200);
    assert.equal(adminRes.body.success, true);
  });

  test('Notification Settings CRUD: Administrator can update email preferences, delivery time, and recipients', async () => {
    const updatePayload = {
      restaurantEmail: 'owner@cascade.et',
      dailyReportTime: '07:30',
      excessiveWastageThreshold: 18,
      enabledTypes: {
        lowStock: true,
        criticalStock: true,
        dailyReport: true,
        weeklyReport: true,
        monthlyReport: true,
        excessiveWastage: true,
        systemAlerts: true,
      },
      recipients: [
        {
          name: 'Abebe General Manager',
          email: 'abebe.gm@cascade.et',
          role: 'General Manager',
          alertTypes: ['low_stock', 'critical_stock', 'daily_report'],
        },
        {
          name: 'Chaltu Head Chef',
          email: 'chaltu.chef@cascade.et',
          role: 'Head Chef',
          alertTypes: ['critical_stock', 'excessive_wastage'],
        },
      ],
    };

    const res = await request(app)
      .put('/api/notifications/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(updatePayload);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.restaurantEmail, 'owner@cascade.et');
    assert.equal(res.body.data.dailyReportTime, '07:30');
    assert.equal(res.body.data.excessiveWastageThreshold, 18);
    assert.equal(res.body.data.recipients.length, 2);
    assert.equal(res.body.data.recipients[0].name, 'Abebe General Manager');

    // Verify recipient filtering helper
    const lowStockRecipients = await notificationService.getRecipientsForType('low_stock');
    assert.ok(lowStockRecipients.includes('abebe.gm@cascade.et'));
    assert.ok(!lowStockRecipients.includes('chaltu.chef@cascade.et'));

    const wasteRecipients = await notificationService.getRecipientsForType('excessive_wastage');
    assert.ok(wasteRecipients.includes('chaltu.chef@cascade.et'));
  });

  test('POST /api/notifications/test-email sends test email and creates NotificationLog record', async () => {
    const testRes = await request(app)
      .post('/api/notifications/test-email')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'test.auditor@cascade.et' });

    assert.equal(testRes.status, 200);
    assert.equal(testRes.body.success, true);

    // Verify NotificationLog audit trail
    const log = await NotificationLog.findOne({
      recipient: 'test.auditor@cascade.et',
      notificationType: 'test',
    });
    assert.ok(log);
    assert.equal(log.status, 'sent');
    assert.ok(log.subject.includes('Resend Configuration Verified'));

    // Check history API
    const historyRes = await request(app)
      .get('/api/notifications/history')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(historyRes.status, 200);
    assert.ok(historyRes.body.data.logs.length >= 1);

    // Check email delivery status health API
    const statusRes = await request(app)
      .get('/api/notifications/email-status')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(statusRes.status, 200);
    assert.ok(statusRes.body.data.stats.totalSent >= 1);
  });

  test('Low-Stock and Critical-Stock Alerts: Triggers on order deductions with strict de-duplication', async () => {
    // 1. Create a dedicated test ingredient with lowStockThreshold = 10, initial stock = 12
    const testIng = await Ingredient.create({
      name: 'Special Honey',
      baseUnit: 'g',
      currentStock: 12,
      lowStockThreshold: 10,
      costPerBaseUnit: 1.5,
      isLowStockAlertActive: false,
      isCriticalStockAlertActive: false,
    });

    const testItem = await MenuItem.create({
      name: 'Honey Tea',
      category: 'Beverages',
      price: 60,
      recipe: [{ ingredient: testIng._id, quantity: 4 }], // Deducts 4g
    });

    const table = await Table.findOne({ isActive: true });

    // Initial alert count
    const initialLowCount = await NotificationLog.countDocuments({
      notificationType: 'low_stock',
      'metadata.ingredientId': testIng._id,
    });

    // 2. First order: stock drops from 12 to 8 (8 <= 10) -> Should trigger low-stock alert!
    const order1 = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${waiterToken}`)
      .send({
        tableId: table._id,
        items: [{ menuItemId: testItem._id, quantity: 1 }],
      });
    assert.equal(order1.status, 201);

    // Allow setImmediate async email dispatch
    await new Promise((r) => setTimeout(r, 80));

    const updatedIng1 = await Ingredient.findById(testIng._id);
    assert.equal(updatedIng1.currentStock, 8);
    assert.equal(updatedIng1.isLowStockAlertActive, true);

    const lowCountAfterOrder1 = await NotificationLog.countDocuments({
      notificationType: 'low_stock',
      'metadata.ingredientId': testIng._id,
    });
    assert.equal(lowCountAfterOrder1, initialLowCount + 1);

    // 3. Second order while STILL low-stock: stock drops from 8 to 4 (4 <= 10)
    // Strict De-duplication Rule: must NOT send another low-stock alert!
    const order2 = await request(app)
      .post(`/api/orders/${order1.body.data.order._id}/items`)
      .set('Authorization', `Bearer ${waiterToken}`)
      .send({
        items: [{ menuItemId: testItem._id, quantity: 1 }],
      });
    assert.equal(order2.status, 200);
    await new Promise((r) => setTimeout(r, 80));

    const lowCountAfterOrder2 = await NotificationLog.countDocuments({
      notificationType: 'low_stock',
      'metadata.ingredientId': testIng._id,
    });
    // De-duplication verified: count has NOT increased!
    assert.equal(lowCountAfterOrder2, lowCountAfterOrder1);

    // 4. Third item drops stock to 0 (4 - 4 = 0) -> Triggers Critical Stock alert!
    const order3 = await request(app)
      .post(`/api/orders/${order1.body.data.order._id}/items`)
      .set('Authorization', `Bearer ${waiterToken}`)
      .send({
        items: [{ menuItemId: testItem._id, quantity: 1 }],
      });
    assert.equal(order3.status, 200);
    await new Promise((r) => setTimeout(r, 80));

    const updatedIng3 = await Ingredient.findById(testIng._id);
    assert.equal(updatedIng3.currentStock, 0);
    assert.equal(updatedIng3.isCriticalStockAlertActive, true);

    const criticalCount = await NotificationLog.countDocuments({
      notificationType: 'critical_stock',
      'metadata.ingredientId': testIng._id,
    });
    assert.ok(criticalCount >= 1);

    // 5. Delivery restocks ingredient back to 25 (> 10 threshold) -> Resets de-duplication flags!
    const delivery = await request(app)
      .post('/api/inventory/deliveries')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        lines: [{ ingredientId: testIng._id, quantity: 25, unitPrice: 1.5 }],
        note: 'Restock Special Honey',
      });
    assert.equal(delivery.status, 201);
    await new Promise((r) => setTimeout(r, 80));

    const recoveredIng = await Ingredient.findById(testIng._id);
    assert.equal(recoveredIng.currentStock, 25);
    assert.equal(recoveredIng.isLowStockAlertActive, false);
    assert.equal(recoveredIng.isCriticalStockAlertActive, false);
  });

  test('Excessive Preparation Wastage Alerts: Dispatches alert when waste exceeds configured tolerance', async () => {
    const milkIng = await Ingredient.findOne({ name: 'Fresh Whole Milk' });

    const initialExcessWasteLogs = await NotificationLog.countDocuments({
      notificationType: 'excessive_wastage',
    });

    // Record preparation waste: expected = 50, actual = 75 (50% excess, > 18% threshold)
    const wasteRes = await request(app)
      .post('/api/inventory/waste')
      .set('Authorization', `Bearer ${kitchenToken}`)
      .send({
        reasonCode: 'prep_waste',
        note: 'Over-boiled milk batch',
        lines: [
          {
            ingredientId: milkIng._id,
            quantity: 75,
            expectedWastageQty: 50,
          },
        ],
      });
    assert.equal(wasteRes.status, 201);
    await new Promise((r) => setTimeout(r, 80));

    const excessWasteLogsAfter = await NotificationLog.countDocuments({
      notificationType: 'excessive_wastage',
    });
    assert.ok(excessWasteLogsAfter > initialExcessWasteLogs);
  });

  test('Scheduled & On-Demand Reports: POST /api/notifications/trigger-report sends daily, weekly, and monthly reports', async () => {
    // 1. Daily Report
    const dailyRes = await request(app)
      .post('/api/notifications/trigger-report')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reportType: 'daily' });
    assert.equal(dailyRes.status, 200);
    assert.equal(dailyRes.body.success, true);
    assert.ok(dailyRes.body.data.recipients.length > 0);

    const dailyLog = await NotificationLog.findOne({ notificationType: 'daily_report' }).sort({ createdAt: -1 });
    assert.ok(dailyLog);
    assert.equal(dailyLog.status, 'sent');
    assert.ok(dailyLog.subject.includes('Daily Business Summary'));

    // 2. Weekly Report
    const weeklyRes = await request(app)
      .post('/api/notifications/trigger-report')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reportType: 'weekly' });
    assert.equal(weeklyRes.status, 200);
    assert.equal(weeklyRes.body.success, true);

    const weeklyLog = await NotificationLog.findOne({ notificationType: 'weekly_report' }).sort({ createdAt: -1 });
    assert.ok(weeklyLog);
    assert.ok(weeklyLog.subject.includes('Weekly Performance Report'));

    // 3. Monthly Report
    const monthlyRes = await request(app)
      .post('/api/notifications/trigger-report')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reportType: 'monthly' });
    assert.equal(monthlyRes.status, 200);
    assert.equal(monthlyRes.body.success, true);

    const monthlyLog = await NotificationLog.findOne({ notificationType: 'monthly_report' }).sort({ createdAt: -1 });
    assert.ok(monthlyLog);
    assert.ok(monthlyLog.subject.includes('Monthly Business Review'));
  });
});
