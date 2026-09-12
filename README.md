# Pestor's Pointers — course platform

A course-selling website with a built-in admin area, so the site owner can change
the pages, add courses and upload videos without touching code.

- **Frontend** — Next.js 14 (App Router), Tailwind
- **API** — Next.js route handlers under `/api/v1`, talking to Supabase with
  the service-role key
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

- `client/lib/server/services/access.js` — what the API enforces
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
4. In **Authentication → URL Configuration**, set the **Site URL** with *no*
   trailing slash, and add `http://localhost:3000/**` plus your deployed
   origin to the redirect allow-list.
5. In **Authentication → Emails → Templates**, point the **Invite user**
   template at the confirm route, which is what turns the emailed token into a
   session:

   ```html
   <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/set-password">Accept your invite</a>
   ```

   Supabase's stock template uses `{{ .ConfirmationURL }}`, which returns the
   tokens in the URL *fragment* — a server route can never read those, so
   invitees land on the homepage signed out.
6. Grab your keys from **Project Settings → API**.

**Set up SMTP before inviting anyone.** Supabase's built-in mailer is for
testing only: it allows a couple of emails an hour and will only deliver to
addresses belonging to your Supabase organisation. Everything else fails as a
`429` on `POST /auth/v1/invite`, which the dashboard reports as the unhelpful
"Error sending invite email". Add a real provider (Resend, Postmark, SES,
SendGrid) under **Project Settings → Authentication → SMTP Settings**, then
raise the ceiling under **Authentication → Rate Limits**.

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
cp client/.env.example client/.env.local
```

Everything lives in that one file now, because the site and the API are one
app. The variable to be careful with is `SUPABASE_SECRET_KEY` — it bypasses all
security rules. It has no `NEXT_PUBLIC_` prefix, which is what keeps it on the
server; never add one.

(`server/.env` still exists for the one-off AWS scripts in `server/scripts/`.
Nothing serves traffic from there.)

### 3. Stripe

1. Add `STRIPE_SECRET_KEY` to `client/.env.local`.
2. Forward webhooks while developing, and copy the signing secret it prints into
   `STRIPE_WEBHOOK_SECRET`:
   ```bash
   stripe listen --forward-to localhost:3000/api/v1/webhooks/stripe
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
- API — http://localhost:3000/api/v1 (same server; `/api/v1/health` answers)

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

For bulk imports the admin UI is the wrong tool — use
[`server/scripts/import-videos.js`](server/scripts/import-videos.js), which takes
a list of videos and, one at a time, creates the row, streams the file down,
multipart-uploads it to `uploads/raw/<id>/original.mp4`, verifies the size and
deletes the local copy before moving on. Never more than one file on disk. It
skips anything already in the bucket, so re-running after an interruption is
cheap and safe.

```bash
cd server
node scripts/import-videos.js --from ../tools/kajabi-export/export/videos/index.json --dry-run
node scripts/import-videos.js --from … --course get-unstuck --transcode --publish
```

If some files were already moved into the bucket by hand under different names,
add `--adopt`. It indexes the bucket, matches each source against it by name and
**server-side copies** the winners into place — no download, no egress. Matching
treats numbering as a hard constraint, so `Lesson 3` will never be adopted for
`Lesson 4`; near-ties are reported for you to resolve rather than guessed at.
Always run it with `--dry-run` first and read the match table.

[`scripts/inspect-s3.js`](server/scripts/inspect-s3.js) reports what is already
in the bucket and how it lines up with the `videos` table.

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

    serverApi.js                calls the API from server components
    server/                     the API itself
      app.js                    route table — what is mounted where
      router.js                 the small Express-compatible router
      middleware/authenticate.js  verifies Supabase JWTs, loads the profile
      services/access.js        all entitlement logic
      routes/                   the API's routes
  app/api/v1/[...path]/         the one handler every API request enters

server/scripts/                 one-off AWS setup and video-import tools

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

**Everything — AWS Amplify.** One app, one deploy. Root directory `client/`,
build `npm run build`. Add every variable from `client/.env.local`, with
`NEXT_PUBLIC_SITE_URL` set to the real domain. The API is served by the same
app at `/api/v1`, so there is no second service and no API host to configure.

The AWS credentials are named `APP_AWS_REGION`, `APP_AWS_ACCESS_KEY_ID` and
`APP_AWS_SECRET_ACCESS_KEY` for two reasons: Amplify refuses to create any
variable beginning with `AWS`, and the Lambda runtime behind Amplify's compute
already sets `AWS_REGION` to its own region. Reading that would have sent every
S3 call to the wrong region. If you would rather not put long-lived keys in the
console at all, grant the Amplify compute role S3 and MediaConvert access and
leave both key variables unset — the SDK will use the role. `APP_AWS_REGION` is
required either way, and the app fails loudly if it is missing.

`/api/v1/health` returns `{"status":"ok"}` on a healthy deploy, and is the
quickest way to tell a broken build from a broken environment variable.

**Stripe.** Add a webhook endpoint pointing at
`https://yourdomain.com/api/v1/webhooks/stripe` and copy its signing secret into
`STRIPE_WEBHOOK_SECRET`. Subscribe it to: `checkout.session.completed`,
`customer.subscription.*`, `invoice.payment_succeeded`, `invoice.payment_failed`.

**Supabase.** Add the production domain to the auth redirect allow-list and to
the S3 bucket's CORS origins.

---

## Notes on a few decisions

- **An API stays in front of Supabase.** Business logic that must not be
  client-editable (Stripe checkout, entitlement grants, signed video URLs) lives
  server-side, and a future mobile app can reuse the same routes.
- **It runs inside Next, not as its own service.** It was a standalone Express
  app, which meant the admin panel went dark on Amplify because only `client/`
  was ever deployed. The routes now run as Next route handlers on the same
  origin, so there is nothing to deploy separately and nothing to point at.
  `client/lib/server/router.js` is a small stand-in for `express.Router`, which
  is why the route files still read like Express.
- **RLS is on for every table anyway.** The API uses the service-role key and
  bypasses it, but the policies mean the browser's anon key is safe to expose:
  it can read published content and a user's own rows, nothing more.
- **Entitlements are rows, not array columns.** A purchase is auditable, and
  access checks are indexable joins.
- **Roles are read from `profiles`, not the JWT**, so a demotion takes effect
  within 30 seconds instead of whenever the token expires.
- **The Stripe webhook body is never parsed** — signature verification needs
  the exact bytes. `app/api/v1/[...path]/route.js` checks for the webhook path
  before touching the body. Don't reorder that.
- **Nothing rate-limits the API in the app.** The Express version counted
  requests in one process's memory, which means nothing on Amplify's compute.
  Put a rate limit in CloudFront or WAF if you want one.
