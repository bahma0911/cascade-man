import { Router } from 'express';
import {
  getMenuItems,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  createMenuItemSchema,
  updateMenuItemSchema,
} from '../controllers/menuController.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(authenticate);

router.get('/', getMenuItems);
router.post('/', requireRole('admin'), validate(createMenuItemSchema), createMenuItem);
router.patch('/:id', requireRole('admin'), validate(updateMenuItemSchema), updateMenuItem);
router.delete('/:id', requireRole('admin'), deleteMenuItem);

export default router;

