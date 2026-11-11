import { Router } from 'express';
import {
  recordDelivery,
  recordWaste,
  recordStockCount,
  recordCorrection,
  getMovements,
  deliverySchema,
  wasteSchema,
  countSchema,
  correctionSchema,
} from '../controllers/inventoryController.js';
import { authenticate, requireRole, requireInventoryPermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(authenticate);

// Deliveries (Admin or Waiter with permission)
router.post('/deliveries', requireInventoryPermission, validate(deliverySchema), recordDelivery);

// Waste log (Admin, Waiter with permission, or Kitchen staff for prep waste)
const allowWasteRecording = (req, res, next) => {
  if (
    req.user.role === 'admin' ||
    req.user.role === 'kitchen' ||
    (req.user.role === 'waiter' && req.user.canManageInventory)
  ) {
    return next();
  }
  return res.status(403).json({
    success: false,
    error: { message: 'Permission required to log waste', code: 'FORBIDDEN' },
  });
};
router.post('/waste', allowWasteRecording, validate(wasteSchema), recordWaste);

// Physical Stock Count
router.post('/counts', requireInventoryPermission, validate(countSchema), recordStockCount);

// Ledger Corrections (Admin ONLY - Rule 9)
router.post('/corrections', requireRole('admin'), validate(correctionSchema), recordCorrection);

// Movement Audit Ledger (Admin, Waiter with permission, Kitchen)
router.get('/movements', getMovements);

export default router;

