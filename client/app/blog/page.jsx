import Link from 'next/link';
import { fetchPosts } from '@/lib/publicData';

export const revalidate = 300;

export const metadata = {
  title: 'Blog',
  description: 'Articles, insights and resources.',
};

export default async function BlogPage() {
  const { posts } = await fetchPosts({ limit: 20 });

  return (
    <main className="max-w-4xl mx-auto px-4 py-14">
      <h1 className="text-4xl font-extrabold text-[#161E2A] mb-2">Blog</h1>
      <p className="text-gray-500 mb-10">Articles, insights and resources.</p>

      {posts.length === 0 ? (
        <p className="text-gray-400">No posts yet — check back soon.</p>
      ) : (
        <div className="space-y-8">
          {posts.map((post) => (
            <article key={post.id} className="group flex flex-col sm:flex-row gap-6 items-start">
              {post.coverImageUrl && (
                <Link href={`/blog/${post.slug}`} className="shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={post.coverImageUrl}
                    alt={post.title}
                    className="w-full sm:w-40 h-28 object-cover rounded-lg"
                  />
                </Link>
              )}

              <div className="flex-1 min-w-0">
                {post.tags?.length > 0 && (
                  <p className="text-xs text-[#f53100] font-semibold mb-1">{post.tags[0]}</p>
                )}
                <h2 className="font-bold text-lg text-[#161E2A] group-hover:text-[#f53100] transition-colors">
                  <Link href={`/blog/${post.slug}`}>{post.title}</Link>
                </h2>
                <p className="text-gray-500 mt-1 text-sm leading-relaxed">{post.excerpt}</p>
                <p className="text-xs text-gray-400 mt-2">
                  {post.author}
                  {post.publishedAt &&
                    ` · ${new Date(post.publishedAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}`}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
