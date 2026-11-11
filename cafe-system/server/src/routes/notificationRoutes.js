import { Router } from 'express';
import { notificationController } from '../controllers/notificationController.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// Section 15.B: Email notification settings are exclusively accessible to administrators
router.use(authenticate);
router.use(requireRole('admin'));

router.get('/settings', notificationController.getSettings);
router.put('/settings', notificationController.updateSettings);
router.post('/test-email', notificationController.sendTestEmail);
router.get('/history', notificationController.getHistory);
router.get('/email-status', notificationController.getEmailStatus);
router.post('/trigger-report', notificationController.triggerReport);

export default router;

