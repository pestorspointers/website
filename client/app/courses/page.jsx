import Link from 'next/link';
import { fetchCourses } from '@/lib/publicData';

export const revalidate = 300;

export const metadata = {
  title: 'Courses',
  description: 'Every course available, with what you get in each one.',
};

export default async function CoursesPage() {
  const courses = await fetchCourses();

  return (
    <main className="max-w-6xl mx-auto px-4 py-14">
      <h1 className="text-4xl font-extrabold text-[#161E2A] mb-2">Courses</h1>
      <p className="text-gray-500 mb-10">
        Buy a course outright, or unlock several at once with a membership.
      </p>

      {courses.length === 0 ? (
        <div className="bg-gray-50 border rounded-2xl p-16 text-center">
          <p className="text-gray-400">No courses have been published yet — check back soon.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map((course) => (
            <Link
              key={course.id}
              href={`/courses/${course.slug}`}
              className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow border border-gray-100 flex flex-col"
            >
              {course.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
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

              <div className="p-5 flex-1 flex flex-col">
                <h2 className="font-semibold text-[#161E2A] group-hover:text-[#f53100] transition-colors">
                  {course.title}
                </h2>
                <p className="text-sm text-gray-500 mt-1 line-clamp-3 flex-1">
                  {course.shortDescription || course.description}
                </p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="font-bold text-[#100566]">
                    ${Number(course.price).toFixed(2)}
                  </span>
                  <span className="text-xs text-gray-400">
                    {course.videoCount} {course.videoCount === 1 ? 'video' : 'videos'}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
