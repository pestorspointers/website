/**
 * Runs one API request against the full router.
 *
 * Both callers come through here:
 *
 *   • `app/api/v1/[...path]/route.js` — real HTTP from the browser
 *   • `lib/serverApi.js` — server components, calling straight through with no
 *     network hop, since the API and the pages are one process now
 */

import app from './app.js';
import { runRequest, BODY_METHODS } from './runRequest.js';

export function dispatch(options) {
  return runRequest(app, options);
}

export { BODY_METHODS };
