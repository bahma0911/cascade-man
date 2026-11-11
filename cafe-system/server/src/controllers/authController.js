import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { config } from '../config/index.js';
import { User } from '../models/User.js';

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export async function login(req, res, next) {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({
      username: username.toLowerCase().trim(),
      isActive: true,
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Invalid username or password',
          code: 'INVALID_CREDENTIALS',
        },
      });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Invalid username or password',
          code: 'INVALID_CREDENTIALS',
        },
      });
    }

    const payload = {
      id: user._id.toString(),
      role: user.role,
      canManageInventory: user.canManageInventory,
    };

    const token = jwt.sign(payload, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn,
    });

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user._id,
          name: user.name,
          username: user.username,
          role: user.role,
          canManageInventory: user.canManageInventory,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getMe(req, res) {
  res.json({
    success: true,
    data: {
      user: {
        id: req.user._id,
        name: req.user.name,
        username: req.user.username,
        role: req.user.role,
        canManageInventory: req.user.canManageInventory,
      },
    },
  });
}

