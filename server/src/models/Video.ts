import mongoose, { Document, Schema } from 'mongoose';

export interface IVideo extends Document {
  title: string;
  description: string;
  s3Key?: string;
  cloudFrontUrl?: string;
  duration?: number;
  thumbnailUrl?: string;
  accessType: 'public' | 'course' | 'purchase';
  courseId?: mongoose.Types.ObjectId;
  price?: number;
  stripeProductId?: string;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const VideoSchema = new Schema<IVideo>(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    s3Key: { type: String },
    cloudFrontUrl: { type: String },
    duration: { type: Number },
    thumbnailUrl: { type: String },
    accessType: {
      type: String,
      enum: ['public', 'course', 'purchase'],
      required: true,
    },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course' },
    price: { type: Number, min: 0 },
    stripeProductId: { type: String },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model<IVideo>('Video', VideoSchema);
