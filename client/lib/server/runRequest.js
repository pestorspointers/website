/**
 * Runs one request against a router and returns a plain `{ status, body }`.
 *
 * This is the piece that stands in for the Express request/response objects.
 * It is kept separate from `dispatch.js` so tests can drive a single router
 * without loading the whole API.
 */

/** Requests whose body we parse as JSON. */
export const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export async function runRequest(router, { method = 'GET', path, query = {}, headers = {}, body = {} }) {
  const req = {
    method: method.toUpperCase(),
    path,
    params: {},
    query,
    headers,
    body,
    user: undefined,
  };

  const res = {
    statusCode: 200,
    payload: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };

  try {
    const matched = await router.handle(req, res, path);
    if (!matched) return { status: 404, body: { error: 'Not found' } };
    return { status: res.statusCode, body: res.payload ?? null };
  } catch (err) {
    // HttpError carries its own status; anything else is a real bug, so it gets
    // logged and reported as a 500 without leaking the message. This is what
    // the Express error handler in `server/src/index.js` did.
    const status = err?.status ?? 500;
    if (status >= 500) console.error(err);
    return {
      status,
      body: { error: status >= 500 ? 'Internal server error' : err.message },
    };
  }
}
