import mongoose, { Schema } from 'mongoose';

const CourseSchema = new Schema(
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

export default mongoose.model('Course', CourseSchema);
