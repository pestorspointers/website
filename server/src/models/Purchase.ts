import mongoose, { Document, Schema } from 'mongoose';

export interface IPurchase extends Document {
  userId: mongoose.Types.ObjectId;
  type: 'subscription' | 'video' | 'course';
  itemId?: mongoose.Types.ObjectId;
  stripePaymentIntentId?: string;
  stripeSubscriptionId?: string;
  amount: number;
  createdAt: Date;
}

const PurchaseSchema = new Schema<IPurchase>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: ['subscription', 'video', 'course'],
      required: true,
    },
    itemId: { type: Schema.Types.ObjectId },
    stripePaymentIntentId: { type: String },
    stripeSubscriptionId: { type: String },
    amount: { type: Number, required: true },
  },
  { timestamps: true }
);

export default mongoose.model<IPurchase>('Purchase', PurchaseSchema);
