import Link from 'next/link';
import { getSettings } from '@/lib/settings';

const ICONS = {
  facebook: 'M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z',
  instagram:
    'M16 4H8a4 4 0 00-4 4v8a4 4 0 004 4h8a4 4 0 004-4V8a4 4 0 00-4-4zm-4 9a3 3 0 110-6 3 3 0 010 6zm4.5-7a1 1 0 110 2 1 1 0 010-2z',
  youtube:
    'M22.54 6.42a2.78 2.78 0 00-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 00-1.95 1.96A29 29 0 001 12a29 29 0 00.46 5.58A2.78 2.78 0 003.41 19.54C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 001.95-1.96A29 29 0 0023 12a29 29 0 00-.46-5.58zM9.75 15.02V8.98L15.5 12l-5.75 3.02z',
  tiktok:
    'M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.53V6.77a4.85 4.85 0 01-1.01-.08z',
  // Anything the admin adds that isn't one of the above gets a link glyph.
  default:
    'M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71',
};

function SocialIcon({ label }) {
  const path = ICONS[String(label).toLowerCase()] ?? ICONS.default;
  return (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d={path} />
    </svg>
  );
}

export default async function PublicFooter() {
  const { brand, footer } = await getSettings();
  const year = new Date().getFullYear();

  return (
    <footer className="bg-[#161E2A] text-white">
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 pb-10 border-b border-gray-700">
          <div>
            {brand.footerLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={brand.footerLogoUrl}
                alt={brand.siteName}
                className="h-10 w-auto object-contain mb-3"
              />
            ) : (
              <p className="font-extrabold text-lg mb-3">{brand.siteName}</p>
            )}
            {footer.tagline && (
              <p className="text-sm text-gray-400 leading-relaxed">{footer.tagline}</p>
            )}
          </div>

          {footer.links?.length > 0 && (
            <div>
              <p className="font-semibold text-xs uppercase tracking-widest text-gray-400 mb-4">
                Quick Links
              </p>
              <div className="space-y-2">
                {footer.links.map((link) => (
                  <Link
                    key={`${link.href}-${link.label}`}
                    href={link.href}
                    className="block text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="font-semibold text-xs uppercase tracking-widest text-gray-400 mb-4">
              Connect
            </p>
            {footer.socials?.length > 0 && (
              <div className="flex gap-4 mb-5">
                {footer.socials.map((s) => (
                  <a
                    key={s.label}
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={s.label}
                    className="text-gray-400 hover:text-[#f53100] transition-colors"
                  >
                    <SocialIcon label={s.label} />
                  </a>
                ))}
              </div>
            )}
            {brand.contactEmail && (
              <a
                href={`mailto:${brand.contactEmail}`}
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                {brand.contactEmail}
              </a>
            )}
          </div>
        </div>

        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-gray-500">
            © {year} {footer.copyright || brand.siteName}
          </p>
          <div className="flex gap-4">
            {footer.legalLinks?.map((link) => (
              <Link
                key={`${link.href}-${link.label}`}
                href={link.href}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
