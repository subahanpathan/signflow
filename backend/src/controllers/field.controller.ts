import { Response } from 'express';
import { z } from 'zod';
import { DocModel } from '../models/Document';
import { SignatureField } from '../models/SignatureField';
import { AuthRequest } from '../middleware/auth.middleware';
import { logAction } from '../lib/audit';

// ── Zod schema for creating a field ──────────────────────────────────────────
export const createFieldSchema = z.object({
  page:        z.number().int().min(1),
  x:           z.number().min(0).max(1),
  y:           z.number().min(0).max(1),
  width:       z.number().min(0.01).max(1),
  height:      z.number().min(0.01).max(1),
  signerEmail: z.string().email().or(z.literal('')),
});

export const updateFieldSchema = z.object({
  page:        z.number().int().min(1).optional(),
  x:           z.number().min(0).max(1).optional(),
  y:           z.number().min(0).max(1).optional(),
  width:       z.number().min(0.01).max(1).optional(),
  height:      z.number().min(0.01).max(1).optional(),
  signerEmail: z.string().email().or(z.literal('')).optional(),
});

// ── Helper: verify ownership and editable status ──────────────────────────────
const resolveDoc = async (docId: string, userId: string, res: Response) => {
  const doc = await DocModel.findById(docId);
  if (!doc) { res.status(404).json({ message: 'Document not found' }); return null; }
  if (doc.ownerId.toString() !== userId) { res.status(403).json({ message: 'Forbidden' }); return null; }
  if (!['draft', 'pending'].includes(doc.status)) {
    res.status(400).json({ message: 'Fields can only be edited on draft or pending documents' });
    return null;
  }
  return doc;
};

// ── POST /api/docs/:id/fields ─────────────────────────────────────────────────
export const addField = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = (req.user!._id as any).toString();
    const doc = await resolveDoc(req.params.id as string, userId, res);
    if (!doc) return;

    const { page, x, y, width, height, signerEmail } = req.body;

    // Validate page is within the document
    if (page > doc.pageCount) {
      res.status(400).json({ message: `Page ${page} does not exist in this document (${doc.pageCount} pages total)` });
      return;
    }

    const field = await SignatureField.create({
      documentId: doc._id,
      page, x, y, width, height, signerEmail,
    });

    await logAction(req, doc._id, 'field_placed', req.user!.email, {
      fieldId: field._id,
      page,
      x,
      y,
      signerEmail,
    });

    res.status(201).json({ field });
  } catch (error) {
    console.error('Add field error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/docs/:id/fields ──────────────────────────────────────────────────
export const listFields = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = (req.user!._id as any).toString();
    const doc = await DocModel.findById(req.params.id);
    if (!doc) { res.status(404).json({ message: 'Document not found' }); return; }
    if (doc.ownerId.toString() !== userId) { res.status(403).json({ message: 'Forbidden' }); return; }

    const fields = await SignatureField.find({ documentId: doc._id }).sort({ createdAt: 1 });
    res.json({ fields });
  } catch (error) {
    console.error('List fields error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ── DELETE /api/docs/:id/fields/:fieldId ──────────────────────────────────────
export const deleteField = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = (req.user!._id as any).toString();
    const doc = await resolveDoc(req.params.id as string, userId, res);
    if (!doc) return;

    const field = await SignatureField.findOne({
      _id: req.params.fieldId,
      documentId: doc._id,
    });

    if (!field) { res.status(404).json({ message: 'Field not found' }); return; }

    await field.deleteOne();

    await logAction(req, doc._id, 'field_deleted', req.user!.email, {
      fieldId: field._id,
      page: field.page,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete field error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ── PATCH /api/docs/:id/fields/:fieldId ──────────────────────────────────────
export const updateField = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = (req.user!._id as any).toString();
    const doc = await resolveDoc(req.params.id as string, userId, res);
    if (!doc) return;

    const field = await SignatureField.findOne({
      _id: req.params.fieldId,
      documentId: doc._id,
    });

    if (!field) {
      res.status(404).json({ message: 'Field not found' });
      return;
    }

    const { page, x, y, width, height, signerEmail } = req.body;

    if (page !== undefined) {
      if (page > doc.pageCount) {
        res.status(400).json({
          message: `Page ${page} does not exist in this document (${doc.pageCount} pages total)`
        });
        return;
      }
      field.page = page;
    }
    if (x !== undefined) field.x = x;
    if (y !== undefined) field.y = y;
    if (width !== undefined) field.width = width;
    if (height !== undefined) field.height = height;
    if (signerEmail !== undefined) field.signerEmail = signerEmail;

    await field.save();

    await logAction(req, doc._id, 'field_updated', req.user!.email, {
      fieldId: field._id,
      page: field.page,
      x: field.x,
      y: field.y,
      signerEmail: field.signerEmail,
    });

    res.json({ field });
  } catch (error) {
    console.error('Update field error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
