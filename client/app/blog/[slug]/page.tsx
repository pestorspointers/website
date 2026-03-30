import { notFound } from "next/navigation";
import { compileMDX } from "next-mdx-remote/rsc";
import { mdxComponents } from "../../../lib/mdx-components";

interface Post {
  _id: string;
  slug: string;
  title: string;
  mdxContent: string;
  excerpt: string;
  author: string;
  tags: string[];
  coverImageUrl?: string;
  publishedAt?: string;
}

async function getPost(slug: string): Promise<Post | null> {
  try {
    const res = await fetch(`${process.env.API_URL}/api/v1/blog/${slug}`, {
      next: { revalidate: 3600 },
    });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}) {
  const post = await getPost(params.slug);
  if (!post) return { title: "Post not found" };
  return {
    title: post.title,
    description: post.excerpt,
    openGraph: post.coverImageUrl
      ? { images: [{ url: post.coverImageUrl }] }
      : undefined,
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: { slug: string };
}) {
  const post = await getPost(params.slug);
  if (!post) notFound();

  const { content } = await compileMDX({
    source: post.mdxContent,
    components: mdxComponents,
    options: { parseFrontmatter: false },
  });

  return (
    <main className="max-w-3xl mx-auto px-4 py-12">
      {/* Cover image */}
      {post.coverImageUrl && (
        <img
          src={post.coverImageUrl}
          alt={post.title}
          className="w-full aspect-video object-cover rounded-xl mb-8"
        />
      )}

      {/* Tags */}
      {post.tags.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-4">
          {post.tags.map((tag) => (
            <span
              key={tag}
              className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Title + meta */}
      <h1 className="text-4xl font-bold leading-tight">{post.title}</h1>
      <p className="text-gray-500 text-sm mt-3">
        {post.author}
        {post.publishedAt && (
          <>
            {" · "}
            {new Date(post.publishedAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </>
        )}
      </p>

      {/* MDX content */}
      <div className="mt-8 prose prose-gray max-w-none">{content}</div>

      {/* Back link */}
      <div className="mt-12 pt-6 border-t">
        <a href="/blog" className="text-sm text-blue-600 hover:underline">
          ← Back to all posts
        </a>
      </div>
    </main>
  );
}
