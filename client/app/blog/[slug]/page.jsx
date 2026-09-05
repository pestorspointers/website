import { notFound } from "next/navigation";
import { compileMDX } from "next-mdx-remote/rsc";
import { mdxComponents } from "@/lib/mdx-components";
import { fetchPost } from "@/lib/publicData";

const getPost = (slug) => fetchPost(slug);

export async function generateMetadata({ params }) {
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

export default async function BlogPostPage({ params }) {
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
        // eslint-disable-next-line @next/next/no-img-element
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
