import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { login, getMe, loginSchema } from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

// Rate limiter for login: max 15 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      message: 'Too many login attempts. Please try again in 15 minutes.',
      code: 'TOO_MANY_REQUESTS',
    },
  },
});

router.post('/login', loginLimiter, validate(loginSchema), login);
router.get('/me', authenticate, getMe);

export default router;

