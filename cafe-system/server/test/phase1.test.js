import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { seedDatabase } from '../src/seed.js';

describe('Server Skeleton, Health, Auth, Roles & Permissions', () => {
  let mongoServer;

  before(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await connectDB(uri);
    await seedDatabase(uri);
  });

  after(async () => {
    await disconnectDB();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  test('GET /health returns 200 and healthy database status', async () => {
    const res = await request(app).get('/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'healthy');
    assert.equal(res.body.database, 'connected');
    assert.ok(typeof res.body.uptime === 'number');
  });

  test('POST /api/auth/login rejects invalid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'wrongpassword' });

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'INVALID_CREDENTIALS');
  });

  test('POST /api/auth/login validates required fields', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: '' });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  test('POST /api/auth/login logs in admin successfully and returns token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.token);
    assert.equal(res.body.data.user.role, 'admin');
    assert.equal(res.body.data.user.canManageInventory, true);
  });

  test('GET /api/auth/me rejects requests without token', async () => {
    const res = await request(app).get('/api/auth/me');
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'UNAUTHORIZED');
  });

  test('GET /api/auth/me returns authenticated user profile', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'waiter_inv', password: 'waiter123' });

    const token = loginRes.body.data.token;

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(meRes.status, 200);
    assert.equal(meRes.body.success, true);
    assert.equal(meRes.body.data.user.username, 'waiter_inv');
    assert.equal(meRes.body.data.user.role, 'waiter');
    assert.equal(meRes.body.data.user.canManageInventory, true);
  });

  test('Verify all roles can login and have proper flags', async () => {
    // Standard waiter
    const waiterRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'waiter', password: 'waiter123' });
    assert.equal(waiterRes.body.data.user.role, 'waiter');
    assert.equal(waiterRes.body.data.user.canManageInventory, false);

    // Kitchen
    const kitchenRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'kitchen', password: 'kitchen123' });
    assert.equal(kitchenRes.body.data.user.role, 'kitchen');
    assert.equal(kitchenRes.body.data.user.canManageInventory, false);
  });
});

