import mongoose from 'mongoose';
import net from 'net';
import dns from 'dns';
import { config } from './index.js';

let isConnected = false;
let isShuttingDown = false;
let memoryServerInstance = null;

// Configure public DNS servers (Google & Cloudflare) for reliable SRV resolution on Linux/ISP networks
try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch {
  // Ignored if custom DNS servers cannot be set in current environment
}

function checkPortOpen(host, port, timeoutMs = 500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let isOpen = false;

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      isOpen = true;
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      resolve(false);
    });
    socket.connect(port, host);
  });
}

export async function connectDB(customUri) {
  isShuttingDown = false;
  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  let uri = customUri || config.mongoUri;

  // In dev mode, check if 127.0.0.1:27017 is actually reachable before waiting for Mongoose timeout
  if (config.nodeEnv === 'development' && !customUri && uri.includes('127.0.0.1:27017')) {
    const isPortOpen = await checkPortOpen('127.0.0.1', 27017);
    if (!isPortOpen) {
      console.log('[Database] No local MongoDB server detected on 127.0.0.1:27017.');
      console.log('[Database] Starting built-in in-memory MongoDB replica for instant development...');

      const { MongoMemoryReplSet } = await import('mongodb-memory-server');
      memoryServerInstance = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
      uri = memoryServerInstance.getUri();

      mongoose.set('strictQuery', true);
      await mongoose.connect(uri, { maxPoolSize: 10 });
      isConnected = true;
      console.log(`[Database] In-memory MongoDB connected: ${uri}`);

      // Auto-seed in-memory DB with minimal admin/staff accounts (no sample tables/menu/ingredients)
      const { seedMinimal } = await import('../seed.js');
      await seedMinimal(uri);

      return mongoose.connection;
    }
  }

  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    });

    isConnected = true;
    console.log(`[Database] MongoDB connected: ${mongoose.connection.host}`);
    return mongoose.connection;
  } catch (err) {
    // In development mode, if connecting to remote DB fails for any reason (IP whitelist, network, DNS, auth),
    // automatically fall back to the in-memory MongoDB replica set so the backend starts immediately!
    if (config.nodeEnv === 'development') {
      console.warn(`[Database Warning] Could not connect to remote MongoDB: ${err.message}`);
      if (err.message?.includes('whitelist') || err.name?.includes('ServerSelectionError')) {
        console.warn('[Database Notice] Atlas IP Whitelist: To use your Atlas database directly, add your IP (or 0.0.0.0/0) in MongoDB Atlas -> Network Access.');
      }
      console.log('[Database] Starting built-in in-memory MongoDB replica for instant development...');

      const { MongoMemoryReplSet } = await import('mongodb-memory-server');
      memoryServerInstance = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
      const fallbackUri = memoryServerInstance.getUri();

      mongoose.set('strictQuery', true);
      await mongoose.connect(fallbackUri, { maxPoolSize: 10 });
      isConnected = true;
      console.log(`[Database] In-memory MongoDB connected: ${fallbackUri}`);

      // Auto-seed in-memory DB with minimal admin/staff accounts (no sample tables/menu/ingredients)
      const { seedMinimal } = await import('../seed.js');
      await seedMinimal(fallbackUri);

      return mongoose.connection;
    }

    console.error(`[Database Error] Failed to connect to MongoDB: ${err.message}`);
    throw err;
  }
}

export async function disconnectDB() {
  isShuttingDown = true;
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
    console.log('[Database] MongoDB disconnected cleanly');
  }
  if (memoryServerInstance) {
    await memoryServerInstance.stop();
    memoryServerInstance = null;
    console.log('[Database] In-memory MongoDB stopped');
  }
}

mongoose.connection.on('disconnected', () => {
  if (isConnected && !isShuttingDown) {
    isConnected = false;
    console.warn('[Database] MongoDB connection lost');
  }
});

mongoose.connection.on('error', (err) => {
  if (isConnected) {
    console.error('[Database Error]', err);
  }
});
