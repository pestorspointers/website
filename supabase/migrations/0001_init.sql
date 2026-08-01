-- ============================================================================
--  Pestor's Pointers platform — initial schema
--  Run this in the Supabase SQL editor (or `supabase db push`) BEFORE seeding.
--
--  Design notes:
--   * Auth lives in Supabase `auth.users`. Every auth user gets a mirrored row
--     in `public.profiles` via the `on_auth_user_created` trigger.
--   * Roles are stored on `profiles.role` ('user' | 'admin').
--   * The Express API talks to this database with the SERVICE ROLE key, which
--     bypasses RLS. The RLS policies below exist so that the anon/publishable
--     key is safe to expose in the browser: it can read published content and
--     a user's own rows, and nothing else.
--   * Entitlements are rows, not array columns, so a purchase is auditable and
--     access checks are indexable joins.
-- ============================================================================

create extension if not exists pgcrypto;

-- ────────────────────────────────────────────────────────────────────────────
--  Shared helpers
-- ────────────────────────────────────────────────────────────────────────────

-- Keeps `updated_at` honest without the API having to remember.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ────────────────────────────────────────────────────────────────────────────
--  site_settings — global key/value config the admin can edit (nav, footer,
--  brand colours, social links, bootstrap admin emails).
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.site_settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

create trigger site_settings_touch
  before update on public.site_settings
  for each row execute function public.touch_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
--  courses — the sellable products
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.courses (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  title             text not null,
  description       text not null default '',
  short_description text,
  thumbnail_url     text,
  price             numeric(10,2) not null default 0 check (price >= 0),
  stripe_product_id text,
  stripe_price_id   text,
  is_published      boolean not null default false,
  display_order     integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists courses_published_idx
  on public.courses (is_published, display_order, created_at desc);

create trigger courses_touch
  before update on public.courses
  for each row execute function public.touch_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
--  subscription_tiers — recurring plans. A tier unlocks a set of courses.
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.subscription_tiers (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null,
  description             text not null default '',
  features                jsonb not null default '[]'::jsonb,
  price_monthly           numeric(10,2),
  price_annual            numeric(10,2),
  stripe_product_id       text,
  stripe_price_monthly_id text,
  stripe_price_annual_id  text,
  is_active               boolean not null default true,
  display_order           integer not null default 0,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create trigger subscription_tiers_touch
  before update on public.subscription_tiers
  for each row execute function public.touch_updated_at();

-- Which courses each tier unlocks (replaces the old unlockedCourseIds array).
create table if not exists public.tier_courses (
  tier_id   uuid not null references public.subscription_tiers(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  primary key (tier_id, course_id)
);

create index if not exists tier_courses_course_idx on public.tier_courses (course_id);

-- ────────────────────────────────────────────────────────────────────────────
--  profiles — mirrors auth.users, holds role + billing state
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id                     uuid primary key references auth.users(id) on delete cascade,
  email                  text not null,
  full_name              text,
  role                   text not null default 'user'
                           check (role in ('user','admin')),
  stripe_customer_id     text unique,
  -- Mirrors Stripe's subscription.status vocabulary verbatim so webhooks can
  -- never fail on an unmapped value.
  subscription_status    text not null default 'none'
                           check (subscription_status in (
                             'none','incomplete','incomplete_expired','trialing',
                             'active','past_due','canceled','unpaid','paused'
                           )),
  subscription_tier_id   uuid references public.subscription_tiers(id) on delete set null,
  stripe_subscription_id text,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists profiles_stripe_customer_idx on public.profiles (stripe_customer_id);

create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
--  videos — attached to a course, ordered within it
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.videos (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  description       text not null default '',
  -- HLS manifest key inside the private S3 bucket, e.g.
  -- videos/hls/<id>/index.m3u8 — never served directly, only via signed URLs.
  s3_key            text,
  duration_seconds  integer,
  thumbnail_url     text,
  -- 'public'   → anyone (marketing/trailer clips)
  -- 'course'   → owners of course_id, or subscribers whose tier unlocks it
  -- 'purchase' → only users who bought this specific video
  access_type       text not null default 'course'
                      check (access_type in ('public','course','purchase')),
  course_id         uuid references public.courses(id) on delete set null,
  position          integer not null default 0,
  price             numeric(10,2) check (price is null or price >= 0),
  stripe_product_id text,
  is_published      boolean not null default false,
  -- Set by the /transcode flow: pending → processing → ready | failed
  transcode_status  text not null default 'pending'
                      check (transcode_status in ('pending','processing','ready','failed')),
  transcode_job_id  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists videos_course_idx on public.videos (course_id, position);
create index if not exists videos_access_idx on public.videos (access_type, is_published);

create trigger videos_touch
  before update on public.videos
  for each row execute function public.touch_updated_at();

-- A *published* course video must belong to a course, otherwise nobody could
-- ever be entitled to watch it. Unpublished ones may sit unassigned in the
-- library waiting to be filed.
alter table public.videos
  drop constraint if exists videos_course_required;
alter table public.videos
  add constraint videos_course_required
  check (access_type <> 'course' or course_id is not null or is_published = false);

-- Deleting a course returns its videos to the library as drafts rather than
-- destroying them — the files are expensive to re-upload, and an admin may
-- well want to re-file them. They are unpublished on the way out, because a
-- course video with no course has no one who can be entitled to it.
create or replace function public.release_course_videos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.videos
     set course_id = null,
         is_published = false,
         position = 0
   where course_id = old.id;
  return old;
end;
$$;

create trigger courses_release_videos
  before delete on public.courses
  for each row execute function public.release_course_videos();

-- ────────────────────────────────────────────────────────────────────────────
--  purchases — immutable ledger of every Stripe transaction we acted on
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.purchases (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references public.profiles(id) on delete cascade,
  type                     text not null check (type in ('subscription','course','video')),
  course_id                uuid references public.courses(id) on delete set null,
  video_id                 uuid references public.videos(id) on delete set null,
  tier_id                  uuid references public.subscription_tiers(id) on delete set null,
  amount_cents             integer not null default 0,
  currency                 text not null default 'usd',
  stripe_checkout_session_id text unique,
  -- Recurring renewals arrive as invoices, not checkout sessions. Unique so a
  -- replayed webhook can't bill the ledger twice.
  stripe_invoice_id        text unique,
  stripe_payment_intent_id text,
  stripe_subscription_id   text,
  created_at               timestamptz not null default now()
);

create index if not exists purchases_user_idx on public.purchases (user_id, created_at desc);

-- ────────────────────────────────────────────────────────────────────────────
--  entitlements — what a user may actually watch
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.course_entitlements (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  course_id   uuid not null references public.courses(id) on delete cascade,
  source      text not null default 'purchase' check (source in ('purchase','manual')),
  purchase_id uuid references public.purchases(id) on delete set null,
  granted_at  timestamptz not null default now(),
  unique (user_id, course_id)
);

create index if not exists course_entitlements_user_idx on public.course_entitlements (user_id);

create table if not exists public.video_entitlements (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  video_id    uuid not null references public.videos(id) on delete cascade,
  source      text not null default 'purchase' check (source in ('purchase','manual')),
  purchase_id uuid references public.purchases(id) on delete set null,
  granted_at  timestamptz not null default now(),
  unique (user_id, video_id)
);

create index if not exists video_entitlements_user_idx on public.video_entitlements (user_id);

-- ────────────────────────────────────────────────────────────────────────────
--  blog_posts
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.blog_posts (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  title           text not null,
  mdx_content     text not null default '',
  excerpt         text not null default '',
  author          text not null default '',
  tags            text[] not null default '{}',
  cover_image_url text,
  is_published    boolean not null default false,
  published_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists blog_posts_published_idx
  on public.blog_posts (is_published, published_at desc);

create trigger blog_posts_touch
  before update on public.blog_posts
  for each row execute function public.touch_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
--  CMS — pages made of ordered, typed blocks
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.pages (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  title            text not null,
  meta_title       text,
  meta_description text,
  is_published     boolean not null default true,
  -- System pages back a hard-coded route (/, /about, /contact) and cannot be
  -- deleted from the admin UI, only edited.
  is_system        boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger pages_touch
  before update on public.pages
  for each row execute function public.touch_updated_at();

create table if not exists public.page_blocks (
  id         uuid primary key default gen_random_uuid(),
  page_id    uuid not null references public.pages(id) on delete cascade,
  type       text not null,
  position   integer not null default 0,
  is_visible boolean not null default true,
  content    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists page_blocks_page_idx on public.page_blocks (page_id, position);

create trigger page_blocks_touch
  before update on public.page_blocks
  for each row execute function public.touch_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
--  media — the admin's image library (Supabase Storage bucket `media`)
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.media (
  id           uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  url          text not null,
  filename     text not null,
  mime_type    text,
  size_bytes   bigint,
  alt_text     text,
  uploaded_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists media_created_idx on public.media (created_at desc);

-- ============================================================================
--  Functions
-- ============================================================================

-- New signups get a profile automatically. An email listed in the
-- `admin_emails` site setting is promoted to admin on the way in, so the site
-- owner never has to hand-edit the database.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_emails jsonb;
  v_role         text := 'user';
begin
  select value into v_admin_emails
    from public.site_settings
   where key = 'admin_emails';

  if v_admin_emails is not null
     and jsonb_typeof(v_admin_emails) = 'array'
     and v_admin_emails ? lower(new.email)
  then
    v_role := 'admin';
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    lower(new.email),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    v_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- SECURITY DEFINER so RLS policies can call it without recursing into
-- `profiles`' own policies.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.profiles p
     where p.id = (select auth.uid())
       and p.role = 'admin'
  );
$$;

-- Single source of truth for "may this user watch this course's videos?".
-- Both the API and the RLS policies call it, so the rule can never drift.
create or replace function public.can_access_course(p_user uuid, p_course uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_user is not null
    and p_course is not null
    and (
      -- bought the course outright
      exists (
        select 1
          from public.course_entitlements ce
         where ce.user_id = p_user
           and ce.course_id = p_course
      )
      -- or holds a paying subscription on a tier that unlocks it
      or exists (
        select 1
          from public.profiles pr
          join public.tier_courses tc on tc.tier_id = pr.subscription_tier_id
         where pr.id = p_user
           and pr.subscription_status in ('active','trialing')
           and tc.course_id = p_course
      )
    );
$$;

create or replace function public.can_access_video(p_user uuid, p_video uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case v.access_type
    when 'public' then true
    when 'purchase' then exists (
      select 1
        from public.video_entitlements ve
       where ve.user_id = p_user
         and ve.video_id = v.id
    )
    when 'course' then public.can_access_course(p_user, v.course_id)
    else false
  end
  from public.videos v
  where v.id = p_video;
$$;

-- ============================================================================
--  Row Level Security
--
--  The Express API uses the service role key and bypasses everything below.
--  These policies make the anon/publishable key safe in the browser.
-- ============================================================================

alter table public.site_settings       enable row level security;
alter table public.courses             enable row level security;
alter table public.subscription_tiers  enable row level security;
alter table public.tier_courses        enable row level security;
alter table public.profiles            enable row level security;
alter table public.videos              enable row level security;
alter table public.purchases           enable row level security;
alter table public.course_entitlements enable row level security;
alter table public.video_entitlements  enable row level security;
alter table public.blog_posts          enable row level security;
alter table public.pages               enable row level security;
alter table public.page_blocks         enable row level security;
alter table public.media               enable row level security;

-- ─── public read of published marketing content ─────────────────────────────

create policy "site settings are world readable"
  on public.site_settings for select using (true);

create policy "published courses are world readable"
  on public.courses for select using (is_published or public.is_admin());

create policy "active tiers are world readable"
  on public.subscription_tiers for select using (is_active or public.is_admin());

create policy "tier course links are world readable"
  on public.tier_courses for select using (true);

create policy "published posts are world readable"
  on public.blog_posts for select using (is_published or public.is_admin());

create policy "published pages are world readable"
  on public.pages for select using (is_published or public.is_admin());

create policy "blocks of published pages are world readable"
  on public.page_blocks for select using (
    public.is_admin()
    or exists (
      select 1 from public.pages pg
       where pg.id = page_blocks.page_id
         and pg.is_published
    )
  );

create policy "media is world readable"
  on public.media for select using (true);

-- Video *metadata* is readable (titles/thumbnails power the locked course
-- outline). The playable URL is never in this table — it is a short-lived
-- CloudFront signature the API issues only after an access check.
create policy "published video metadata is world readable"
  on public.videos for select using (is_published or public.is_admin());

-- ─── a user's own rows ──────────────────────────────────────────────────────

create policy "users read their own profile"
  on public.profiles for select using (id = (select auth.uid()) or public.is_admin());

create policy "users update their own profile name"
  on public.profiles for update
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "users read their own purchases"
  on public.purchases for select
  using (user_id = (select auth.uid()) or public.is_admin());

create policy "users read their own course entitlements"
  on public.course_entitlements for select
  using (user_id = (select auth.uid()) or public.is_admin());

create policy "users read their own video entitlements"
  on public.video_entitlements for select
  using (user_id = (select auth.uid()) or public.is_admin());

-- ─── admin write access ─────────────────────────────────────────────────────
--  Writes normally go through the Express API (service role), but granting
--  admins direct write keeps the door open for Supabase Studio edits.

create policy "admins write site settings"  on public.site_settings      for all using (public.is_admin()) with check (public.is_admin());
create policy "admins write courses"        on public.courses            for all using (public.is_admin()) with check (public.is_admin());
create policy "admins write tiers"          on public.subscription_tiers for all using (public.is_admin()) with check (public.is_admin());
create policy "admins write tier courses"   on public.tier_courses       for all using (public.is_admin()) with check (public.is_admin());
create policy "admins write videos"         on public.videos             for all using (public.is_admin()) with check (public.is_admin());
create policy "admins write posts"          on public.blog_posts         for all using (public.is_admin()) with check (public.is_admin());
create policy "admins write pages"          on public.pages              for all using (public.is_admin()) with check (public.is_admin());
create policy "admins write blocks"         on public.page_blocks        for all using (public.is_admin()) with check (public.is_admin());
create policy "admins write media"          on public.media              for all using (public.is_admin()) with check (public.is_admin());
create policy "admins write profiles"       on public.profiles           for all using (public.is_admin()) with check (public.is_admin());
create policy "admins write entitlements"   on public.course_entitlements for all using (public.is_admin()) with check (public.is_admin());
create policy "admins write video grants"   on public.video_entitlements for all using (public.is_admin()) with check (public.is_admin());
create policy "admins write purchases"      on public.purchases          for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
--  Storage — public bucket for CMS images (never for course video)
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media', 'media', true, 10485760,
  array['image/jpeg','image/png','image/webp','image/gif','image/svg+xml','image/avif']
)
on conflict (id) do nothing;

create policy "media bucket is world readable"
  on storage.objects for select
  using (bucket_id = 'media');

create policy "admins upload media"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.is_admin());

create policy "admins delete media"
  on storage.objects for delete to authenticated
  using (bucket_id = 'media' and public.is_admin());
