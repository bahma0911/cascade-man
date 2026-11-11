import { config } from '../config/index.js';

/**
 * Validates HTTP and Socket.IO request origins against configured allowed origins.
 * Supports comma-separated CLIENT_URL entries as well as Render's RENDER_EXTERNAL_URL.
 */
export function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (config.nodeEnv === 'development' || config.nodeEnv === 'test') return true;

  const normalizedOrigin = origin.replace(/\/+$/, '');
  const allowed = [...config.clientUrls];

  if (process.env.RENDER_EXTERNAL_URL) {
    allowed.push(process.env.RENDER_EXTERNAL_URL.trim().replace(/\/+$/, ''));
  }

  return allowed.includes(normalizedOrigin);
}

export function corsOriginHandler(origin, callback) {
  if (isAllowedOrigin(origin)) {
    return callback(null, true);
  }
  return callback(new Error(`CORS not allowed for origin: ${origin}`), false);
}
