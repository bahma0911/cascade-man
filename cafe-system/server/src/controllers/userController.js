import bcrypt from 'bcrypt';
import { z } from 'zod';
import { User } from '../models/User.js';

export const createUserSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  username: z.string().trim().min(3, 'Username must be at least 3 characters').max(50),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['waiter', 'kitchen', 'barista', 'admin']),
  canManageInventory: z.boolean().default(false),
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  role: z.enum(['waiter', 'kitchen', 'barista', 'admin']).optional(),
  canManageInventory: z.boolean().optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(6, 'Password must be at least 6 characters').optional(),
});

export async function getUsers(req, res, next) {
  try {
    const users = await User.find().select('-passwordHash').sort({ createdAt: -1 });
    res.json({
      success: true,
      data: { users },
    });
  } catch (err) {
    next(err);
  }
}

export async function createUser(req, res, next) {
  try {
    const { name, username, password, role, canManageInventory } = req.body;

    const normalizedUsername = username.toLowerCase().trim();
    const existing = await User.findOne({ username: normalizedUsername });
    if (existing) {
      return res.status(409).json({
        success: false,
        error: { message: 'Username is already taken', code: 'DUPLICATE_USERNAME' },
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      username: normalizedUsername,
      passwordHash,
      role,
      canManageInventory: role === 'admin' ? true : canManageInventory || false,
      isActive: true,
    });

    res.status(201).json({
      success: true,
      data: { user: user.toJSON() },
    });
  } catch (err) {
    next(err);
  }
}

export async function updateUser(req, res, next) {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: { message: 'User not found', code: 'NOT_FOUND' },
      });
    }

    const { name, role, canManageInventory, isActive, password } = req.body;
    const isSelf = id === req.user._id.toString();

    if (isSelf && isActive === false) {
      return res.status(400).json({
        success: false,
        error: { message: 'Cannot deactivate your own account', code: 'BAD_REQUEST' },
      });
    }
    if (isSelf && role !== undefined && role !== 'admin') {
      return res.status(400).json({
        success: false,
        error: { message: 'Cannot downgrade your own administrator role', code: 'BAD_REQUEST' },
      });
    }

    if (name !== undefined) user.name = name;
    if (role !== undefined) {
      user.role = role;
      if (role === 'admin') user.canManageInventory = true;
    }
    if (canManageInventory !== undefined) user.canManageInventory = canManageInventory;
    if (isActive !== undefined) user.isActive = isActive;

    if (password) {
      user.passwordHash = await bcrypt.hash(password, 10);
    }

    await user.save();

    res.json({
      success: true,
      data: { user: user.toJSON() },
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteUser(req, res, next) {
  try {
    const { id } = req.params;

    // Prevent deleting self
    if (id === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        error: { message: 'Cannot deactivate your own account', code: 'BAD_REQUEST' },
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: { message: 'User not found', code: 'NOT_FOUND' },
      });
    }

    if (req.query.permanent === 'true' || req.query.force === 'true') {
      await User.findByIdAndDelete(id);
      return res.json({
        success: true,
        data: { message: 'User permanently deleted from database', hardDeleted: true },
      });
    }

    user.isActive = false;
    await user.save();

    res.json({
      success: true,
      data: { message: 'User deactivated successfully (soft delete)', user: user.toJSON() },
    });
  } catch (err) {
    next(err);
  }
}

