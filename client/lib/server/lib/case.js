/**
 * Postgres columns are snake_case; the React client speaks camelCase.
 * These helpers translate at the API boundary so neither side has to
 * compromise.
 */

const camel = (s) => s.replace(/_([a-z0-9])/g, (_m, c) => c.toUpperCase());
const snake = (s) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

const isPlainObject = (v) =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);

/** Deep snake_case → camelCase on rows coming out of Postgres. */
export function camelize(value) {
  if (Array.isArray(value)) return value.map(camelize);
  if (!isPlainObject(value)) return value;

  const out = {};
  for (const [key, val] of Object.entries(value)) {
    out[camel(key)] = camelize(val);
  }
  return out;
}

/**
 * Pick an allowlist of camelCase fields off a request body and return them
 * snake_cased, ready for an insert/update. Fields not in `allowed` are
 * dropped, which is what keeps clients from writing to columns like `role`
 * or `stripe_customer_id` through a generic PATCH.
 */
export function pickSnake(body, allowed) {
  const out = {};
  if (!isPlainObject(body)) return out;

  for (const key of allowed) {
    if (key in body) out[snake(key)] = body[key];
  }
  return out;
}

export { camel, snake };
