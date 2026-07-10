import mongoose, { Document, Schema } from 'mongoose';

export interface ISignatureField extends Document {
  documentId: mongoose.Types.ObjectId;
  page: number;       // 1-indexed
  x: number;          // normalised 0–1 relative to page width
  y: number;          // normalised 0–1 relative to page height
  width: number;      // normalised 0–1
  height: number;     // normalised 0–1
  signerEmail: string;
  status: 'unsigned' | 'signed';
  signatureImageUrl: string | null;
  signedAt: Date | null;
  createdAt: Date;
}

const signatureFieldSchema: Schema = new Schema(
  {
    documentId: { type: Schema.Types.ObjectId, ref: 'Document', required: true },
    page:        { type: Number, required: true, min: 1 },
    x:           { type: Number, required: true, min: 0, max: 1 },
    y:           { type: Number, required: true, min: 0, max: 1 },
    width:       { type: Number, required: true, min: 0, max: 1 },
    height:      { type: Number, required: true, min: 0, max: 1 },
    signerEmail: { type: String, required: true, lowercase: true, trim: true },
    status:      { type: String, enum: ['unsigned', 'signed'], default: 'unsigned' },
    signatureImageUrl: { type: String, default: null },
    signedAt:    { type: Date, default: null },
  },
  { timestamps: true }
);

export const SignatureField = mongoose.model<ISignatureField>(
  'SignatureField',
  signatureFieldSchema
);
