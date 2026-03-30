import Link from 'next/link';
import Image from 'next/image';

const socialLinks = [
  {
    label: 'Facebook',
    href: 'https://www.facebook.com/Jpestor?mibextid=LQQJ4d',
    icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z" />
      </svg>
    ),
  },
  {
    label: 'Instagram',
    href: 'https://www.instagram.com/pestorspointers/',
    icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M16 4H8a4 4 0 00-4 4v8a4 4 0 004 4h8a4 4 0 004-4V8a4 4 0 00-4-4zm-4 9a3 3 0 110-6 3 3 0 010 6zm4.5-7a1 1 0 110 2 1 1 0 010-2z" />
      </svg>
    ),
  },
  {
    label: 'YouTube',
    href: 'https://youtube.com/@PestorsPointers',
    icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M22.54 6.42a2.78 2.78 0 00-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 00-1.95 1.96A29 29 0 001 12a29 29 0 00.46 5.58A2.78 2.78 0 003.41 19.54C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 001.95-1.96A29 29 0 0023 12a29 29 0 00-.46-5.58zM9.75 15.02V8.98L15.5 12l-5.75 3.02z" />
      </svg>
    ),
  },
  {
    label: 'TikTok',
    href: 'https://www.tiktok.com/@pestorspointers?_t=8fseGXGZoJ4&_r=1',
    icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.53V6.77a4.85 4.85 0 01-1.01-.08z" />
      </svg>
    ),
  },
];

const footerLinks = [
  { href: '/courses', label: 'Courses' },
  { href: '/blog', label: 'Blog' },
  { href: '/about', label: 'About Jeremy' },
  { href: '/contact', label: 'Contact Us' },
  { href: '/contact', label: 'Become an Affiliate' },
];

export default function PublicFooter() {
  return (
    <footer className="bg-[#161E2A] text-white">
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 pb-10 border-b border-gray-700">
          {/* Brand */}
          <div>
            <Image
              src="https://kajabi-storefronts-production.kajabi-cdn.com/kajabi-storefronts-production/file-uploads/themes/2155355257/settings_images/fa8aa-a07a-fee1-1427-0838b76575_0781e02a-1437-42e4-9456-8938569f0c77.png"
              alt="Pestor's Pointers"
              width={140}
              height={40}
              className="h-10 w-auto object-contain mb-3"
              unoptimized
            />
            <p className="text-sm text-gray-400 leading-relaxed">
              S.i.T.i.N.G. Outreach<br />
              Standing. in. the. Increasingly.<br />Neglected. Gap.
            </p>
          </div>

          {/* Quick links */}
          <div>
            <p className="font-semibold text-xs uppercase tracking-widest text-gray-400 mb-4">Quick Links</p>
            <div className="space-y-2">
              {footerLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block text-sm text-gray-400 hover:text-white transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Connect */}
          <div>
            <p className="font-semibold text-xs uppercase tracking-widest text-gray-400 mb-4">Connect</p>
            <div className="flex gap-4 mb-5">
              {socialLinks.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="text-gray-400 hover:text-[#f53100] transition-colors"
                >
                  {s.icon}
                </a>
              ))}
            </div>
            <a
              href="mailto:jeremypestor@gmail.com"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              jeremypestor@gmail.com
            </a>
          </div>
        </div>

        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-gray-500">© 2026 S.i.T.i.N.G. Outreach | All Rights Reserved.</p>
          <Link href="/terms" className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
            Terms &amp; Conditions
          </Link>
        </div>
      </div>
    </footer>
  );
}
