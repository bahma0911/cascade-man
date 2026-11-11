import { Router } from 'express';
import {
  createOrder,
  addItemsToOrder,
  updateItemStatus,
  cancelItem,
  closeOrder,
  cancelOrder,
  getActiveOrders,
  getMyOrders,
  getOrderById,
  getOrderHistory,
  createOrderSchema,
  addItemsSchema,
  updateItemStatusSchema,
  cancelItemSchema,
} from '../controllers/orderController.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(authenticate);

// List endpoints
router.get('/active', getActiveOrders);
router.get('/mine', requireRole('waiter', 'admin'), getMyOrders);
router.get('/', getOrderHistory);
router.get('/:id', getOrderById);

// Order creation and modifications
router.post('/', requireRole('waiter', 'admin'), validate(createOrderSchema), createOrder);
router.post('/:id/items', requireRole('waiter', 'admin'), validate(addItemsSchema), addItemsToOrder);
router.patch('/:id/items/:itemId/status', validate(updateItemStatusSchema), updateItemStatus);
router.patch('/:id/items/:itemId/cancel', validate(cancelItemSchema), cancelItem);
router.patch('/:id/close', requireRole('waiter', 'admin'), closeOrder);
router.patch('/:id/cancel', requireRole('waiter', 'admin'), cancelOrder);

export default router;

