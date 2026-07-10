import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.middleware';
import {
  uploadDocument,
  listDocuments,
  getDocument,
  deleteDocument,
  shareDocument,
  getAuditLogs,
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

router.post('/upload', requireAuth, upload.single('pdf'), uploadDocument);
router.get('/', requireAuth, listDocuments);
router.get('/:id', requireAuth, getDocument);
router.delete('/:id', requireAuth, deleteDocument);
router.post('/:id/share', requireAuth, shareDocument);
router.get('/:id/audit', requireAuth, getAuditLogs);

// Nested field routes: /api/docs/:id/fields
router.use('/:id/fields', fieldRoutes);

export default router;
