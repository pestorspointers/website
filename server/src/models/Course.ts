import mongoose, { Document, Schema } from 'mongoose';

export interface ICourse extends Document {
  slug: string;
  title: string;
  description: string;
  thumbnailUrl?: string;
  videoIds: mongoose.Types.ObjectId[];
  price: number;
  stripeProductId?: string;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CourseSchema = new Schema<ICourse>(
  {
    slug: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    thumbnailUrl: { type: String },
    videoIds: [{ type: Schema.Types.ObjectId, ref: 'Video' }],
    price: { type: Number, required: true, min: 0 },
    stripeProductId: { type: String },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model<ICourse>('Course', CourseSchema);
