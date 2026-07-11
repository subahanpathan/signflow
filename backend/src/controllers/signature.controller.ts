import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { SignatureField } from '../models/SignatureField';
import { DocModel } from '../models/Document';
import { supabase } from '../lib/supabase';
import { asyncHandler } from '../middleware/asyncHandler.middleware';
import multer from 'multer';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed for signatures'));
    }
  },
});

// ── POST /api/docs/:id/fields/:fieldId/sign ─────────────────────────────────────
export const signField = [
  upload.single('signature'),
  asyncHandler(
    async (req: AuthRequest, res: Response): Promise<void> => {
      try {
      const userId = (req.user!._id as any).toString();
      const { id: docId, fieldId } = req.params;

      // Verify ownership of document
      const doc = await DocModel.findById(docId);
      if (!doc) { res.status(404).json({ message: 'Document not found' }); return; }
      if (doc.ownerId.toString() !== userId) { res.status(403).json({ message: 'Forbidden' }); return; }

      // Find field
      const field = await SignatureField.findOne({ _id: fieldId, documentId: doc._id });
      if (!field) { res.status(404).json({ message: 'Signature field not found' }); return; }
      if (field.status === 'signed') { res.status(400).json({ message: 'Field already signed' }); return; }

      if (!req.file) { res.status(400).json({ message: 'Signature image required' }); return; }

      const fileBuffer = req.file.buffer;
      const ext = req.file.mimetype.split('/')[1] || 'png';
      const storagePath = `signatures/${docId}/${fieldId}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('signatures')
        .upload(storagePath, fileBuffer, { contentType: req.file.mimetype, upsert: false });

      if (uploadError) {
        console.error('Supabase signature upload error:', uploadError);
        res.status(500).json({ message: 'Failed to store signature' });
        return;
      }

      // Update field
      field.signatureImageUrl = storagePath;
      field.status = 'signed';
      field.signedAt = new Date();
      await field.save();

      res.json({ field });
    } catch (error) {
      console.error('Sign field error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  })
];

// ── POST /api/docs/:id/sign (finalize document) ───────────────────────────────────
export const finalizeDocument = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = (req.user!._id as any).toString();
    const doc = await DocModel.findById(req.params.id);
    if (!doc) { res.status(404).json({ message: 'Document not found' }); return; }
    if (doc.ownerId.toString() !== userId) { res.status(403).json({ message: 'Forbidden' }); return; }

    // Ensure all fields signed
    const unsigned = await SignatureField.countDocuments({ documentId: doc._id, status: 'unsigned' });
    if (unsigned > 0) { res.status(400).json({ message: 'Not all fields are signed' }); return; }

    doc.status = 'signed';
    await doc.save();
    res.json({ document: doc });
  } catch (error) {
    console.error('Finalize document error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
