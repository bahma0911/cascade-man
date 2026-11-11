import { Router } from 'express';
import {
  getIngredients,
  createIngredient,
  updateIngredient,
  deleteIngredient,
  createIngredientSchema,
  updateIngredientSchema,
} from '../controllers/ingredientController.js';
import { authenticate, requireRole, requireInventoryPermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(authenticate);

router.get('/', getIngredients);
router.post('/', requireInventoryPermission, validate(createIngredientSchema), createIngredient);
router.patch('/:id', requireInventoryPermission, validate(updateIngredientSchema), updateIngredient);
router.delete('/:id', requireRole('admin'), deleteIngredient);

export default router;

