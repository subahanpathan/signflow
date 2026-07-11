import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/asyncHandler.middleware';
import {
  uploadDocument,
  listDocuments,
  getDocument,
  deleteDocument,
  shareDocument,
  getAuditLogs,
  downloadDocument,
} from '../controllers/document.controller';
import fieldRoutes from './field.routes';

const router = Router();

// Buffer mode — files go straight to Supabase, never touch disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
});

router.post('/upload', requireAuth, upload.single('pdf'), asyncHandler(uploadDocument));
router.get('/', requireAuth, asyncHandler(listDocuments));
router.get('/:id', requireAuth, asyncHandler(getDocument));
router.get('/:id/download', requireAuth, asyncHandler(downloadDocument));
router.delete('/:id', requireAuth, asyncHandler(deleteDocument));
router.post('/:id/share', requireAuth, asyncHandler(shareDocument));
router.get('/:id/audit', requireAuth, asyncHandler(getAuditLogs));

// Nested field routes: /api/docs/:id/fields
router.use('/:id/fields', fieldRoutes);

export default router;
