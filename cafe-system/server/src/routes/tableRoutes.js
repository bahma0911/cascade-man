import { Router } from 'express';
import {
  getTables,
  createTable,
  updateTable,
  deleteTable,
  createTableSchema,
  updateTableSchema,
} from '../controllers/tableController.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(authenticate);

router.get('/', getTables);
router.post('/', requireRole('admin'), validate(createTableSchema), createTable);
router.patch('/:id', requireRole('admin'), validate(updateTableSchema), updateTable);
router.delete('/:id', requireRole('admin'), deleteTable);

export default router;

