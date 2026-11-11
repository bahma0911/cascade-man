import http from 'http';
import app from './app.js';
import { config } from './config/index.js';
import { connectDB, disconnectDB } from './config/db.js';
import { initSocketIO } from './sockets/socket.js';
import { reportEmailService } from './services/reportEmailService.js';
import { ensureDefaults } from './utils/ensureDefaults.js';

const server = http.createServer(app);

// Initialize Socket.IO with HTTP server
const io = initSocketIO(server);

async function startServer() {
  try {
    await connectDB();

    // Ensure barista user and station item types exist
    await ensureDefaults();

    // Start scheduled reports runner (Section 15.C)
    reportEmailService.startScheduledJob();

    server.listen(config.port, '0.0.0.0', () => {
      console.log(`[Server] Cafe & Restaurant API running on port ${config.port} in ${config.nodeEnv} mode`);
      console.log(`[Server] Health check: http://localhost:${config.port}/health`);
    });
  } catch (err) {
    console.error('[Server] Fatal startup error:', err);
    process.exit(1);
  }
}

// Graceful shutdown handling
function handleShutdown(signal) {
  console.log(`\n[Server] ${signal} signal received. Closing HTTP server and database connection...`);
  server.close(async () => {
    console.log('[Server] HTTP server closed');
    await disconnectDB();
    process.exit(0);
  });
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

startServer();

export { server, app, io };

