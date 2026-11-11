import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const defaultJwtSecret = 'default-dev-secret-do-not-use-in-production-123456';
const rawClientUrls = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((u) => u.trim().replace(/\/+$/, ''))
  .filter(Boolean);

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl: rawClientUrls[0] || 'http://localhost:5173',
  clientUrls: rawClientUrls,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cafe_management',
  jwtSecret: process.env.JWT_SECRET || defaultJwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  timezone: process.env.TIMEZONE || 'Africa/Addis_Ababa',
  // Section 15: Resend Email Configuration
  resendApiKey: process.env.RESEND_API_KEY || '',
  emailFrom: (() => {
    const rawFrom = process.env.RESEND_FROM || process.env.EMAIL_FROM || 'no-reply@bahma.com.et';
    const app = process.env.APP_NAME || 'Cascade Coffee';
    return rawFrom.includes('<') ? rawFrom : `${app} <${rawFrom}>`;
  })(),
  appName: process.env.APP_NAME || 'Cascade Coffee',
};

if (
  config.nodeEnv === 'production' &&
  (config.jwtSecret === defaultJwtSecret ||
    config.jwtSecret.includes('change-in-production') ||
    config.jwtSecret.length < 32)
) {
  console.warn(
    '[Security Warning] JWT_SECRET is weak or using a placeholder in production. Set a strong random secret (32+ chars) in Render environment variables!'
  );
}

