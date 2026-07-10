import { Request } from 'express';
import { AuditLog } from '../models/AuditLog';

export const logAction = async (
  req: Request,
  documentId: string | any,
  action:
    | 'document_uploaded'
    | 'field_placed'
    | 'field_deleted'
    | 'field_updated'
    | 'document_published'
    | 'field_signed'
    | 'document_finalized'
    | 'document_rejected',
  actorEmail: string,
  metadata: Record<string, any> = {}
): Promise<void> => {
  try {
    const ipAddress =
      (req.headers['x-forwarded-for'] as string) ||
      req.socket.remoteAddress ||
      'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    await AuditLog.create({
      documentId,
      action,
      actorEmail: actorEmail.toLowerCase(),
      ipAddress,
      userAgent,
      metadata,
    });
  } catch (error) {
    console.error('Audit logging error:', error);
  }
};
