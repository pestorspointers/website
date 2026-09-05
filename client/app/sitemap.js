import { fetchCourses, fetchPosts } from '@/lib/publicData';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export default async function sitemap() {
  const [courses, blog] = await Promise.all([
    fetchCourses(),
    fetchPosts({ limit: 50 }),
  ]);

  const staticPages = ['', '/about', '/contact', '/courses', '/blog'].map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: path === '' ? 1 : 0.8,
  }));

  const coursePages = (courses ?? []).map((course) => ({
    url: `${SITE_URL}/courses/${course.slug}`,
    lastModified: course.updatedAt ? new Date(course.updatedAt) : new Date(),
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  const postPages = (blog?.posts ?? []).map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: post.publishedAt ? new Date(post.publishedAt) : new Date(),
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  return [...staticPages, ...coursePages, ...postPages];
}
