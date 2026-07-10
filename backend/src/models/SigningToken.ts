import mongoose, { Document, Schema } from 'mongoose';

export interface ISigningToken extends Document {
  documentId: mongoose.Types.ObjectId;
  signerEmail: string;
  token: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const signingTokenSchema: Schema = new Schema(
  {
    documentId: { type: Schema.Types.ObjectId, ref: 'Document', required: true },
    signerEmail: { type: String, required: true, lowercase: true, trim: true },
    token: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true }
);


export const SigningToken = mongoose.model<ISigningToken>(
  'SigningToken',
  signingTokenSchema
);
