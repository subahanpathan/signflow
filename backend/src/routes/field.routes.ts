import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { asyncHandler } from '../middleware/asyncHandler.middleware';
import {
  addField,
  listFields,
  deleteField,
  updateField,
  createFieldSchema,
  updateFieldSchema,
} from '../controllers/field.controller';

// Mounted at /api/docs/:id/fields (the :id param is inherited from the parent router)
const router = Router({ mergeParams: true });

router.post('/', requireAuth, validate(createFieldSchema), asyncHandler(addField));
router.get('/', requireAuth, asyncHandler(listFields));
router.patch('/:fieldId', requireAuth, validate(updateFieldSchema), asyncHandler(updateField));
router.delete('/:fieldId', requireAuth, asyncHandler(deleteField));

export default router;
