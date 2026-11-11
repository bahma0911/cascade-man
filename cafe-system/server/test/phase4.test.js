import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import request from 'supertest';
import { io as ClientIO } from 'socket.io-client';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { seedDatabase } from '../src/seed.js';
import { initSocketIO } from '../src/sockets/socket.js';
import { MenuItem } from '../src/models/MenuItem.js';
import { Table } from '../src/models/Table.js';

describe(' Real-time Socket.IO Events & Kitchen Notifications', () => {
  let replSet;
  let httpServer;
  let serverPort;
  let adminToken;
  let waiterToken;
  let kitchenToken;

  before(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const uri = replSet.getUri();
    await connectDB(uri);
    await seedDatabase(uri);

    httpServer = http.createServer(app);
    initSocketIO(httpServer);

    await new Promise((resolve) => {
      httpServer.listen(0, () => {
        serverPort = httpServer.address().port;
        resolve();
      });
    });

    const adminLogin = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    adminToken = adminLogin.body.data.token;

    const waiterLogin = await request(app).post('/api/auth/login').send({ username: 'waiter', password: 'waiter123' });
    waiterToken = waiterLogin.body.data.token;

    const kitchenLogin = await request(app).post('/api/auth/login').send({ username: 'kitchen', password: 'kitchen123' });
    kitchenToken = kitchenLogin.body.data.token;
  });

  after(async () => {
    await new Promise((resolve) => httpServer.close(resolve));
    await disconnectDB();
    if (replSet) {
      await replSet.stop();
    }
  });

  test('Socket connection rejects connection without authentication token', async () => {
    await assert.rejects(
      () =>
        new Promise((resolve, reject) => {
          const client = ClientIO(`http://localhost:${serverPort}`, {
            transports: ['websocket'],
            reconnection: false,
          });
          client.on('connect_error', (err) => {
            client.close();
            reject(err);
          });
          client.on('connect', () => {
            client.close();
            resolve();
          });
        }),
      /Authentication token required/
    );
  });

  test('Kitchen client connects and receives order:new event when waiter places an order', async () => {
    const table = await Table.findOne({ name: 'Table 1' });
    const espresso = await MenuItem.findOne({ name: 'Single Espresso' });

    const kitchenSocket = ClientIO(`http://localhost:${serverPort}`, {
      auth: { token: kitchenToken },
      transports: ['websocket'],
    });

    await new Promise((resolve) => kitchenSocket.on('connect', resolve));

    const receivedOrderPromise = new Promise((resolve) => {
      kitchenSocket.on('order:new', (data) => {
        resolve(data);
      });
    });

    // Waiter places order
    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${waiterToken}`)
      .send({
        tableId: table._id,
        items: [{ menuItemId: espresso._id, quantity: 1 }],
      });

    assert.equal(orderRes.status, 201);

    const received = await receivedOrderPromise;
    assert.ok(received.order);
    assert.equal(received.order._id, orderRes.body.data.order._id);
    assert.equal(received.order.items[0].nameSnapshot, 'Single Espresso');

    kitchenSocket.close();
  });

  test('Waiter client receives item:status-changed event when kitchen marks item ready', async () => {
    const table = await Table.findOne({ name: 'Table 2' });
    const espresso = await MenuItem.findOne({ name: 'Single Espresso' });

    const waiterSocket = ClientIO(`http://localhost:${serverPort}`, {
      auth: { token: waiterToken },
      transports: ['websocket'],
    });

    await new Promise((resolve) => waiterSocket.on('connect', resolve));

    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${waiterToken}`)
      .send({
        tableId: table._id,
        items: [{ menuItemId: espresso._id, quantity: 1 }],
      });

    const orderId = orderRes.body.data.order._id;
    const itemId = orderRes.body.data.order.items[0]._id;

    const statusChangedPromise = new Promise((resolve) => {
      waiterSocket.on('item:status-changed', (data) => {
        if (data.status === 'ready') {
          resolve(data);
        }
      });
    });

    // Kitchen marks item preparing then ready
    await request(app)
      .patch(`/api/orders/${orderId}/items/${itemId}/status`)
      .set('Authorization', `Bearer ${kitchenToken}`)
      .send({ status: 'preparing' });

    await request(app)
      .patch(`/api/orders/${orderId}/items/${itemId}/status`)
      .set('Authorization', `Bearer ${kitchenToken}`)
      .send({ status: 'ready' });

    const statusEvent = await statusChangedPromise;
    assert.equal(statusEvent.orderId, orderId);
    assert.equal(statusEvent.itemId, itemId);
    assert.equal(statusEvent.status, 'ready');

    waiterSocket.close();
  });

  test('Late-entry order does NOT notify kitchen room', async () => {
    const table = await Table.findOne({ name: 'Patio 1' });
    const macchiato = await MenuItem.findOne({ name: 'Ethiopian Macchiato' });

    const kitchenSocket = ClientIO(`http://localhost:${serverPort}`, {
      auth: { token: kitchenToken },
      transports: ['websocket'],
    });

    await new Promise((resolve) => kitchenSocket.on('connect', resolve));

    let kitchenNotified = false;
    kitchenSocket.on('order:new', () => {
      kitchenNotified = true;
    });

    // Waiter submits late entry order
    const lateRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${waiterToken}`)
      .send({
        tableId: table._id,
        items: [{ menuItemId: macchiato._id, quantity: 1 }],
        lateEntry: true,
      });

    assert.equal(lateRes.status, 201);
    assert.equal(lateRes.body.data.order.lateEntry, true);

    // Give time to ensure event was not received
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(kitchenNotified, false);

    kitchenSocket.close();
  });
});

