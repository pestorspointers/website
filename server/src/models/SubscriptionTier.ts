import mongoose, { Document, Schema } from 'mongoose';

export interface ISubscriptionTier extends Document {
  name: string;
  description: string;
  stripeProductId?: string;
  stripePriceIds: {
    monthly?: string;
    annual?: string;
  };
  unlockedCourseIds: mongoose.Types.ObjectId[];
  isActive: boolean;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionTierSchema = new Schema<ISubscriptionTier>(
  {
    name: { type: String, required: true },
    description: { type: String, required: true },
    stripeProductId: { type: String },
    stripePriceIds: {
      monthly: { type: String },
      annual: { type: String },
    },
    unlockedCourseIds: [{ type: Schema.Types.ObjectId, ref: 'Course' }],
    isActive: { type: Boolean, default: true },
    displayOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model<ISubscriptionTier>(
  'SubscriptionTier',
  SubscriptionTierSchema
);
