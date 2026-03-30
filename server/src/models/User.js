import mongoose, { Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

const UserSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    stripeCustomerId: { type: String },
    subscription: {
      status: {
        type: String,
        enum: ['active', 'past_due', 'canceled', 'none'],
        default: 'none',
      },
      tierId: { type: Schema.Types.ObjectId, ref: 'SubscriptionTier' },
      stripeSubscriptionId: { type: String },
      currentPeriodEnd: { type: Date },
    },
    purchasedVideoIds: [{ type: Schema.Types.ObjectId, ref: 'Video' }],
    purchasedCourseIds: [{ type: Schema.Types.ObjectId, ref: 'Course' }],
  },
  { timestamps: true }
);

UserSchema.methods.comparePassword = async function (password) {
  return bcrypt.compare(password, this.passwordHash);
};

export default mongoose.model('User', UserSchema);
