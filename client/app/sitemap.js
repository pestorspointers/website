async function fetchSlugs(url, key) {
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const items = key ? (data[key] ?? []) : data;
    return items.map((item) => item.slug);
  } catch {
    return [];
  }
}

export default async function sitemap() {
  const base = process.env.NEXTAUTH_URL ?? 'https://pestorspointers.com';
  const api = process.env.API_URL ?? '';

  const [courseSlugs, postSlugs] = await Promise.all([
    fetchSlugs(`${api}/api/v1/courses`),
    fetchSlugs(`${api}/api/v1/blog?limit=200`, 'posts'),
  ]);

  const staticRoutes = [
    { url: base, lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/courses`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/blog`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
    { url: `${base}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/contact`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.5 },
    { url: `${base}/billing`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.6 },
  ];

  const courseRoutes = courseSlugs.map((slug) => ({
    url: `${base}/courses/${slug}`,
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  const postRoutes = postSlugs.map((slug) => ({
    url: `${base}/blog/${slug}`,
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  return [...staticRoutes, ...courseRoutes, ...postRoutes];
}
