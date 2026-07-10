import { Request, Response } from 'express';
import { z } from 'zod';
import { PDFDocument } from 'pdf-lib';
import crypto from 'crypto';
import { DocModel } from '../models/Document';
import { SignatureField } from '../models/SignatureField';
import { SigningToken } from '../models/SigningToken';
import { AuditLog } from '../models/AuditLog';
import { supabase } from '../lib/supabase';
import { AuthRequest } from '../middleware/auth.middleware';
import { logAction } from '../lib/audit';

const BUCKET = 'documents';

// ── Upload a PDF ──────────────────────────────────────────────────────────────
export const uploadDocument = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ message: 'No PDF file uploaded' });
      return;
    }

    const userId = (req.user!._id as any).toString();
    const buffer = req.file.buffer;

    // Determine page count using pdf-lib
    let pageCount = 0;
    try {
      const pdfDoc = await PDFDocument.load(buffer);
      pageCount = pdfDoc.getPageCount();
    } catch {
      res.status(400).json({ message: 'Invalid or corrupt PDF file' });
      return;
    }

    const title = req.body.title?.trim() || req.file.originalname.replace(/\.pdf$/i, '');
    const storagePath = `${userId}/${Date.now()}_${req.file.originalname}`;

    // Upload to Supabase private bucket
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (uploadError) {
      console.error('Supabase upload error:', uploadError);
      res.status(500).json({ message: 'Failed to upload file to storage' });
      return;
    }

    const document = await DocModel.create({
      ownerId: userId,
      title,
      originalFileUrl: storagePath,
      signedFileUrl: null,
      status: 'draft',
      pageCount,
    });

    await logAction(req, document._id, 'document_uploaded', req.user!.email, {
      title,
      pageCount,
    });

    res.status(201).json({ document });
  } catch (error) {
    console.error('Upload document error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ── List caller's documents ───────────────────────────────────────────────────
export const listDocuments = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const documents = await DocModel.find({ ownerId: (req.user!._id as any).toString() }).sort({ createdAt: -1 });
    res.json({ documents });
  } catch (error) {
    console.error('List documents error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ── Get single document (owner only) ─────────────────────────────────────────
export const getDocument = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const document = await DocModel.findById(req.params.id);

    if (!document) {
      res.status(404).json({ message: 'Document not found' });
      return;
    }

    if (document.ownerId.toString() !== (req.user!._id as any).toString()) {
      res.status(403).json({ message: 'Forbidden' });
      return;
    }

    const filePath = document.status === 'signed' && document.signedFileUrl ? document.signedFileUrl : document.originalFileUrl;

    // Generate a short-lived signed URL for the PDF so the frontend can render it
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(filePath, 60 * 5); // 5 minute expiry

    if (error) {
      console.error('Signed URL error:', error);
      res.status(500).json({ message: 'Could not generate file URL' });
      return;
    }

    res.json({ document: { ...document.toObject(), viewUrl: data.signedUrl } });
  } catch (error) {
    console.error('Get document error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ── Delete document (owner only) ──────────────────────────────────────────────
export const deleteDocument = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const document = await DocModel.findById(req.params.id);

    if (!document) {
      res.status(404).json({ message: 'Document not found' });
      return;
    }

    if (document.ownerId.toString() !== (req.user!._id as any).toString()) {
      res.status(403).json({ message: 'Forbidden' });
      return;
    }

    // Remove from Supabase storage
    await supabase.storage.from(BUCKET).remove([document.originalFileUrl]);
    if (document.signedFileUrl) {
      await supabase.storage.from(BUCKET).remove([document.signedFileUrl]);
    }

    await document.deleteOne();
    res.json({ success: true });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ── POST /api/docs/:id/share ──────────────────────────────────────────────────
export const shareDocument = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const documentId = req.params.id;
    const userId = (req.user!._id as any).toString();

    const document = await DocModel.findById(documentId);
    if (!document) {
      res.status(404).json({ message: 'Document not found' });
      return;
    }

    if (document.ownerId.toString() !== userId) {
      res.status(403).json({ message: 'Forbidden' });
      return;
    }

    if (document.status === 'signed' || document.status === 'rejected') {
      res.status(400).json({ message: 'Cannot share signed or rejected documents' });
      return;
    }

    // Find all signature fields for this document
    const fields = await SignatureField.find({ documentId: document._id });
    if (fields.length === 0) {
      res.status(400).json({ message: 'At least one signature field must be placed before sharing' });
      return;
    }

    // Check if any fields are missing signer email
    const hasUnassigned = fields.some(f => !f.signerEmail);
    if (hasUnassigned) {
      res.status(400).json({ message: 'All signature fields must have a signer email assigned' });
      return;
    }

    // Extract unique emails
    const uniqueEmails = Array.from(new Set(fields.map(f => f.signerEmail.toLowerCase())));

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const links: { email: string; link: string }[] = [];

    // For each email, find or create a token
    for (const email of uniqueEmails) {
      // Find existing active token
      let tokenObj = await SigningToken.findOne({
        documentId: document._id,
        signerEmail: email,
        usedAt: null,
        expiresAt: { $gt: new Date() },
      });

      if (!tokenObj) {
        // Generate new token
        const tokenString = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

        tokenObj = await SigningToken.create({
          documentId: document._id,
          signerEmail: email,
          token: tokenString,
          expiresAt,
        });
      }

      links.push({
        email,
        link: `${frontendUrl}/sign/${tokenObj.token}`,
      });
    }

    // Update document status to pending
    if (document.status === 'draft') {
      document.status = 'pending';
      await document.save();
    }

    await logAction(req, document._id, 'document_published', req.user!.email, {
      signerEmails: uniqueEmails,
    });

    res.json({ links });
  } catch (error) {
    console.error('Share document error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/docs/:id/audit ───────────────────────────────────────────────────
export const getAuditLogs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const documentId = req.params.id;
    const userId = (req.user!._id as any).toString();

    const document = await DocModel.findById(documentId);
    if (!document) {
      res.status(404).json({ message: 'Document not found' });
      return;
    }

    if (document.ownerId.toString() !== userId) {
      res.status(403).json({ message: 'Forbidden' });
      return;
    }

    const logs = await AuditLog.find({ documentId: document._id }).sort({ createdAt: -1 });
    res.json({ logs });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
