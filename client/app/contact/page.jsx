import CmsPage from '@/components/CmsPage';
import { pageMetadata } from '@/lib/pages';

export const revalidate = 60;

export function generateMetadata() {
  return pageMetadata('contact', { title: 'Contact' });
}

export default function ContactPage() {
  return <CmsPage slug="contact" />;
}
