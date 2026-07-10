import mongoose, { Document, Schema } from 'mongoose';

export interface IDocument extends Document {
  ownerId: mongoose.Types.ObjectId;
  title: string;
  originalFileUrl: string;
  signedFileUrl: string | null;
  status: 'draft' | 'pending' | 'signed' | 'rejected';
  pageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const documentSchema: Schema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    originalFileUrl: { type: String, required: true },
    signedFileUrl: { type: String, default: null },
    status: {
      type: String,
      enum: ['draft', 'pending', 'signed', 'rejected'],
      default: 'draft',
      required: true,
    },
    pageCount: { type: Number, required: true },
  },
  { timestamps: true }
);

export const DocModel = mongoose.model<IDocument>('Document', documentSchema);
