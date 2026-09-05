import { Karla } from 'next/font/google';
import './globals.css';
import { getSettings } from '@/lib/settings';

// Karla is the typeface pestorspointers.com uses; keeping it makes the
// default look a faithful mirror of the Kajabi site.
const karla = Karla({ subsets: ['latin'], weight: ['400', '700'] });

export async function generateMetadata() {
  const { brand } = await getSettings();

  return {
    title: {
      default: brand.siteName,
      template: `%s | ${brand.siteName}`,
    },
    description: brand.tagline,
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
    openGraph: {
      siteName: brand.siteName,
      type: 'website',
    },
  };
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={karla.className}>{children}</body>
    </html>
  );
}
