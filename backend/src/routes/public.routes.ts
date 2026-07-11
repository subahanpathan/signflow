import { Router } from 'express';
import multer from 'multer';
import { asyncHandler } from '../middleware/asyncHandler.middleware';
import {
  getSigningDetails,
  signFieldPublic,
  finalizeDocumentPublic,
  rejectDocumentPublic,
  downloadDocumentPublic,
} from '../controllers/public.controller';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max for signature images
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed for signatures'));
    }
  },
});

router.get('/sign/:token', asyncHandler(getSigningDetails));
router.post('/sign/:token/fields/:fieldId', upload.single('signature'), asyncHandler(signFieldPublic));
router.post('/sign/:token/finalize', asyncHandler(finalizeDocumentPublic));
router.post('/sign/:token/reject', asyncHandler(rejectDocumentPublic));
router.get('/sign/:token/download', asyncHandler(downloadDocumentPublic));

export default router;
