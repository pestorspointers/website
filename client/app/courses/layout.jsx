import PublicNav from '../../components/PublicNav';
import PublicFooter from '../../components/PublicFooter';

export default function CoursesLayout({ children }) {
  return (
    <>
      <PublicNav />
      {children}
      <PublicFooter />
    </>
  );
}
