import Link from 'next/link';
import PublicNav from '../../components/PublicNav';
import PublicFooter from '../../components/PublicFooter';

export const metadata = {
  title: "About Jeremy | Pestor's Pointers",
  description:
    "Meet Jeremy Pestor, Founder of Pestor's Pointers & S.i.T.i.N.G Outreach — Standing. in. the. Increasingly. Neglected. Gap.",
  openGraph: {
    title: "About Jeremy Pestor | Pestor's Pointers",
    description:
      "Helping lost and hurting people find confidence, clarity, hope, strength, vision, direction, awareness, & lasting fulfillment.",
  },
};

export default function AboutPage() {
  return (
    <>
      <PublicNav />

      <main>
        {/* Hero */}
        <section className="bg-[#100566] text-white py-20 text-center">
          <div className="max-w-3xl mx-auto px-4">
            <h1 className="text-4xl md:text-5xl font-extrabold mb-4">
              Hi! &hellip; I&apos;m Jeremy Pestor
            </h1>
            <p className="text-blue-200 text-lg max-w-2xl mx-auto">
              Founder of &lsquo;Pestor&apos;s Pointers&rsquo; &amp; S.i.T.i.N.G Outreach, which
              stands for &ldquo;Standing. in. the. Increasingly. Neglected, Gap.&rdquo;
            </p>
          </div>
        </section>

        {/* Main content */}
        <section className="py-20 bg-white">
          <div className="max-w-3xl mx-auto px-4">
            {/* Photo placeholder */}
            <div className="w-40 h-40 rounded-full bg-gray-200 mx-auto mb-10 flex items-center justify-center text-gray-400 text-3xl font-bold">
              JP
            </div>

            <div className="space-y-6 text-gray-700 leading-relaxed text-lg">
              <p>
                Lost &amp; hurting people I help guide along life&apos;s complicated journey by
                providing a roadmap to help those who have been abandoned by an absent male figure
                &amp; who feel hopeless &amp; confused, to find the missing pieces to receive{' '}
                <strong>
                  confidence, clarity, hope, strength, vision, direction, awareness, &amp; lasting
                  fulfillment
                </strong>{' '}
                in their life as they discover the 3 key ingredients that make up their own, UNIQUE
                PURPOSE!
              </p>

              <p>
                Regardless of your view of God, religion, church, or even &lsquo;religious
                people,&rsquo; as long as we can agree that there is a{' '}
                <strong>Higher Power, an Infinite Designer, a Loving Creator,</strong> then this
                program is for YOU!
              </p>

              <p>
                I come from a non-judgmental &amp; loving &lsquo;big brother&rsquo; perspective to
                both men &amp; women alike, &amp; I have found in all of my life experiences so far
                as a single man in my early 40s, that sometimes we just need a guide who&apos;s
                been where we are, who understands us, has felt our pain, &amp; can point us in the
                right direction to navigate life&apos;s complicated journey to find personal
                FREEDOM.
              </p>

              <p>
                I start with the relationship people have with themselves &amp; how that plays out
                in all the other areas of our life, because I&apos;ve been there &amp; have
                struggled throughout my lifetime as well, so from day #1, I meet you right where
                you&apos;re at in order to find the REAL YOU, the person who you desire to be,
                &amp; who you were ALWAYS meant to be!
              </p>

              <p>
                I can guide you to become the{' '}
                <strong>strongest version of you at your core center</strong> so your true inner
                HERO can arise &amp; BREAK FREE from your past and do AMAZING things in your
                lifetime, because when you become the strongest-centered version of yourself, your
                entire life, existence, &amp; world, including all of your relationships will
                improve, whether you&apos;re single or currently in a dating relationship!
              </p>

              <p className="font-semibold text-[#100566]">
                I look forward to getting to know and coach you personally with this program. Your
                journey starts TODAY!
              </p>
            </div>

            <div className="mt-14 text-center">
              <p className="text-xl font-bold text-[#161E2A] mb-2">Join Our Free Trial</p>
              <p className="text-gray-500 mb-7">
                Get started today before this once in a lifetime opportunity expires.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  href="/billing"
                  className="px-8 py-4 bg-[#f53100] text-white font-bold rounded-lg hover:bg-[#d42a00] transition-colors"
                >
                  Join Our Free Trial
                </Link>
                <Link
                  href="/courses"
                  className="px-8 py-4 border-2 border-[#100566] text-[#100566] font-semibold rounded-lg hover:bg-[#100566] hover:text-white transition-colors"
                >
                  Explore the Courses
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </>
  );
}
