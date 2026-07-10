import mongoose, { Document, Schema } from 'mongoose';

export interface IAuditLog extends Document {
  documentId: mongoose.Types.ObjectId;
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
  metadata: Record<string, any>;
  createdAt: Date;
}

const auditLogSchema: Schema = new Schema(
  {
    documentId: { type: Schema.Types.ObjectId, ref: 'Document', required: true },
    action: {
      type: String,
      required: true,
      enum: [
        'document_uploaded',
        'field_placed',
        'field_deleted',
        'field_updated',
        'document_published',
        'field_signed',
        'document_finalized',
        'document_rejected',
      ],
    },
    actorEmail: { type: String, required: true, lowercase: true, trim: true },
    ipAddress: { type: String, required: true },
    userAgent: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Index for quick queries on document ID
auditLogSchema.index({ documentId: 1, createdAt: -1 });

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', auditLogSchema);
