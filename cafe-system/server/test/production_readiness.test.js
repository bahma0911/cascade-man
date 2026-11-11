import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { seedDatabase } from '../src/seed.js';
import { ensureDefaults } from '../src/utils/ensureDefaults.js';
import { User } from '../src/models/User.js';

describe('Production Readiness & Hardening Regressions', () => {
  let mongoServer;
  let adminToken;
  let adminId;

  before(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await connectDB(uri);
    await seedDatabase(uri);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });

    adminToken = loginRes.body.data.token;
    adminId = loginRes.body.data.user.id;
  });

  after(async () => {
    await disconnectDB();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  test('Express trusts proxy headers for rate limiting behind Render/Nginx', () => {
    assert.equal(app.get('trust proxy'), 1);
  });

  test('Admin cannot deactivate or downgrade their own account', async () => {
    const deactivateRes = await request(app)
      .patch(`/api/users/${adminId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false });

    assert.equal(deactivateRes.status, 400);
    assert.equal(deactivateRes.body.success, false);

    const roleRes = await request(app)
      .patch(`/api/users/${adminId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'waiter' });

    assert.equal(roleRes.status, 400);
    assert.equal(roleRes.body.success, false);
  });

  test('ensureDefaults does not recreate deleted barista account on restart', async () => {
    await User.deleteOne({ username: 'barista' });
    await ensureDefaults();
    const recreated = await User.findOne({ username: 'barista' });
    assert.equal(recreated, null);
  });

  test('Tables and ingredients handle regex metacharacters safely', async () => {
    const tableRes = await request(app)
      .post('/api/tables')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Patio (VIP + 1)' });

    assert.equal(tableRes.status, 201);

    const ingRes = await request(app)
      .post('/api/ingredients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Sugar (100% Pure)', baseUnit: 'g', currentStock: 500 });

    assert.equal(ingRes.status, 201);
  });

  test('Expense validation failures return HTTP 400 instead of 500', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ category: 'invalid_category', amount: -5 });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });
});
