import mongoose, { Document, Schema } from 'mongoose';

export interface IBlogPost extends Document {
  slug: string;
  title: string;
  mdxContent: string;
  excerpt: string;
  author: string;
  tags: string[];
  coverImageUrl?: string;
  isPublished: boolean;
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const BlogPostSchema = new Schema<IBlogPost>(
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

export default mongoose.model<IBlogPost>('BlogPost', BlogPostSchema);
