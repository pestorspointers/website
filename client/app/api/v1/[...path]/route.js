/**
 * Every `/api/v1/*` request enters here.
 *
 * The API used to be a separate Express service; it now runs inside this Next
 * app, so a single catch-all handler forwards each request to the same router
 * the Express server used. One entry point rather than forty route files keeps
 * the paths, the middleware order and the error shapes identical to what was
 * already working.
 */

import { NextResponse } from 'next/server';
import { dispatch, BODY_METHODS } from '@/lib/server/dispatch';
import { WEBHOOK_PREFIX } from '@/lib/server/app';

// Every route reads the caller's token or writes to the database. None of it
// can be prerendered or cached.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function handle(request) {
  const url = new URL(request.url);

  // Stripe signs the exact bytes it posted, so the webhook body stays a string.
  // Everything else is JSON, and an absent body reads as `{}` the way
  // `express.json()` left it.
  const isWebhook = url.pathname.startsWith(WEBHOOK_PREFIX);
  let body = {};

  if (BODY_METHODS.has(request.method)) {
    const raw = await request.text();
    if (isWebhook) {
      body = raw;
    } else if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
      }
    }
  }

  const { status, body: payload } = await dispatch({
    method: request.method,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    headers: Object.fromEntries(request.headers),
    body,
  });

  return NextResponse.json(payload, { status });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
