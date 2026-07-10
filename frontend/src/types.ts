// Types shared between frontend components
export interface DocumentItem {
  _id: string;
  title: string;
  status: 'draft' | 'pending' | 'signed' | 'rejected';
  pageCount: number;
  createdAt: string;
  viewUrl?: string; // signed URL to view PDF
}

export interface SignatureField {
  _id: string;
  documentId: string;
  page: number; // 1‑indexed
  x: number;   // 0‑1 relative to page width
  y: number;   // 0‑1 relative to page height
  width: number; // 0‑1
  height: number; // 0‑1
  signerEmail: string;
  status: 'unsigned' | 'signed';
}

export interface AuditLog {
  _id: string;
  documentId: string;
  action:
    | 'document_uploaded'
    | 'field_placed'
    | 'field_deleted'
    | 'field_updated'
    | 'document_published'
    | 'field_signed'
    | 'document_finalized'
    | 'document_rejected';
  actorEmail: string;
  ipAddress: string;
  userAgent: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}
