# Life Coach Platform — Full Build Plan

## Current Status

**ALL PHASES COMPLETE — Platform is feature-complete and ready for deployment.**

| Phase | Description | Status |
|---|---|---|
| Phase 1 | Foundation (Next.js + Express + Auth + MongoDB) | ✅ Complete |
| Phase 2 | Subscriptions & Payments (Stripe) | ✅ Complete |
| Phase 3 | Video Pipeline (S3 + CloudFront + MediaConvert) | ✅ Complete |
| Phase 4 | Courses (CRUD + purchase flow) | ✅ Complete |
| Phase 5 | Blog (MDX editor + rendering) | ✅ Complete |
| Phase 6 | Public Site (homepage + SEO + nav) | ✅ Complete |

---

## Project Overview

A full-stack MERN platform for a life coach to sell:
- Subscription tiers (recurring, unlocks specific courses)
- Individual video purchases (one-time)
- Course bundles (one-time)

Also includes a blog, public marketing pages, and a fully-featured admin panel.

---

## Tech Stack (Final — Do Not Change)

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Next.js 14 (App Router) | Replaces CRA — needed for SEO/SSR |
| Backend API | Express.js + Node.js | Separate from Next.js, hosts all business logic |
| Database | MongoDB Atlas (Mongoose) | |
| Auth | NextAuth.js (web) + JWT shared with Express | Mobile-compatible |
| Payments | Stripe | Subscriptions + one-time purchases, greenfield account |
| Public videos | YouTube embeds (recommended) | Testimonials/trailers — saves S3 cost |
| Protected video storage | AWS S3 (private bucket) | Never expose directly |
| Protected video delivery | AWS CloudFront + signed URLs | OAC, time-limited URLs |
| Video transcoding | AWS MediaConvert | Upload → HLS (adaptive bitrate) |
| Video player | Video.js + HLS.js plugin | Supports HLS streams |
| Blog editor | Monaco Editor (MDX) | Admin writes raw MDX |
| Blog rendering | next-mdx-remote + Shiki | Server-side MDX with syntax highlighting |
| Frontend hosting | AWS Amplify | Do NOT use Vercel (user rejected — cost) |
| Backend hosting | Railway | Simple Node.js hosting |
| Email | Resend | Transactional emails, free tier 3k/month |

---

## Repository Structure

```
/Users/ppadmin/JD/website/         ← monorepo root
├── client/                         ← Next.js 14 app
│   ├── app/
│   │   ├── (auth)/                 ← login, register (no nav)
│   │   ├── (protected)/            ← dashboard, billing, video player
│   │   ├── admin/                  ← admin panel (role=admin only)
│   │   ├── api/auth/[...nextauth]/ ← NextAuth handler
│   │   ├── blog/                   ← public blog pages
│   │   ├── courses/                ← public course catalog
│   │   └── page.tsx                ← homepage
│   ├── components/
│   ├── lib/
│   │   ├── auth.ts                 ← NextAuth config
│   │   └── api.ts                  ← axios instance
│   ├── middleware.ts                ← route protection
│   └── types/next-auth.d.ts
│
├── server/                         ← Express API
│   └── src/
│       ├── config/db.ts
│       ├── middleware/
│       │   ├── authenticate.ts     ← JWT verification
│       │   └── requireAdmin.ts     ← role guard
│       ├── models/                 ← all Mongoose models
│       ├── routes/                 ← all API routes
│       └── services/
│           └── stripe.ts           ← Stripe singleton
│
└── PLAN.md                         ← this file
```

---

## Environment Variables

### `server/.env`
```
PORT=5001
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/lifecoach
JWT_SECRET=<random 32+ chars>
CLIENT_URL=http://localhost:3000
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
S3_BUCKET_NAME=lifecoach-videos
CLOUDFRONT_DOMAIN=https://xxxx.cloudfront.net
CLOUDFRONT_KEY_PAIR_ID=...
CLOUDFRONT_PRIVATE_KEY=<RSA private key for signed URLs, base64 encoded>
MEDIACONVERT_ENDPOINT=https://xxxx.mediaconvert.us-east-1.amazonaws.com
MEDIACONVERT_ROLE_ARN=arn:aws:iam::...
```

### `client/.env.local`
```
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<random 32+ chars, different from JWT_SECRET>
API_URL=http://localhost:5001
NEXT_PUBLIC_API_URL=http://localhost:5001
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

---

## Business Model & Access Control

### User Roles
- `user` — default, can browse + purchase
- `admin` — full access to admin panel, hidden from all public routes

### Subscription Tiers
- Stored in `subscriptionTiers` MongoDB collection (NOT hardcoded)
- Admin can create/edit/delete tiers via admin portal
- Each tier has `unlockedCourseIds: [ObjectId]` — admin assigns which courses a tier unlocks
- 2 tiers at launch, but the system supports any number
- Each tier syncs to a Stripe Product with monthly + optional annual Price

### Video Access Types (3 types — `accessType` field on Video model)
| Type | Who can watch |
|---|---|
| `public` | Anyone, no login needed. Use YouTube embeds for these. |
| `course` | Active subscriber whose tier includes this video's courseId, OR user who purchased the course bundle |
| `purchase` | Only users who individually purchased this video. Even subscribers must purchase separately. |

### Access Control Logic
```
canUserWatchVideo(user, video):
  if video.accessType === 'public'    → ALLOW

  if video.accessType === 'purchase'
    → ALLOW if video._id in user.purchasedVideoIds, else DENY

  if video.accessType === 'course'
    → ALLOW if user.purchasedCourseIds includes video.courseId
    → ALLOW if user.subscription.status === 'active'
         AND tier.unlockedCourseIds includes video.courseId
    → DENY otherwise
```

---

## Database Schemas

### `users`
```
email: String (unique, lowercase)
passwordHash: String
role: 'user' | 'admin'
stripeCustomerId: String
subscription: {
  status: 'active' | 'past_due' | 'canceled' | 'none'
  tierId: ObjectId → SubscriptionTier
  stripeSubscriptionId: String
  currentPeriodEnd: Date
}
purchasedVideoIds: [ObjectId → Video]
purchasedCourseIds: [ObjectId → Course]
timestamps: true
```

### `subscriptionTiers`
```
name: String
description: String
stripeProductId: String
stripePriceIds: { monthly: String, annual: String }
unlockedCourseIds: [ObjectId → Course]
isActive: Boolean (default true)
displayOrder: Number (default 0)
timestamps: true
```
Admin assigns courses to tiers. Deactivating archives the Stripe product.

### `courses`
```
slug: String (unique)
title: String
description: String
thumbnailUrl: String
videoIds: [ObjectId → Video]
price: Number (for one-time bundle purchase)
stripeProductId: String
isPublished: Boolean (default false)
timestamps: true
```
When admin creates a course, a Stripe Product is auto-created. When course is added to a subscription tier, update `tier.unlockedCourseIds`.

### `videos`
```
title: String
description: String
s3Key: String (e.g. "videos/hls/abc123/index.m3u8")
cloudFrontUrl: String (base URL — signed URLs generated per-request)
duration: Number (seconds)
thumbnailUrl: String
accessType: 'public' | 'course' | 'purchase'
courseId: ObjectId → Course (for course videos)
price: Number (for purchase videos)
stripeProductId: String (for purchase videos)
isPublished: Boolean (default false)
timestamps: true
```

### `blogPosts`
```
slug: String (unique)
title: String
mdxContent: String (raw MDX)
excerpt: String
author: String
tags: [String]
coverImageUrl: String
isPublished: Boolean (default false)
publishedAt: Date
timestamps: true
```

### `purchases`
```
userId: ObjectId → User
type: 'subscription' | 'video' | 'course'
itemId: ObjectId (video or course)
stripePaymentIntentId: String
stripeSubscriptionId: String
amount: Number (in cents)
timestamps: true
```

---

## API Routes

### Auth — `/api/v1/auth`
```
POST /register         → create account, returns JWT
POST /login            → verify credentials, returns JWT
GET  /me               → get current user (auth required)
```

### Admin Users — `/api/v1/admin` (auth + admin required)
```
GET    /users          → list all users
PATCH  /users/:id/role → update user role
```

### Subscription Tiers — `/api/v1/admin/subscription-tiers` (auth + admin required)
```
GET    /               → list all tiers (including inactive)
POST   /               → create tier + sync to Stripe
PATCH  /:id            → update tier + sync to Stripe
DELETE /:id            → soft delete (deactivate on Stripe)
```

### Payments — `/api/v1/payments`
```
GET  /tiers                      → PUBLIC: list active tiers
POST /create-checkout-session    → create Stripe Checkout (subscription)
POST /create-portal-session      → create Stripe Customer Portal session
GET  /subscription               → get current user's subscription status
```

### Webhooks — `/api/v1/webhooks` (raw body — must be before express.json)
```
POST /stripe  → handles:
  checkout.session.completed         → grant subscription access
  customer.subscription.created      → sync tier + status
  customer.subscription.updated      → sync tier + status + period end
  customer.subscription.deleted      → revoke, clear tier
  invoice.payment_failed             → set past_due
  invoice.payment_succeeded          → set active
  checkout.session.completed (mode=payment) → grant video/course access [Phase 3/4]
```

### Videos — `/api/v1/videos` [Phase 3]
```
GET    /                    → PUBLIC: list published public videos
GET    /:id/stream          → PROTECTED: return signed CloudFront URL (checks access)
POST   /upload-url          → ADMIN: get S3 presigned PUT URL for upload
POST   /                    → ADMIN: create video metadata after upload
PATCH  /:id                 → ADMIN: update video
DELETE /:id                 → ADMIN: delete video + S3 object
```

### Courses — `/api/v1/courses` [Phase 4]
```
GET    /                    → PUBLIC: list published courses
GET    /:slug               → PUBLIC: course detail
POST   /                    → ADMIN: create course + Stripe Product
PATCH  /:id                 → ADMIN: update course
DELETE /:id                 → ADMIN: delete course
POST   /:id/videos          → ADMIN: add/reorder videos in course
POST   /:id/checkout        → PROTECTED: create one-time purchase Checkout Session
```

### Blog — `/api/v1/blog` [Phase 5]
```
GET    /                    → PUBLIC: list published posts
GET    /:slug               → PUBLIC: get post by slug
POST   /                    → ADMIN: create post
PATCH  /:id                 → ADMIN: update post
DELETE /:id                 → ADMIN: delete post
```

---

## Build Phases

### ✅ Phase 1 — Foundation (COMPLETE — session 1)
- Next.js 14 + Express scaffolding
- MongoDB Atlas connection + all 6 Mongoose models
- NextAuth.js login/register with JWT
- JWT passed to Express for API auth
- Admin role middleware
- Admin panel shell with sidebar nav
- Protected routes via Next.js middleware
- `/dashboard`, `/login`, `/register`, `/admin`

### ✅ Phase 2 — Subscriptions & Payments (COMPLETE — session 1)
- `subscriptionTiers` CRUD in admin with Stripe Product/Price sync
- Stripe Checkout sessions (subscription mode)
- Stripe Customer Portal
- Webhook handler (5 event types)
- `/admin/subscriptions` — create/activate/deactivate tiers
- `/billing` — user-facing subscribe page with monthly/annual toggle
- Dashboard shows live subscription status

### ✅ Phase 3 — Video Pipeline (COMPLETE — session 2)
**Server:**
- `GET /api/v1/videos` — public video listing
- `GET /api/v1/videos/:id/stream` — access-checked, returns signed CloudFront URL
- `POST /api/v1/videos/upload-url` — admin gets S3 presigned PUT URL
- `POST /api/v1/videos` — create video record after upload completes
- `PATCH /api/v1/videos/:id` — update metadata
- `DELETE /api/v1/videos/:id` — remove from DB + S3
- AWS MediaConvert service: trigger transcoding job on upload completion
- CloudFront signed URL service: generate time-limited signed URLs

**Client:**
- `/admin/videos` — list, upload, edit, publish videos
  - Upload flow: get presigned URL → browser PUTs to S3 → poll for MediaConvert completion → save metadata
  - Fields: title, description, accessType, courseId (optional), price (if purchase type), thumbnail
- `components/VideoPlayer.tsx` — Video.js + HLS.js, fetches signed URL on mount
- `/watch/[id]` — protected video player page (checks access before rendering player)

**AWS Setup for Phase 3:**
1. Create private S3 bucket (`lifecoach-videos`)
2. Create CloudFront distribution with OAC pointing to S3
3. Enable CloudFront key pair for signed URLs (in CloudFront → Key management)
4. Set up MediaConvert: create IAM role with S3 read/write + MediaConvert permissions
5. Get MediaConvert endpoint for your AWS region
6. S3 folder structure:
   - `uploads/raw/{videoId}/original.mp4` — raw upload
   - `videos/hls/{videoId}/` — MediaConvert HLS output
   - `thumbnails/{videoId}.jpg` — thumbnail

**MediaConvert Job Template:**
- Input: `s3://bucket/uploads/raw/{videoId}/original.mp4`
- Output: HLS adaptive bitrate, multiple renditions (360p, 720p, 1080p)
- Output path: `s3://bucket/videos/hls/{videoId}/`
- Thumbnail: extract frame at 5s, save as JPG

**CloudFront Signed URL Generation (server-side):**
```typescript
import { getSignedUrl } from '@aws-sdk/cloudfront-signer';

const signedUrl = getSignedUrl({
  url: `${process.env.CLOUDFRONT_DOMAIN}/${video.s3Key}`,
  keyPairId: process.env.CLOUDFRONT_KEY_PAIR_ID,
  privateKey: Buffer.from(process.env.CLOUDFRONT_PRIVATE_KEY, 'base64').toString(),
  dateLessThan: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours
});
```

### ✅ Phase 4 — Courses (COMPLETE — session 2)
**Server:**
- `GET /api/v1/courses` — public list of published courses
- `GET /api/v1/courses/:slug` — course detail with video list (no stream URLs)
- `POST /api/v1/courses` — admin create + auto-create Stripe Product
- `PATCH /api/v1/courses/:id` — update metadata, reorder videos
- `DELETE /api/v1/courses/:id` — remove course
- `POST /api/v1/courses/:id/checkout` — one-time purchase Checkout Session
- Webhook update: handle `checkout.session.completed` with `type=course` to add to `user.purchasedCourseIds`
- Admin endpoint: `PATCH /api/v1/admin/subscription-tiers/:id` already accepts `unlockedCourseIds` — use this to assign courses to tiers

**Client:**
- `/admin/courses` — list courses, create/edit
  - Create course: title, slug (auto-generated), description, thumbnail, price
  - Assign videos (multi-select from existing video library)
  - Assign to subscription tier (multi-select)
- `/admin/courses/[id]` — edit course, reorder videos via drag-and-drop
- `/courses` — public course catalog (SSG, revalidate every hour)
- `/courses/[slug]` — course detail page: description, video list (locked/unlocked indicators), purchase button

### ✅ Phase 5 — Blog (COMPLETE — session 2)
**Server:**
- `GET /api/v1/blog` — public published posts (paginated)
- `GET /api/v1/blog/:slug` — single post
- `POST /api/v1/blog` — admin create
- `PATCH /api/v1/blog/:id` — admin update
- `DELETE /api/v1/blog/:id` — admin delete

**Client:**
- `/admin/blog` — list posts with publish/unpublish toggle
- `/admin/blog/new` — Monaco MDX editor with live preview panel side-by-side
- `/admin/blog/[id]/edit` — same editor, pre-populated
- `/blog` — public blog listing (SSG + ISR, revalidate: 3600)
- `/blog/[slug]` — rendered MDX post (SSG + ISR)

**MDX Setup:**
- Package: `next-mdx-remote`
- Syntax highlighting: `shiki`
- Custom MDX components to register in `mdx-components.tsx`:
  ```tsx
  YouTube: ({ id }) => <iframe src={`https://youtube.com/embed/${id}`} ... />
  CalloutBox: ({ type, children }) => <div className={`callout callout-${type}`}>...</div>
  VideoEmbed: ({ videoId }) => <VideoPlayer videoId={videoId} />  // platform video
  ```

### ✅ Phase 6 — Public Site (COMPLETE — session 3)
**Built:**
- `components/PublicNav.tsx` — sticky nav with real logo image, auth-aware (Login/Sign Up vs Dashboard), mobile hamburger
- `components/PublicFooter.tsx` — dark navy footer with real footer logo, all social links (FB/IG/YT/TikTok), Become an Affiliate, Terms & Conditions
- `/` — Full homepage matching pestorspointers.com:
  - Hero with real background image + exact copy ("GET UNSTUCK IN LIFE!")
  - 60-day program cards with real card images and exact copy
  - "Feel Like Something Is Missing" section with mountain background
  - "Big Bro" section with beach background
  - Wistia video embed (ID: 2am1ihye3z)
  - Featured courses (from DB)
  - Subscription tier pricing cards (from DB)
  - Featured blog posts (from DB)
- `/about` — exact Jeremy Pestor bio copy, photo placeholder, S.i.T.i.N.G. Outreach content
- `/contact` — exact copy ("LET'S CONNECT"), real contact hero image, email, social cards
- `app/blog/layout.tsx` — wraps all blog pages with nav + footer
- `app/courses/layout.tsx` — wraps all courses pages with nav + footer
- `app/(protected)/layout.tsx` — dashboard/billing/watch now include nav + footer
- `app/layout.tsx` — updated metadata with brand title template and `metadataBase`
- `app/sitemap.ts` — dynamic sitemap fetching course + post slugs from API
- `public/robots.txt` — blocks /admin, /dashboard, /billing, /watch

**Design source:** Replicated from https://www.pestorspointers.com (owned by user)
- Colors: `#f53100` (accent), `#100566` (navy), `#161E2A` (dark footer)
- Logo and all images pulled from Kajabi CDN URLs
- Exact marketing copy used verbatim

---

## AWS Setup Checklist (Phase 3)

### S3
- [ ] Create bucket: `lifecoach-videos` (or similar)
- [ ] Block ALL public access
- [ ] Enable versioning (optional)
- [ ] CORS config for browser direct upload:
  ```json
  [{ "AllowedOrigins": ["http://localhost:3000", "https://yourdomain.com"],
     "AllowedMethods": ["PUT"], "AllowedHeaders": ["*"] }]
  ```

### CloudFront
- [ ] Create distribution → origin = S3 bucket
- [ ] Create Origin Access Control (OAC) — attach to distribution
- [ ] Update S3 bucket policy to allow CloudFront OAC only
- [ ] Enable signed URLs/cookies: set Trusted Key Groups
- [ ] Create CloudFront key pair → download private key → base64 encode for env var

### IAM
- [ ] Create IAM user for server: permissions for S3 + CloudFront + MediaConvert
- [ ] Create IAM role for MediaConvert: S3 read/write permissions

### MediaConvert
- [ ] Get endpoint URL from AWS console (region-specific)
- [ ] Create job template or use inline job spec in code

---

## Stripe Setup Checklist

- [ ] Add `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` from test dashboard
- [ ] Run `stripe listen --forward-to localhost:5001/api/v1/webhooks/stripe` for local dev
- [ ] Copy `STRIPE_WEBHOOK_SECRET` from Stripe CLI output
- [ ] Activate Customer Portal: Stripe Dashboard → Settings → Billing → Customer Portal
- [ ] Subscription tier Products/Prices are auto-created by the admin portal (no manual Stripe setup needed for tiers)
- [ ] Individual video/course Products/Prices auto-created when admin creates content (Phase 3/4)

---

## Deployment (Production)

### Frontend — AWS Amplify
1. Connect GitHub repo to Amplify
2. Set build settings: root = `client/`, build command = `npm run build`, output = `.next`
3. Add all `client/.env.local` vars as Amplify environment variables
4. Update `NEXTAUTH_URL` to production domain

### Backend — Railway
1. Create new Railway project → connect GitHub
2. Set root directory to `server/`
3. Add all `server/.env` vars as Railway environment variables
4. Update `CLIENT_URL` to production Amplify domain

### MongoDB
- Upgrade Atlas cluster from M0 (free) to M10 ($57/month) for production
- Whitelist Railway's static IP or use `0.0.0.0/0` with strong credentials

---

## Key Decisions & Constraints

1. **No Vercel** — user rejected due to cost. Use AWS Amplify for Next.js hosting.
2. **No CRA** — replaced with Next.js 14 for SSR/SEO.
3. **Port 5001** for Express server (macOS AirPlay uses 5000).
4. **Separate Express backend** — Next.js API routes are only used for NextAuth. All business logic is in Express so a future React Native mobile app can use the same API.
5. **API versioned at `/api/v1/`** — future-proofing for mobile.
6. **Auth flow**: NextAuth CredentialsProvider calls Express `/login` → Express returns JWT → NextAuth stores JWT in session → client passes JWT as `Authorization: Bearer` header to Express.
7. **Webhook raw body**: The `/api/v1/webhooks` route is mounted BEFORE `express.json()` in `index.ts` to preserve raw body for Stripe signature verification. Do not change this order.
8. **Admin first user**: Register normally, then manually set `role: "admin"` in MongoDB Atlas. After that, use `/admin/users` to promote others.
9. **Public videos** use YouTube embeds (not S3) to save bandwidth costs.
10. **Subscription tiers are dynamic** — stored in DB, not hardcoded. Admin manages them entirely through the UI.
11. **MDX blog** uses Monaco Editor in admin (same editor as VS Code) for raw MDX input.
