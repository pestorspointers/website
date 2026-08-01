import { apiGet } from './serverApi';

/**
 * Site-wide config the admin edits under Admin → Site Settings. Defaults keep
 * the site rendering correctly on a brand-new database, or if the API is down.
 */

const DEFAULTS = {
  brand: {
    siteName: "Pestor's Pointers",
    tagline: '',
    logoUrl: '',
    footerLogoUrl: '',
    contactEmail: '',
    accentColor: '#f53100',
    navyColor: '#100566',
    darkColor: '#161E2A',
  },
  nav: {
    links: [
      { label: 'Home', href: '/' },
      { label: 'Courses', href: '/courses' },
      { label: 'Blog', href: '/blog' },
      { label: 'About', href: '/about' },
      { label: 'Contact', href: '/contact' },
    ],
  },
  footer: {
    tagline: '',
    links: [],
    socials: [],
    legalLinks: [],
    copyright: '',
  },
};

export async function getSettings() {
  const settings = (await apiGet('/api/v1/settings', { revalidate: 60, fallback: {} })) ?? {};

  return {
    brand: { ...DEFAULTS.brand, ...(settings.brand ?? {}) },
    nav: { ...DEFAULTS.nav, ...(settings.nav ?? {}) },
    footer: { ...DEFAULTS.footer, ...(settings.footer ?? {}) },
  };
}
