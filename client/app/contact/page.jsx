import Link from 'next/link';
import PublicNav from '../../components/PublicNav';
import PublicFooter from '../../components/PublicFooter';

export const metadata = {
  title: "Contact | Pestor's Pointers",
  description: "Get in touch with Jeremy Pestor. You've got questions. We've got answers.",
};

export default function ContactPage() {
  return (
    <>
      <PublicNav />

      <main>
        {/* Hero image */}
        <div className="w-full h-64 overflow-hidden">
          <img
            src="https://kajabi-storefronts-production.kajabi-cdn.com/kajabi-storefronts-production/file-uploads/themes/2155262639/settings_images/7cb311d-b346-85bc-700b-ac7826a04eee_1681a9cd-010f-490b-8486-e71534a01eea.jpg"
            alt="Contact"
            className="w-full h-full object-cover"
          />
        </div>

        {/* Content */}
        <section className="py-20 bg-white">
          <div className="max-w-2xl mx-auto px-4 text-center">
            <h1 className="text-4xl md:text-5xl font-extrabold text-[#161E2A] mb-4">
              LET&apos;S CONNECT
            </h1>
            <p className="text-xl text-gray-600 mb-10">
              You&apos;ve got questions. We&apos;ve got answers.
            </p>

            <div className="bg-gray-50 rounded-2xl p-10 text-left space-y-5 mb-12">
              <p className="text-gray-700 text-lg">
                Are you looking for a side gig to earn some easy money by becoming an affiliate who
                refers new clients?
              </p>
              <p className="text-gray-700 font-semibold text-lg">If so, we&apos;re hiring!!</p>
              <p className="text-gray-700 text-lg">
                Do you need to book a call with my team or have a special circumstance that needs
                explaining?
              </p>
              <p className="text-gray-700 font-semibold text-lg">
                Hey, you have my attention!
              </p>
              <p className="text-gray-700 text-lg">
                Email me at{' '}
                <a
                  href="mailto:jeremypestor@gmail.com"
                  className="text-[#f53100] font-bold hover:underline"
                >
                  jeremypestor@gmail.com
                </a>{' '}
                and I&apos;ll get back to you shortly!
              </p>
              <p className="text-gray-500 font-semibold">— Jeremy Pestor</p>
            </div>

            {/* Social links */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-14">
              {[
                { label: 'Facebook', handle: '@Jpestor', href: 'https://www.facebook.com/Jpestor?mibextid=LQQJ4d' },
                { label: 'Instagram', handle: '@pestorspointers', href: 'https://www.instagram.com/pestorspointers/' },
                { label: 'YouTube', handle: '@PestorsPointers', href: 'https://www.youtube.com/@PestorsPointers' },
                { label: 'TikTok', handle: '@pestorspointers', href: 'https://www.tiktok.com/@pestorspointers' },
              ].map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-gray-50 rounded-xl p-5 hover:bg-[#100566] transition-colors group"
                >
                  <p className="font-semibold text-sm text-[#161E2A] group-hover:text-white transition-colors">
                    {s.label}
                  </p>
                  <p className="text-xs text-gray-400 mt-1 group-hover:text-blue-200 transition-colors">
                    {s.handle}
                  </p>
                </a>
              ))}
            </div>

            {/* Free trial CTA */}
            <h2 className="text-2xl font-bold text-[#161E2A] mb-2">Join Our Free Trial</h2>
            <p className="text-gray-500 mb-7">
              Get started today before this once in a lifetime opportunity expires.
            </p>
            <Link
              href="/billing"
              className="inline-block px-10 py-4 bg-[#f53100] text-white font-bold rounded-lg hover:bg-[#d42a00] transition-colors"
            >
              Get Started Today
            </Link>
          </div>
        </section>
      </main>

      <PublicFooter />
    </>
  );
}
