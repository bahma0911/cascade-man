import { Router } from 'express';
import { reportController } from '../controllers/reportController.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// Section 14: Reports are strictly restricted to administrators
router.use(authenticate);
router.use(requireRole('admin'));

// Section 14 Core Analytics
router.get('/dashboard', reportController.getDashboard);
router.get('/orders', reportController.getOrders);
router.get('/revenue', reportController.getRevenue);
router.get('/ingredient-costs', reportController.getIngredientCosts);
router.get('/wastage-costs', reportController.getWastageCosts);
router.get('/profit-loss', reportController.getProfitLoss);

// Backward-compatible Phase 6 routes
router.get('/sales', reportController.getSales);
router.get('/top-selling', reportController.getTopSelling);
router.get('/ingredient-usage', reportController.getIngredientUsage);
router.get('/low-stock', reportController.getLowStock);
router.get('/preparation-wastage', reportController.getPreparationWastage);

export default router;
