import { Router } from 'express';
import { expenseController } from '../controllers/expenseController.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// Operating expenses are managed exclusively by administrator
router.use(authenticate);
router.use(requireRole('admin'));

router.post('/', expenseController.create);
router.get('/', expenseController.getAll);
router.get('/summary', expenseController.getSummary);
router.delete('/:id', expenseController.delete);

export default router;

