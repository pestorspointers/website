import { NextRequest, NextResponse } from 'next/server';
import { compileMDX } from 'next-mdx-remote/rsc';

export async function POST(req: NextRequest) {
  const { mdxContent } = await req.json();

  if (!mdxContent || typeof mdxContent !== 'string') {
    return NextResponse.json({ error: 'mdxContent required' }, { status: 400 });
  }

  try {
    // Compile just to validate — we return the raw MDX source back.
    // The actual rendering happens in the public /blog/[slug] page.
    await compileMDX({ source: mdxContent });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'MDX compile error';
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
