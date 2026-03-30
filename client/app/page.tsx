import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-white">
      <h1 className="text-4xl font-bold mb-4">Life Coach Platform</h1>
      <p className="text-gray-500 mb-8">Coming soon</p>
      <div className="flex gap-4">
        <Link
          href="/login"
          className="px-5 py-2 bg-black text-white rounded hover:bg-gray-800"
        >
          Sign In
        </Link>
        <Link
          href="/register"
          className="px-5 py-2 border border-black rounded hover:bg-gray-50"
        >
          Register
        </Link>
      </div>
    </main>
  );
}
