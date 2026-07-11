import { Request, Response } from 'express';
import { PDFDocument } from 'pdf-lib';
import { DocModel } from '../models/Document';
import { SignatureField } from '../models/SignatureField';
import { SigningToken } from '../models/SigningToken';
import { supabase } from '../lib/supabase';
import { logAction } from '../lib/audit';
import multer from 'multer';

const BUCKET_DOCS = 'documents';
const BUCKET_SIGS = 'signatures';

// Helper to validate a signing token
const getValidToken = async (tokenString: string, res: Response) => {
  const tokenObj = await SigningToken.findOne({ token: tokenString });

  if (!tokenObj) {
    res.status(404).json({ message: 'Signing token not found' });
    return null;
  }

  if (tokenObj.usedAt) {
    res.status(400).json({ message: 'Signing token has already been used' });
    return null;
  }

  if (tokenObj.expiresAt < new Date()) {
    res.status(400).json({ message: 'Signing token has expired' });
    return null;
  }

  return tokenObj;
};

// ── GET /api/public/sign/:token ───────────────────────────────────────────────
export const getSigningDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.params;
    const tokenObj = await getValidToken(token as string, res);
    if (!tokenObj) return;

    const document = await DocModel.findById(tokenObj.documentId);
    if (!document) {
      res.status(404).json({ message: 'Document not found' });
      return;
    }

    // Generate short-lived signed URL for PDF
    const { data, error } = await supabase.storage
      .from(BUCKET_DOCS)
      .createSignedUrl(document.originalFileUrl, 60 * 15); // 15 mins

    if (error) {
      console.error('Supabase signed URL error:', error);
      res.status(500).json({ message: 'Could not retrieve document PDF' });
      return;
    }

    // Get fields for this document
    const fields = await SignatureField.find({ documentId: document._id }).sort({ createdAt: 1 });

    res.json({
      document: {
        _id: document._id,
        title: document.title,
        status: document.status,
        pageCount: document.pageCount,
        viewUrl: data.signedUrl,
      },
      fields,
      signerEmail: tokenObj.signerEmail,
    });
  } catch (error) {
    console.error('Get signing details error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ── POST /api/public/sign/:token/fields/:fieldId ───────────────────────────────
export const signFieldPublic = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, fieldId } = req.params;
    const tokenObj = await getValidToken(token as string, res);
    if (!tokenObj) return;

    if (!req.file) {
      res.status(400).json({ message: 'Signature image is required' });
      return;
    }

    const field = await SignatureField.findOne({
      _id: fieldId,
      documentId: tokenObj.documentId,
    });

    if (!field) {
      res.status(404).json({ message: 'Signature field not found' });
      return;
    }

    // Security check: must match token's signer email (lowercase)
    if (field.signerEmail.toLowerCase() !== tokenObj.signerEmail.toLowerCase()) {
      res.status(403).json({ message: 'You are not authorized to sign this field' });
      return;
    }

    if (field.status === 'signed') {
      res.status(400).json({ message: 'Field is already signed' });
      return;
    }

    // Upload signature image to Supabase
    const fileBuffer = req.file.buffer;
    const ext = req.file.mimetype.split('/')[1] || 'png';
    const storagePath = `${tokenObj.documentId}/${field._id}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_SIGS)
      .upload(storagePath, fileBuffer, {
        contentType: req.file.mimetype,
        upsert: false,
      });

    if (uploadError) {
      console.error('Supabase signature upload error:', uploadError);
      res.status(500).json({ message: 'Failed to upload signature' });
      return;
    }

    // Update field
    field.signatureImageUrl = storagePath;
    field.status = 'signed';
    field.signedAt = new Date();
    await field.save();

    await logAction(req, tokenObj.documentId, 'field_signed', tokenObj.signerEmail, {
      fieldId: field._id,
      page: field.page,
    });

    res.json({ field });
  } catch (error) {
    console.error('Sign field public error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ── POST /api/public/sign/:token/finalize ───────────────────────────────────────
export const finalizeDocumentPublic = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.params;
    const tokenObj = await getValidToken(token as string, res);
    if (!tokenObj) return;

    const document = await DocModel.findById(tokenObj.documentId);
    if (!document) {
      res.status(404).json({ message: 'Document not found' });
      return;
    }

    // Verify if all fields on the document are signed
    const unsignedCount = await SignatureField.countDocuments({
      documentId: document._id,
      status: 'unsigned',
    });

    if (unsignedCount > 0) {
      res.status(400).json({
        message: `Cannot finalize. There are still ${unsignedCount} unsigned fields in this document.`,
      });
      return;
    }

    // ── PDF Finalization / Burning Signatures ──────────────────────────────
    // 1. Download original PDF from Supabase
    const { data: pdfData, error: pdfDownloadError } = await supabase.storage
      .from(BUCKET_DOCS)
      .download(document.originalFileUrl);

    if (pdfDownloadError || !pdfData) {
      console.error('Failed to download original PDF:', pdfDownloadError);
      res.status(500).json({ message: 'Failed to retrieve original PDF for finalization' });
      return;
    }

    const pdfArrayBuffer = await pdfData.arrayBuffer();
    const pdfDoc = await PDFDocument.load(pdfArrayBuffer);
    const pages = pdfDoc.getPages();

    // 2. Fetch all fields with their signature images
    const signedFields = await SignatureField.find({
      documentId: document._id,
      status: 'signed',
    });

    // 3. Draw each signature onto the PDF
    for (const field of signedFields) {
      if (!field.signatureImageUrl) continue;

      const { data: sigData, error: sigDownloadError } = await supabase.storage
        .from(BUCKET_SIGS)
        .download(field.signatureImageUrl);

      if (sigDownloadError || !sigData) {
        console.error(`Failed to download signature for field ${field._id}:`, sigDownloadError);
        res.status(500).json({ message: 'Failed to retrieve signature image' });
        return;
      }

      const sigArrayBuffer = await sigData.arrayBuffer();
      const sigImageBytes = Buffer.from(sigArrayBuffer);

      const ext = field.signatureImageUrl.split('.').pop()?.toLowerCase();
      const sigImage =
        ext === 'jpg' || ext === 'jpeg'
          ? await pdfDoc.embedJpg(sigImageBytes)
          : await pdfDoc.embedPng(sigImageBytes);

      // Get page dimensions
      const pageIndex = field.page - 1; // 1-indexed to 0-indexed
      if (pageIndex < 0 || pageIndex >= pages.length) continue;
      const page = pages[pageIndex];
      const { width: pageWidth, height: pageHeight } = page.getSize();

      // Convert relative HTML coordinates (top-left) to PDF coordinates (bottom-left)
      const widthInPdf = field.width * pageWidth;
      const heightInPdf = field.height * pageHeight;
      const xInPdf = field.x * pageWidth;
      const yInPdf = (1 - field.y - field.height) * pageHeight;

      page.drawImage(sigImage, {
        x: xInPdf,
        y: yInPdf,
        width: widthInPdf,
        height: heightInPdf,
      });
    }

    // 4. Save and upload signed PDF
    const finalizedPdfBytes = await pdfDoc.save();
    const finalizedPdfBuffer = Buffer.from(finalizedPdfBytes);
    const signedPath = `signed/${document._id}/finalized.pdf`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_DOCS)
      .upload(signedPath, finalizedPdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      console.error('Failed to upload signed PDF:', uploadError);
      res.status(500).json({ message: 'Failed to upload finalized PDF' });
      return;
    }

    // Update document status to signed and point to the finalized signed file
    document.signedFileUrl = signedPath;
    document.status = 'signed';
    await document.save();

    // Mark all tokens for this document as used
    await SigningToken.updateMany(
      { documentId: document._id },
      { $set: { usedAt: new Date() } }
    );

    await logAction(req, document._id, 'document_finalized', tokenObj.signerEmail, {});

    res.json({ success: true, document });
  } catch (error) {
    console.error('Finalize document public error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ── POST /api/public/sign/:token/reject ─────────────────────────────────────────
export const rejectDocumentPublic = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.params;
    const reason: string = req.body?.reason || 'No reason provided';

    const tokenObj = await getValidToken(token as string, res);
    if (!tokenObj) return;

    const document = await DocModel.findById(tokenObj.documentId);
    if (!document) {
      res.status(404).json({ message: 'Document not found' });
      return;
    }

    if (document.status === 'signed' || document.status === 'rejected') {
      res.status(400).json({ message: `Document is already ${document.status}` });
      return;
    }

    // Update document status to rejected
    document.status = 'rejected';
    await document.save();

    // Mark all tokens for this document as used so they can't be re-used
    await SigningToken.updateMany(
      { documentId: document._id },
      { $set: { usedAt: new Date() } }
    );

    await logAction(req, document._id, 'document_rejected', tokenObj.signerEmail, {
      reason,
    });

    res.json({ success: true, document });
  } catch (error) {
    console.error('Reject document public error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/public/sign/:token/download ────────────────────────────────────────
export const downloadDocumentPublic = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.params;
    const tokenObj = await SigningToken.findOne({ token: token as string });

    if (!tokenObj) {
      res.status(404).json({ message: 'Signing token not found' });
      return;
    }

    const document = await DocModel.findById(tokenObj.documentId);
    if (!document) {
      res.status(404).json({ message: 'Document not found' });
      return;
    }

    if (document.status !== 'signed') {
      res.status(400).json({ message: 'Document has not been finalized yet' });
      return;
    }

    // If token has been used, enforce a 48-hour download window
    if (tokenObj.usedAt) {
      const hoursSinceUsed = (Date.now() - tokenObj.usedAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceUsed > 48) {
        res.status(403).json({
          message: 'Download window has expired. Please contact the document owner for a copy.',
        });
        return;
      }
    }

    const filePath = document.signedFileUrl || document.originalFileUrl;
    if (!filePath) {
      res.status(500).json({ message: 'No file available for download' });
      return;
    }

    const { data, error } = await supabase.storage
      .from(BUCKET_DOCS)
      .createSignedUrl(filePath, 60 * 5); // 5 minute expiry

    if (error) {
      console.error('Supabase signed URL error:', error);
      res.status(500).json({ message: 'Could not generate download URL' });
      return;
    }

    res.json({ downloadUrl: data.signedUrl });
  } catch (error) {
    console.error('Download document public error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
