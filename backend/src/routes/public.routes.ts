import { Router } from 'express';
import multer from 'multer';
import {
  getSigningDetails,
  signFieldPublic,
  finalizeDocumentPublic,
  rejectDocumentPublic,
} from '../controllers/public.controller';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max for signature images
});

router.get('/sign/:token', getSigningDetails);
router.post('/sign/:token/fields/:fieldId', upload.single('signature'), signFieldPublic);
router.post('/sign/:token/finalize', finalizeDocumentPublic);
router.post('/sign/:token/reject', rejectDocumentPublic);

export default router;
