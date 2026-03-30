import PublicNav from '../../components/PublicNav';
import PublicFooter from '../../components/PublicFooter';

export default function CoursesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PublicNav />
      {children}
      <PublicFooter />
    </>
  );
}
