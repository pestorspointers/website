import mongoose, { Schema } from 'mongoose';

const VideoSchema = new Schema(
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

export default mongoose.model('Video', VideoSchema);
