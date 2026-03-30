import { notFound } from 'next/navigation';
import PurchaseButton from './PurchaseButton';

async function getCourse(slug) {
  try {
    const res = await fetch(`${process.env.API_URL}/api/v1/courses/${slug}`, {
      next: { revalidate: 3600 },
    });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }) {
  const course = await getCourse(params.slug);
  if (!course) return { title: 'Course not found' };
  return {
    title: course.title,
    description: course.description,
  };
}

function formatDuration(seconds) {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default async function CourseDetailPage({ params }) {
  const course = await getCourse(params.slug);
  if (!course) notFound();

  return (
    <main className="max-w-4xl mx-auto px-4 py-12">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left: course info */}
        <div className="md:col-span-2 space-y-6">
          <div>
            <h1 className="text-3xl font-bold">{course.title}</h1>
            <p className="text-gray-600 mt-3">{course.description}</p>
          </div>

          {/* Video list */}
          <div>
            <h2 className="text-lg font-semibold mb-3">
              Course Content · {course.videoIds.length} videos
            </h2>
            <div className="border rounded-lg divide-y">
              {course.videoIds.map((video, i) => (
                <div key={video._id} className="flex items-center gap-3 px-4 py-3">
                  <span className="text-sm text-gray-400 w-6">{i + 1}.</span>
                  {video.thumbnailUrl ? (
                    <img
                      src={video.thumbnailUrl}
                      alt=""
                      className="w-12 h-8 object-cover rounded"
                    />
                  ) : (
                    <div className="w-12 h-8 bg-gray-100 rounded flex items-center justify-center text-gray-300 text-xs">
                      ▶
                    </div>
                  )}
                  <span className="flex-1 text-sm">{video.title}</span>
                  {video.duration && (
                    <span className="text-xs text-gray-400">{formatDuration(video.duration)}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: purchase card */}
        <div className="md:col-span-1">
          <div className="border rounded-xl p-6 sticky top-6 space-y-4">
            {course.thumbnailUrl && (
              <img
                src={course.thumbnailUrl}
                alt={course.title}
                className="w-full aspect-video object-cover rounded-lg"
              />
            )}
            <div>
              <p className="text-2xl font-bold">${course.price.toFixed(2)}</p>
              <p className="text-sm text-gray-500 mt-1">One-time purchase · lifetime access</p>
            </div>
            <PurchaseButton courseId={course._id} price={course.price} />
            <p className="text-xs text-gray-400 text-center">
              Or{' '}
              <a href="/billing" className="underline hover:text-gray-600">
                subscribe
              </a>{' '}
              for access to all courses.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
