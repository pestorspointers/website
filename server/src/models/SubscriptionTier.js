import mongoose, { Schema } from 'mongoose';

const SubscriptionTierSchema = new Schema(
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

export default mongoose.model('SubscriptionTier', SubscriptionTierSchema);
