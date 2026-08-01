# Pestor's Pointers — course platform

A course-selling website with a built-in admin area, so the site owner can change
the pages, add courses and upload videos without touching code.

- **Frontend** — Next.js 14 (App Router), Tailwind
- **API** — Express, talking to Supabase with the service-role key
- **Database + auth + image storage** — Supabase (Postgres, Auth, Storage)
- **Payments** — Stripe (memberships + one-off course purchases)
- **Course video** — private S3 bucket → MediaConvert (HLS) → CloudFront signed URLs

---

## How access works

Three things can unlock a video, and nothing else can:

| Video type | Who can watch it |
|---|---|
| `public` | Anyone, logged in or not. Use for trailers and free clips. |
| `course` | Anyone who bought that course, **or** a paying member on a plan that includes it. |
| `purchase` | Only someone who bought that specific video. |

A course purchase unlocks **exactly the videos attached to that course** — nothing
else. That scoping comes from `videos.course_id`, and a video can only belong to
one course at a time.

The rule lives in two places that must agree:

- `server/src/services/access.js` — what the API enforces
- `public.can_access_course()` / `public.can_access_video()` in the migration — what
  Row Level Security enforces

A playable video URL is only ever produced by `GET /api/v1/videos/:id/stream`,
which runs the access check and then returns a CloudFront URL signed for two
hours. There is no other route to the video files: the S3 bucket is private and
CloudFront requires the signature.

---

## First-time setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** and run, in order:
   - `supabase/migrations/0001_init.sql` — tables, functions, RLS, storage bucket
   - `supabase/seed.sql` — starter pages, navigation, footer
3. In **Authentication → Providers**, make sure Email is enabled. Decide whether
   you want "Confirm email" on (recommended for a live site) — the sign-up page
   handles both.
4. In **Authentication → URL Configuration**, add your site URL and
   `http://localhost:3000/auth/callback` to the redirect allow-list.
5. Grab your keys from **Project Settings → API**.

**Make yourself an admin.** Before signing up, run this with your own email:

```sql
update public.site_settings
   set value = '["you@example.com"]'::jsonb
 where key = 'admin_emails';
```

Anyone who signs up with a listed email becomes an admin automatically. After
that you can promote other people from **Admin → Members**. Already signed up?
Just set it directly:

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

### 2. Environment files

Copy the examples and fill them in:

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env.local
```

The one to be careful with is `SUPABASE_SERVICE_ROLE_KEY` — it bypasses all
security rules. It belongs in `server/.env` only, never in the client.

### 3. Stripe

1. Add `STRIPE_SECRET_KEY` to `server/.env`.
2. Forward webhooks while developing, and copy the signing secret it prints into
   `STRIPE_WEBHOOK_SECRET`:
   ```bash
   stripe listen --forward-to localhost:5001/api/v1/webhooks/stripe
   ```
3. Turn on the Customer Portal: **Stripe Dashboard → Settings → Billing →
   Customer Portal**.

Stripe products and prices are created automatically when you add a course or a
membership plan in the admin — there is nothing to set up by hand.

### 4. AWS (only needed for course video)

Everything else works without this; you just can't play uploaded videos until
it's done.

- **S3** — a private bucket, all public access blocked, with this CORS rule so the
  browser can upload directly:
  ```json
  [{ "AllowedOrigins": ["http://localhost:3000", "https://yourdomain.com"],
     "AllowedMethods": ["PUT"], "AllowedHeaders": ["*"] }]
  ```
- **CloudFront** — a distribution in front of that bucket using Origin Access
  Control, with signed URLs enabled (Trusted Key Groups). Create a key pair,
  then base64-encode the private key for `CLOUDFRONT_PRIVATE_KEY`:
  ```bash
  base64 -i private_key.pem | tr -d '\n'
  ```
- **MediaConvert** — an IAM role with read/write on the bucket, plus your
  region's endpoint URL.

### 5. Run it

```bash
npm run install:all
npm run dev
```

- Site — http://localhost:3000
- Admin — http://localhost:3000/admin
- API — http://localhost:5001

---

## Using the admin

Everything the site owner needs is at `/admin`.

**Pages** — pick a page, then add, reorder, hide or delete sections. Each section
type (hero banner, cards, text, gallery, video, pricing, FAQ…) has its own simple
form. Text edits save when you press **Save changes**; moving, hiding and
deleting save immediately.

Two sections fill themselves in: **Course list** and **Membership plans** show
whatever is currently published, so the homepage stays current on its own.

**Images** — upload once, reuse anywhere. Every image picker in the admin can
choose from this library.

**Site Settings** — logos, site name, the top navigation, the footer, and which
email addresses get admin on sign-up.

**Courses** — create a course, set its price, then attach videos and put them in
order. The tick-boxes at the bottom control which membership plans include it.

**Videos** — upload a file, choose whether it's free, part of a course, or sold
on its own. Uploading is: create → upload to S3 → transcode. The badge flips from
*Processing…* to *Ready to play* on its own; a video can only be published once
it's ready.

**Memberships** — recurring plans, and which courses each one unlocks. Changing a
price creates a new price in Stripe; existing subscribers keep paying what they
signed up for.

**Members** — who has signed up, what they're paying, and a manual override to
grant or revoke course access (useful for refunds and comps).

---

## Project layout

```
client/                         Next.js app
  app/
    (auth)/                     login, register, password reset
    (protected)/                dashboard, billing, watch — login required
    admin/                      admin area — admin role required
    auth/callback/              exchanges emailed auth links for a session
    page.jsx, about/, contact/  CMS-driven public pages
  components/
    blocks/BlockRenderer.jsx    renders CMS sections
    admin/                      page builder, media library, settings editor
  lib/
    blocks.js                   block catalogue — drives builder AND renderer
    supabase/                   browser + server Supabase clients
    api.js                      browser API client (attaches the access token)
    serverApi.js                server-side API fetch helpers

server/src/
  middleware/authenticate.js    verifies Supabase JWTs, loads the profile
  services/access.js            all entitlement logic
  routes/                       the API

supabase/
  migrations/0001_init.sql      schema, functions, RLS, storage bucket
  seed.sql                      starter pages and settings
```

### Adding a new kind of page section

1. Add an entry to `BLOCK_TYPES` in `client/lib/blocks.js` (label, description,
   fields, defaults). This alone gives you the admin form.
2. Add a component and a `RENDERERS` entry in
   `client/components/blocks/BlockRenderer.jsx`.

No API or database change is needed — block content is JSON.

---

## Deploying

**Frontend — AWS Amplify.** Root directory `client/`, build `npm run build`. Add
every variable from `client/.env.local`, with `NEXT_PUBLIC_SITE_URL` set to the
real domain.

**API — Railway.** Root directory `server/`. Add every variable from
`server/.env`, with `CLIENT_URL` set to the deployed frontend origin (comma-
separate if there's more than one).

**Stripe.** Add a webhook endpoint pointing at
`https://your-api-domain/api/v1/webhooks/stripe` and copy its signing secret into
`STRIPE_WEBHOOK_SECRET`. Subscribe it to: `checkout.session.completed`,
`customer.subscription.*`, `invoice.payment_succeeded`, `invoice.payment_failed`.

**Supabase.** Add the production domain to the auth redirect allow-list and to
the S3 bucket's CORS origins.

---

## Notes on a few decisions

- **Express stays in front of Supabase.** Business logic that must not be
  client-editable (Stripe checkout, entitlement grants, signed video URLs) lives
  server-side, and a future mobile app can reuse the same API.
- **RLS is on for every table anyway.** The API uses the service-role key and
  bypasses it, but the policies mean the browser's anon key is safe to expose:
  it can read published content and a user's own rows, nothing more.
- **Entitlements are rows, not array columns.** A purchase is auditable, and
  access checks are indexable joins.
- **Roles are read from `profiles`, not the JWT**, so a demotion takes effect
  within 30 seconds instead of whenever the token expires.
- **The webhook route is mounted before `express.json()`** — Stripe signature
  verification needs the raw body. Don't reorder it in `index.js`.
