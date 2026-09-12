/**
 * Membership plan admin API, exercised over HTTP with no database or Stripe.
 *
 *   npm test
 *
 * Supabase, Stripe and the auth middleware are swapped for in-memory fakes so
 * the real route logic runs end to end without touching the live project.
 */
import { beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';

const here = (path) => new URL(path, import.meta.url).href;

// ── In-memory Supabase ───────────────────────────────────────────────────────

const tables = { subscription_tiers: [], tier_courses: [] };
let seq = 1;
const newId = () => `00000000-0000-4000-8000-${String(seq++).padStart(12, '0')}`;

const TIER_DEFAULTS = {
  description: '',
  features: [],
  price_annual: null,
  stripe_product_id: null,
  stripe_price_monthly_id: null,
  stripe_price_annual_id: null,
  is_active: true,
  display_order: 0,
};

/** Just enough of the PostgREST query builder for the routes under test. */
function from(table) {
  const q = { op: 'select', payload: null, filters: [], embed: false, mode: 'many' };
  const matching = () =>
    tables[table].filter((row) => q.filters.every(([column, value]) => row[column] === value));

  const execute = () => {
    let rows;
    if (q.op === 'insert') {
      rows = [].concat(q.payload).map((row) => ({
        ...(table === 'subscription_tiers' ? { id: newId(), ...TIER_DEFAULTS } : {}),
        ...row,
      }));
      tables[table].push(...rows);
    } else if (q.op === 'update') {
      rows = matching();
      for (const row of rows) Object.assign(row, q.payload);
    } else if (q.op === 'delete') {
      rows = matching();
      tables[table] = tables[table].filter((row) => !rows.includes(row));
    } else {
      rows = matching();
    }

    rows = rows.map((row) =>
      q.embed
        ? {
            ...row,
            tier_courses: tables.tier_courses
              .filter((link) => link.tier_id === row.id)
              .map(({ course_id }) => ({ course_id })),
          }
        : { ...row }
    );

    if (q.mode === 'single') {
      return rows.length === 1
        ? { data: rows[0], error: null }
        : { data: null, error: { message: `expected 1 row, got ${rows.length}` } };
    }
    if (q.mode === 'maybe') return { data: rows[0] ?? null, error: null };
    return { data: rows, error: null };
  };

  const builder = {
    select(columns = '*') {
      q.embed = String(columns).includes('tier_courses(');
      return builder;
    },
    insert(payload) {
      q.op = 'insert';
      q.payload = payload;
      return builder;
    },
    update(payload) {
      q.op = 'update';
      q.payload = payload;
      return builder;
    },
    delete() {
      q.op = 'delete';
      return builder;
    },
    eq(column, value) {
      q.filters.push([column, value]);
      return builder;
    },
    order() {
      return builder;
    },
    single() {
      q.mode = 'single';
      return Promise.resolve(execute());
    },
    maybeSingle() {
      q.mode = 'maybe';
      return Promise.resolve(execute());
    },
    then(resolve, reject) {
      return Promise.resolve(execute()).then(resolve, reject);
    },
  };
  return builder;
}

// ── Fake Stripe ──────────────────────────────────────────────────────────────

const stripe = { on: false, calls: [], failPrices: false };
let stripeSeq = 1;
const fakeStripe = {
  products: {
    create: async (params) => {
      stripe.calls.push({ call: 'products.create', params });
      return { id: `prod_${stripeSeq++}` };
    },
    update: async (id, params) => {
      stripe.calls.push({ call: 'products.update', id, params });
      return { id };
    },
  },
  prices: {
    create: async (params) => {
      if (stripe.failPrices) throw new Error('Invalid API key provided');
      stripe.calls.push({ call: 'prices.create', params });
      return { id: `price_${stripeSeq++}` };
    },
  },
};
const callsTo = (name) => stripe.calls.filter((c) => c.call === name);

// ── Wire the fakes in, then load the real routes ─────────────────────────────

let currentUser;

mock.module(here('./config/supabase.js'), {
  exports: {
    db: () => ({ from }),
    unwrap: ({ data, error }, context = 'query') => {
      if (error) throw new Error(`${context}: ${error.message}`);
      return data;
    },
  },
});
mock.module(here('./middleware/authenticate.js'), {
  exports: {
    authenticate: (req, _res, next) => {
      req.user = currentUser;
      next();
    },
  },
});
mock.module(here('./services/stripe.js'), {
  exports: { default: () => fakeStripe, stripeEnabled: () => stripe.on },
});

const { Router } = await import('./router.js');
const { runRequest } = await import('./runRequest.js');
const { default: tierRoutes } = await import('./routes/subscriptionTiers.js');

// The routes run through the same router and request runner that serve real
// traffic, so this exercises the dispatch path as well as the route logic.
const app = Router();
app.use('/tiers', tierRoutes);

async function call(method, path = '', body) {
  const [pathname, search = ''] = `/tiers${path}`.split('?');
  return runRequest(app, {
    method,
    path: pathname,
    query: Object.fromEntries(new URLSearchParams(search)),
    body: body ?? {},
  });
}

const createPlan = (overrides = {}) =>
  call('POST', '', { name: 'Monthly Membership', priceMonthly: 17.77, ...overrides });

beforeEach(() => {
  tables.subscription_tiers = [];
  tables.tier_courses = [];
  stripe.on = false;
  stripe.calls = [];
  stripe.failPrices = false;
  currentUser = { id: 'admin-1', role: 'admin' };
});

// ── Tests ────────────────────────────────────────────────────────────────────

test('creates a plan with no Stripe account connected', async () => {
  const { status, body } = await createPlan({
    description: 'Everything, every month',
    priceAnnual: 177,
    features: ['All three programs', '   ', 'Cancel anytime'],
  });

  assert.equal(status, 201);
  assert.equal(body.name, 'Monthly Membership');
  assert.equal(body.priceMonthly, 17.77);
  assert.equal(body.priceAnnual, 177);
  assert.deepEqual(body.features, ['All three programs', 'Cancel anytime']);
  assert.equal(body.stripeSynced, false);
  assert.equal(body.stripeWarning, undefined);
  assert.equal(stripe.calls.length, 0, 'no Stripe calls without a key');
  assert.equal(tables.subscription_tiers.length, 1);
});

test('rejects a plan with no name, no monthly price, or a bad yearly price', async () => {
  assert.equal((await call('POST', '', { priceMonthly: 10 })).status, 400);
  assert.equal((await call('POST', '', { name: 'No price' })).status, 400);
  assert.equal((await createPlan({ priceAnnual: -5 })).status, 400);
  assert.equal(tables.subscription_tiers.length, 0, 'nothing saved on a bad request');
});

test('saves a price change even with no Stripe account connected', async () => {
  // Regression: a price used to be saved only as a side effect of minting a
  // Stripe price, so without Stripe the edit was silently discarded.
  const { body: plan } = await createPlan({ priceAnnual: 177 });

  const { status, body } = await call('PATCH', `/${plan.id}`, { priceMonthly: 20 });
  assert.equal(status, 200);
  assert.equal(body.priceMonthly, 20);
  assert.equal(tables.subscription_tiers[0].price_monthly, 20);

  const cleared = await call('PATCH', `/${plan.id}`, { priceAnnual: null });
  assert.equal(cleared.body.priceAnnual, null, 'an empty yearly price removes the yearly option');
});

test('creates the Stripe product and both prices once a key exists', async () => {
  stripe.on = true;
  const { status, body } = await createPlan({ priceAnnual: 177 });

  assert.equal(status, 201);
  assert.equal(body.stripeSynced, true);
  assert.equal(callsTo('products.create').length, 1);

  const prices = callsTo('prices.create').map((c) => c.params);
  assert.deepEqual(
    prices.map((p) => [p.unit_amount, p.recurring.interval]),
    [
      [1777, 'month'],
      [17700, 'year'],
    ]
  );
  assert.ok(
    prices.every((p) => p.metadata.tierId === body.id),
    'every price is tagged with the plan id for the webhook'
  );
});

test('a price change mints a new Stripe price and keeps the product', async () => {
  stripe.on = true;
  const { body: plan } = await createPlan();
  const oldPriceId = tables.subscription_tiers[0].stripe_price_monthly_id;

  const { body } = await call('PATCH', `/${plan.id}`, { priceMonthly: 25 });
  assert.equal(body.stripeSynced, true);
  assert.equal(callsTo('products.create').length, 1, 'same product');
  assert.equal(callsTo('prices.create').at(-1).params.unit_amount, 2500);
  assert.notEqual(tables.subscription_tiers[0].stripe_price_monthly_id, oldPriceId);
});

test('a plan created before Stripe was connected syncs on its next save', async () => {
  const { body: plan } = await createPlan();
  assert.equal(plan.stripeSynced, false);

  stripe.on = true;
  const { body } = await call('PATCH', `/${plan.id}`, { description: 'Now with Stripe' });
  assert.equal(body.stripeSynced, true);
  assert.equal(callsTo('products.create').length, 1);
  assert.equal(callsTo('prices.create').length, 1);
});

test('edits that change nothing on Stripe make no Stripe calls', async () => {
  stripe.on = true;
  const { body: plan } = await createPlan();
  stripe.calls = [];

  await call('PATCH', `/${plan.id}`, { features: ['Bonus videos'] });
  assert.equal(stripe.calls.length, 0);
});

test('a Stripe failure never loses the save, and the retry reuses the product', async () => {
  stripe.on = true;
  stripe.failPrices = true;
  const { status, body } = await createPlan();

  assert.equal(status, 201);
  assert.equal(body.stripeSynced, false);
  assert.match(body.stripeWarning, /Stripe/);
  assert.equal(tables.subscription_tiers.length, 1, 'the plan is still saved');
  assert.ok(tables.subscription_tiers[0].stripe_product_id, 'the product id is kept, not orphaned');

  stripe.failPrices = false;
  const retry = await call('PATCH', `/${body.id}`, { description: 'retry' });
  assert.equal(retry.body.stripeSynced, true);
  assert.equal(callsTo('products.create').length, 1, 'the retry reuses the saved product');
});

test('sets the courses a plan unlocks', async () => {
  const course = '11111111-1111-4111-8111-111111111111';
  const { body: plan } = await createPlan();

  const { body } = await call('PATCH', `/${plan.id}`, { courseIds: [course] });
  assert.deepEqual(body.courseIds, [course]);

  const { body: list } = await call('GET');
  assert.deepEqual(list[0].courseIds, [course]);
  assert.equal(list[0].stripeSynced, false);
});

test('retires and reactivates a plan, keeping Stripe in step', async () => {
  stripe.on = true;
  const { body: plan } = await createPlan();

  assert.equal((await call('DELETE', `/${plan.id}`)).status, 200);
  assert.equal(tables.subscription_tiers[0].is_active, false);
  assert.deepEqual(callsTo('products.update').at(-1).params, { active: false });

  const { body } = await call('PATCH', `/${plan.id}`, { isActive: true });
  assert.equal(body.isActive, true);
  assert.deepEqual(callsTo('products.update').at(-1).params, { active: true });
});

test('refuses non-admins', async () => {
  currentUser = { id: 'member-1', role: 'user' };
  assert.equal((await call('GET')).status, 403);
  assert.equal((await createPlan()).status, 403);
  assert.equal(tables.subscription_tiers.length, 0);
});

test('an unknown or malformed plan id is a 404, not a crash', async () => {
  assert.equal((await call('PATCH', '/not-a-uuid', { name: 'x' })).status, 404);
  assert.equal(
    (await call('PATCH', '/00000000-0000-4000-8000-999999999999', { name: 'x' })).status,
    404
  );
});
