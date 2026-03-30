export const mdxComponents = {
  // Embed a YouTube video: <YouTube id="dQw4w9WgXcQ" />
  YouTube: ({ id }) => (
    <div className="relative aspect-video my-6 rounded-xl overflow-hidden">
      <iframe
        src={`https://www.youtube.com/embed/${id}`}
        title="YouTube video"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="absolute inset-0 w-full h-full"
      />
    </div>
  ),

  // Callout box: <CalloutBox type="info">Some note</CalloutBox>
  // type: "info" | "warning" | "tip" | "danger"
  CalloutBox: ({ type = 'info', children }) => {
    const styles = {
      info: 'bg-blue-50 border-blue-400 text-blue-900',
      warning: 'bg-yellow-50 border-yellow-400 text-yellow-900',
      tip: 'bg-green-50 border-green-400 text-green-900',
      danger: 'bg-red-50 border-red-400 text-red-900',
    };
    const icons = {
      info: 'ℹ️',
      warning: '⚠️',
      tip: '💡',
      danger: '🚨',
    };
    return (
      <div className={`border-l-4 px-4 py-3 my-4 rounded-r-lg text-sm ${styles[type]}`}>
        <span className="mr-2">{icons[type]}</span>
        {children}
      </div>
    );
  },

  // Override default prose elements for consistent styling
  h1: ({ children }) => <h1 className="text-3xl font-bold mt-8 mb-4">{children}</h1>,
  h2: ({ children }) => <h2 className="text-2xl font-semibold mt-8 mb-3">{children}</h2>,
  h3: ({ children }) => <h3 className="text-xl font-semibold mt-6 mb-2">{children}</h3>,
  p: ({ children }) => <p className="my-4 leading-7">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-6 my-4 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-6 my-4 space-y-1">{children}</ol>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-gray-300 pl-4 italic text-gray-600 my-4">
      {children}
    </blockquote>
  ),
  code: ({ children }) => (
    <code className="bg-gray-100 text-pink-600 rounded px-1 py-0.5 text-sm font-mono">
      {children}
    </code>
  ),
  a: ({ href, children }) => (
    <a href={href} className="text-blue-600 underline hover:text-blue-800" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
};
