import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
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

router.post('/', requireAuth, validate(createFieldSchema), addField);
router.get('/', requireAuth, listFields);
router.patch('/:fieldId', requireAuth, validate(updateFieldSchema), updateField);
router.delete('/:fieldId', requireAuth, deleteField);

export default router;
