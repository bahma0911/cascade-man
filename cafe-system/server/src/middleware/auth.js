import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { User } from '../models/User.js';

export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Authentication token is missing or malformed',
          code: 'UNAUTHORIZED',
        },
      });
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, config.jwtSecret);
    } catch (err) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Invalid or expired authentication token',
          code: 'UNAUTHORIZED',
        },
      });
    }

    const user = await User.findById(decoded.id).select('-passwordHash');
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'User account is inactive or no longer exists',
          code: 'UNAUTHORIZED',
        },
      });
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Authentication required',
          code: 'UNAUTHORIZED',
        },
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          message: `Access forbidden for role: ${req.user.role}`,
          code: 'FORBIDDEN',
        },
      });
    }

    next();
  };
}

export function requireInventoryPermission(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: {
        message: 'Authentication required',
        code: 'UNAUTHORIZED',
      },
    });
  }

  const hasPermission =
    req.user.role === 'admin' ||
    (req.user.role === 'waiter' && req.user.canManageInventory);

  if (!hasPermission) {
    return res.status(403).json({
      success: false,
      error: {
        message: 'Inventory management permission required',
        code: 'FORBIDDEN_INVENTORY',
      },
    });
  }

  next();
}

