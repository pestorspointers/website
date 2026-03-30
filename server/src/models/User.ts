import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends Document {
  email: string;
  passwordHash: string;
  role: 'user' | 'admin';
  stripeCustomerId?: string;
  subscription: {
    status: 'active' | 'past_due' | 'canceled' | 'none';
    tierId?: mongoose.Types.ObjectId;
    stripeSubscriptionId?: string;
    currentPeriodEnd?: Date;
  };
  purchasedVideoIds: mongoose.Types.ObjectId[];
  purchasedCourseIds: mongoose.Types.ObjectId[];
  comparePassword(password: string): Promise<boolean>;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
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

UserSchema.methods.comparePassword = async function (
  password: string
): Promise<boolean> {
  return bcrypt.compare(password, this.passwordHash);
};

export default mongoose.model<IUser>('User', UserSchema);
