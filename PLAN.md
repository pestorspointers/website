# Build status

Setup instructions and architecture notes live in [README.md](README.md). This
file tracks what's built and what's left.

## Done

| Area | State |
|---|---|
| Supabase Postgres schema, RLS, triggers, seed | ✅ |
| Supabase Auth: sign-up, sign-in, password reset, email confirmation | ✅ |
| Role-based authorisation (`user` / `admin`) | ✅ |
| Stripe memberships + one-off course purchases | ✅ |
| Entitlements + paywall on every gated video | ✅ |
| Admin page builder (add / reorder / hide / delete sections) | ✅ |
| Image library on Supabase Storage | ✅ |
| Site settings: branding, navigation, footer | ✅ |
| Course admin: create, price, attach + order videos, assign to plans | ✅ |
| Video admin: upload → transcode → publish, with status polling | ✅ |
| Membership admin: plans, pricing, included courses | ✅ |
| Member admin: roles, manual course grants and revokes | ✅ |
| Blog (MDX editor + public rendering) | ✅ |
| Member dashboard, billing, gated watch page | ✅ |

### Migrated away from

The platform previously ran on MongoDB + Mongoose with NextAuth credentials auth.
Both are gone: `server/src/models/` and `client/lib/auth.js` were deleted, and
`next-auth`, `mongoose`, `bcryptjs` and `jsonwebtoken` were removed from
`package.json`. There is no migration script — the rebuild was done on an empty
database by agreement.

## Verified

- The migration and seed apply cleanly to a fresh Postgres 16 database.
- Access rules were tested directly against the database: a member who bought
  Course A can watch Course A's videos and **not** Course B's; a subscriber whose
  plan includes only Course B gets the mirror image; public clips play for
  everyone.
- The sign-up trigger creates a profile and promotes emails listed in the
  `admin_emails` setting.
- Deleting a course releases its videos back to the library as drafts, and
  cascades away its entitlements.
- `next build` compiles all 31 routes with no errors.

## Not done yet

These need real credentials and can't be exercised locally:

- **End-to-end Stripe run** — checkout → webhook → entitlement granted. Use
  `stripe listen` and a test card once keys are in place.
- **The AWS video path** — S3 upload, MediaConvert transcode, CloudFront signed
  playback. The code is written; the console setup in README step 4 is not.
- **Email deliverability** — Supabase's built-in mailer is rate-limited and fine
  for testing. Configure a real SMTP provider before launch or confirmation
  emails will silently stall.

## Worth doing next

- **Terms page.** The footer links to `/terms` and that route doesn't exist yet.
  Either build it or drop the link in Admin → Site Settings.
- **Order confirmation emails.** Nothing is sent after a purchase right now;
  Stripe's own receipts are the only confirmation.
- **Watch progress.** The dashboard lists videos but doesn't track what's been
  watched — a `video_progress` table would enable "continue where you left off".
- **Per-video purchases.** The database and access rules support `purchase`
  videos, but there's no public page to buy one — only courses have a checkout
  button.
