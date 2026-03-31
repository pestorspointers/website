import Link from "next/link";
import "./page.css";

async function getCourses() {
  try {
    const res = await fetch(`${process.env.API_URL}/api/v1/courses`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export const metadata = {
  title: "Courses",
  description: "Browse all available courses.",
};

export default async function CoursesPage() {
  const courses = await getCourses();

  return (
    <main className="max-w-5xl mx-auto px-4 py-12">
      <div className="course-banner w-screen relative left-1/2 -translate-x-1/2 flex-auto align-middle">
        <p className="text-white text-6xl text-center">
          Choose the Resources That Best Meet Your Needs
        </p>
        <p className="text-white text-2xl text-center pt-3">
          Pricing that allows you to jump in TODAY and get started immediately!
        </p>
      </div>
      <h1 className="text-3xl font-bold mb-2">Courses</h1>
      <p className="text-gray-500 mb-8">
        Choose a course or subscribe for full access.
      </p>

      {courses.length === 0 ? (
        <p className="text-gray-400">
          No courses available yet — check back soon.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map((course) => (
            <Link
              key={course._id}
              href={`/courses/${course.slug}`}
              className="group border rounded-xl overflow-hidden hover:shadow-md transition-shadow bg-white"
            >
              {course.thumbnailUrl ? (
                <img
                  src={course.thumbnailUrl}
                  alt={course.title}
                  className="w-full aspect-video object-cover"
                />
              ) : (
                <div className="w-full aspect-video bg-gray-100 flex items-center justify-center text-gray-300 text-4xl">
                  ▶
                </div>
              )}
              <div className="p-4">
                <h2 className="font-semibold text-base group-hover:text-blue-600 transition-colors">
                  {course.title}
                </h2>
                <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                  {course.description}
                </p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm font-bold">
                    ${course.price.toFixed(2)}
                  </span>
                  <span className="text-xs text-gray-400">
                    {course.videoIds.length} videos
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
