import mongoose, { Schema } from 'mongoose';

const PurchaseSchema = new Schema(
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

export default mongoose.model('Purchase', PurchaseSchema);
