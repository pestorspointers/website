import mongoose, { Schema } from 'mongoose';

const BlogPostSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    mdxContent: { type: String, required: true },
    excerpt: { type: String, required: true },
    author: { type: String, required: true },
    tags: [{ type: String }],
    coverImageUrl: { type: String },
    isPublished: { type: Boolean, default: false },
    publishedAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model('BlogPost', BlogPostSchema);
