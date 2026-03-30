import Link from "next/link";

async function getPosts() {
  try {
    const res = await fetch(`${process.env.API_URL}/api/v1/blog`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return { posts: [], total: 0, pages: 0 };
    return res.json();
  } catch {
    return { posts: [], total: 0, pages: 0 };
  }
}

export const metadata = {
  title: "Blog",
  description: "Articles, insights, and resources from the life coach.",
};

export default async function BlogPage() {
  const { posts } = await getPosts();
  console.log(posts);

  return (
    <main className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-2">Blog</h1>
      <p className="text-gray-500 mb-10">Articles, insights, and resources.</p>

      {posts.length === 0 ? (
        <p className="text-gray-400">No posts yet — check back soon.</p>
      ) : (
        <div className="space-y-8">
          {posts.map((post) => (
            <article key={post._id} className="group flex gap-6 items-start">
              {post.coverImageUrl && (
                <Link href={`/blog/${post.slug}`} className="shrink-0">
                  <img
                    src={post.coverImageUrl}
                    alt={post.title}
                    className="w-40 h-28 object-cover rounded-lg"
                  />
                </Link>
              )}
              <div className="flex-1 min-w-0">
                {post.tags.length > 0 && (
                  <div className="flex gap-2 flex-wrap mb-2">
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
                <Link href={`/blog/${post.slug}`}>
                  <h2 className="text-xl font-semibold group-hover:text-blue-600 transition-colors">
                    {post.title}
                  </h2>
                </Link>
                <p className="text-gray-500 text-sm mt-1 line-clamp-2">
                  {post.excerpt}
                </p>
                <p className="text-xs text-gray-400 mt-2">
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
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
