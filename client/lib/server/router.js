/**
 * A very small stand-in for `express.Router`, covering exactly the subset of
 * Express this API uses: `get/post/put/patch/delete`, `use` for middleware and
 * for mounting sub-routers, `req.params/query/body/headers/user`, and
 * `res.status().json()`.
 *
 * It exists because the API now runs inside Next.js route handlers on Amplify
 * rather than as a standalone Express process. Keeping the Express shape means
 * every file in `routes/` is unchanged apart from where `Router` is imported
 * from, so the routing and business logic that was already working in
 * production stays byte-for-byte the same.
 *
 * Deliberately not supported, because nothing here uses it: regex and wildcard
 * paths, optional params, `res.send/redirect/cookie`, streaming responses, and
 * error-handling middleware with four arguments.
 */

const ROUTER = Symbol('router');

const split = (path) => String(path).split('/').filter(Boolean);

/**
 * Match a pattern against a request path.
 *
 * `prefix` matching is what `use('/api/v1/admin', router)` needs: the pattern
 * only has to cover the leading segments, and whatever is left over is what the
 * sub-router sees.
 */
function match(patternSegments, pathSegments, { prefix = false } = {}) {
  if (prefix ? patternSegments.length > pathSegments.length : patternSegments.length !== pathSegments.length) {
    return null;
  }

  const params = {};

  for (const [i, pattern] of patternSegments.entries()) {
    const segment = pathSegments[i];
    if (pattern.startsWith(':')) {
      params[pattern.slice(1)] = safeDecode(segment);
    } else if (pattern !== segment) {
      return null;
    }
  }

  return { params, rest: `/${pathSegments.slice(patternSegments.length).join('/')}` };
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    // A malformed escape is not a reason to 500 — hand the route the raw text
    // and let its own validation reject it.
    return value;
  }
}

/**
 * Run one middleware and report whether it passed control on. Express decides
 * that by whether `next()` was called; an error passed to `next(err)` is
 * rethrown so the handler at the edge turns it into a status code, exactly as
 * `express-async-errors` did.
 */
async function runMiddleware(fn, req, res) {
  let called = false;
  let error;

  await fn(req, res, (err) => {
    called = true;
    error = err;
  });

  if (error) throw error;
  return called;
}

export function Router() {
  const stack = [];

  const add = (method) => (path, ...handlers) => {
    stack.push({ method, segments: split(path), handlers });
    return router;
  };

  const router = {
    [ROUTER]: true,
    stack,

    /** `use(mw…)`, `use('/path', mw…)` or `use('/path', subRouter)`. */
    use(pathOrHandler, ...rest) {
      const hasPath = typeof pathOrHandler === 'string';
      const path = hasPath ? pathOrHandler : '/';
      const handlers = hasPath ? rest : [pathOrHandler, ...rest];

      for (const handler of handlers) {
        stack.push({
          method: null,
          segments: split(path),
          mounted: Boolean(handler?.[ROUTER]),
          handlers: [handler],
        });
      }
      return router;
    },

    get: add('GET'),
    post: add('POST'),
    put: add('PUT'),
    patch: add('PATCH'),
    delete: add('DELETE'),

    /**
     * Walk the stack in registration order. Middleware registered with `use`
     * runs for everything that reaches it, and the first matching route wins —
     * which is why `router.use(authenticate, requireAdmin)` halfway down a file
     * protects the routes below it and leaves the public ones above it alone.
     */
    async handle(req, res, path = req.path) {
      const pathSegments = split(path);

      for (const layer of stack) {
        if (layer.method === null) {
          const hit = match(layer.segments, pathSegments, { prefix: true });
          if (!hit) continue;

          const [handler] = layer.handlers;

          if (layer.mounted) {
            const handled = await handler.handle(req, res, hit.rest);
            if (handled) return true;
            continue;
          }

          Object.assign(req.params, hit.params);
          const passedOn = await runMiddleware(handler, req, res);
          // A middleware that answered instead of calling next() is done.
          if (!passedOn) return true;
          continue;
        }

        if (layer.method !== req.method) continue;

        const hit = match(layer.segments, pathSegments);
        if (!hit) continue;

        req.params = { ...req.params, ...hit.params };

        for (const handler of layer.handlers) {
          // Route-level middleware (`get('/x', authenticate, fn)`) is told apart
          // from the final handler by arity, the same way Express does it.
          if (handler.length >= 3) {
            const passedOn = await runMiddleware(handler, req, res);
            if (!passedOn) return true;
            continue;
          }
          await handler(req, res);
        }

        return true;
      }

      return false;
    },
  };

  return router;
}

export default Router;
