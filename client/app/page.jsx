import Link from 'next/link';
import PublicNav from '../components/PublicNav';
import PublicFooter from '../components/PublicFooter';

async function getFeaturedCourses() {
  try {
    const res = await fetch(`${process.env.API_URL}/api/v1/courses`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const courses = await res.json();
    return courses.slice(0, 3);
  } catch {
    return [];
  }
}

async function getFeaturedPosts() {
  try {
    const res = await fetch(`${process.env.API_URL}/api/v1/blog?limit=3`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.posts ?? [];
  } catch {
    return [];
  }
}

async function getTiers() {
  try {
    const res = await fetch(`${process.env.API_URL}/api/v1/payments/tiers`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export const metadata = {
  title: "GET UNSTUCK IN LIFE! | Pestor's Pointers",
  description:
    "I can help you find your purpose, place in this world & true fulfillment! The 7-Stage, 21-Step Program & Guide. Let's get unstuck — step into the life you were destined to live.",
  openGraph: {
    title: "Pestor's Pointers — GET UNSTUCK IN LIFE!",
    description:
      "The 7-Stage, 21-Step Program & Guide to help you find your purpose, place in this world & true fulfillment.",
    type: 'website',
  },
};

const programSteps = [
  {
    step: '01',
    title: 'Your first steps',
    description:
      "Finding a connection, roadmap, & 'Big Brother' who can help guide & point you in the right direction by giving you some hope, while discovering where you're at in your life, what you're feeling inside, what's missing, & what you desire to accomplish.",
    image:
      'https://kajabi-storefronts-production.kajabi-cdn.com/kajabi-storefronts-production/file-uploads/themes/2155355257/settings_images/f8cff26-3541-bf8e-135-1c8cf3fdc1b1_740fc10e-f7ae-4189-bcc5-d9cc0c97228a.jpg',
    bg: 'bg-[#100566]',
  },
  {
    step: '02',
    title: 'Growing stronger',
    description:
      "Since you are the 'common denominator' in all of your relationships, let's unpack the 'why' beneath the surface as we learn to set healthy boundaries to improve your 'circle of influence'...",
    image:
      'https://kajabi-storefronts-production.kajabi-cdn.com/kajabi-storefronts-production/file-uploads/themes/2155355257/settings_images/f8e8e8-74b-845-865e-64d43ee1f24_2b3e726-67a-228-baf4-37ec4ccb5_pexels-andrea-piacquadio-3760137_1_1_.png',
    bg: 'bg-[#100566]',
  },
  {
    step: '03',
    title: 'Next level destiny',
    description:
      "Wanting more for your life & choosing to move forward past your fear as you discover your individual purpose & find satisfaction & eternal fulfillment, while becoming a 'High Value, 1% Person of Excellence!'",
    image:
      'https://kajabi-storefronts-production.kajabi-cdn.com/kajabi-storefronts-production/file-uploads/themes/2155355257/settings_images/c3cc15-8eba-365d-a33b-3c6bdc0883c0_2b3e726-67a-228-baf4-37ec4ccb5_pexels-andrea-piacquadio-3760137_1_2_.png',
    bg: 'bg-[#100566]',
  },
];

export default async function HomePage() {
  const [courses, posts, tiers] = await Promise.all([
    getFeaturedCourses(),
    getFeaturedPosts(),
    getTiers(),
  ]);

  const sortedTiers = [...tiers].sort((a, b) => a.displayOrder - b.displayOrder);

  return (
    <>
      <PublicNav />

      {/* ── Hero ── */}
      <section
        className="relative text-white overflow-hidden"
        style={{
          backgroundImage:
            'url(https://kajabi-storefronts-production.kajabi-cdn.com/kajabi-storefronts-production/file-uploads/themes/2155355257/settings_images/4e2af3-c6fb-740e-0163-dc383a772c74_looking-at-the-compass-to-figure-out-right-direction-foggy-valley-and-mountains-in-bac-SBI-327990886.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute inset-0 bg-[#100566]/75" />
        <div className="relative max-w-4xl mx-auto px-4 py-28 md:py-36 text-center">
          <h1 className="text-4xl md:text-6xl font-extrabold leading-tight mb-4">
            GET UNSTUCK IN LIFE!
          </h1>
          <p className="text-xl md:text-2xl font-semibold text-blue-100 mb-8">
            The 7-Stage, 21-Step Program &amp; Guide
          </p>
          <h2 className="text-2xl md:text-3xl font-bold mb-3">
            Feel Lost? Stuck somewhere on your journey?
          </h2>
          <p className="text-lg text-blue-100 mb-2">
            I can help you find your purpose, place in this world &amp; and true fulfillment!
          </p>
          <p className="text-base text-blue-200/80 mb-10">
            Let&apos;s get unstuck! Step into the life you were destined to live.
          </p>
          <Link
            href="/courses"
            className="inline-block px-10 py-4 bg-[#f53100] text-white font-bold rounded-lg hover:bg-[#d42a00] transition-colors text-lg"
          >
            Explore the courses
          </Link>
        </div>
      </section>

      {/* ── 60-Day Journey ── */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-center text-[#161E2A] mb-12">
            What you&apos;ll learn on your 60 day journey...
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {programSteps.map((step) => (
              <div key={step.step} className="rounded-2xl overflow-hidden shadow-md bg-white">
                <div className="relative h-52 overflow-hidden">
                  <img
                    src={step.image}
                    alt={step.title}
                    className="w-full h-full object-cover"
                  />
                  <div className={`absolute inset-0 ${step.bg}/60`} />
                  <div className="absolute bottom-0 left-0 p-5">
                    <p className="text-5xl font-black text-white/20 leading-none">{step.step}</p>
                  </div>
                </div>
                <div className={`${step.bg} text-white p-6`}>
                  <h3 className="text-xl font-bold mb-3">{step.title}</h3>
                  <p className="text-sm leading-relaxed text-blue-100">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Emotional Section ── */}
      <section
        className="relative py-24 text-white"
        style={{
          backgroundImage:
            'url(https://kajabi-storefronts-production.kajabi-cdn.com/kajabi-storefronts-production/file-uploads/themes/2155355257/settings_images/e386514-0a1-c3c7-57-eccf155ab8e_tourist-in-hoodie-in-front-of-rural-landscape-with-mountains-on-the-way-of-the-paul-va-SBI-327903316_1_.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute inset-0 bg-[#161E2A]/70" />
        <div className="relative max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-8">
            Feel Like Something Is Missing in Your Life?
          </h2>
          <p className="text-lg text-gray-200 mb-6 leading-relaxed">
            Maybe you feel emotionally as if you&apos;re drowning in the ocean &amp; just want to get
            your head above water so you can start making some better progress in your individual
            life?
          </p>
          <p className="text-lg text-gray-200 mb-10 leading-relaxed">
            Do you ever feel emotionally trapped inside a cage &amp; you just want to break free from
            these invisible chains that keep you down &amp; that keep the REAL YOU from coming out?
          </p>
          <Link
            href="/courses"
            className="inline-block px-10 py-4 bg-[#f53100] text-white font-bold rounded-lg hover:bg-[#d42a00] transition-colors text-lg"
          >
            Explore More
          </Link>
        </div>
      </section>

      {/* ── Big Bro / 7-Stage Program ── */}
      <section
        className="relative py-24 text-white"
        style={{
          backgroundImage:
            'url(https://kajabi-storefronts-production.kajabi-cdn.com/kajabi-storefronts-production/file-uploads/themes/2155355257/settings_images/8bcee53-1112-c2-12-c7df16c8a16a_banca-boat-at-las-cabanas-beach-with-stunning-pinagbuyutan-island-in-background-breath-SBI-342307242_1_.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute inset-0 bg-[#100566]/75" />
        <div className="relative max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-5">
            I can help guide you (male or female) as your &lsquo;Big Bro&rsquo; as you face
            life&apos;s challenges head on!
          </h2>
          <p className="text-lg text-blue-100 leading-relaxed">
            Start today with my 7-stage, 21-step program guide to help navigate successfully through
            life...
          </p>
        </div>
      </section>

      {/* ── Wistia Video ── */}
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4">
          <div className="aspect-video w-full rounded-2xl overflow-hidden shadow-lg bg-gray-100">
            <iframe
              src="https://fast.wistia.net/embed/iframe/2am1ihye3z?videoFoam=true"
              title="Pestor's Pointers Introduction"
              allow="autoplay; fullscreen"
              allowFullScreen
              className="w-full h-full"
            />
          </div>
        </div>
      </section>

      {/* ── Featured Courses ── */}
      {courses.length > 0 && (
        <section className="py-20 bg-gray-50">
          <div className="max-w-6xl mx-auto px-4">
            <div className="flex items-end justify-between mb-10">
              <h2 className="text-3xl font-bold text-[#161E2A]">Course Offerings</h2>
              <Link href="/courses" className="text-sm text-[#100566] font-semibold hover:underline hidden sm:block">
                View all →
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {courses.map((course) => (
                <Link
                  key={course._id}
                  href={`/courses/${course.slug}`}
                  className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow border border-gray-100"
                >
                  {course.thumbnailUrl ? (
                    <img
                      src={course.thumbnailUrl}
                      alt={course.title}
                      className="w-full aspect-video object-cover"
                    />
                  ) : (
                    <div className="w-full aspect-video bg-[#100566]/10 flex items-center justify-center text-[#100566]/30 text-5xl">
                      ▶
                    </div>
                  )}
                  <div className="p-5">
                    <h3 className="font-semibold text-[#161E2A] group-hover:text-[#f53100] transition-colors">
                      {course.title}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1 line-clamp-2">{course.description}</p>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="font-bold text-[#100566]">${course.price.toFixed(2)}</span>
                      <span className="text-xs text-gray-400">{course.videoIds.length} videos</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Free Trial / Pricing ── */}
      <section className="py-20 bg-[#100566]">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">Join Our Free Trial</h2>
          <p className="text-blue-200 text-lg mb-10">
            Get started today before this once in a lifetime opportunity expires.
          </p>
          {sortedTiers.length > 0 ? (
            <div
              className={`grid gap-6 ${
                sortedTiers.length === 1 ? 'max-w-sm mx-auto' : 'grid-cols-1 sm:grid-cols-2'
              }`}
            >
              {sortedTiers.map((tier, i) => {
                const highlighted = i === 1;
                return (
                  <div
                    key={tier._id}
                    className={`rounded-2xl p-8 text-left ${highlighted ? 'bg-[#f53100]' : 'bg-white'}`}
                  >
                    <h3 className={`text-xl font-bold mb-2 ${highlighted ? 'text-white' : 'text-[#161E2A]'}`}>
                      {tier.name}
                    </h3>
                    <p className={`text-sm mb-7 leading-relaxed ${highlighted ? 'text-white/80' : 'text-gray-500'}`}>
                      {tier.description}
                    </p>
                    <Link
                      href="/billing"
                      className={`block w-full text-center py-3 rounded-xl font-bold transition-colors ${
                        highlighted
                          ? 'bg-white text-[#f53100] hover:bg-gray-100'
                          : 'bg-[#f53100] text-white hover:bg-[#d42a00]'
                      }`}
                    >
                      Get Started
                    </Link>
                  </div>
                );
              })}
            </div>
          ) : (
            <Link
              href="/register"
              className="inline-block px-10 py-4 bg-[#f53100] text-white font-bold rounded-lg hover:bg-[#d42a00] transition-colors text-lg"
            >
              Get Started Today
            </Link>
          )}
        </div>
      </section>

      {/* ── Featured Blog Posts ── */}
      {posts.length > 0 && (
        <section className="py-20 bg-white">
          <div className="max-w-6xl mx-auto px-4">
            <div className="flex items-end justify-between mb-10">
              <h2 className="text-3xl font-bold text-[#161E2A]">Articles &amp; Insights</h2>
              <Link href="/blog" className="text-sm text-[#100566] font-semibold hover:underline hidden sm:block">
                View all →
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {posts.map((post) => (
                <Link key={post._id} href={`/blog/${post.slug}`} className="group">
                  {post.coverImageUrl ? (
                    <img
                      src={post.coverImageUrl}
                      alt={post.title}
                      className="w-full aspect-video object-cover rounded-xl mb-3"
                    />
                  ) : (
                    <div className="w-full aspect-video bg-gray-100 rounded-xl mb-3" />
                  )}
                  {post.tags.length > 0 && (
                    <p className="text-xs text-[#f53100] font-semibold mb-1">{post.tags[0]}</p>
                  )}
                  <h3 className="font-semibold text-sm leading-snug text-[#161E2A] group-hover:text-[#f53100] transition-colors">
                    {post.title}
                  </h3>
                  <p className="text-xs text-gray-400 mt-1 line-clamp-2">{post.excerpt}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <PublicFooter />
    </>
  );
}
