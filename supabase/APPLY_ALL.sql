-- ============================================================
-- Combined setup: 0001_init + 0002_modules + seed
-- Paste into Supabase Dashboard → SQL Editor → Run.
-- Safe to re-run: every statement is idempotent.
-- ============================================================

-- ─── 0001_init.sql ───────────────────────────────────────────
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

-- ─── 0002_modules.sql ────────────────────────────────────────
-- ============================================================================
--  0002 — modules, and a record of where each video came from
--
--  The original schema is two levels: a course owns videos, ordered by
--  `videos.position`. The Kajabi programs being migrated in are three:
--
--     program  →  module      →  lesson
--     course   →  (missing)   →  video
--
--  Flattening would lose real information — the daily programs are organised
--  by month ("January", "February"), and a 367-lesson course with no grouping
--  is not usable. This adds the middle tier.
--
--  `videos.module_id` is nullable, so existing courses that never had modules
--  keep working untouched and the admin UI can ignore modules entirely.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
--  modules — an ordered group of videos inside one course
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.modules (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid not null references public.courses(id) on delete cascade,
  title         text not null,
  description   text not null default '',
  position      integer not null default 0,
  -- The Kajabi category id this module was imported from. Lets the import be
  -- re-run without creating duplicates, and keeps a trail back to the source.
  source_ref    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists modules_course_idx
  on public.modules (course_id, position);

-- One module per Kajabi category, so re-running the import updates in place.
create unique index if not exists modules_source_ref_key
  on public.modules (course_id, source_ref)
  where source_ref is not null;

create trigger modules_touch
  before update on public.modules
  for each row execute function public.touch_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
--  videos — join a module, and remember the source
-- ────────────────────────────────────────────────────────────────────────────

alter table public.videos
  add column if not exists module_id uuid references public.modules(id) on delete set null;

-- The Wistia id the file came from. This is what makes the import idempotent:
-- the raw upload in S3 is keyed by it, so a re-run finds the existing row
-- instead of creating a second one.
alter table public.videos
  add column if not exists source_wistia_id text;

create index if not exists videos_module_idx
  on public.videos (module_id, position);

create unique index if not exists videos_source_wistia_id_key
  on public.videos (source_wistia_id)
  where source_wistia_id is not null;

-- A video's module must belong to the same course as the video, or the
-- syllabus would show a lesson filed under another product's module.
create or replace function public.videos_module_matches_course()
returns trigger
language plpgsql
as $$
begin
  if new.module_id is not null then
    if not exists (
      select 1 from public.modules m
      where m.id = new.module_id
        and m.course_id is not distinct from new.course_id
    ) then
      raise exception 'module % does not belong to course %', new.module_id, new.course_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists videos_module_course_check on public.videos;
create trigger videos_module_course_check
  before insert or update of module_id, course_id on public.videos
  for each row execute function public.videos_module_matches_course();

-- ────────────────────────────────────────────────────────────────────────────
--  Row Level Security — mirror the course rules exactly
--
--  A module is only as visible as the course that owns it. It carries no
--  content of its own, so this is about not leaking the syllabus of an
--  unpublished course.
-- ────────────────────────────────────────────────────────────────────────────

alter table public.modules enable row level security;

create policy "modules of published courses are world readable"
  on public.modules for select using (
    public.is_admin()
    or exists (
      select 1 from public.courses c
      where c.id = modules.course_id
        and c.is_published
    )
  );

create policy "admins write modules"
  on public.modules for all
  using (public.is_admin())
  with check (public.is_admin());

-- ─── seed.sql ────────────────────────────────────────────────
-- ============================================================================
--  Seed data — run AFTER 0001_init.sql
--
--  Ports the previously hard-coded homepage / about / contact pages into the
--  CMS so the admin can edit every word and image without touching code.
--  Safe to re-run: pages are inserted on-conflict-do-nothing and blocks are
--  only added to a page that has none.
--
--  ⚠ FIRST THING TO DO: put the site owner's email in `admin_emails` below.
--     Anyone in that list is promoted to admin automatically when they sign up.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
--  Global settings
-- ────────────────────────────────────────────────────────────────────────────

insert into public.site_settings (key, value) values
  ('admin_emails', $json$[]$json$::jsonb)
on conflict (key) do nothing;

insert into public.site_settings (key, value) values
  ('brand', $json${
    "siteName": "Pestor's Pointers",
    "tagline": "Get unstuck in life.",
    "logoUrl": "https://kajabi-storefronts-production.kajabi-cdn.com/kajabi-storefronts-production/file-uploads/themes/2155355257/settings_images/ed08b2a-a3e0-3612-d74e-125be7a47_0781e02a-1437-42e4-9456-8938569f0c77.png",
    "footerLogoUrl": "https://kajabi-storefronts-production.kajabi-cdn.com/kajabi-storefronts-production/file-uploads/themes/2155355257/settings_images/fa8aa-a07a-fee1-1427-0838b76575_0781e02a-1437-42e4-9456-8938569f0c77.png",
    "contactEmail": "jeremypestor@gmail.com",
    "accentColor": "#f53100",
    "navyColor": "#100566",
    "darkColor": "#161E2A"
  }$json$::jsonb)
on conflict (key) do nothing;

insert into public.site_settings (key, value) values
  ('nav', $json${
    "links": [
      { "label": "Home",     "href": "/" },
      { "label": "Courses",  "href": "/courses" },
      { "label": "Blog",     "href": "/blog" },
      { "label": "About",    "href": "/about" },
      { "label": "Contact",  "href": "/contact" }
    ]
  }$json$::jsonb)
on conflict (key) do nothing;

insert into public.site_settings (key, value) values
  ('footer', $json${
    "tagline": "Helping lost and hurting people find confidence, clarity, hope, strength, vision, direction, awareness, and lasting fulfillment.",
    "links": [
      { "label": "Courses",             "href": "/courses" },
      { "label": "Blog",                "href": "/blog" },
      { "label": "About Jeremy",        "href": "/about" },
      { "label": "Contact Us",          "href": "/contact" },
      { "label": "Become an Affiliate", "href": "/contact" }
    ],
    "socials": [
      { "label": "Facebook",  "handle": "@Jpestor",          "href": "https://www.facebook.com/Jpestor?mibextid=LQQJ4d" },
      { "label": "Instagram", "handle": "@pestorspointers",   "href": "https://www.instagram.com/pestorspointers/" },
      { "label": "YouTube",   "handle": "@PestorsPointers",   "href": "https://youtube.com/@PestorsPointers" },
      { "label": "TikTok",    "handle": "@pestorspointers",   "href": "https://www.tiktok.com/@pestorspointers?_t=8fseGXGZoJ4&_r=1" }
    ],
    "legalLinks": [
      { "label": "Terms & Conditions", "href": "/terms" }
    ],
    "copyright": "Pestor's Pointers. All rights reserved."
  }$json$::jsonb)
on conflict (key) do nothing;

-- ────────────────────────────────────────────────────────────────────────────
--  Pages
-- ────────────────────────────────────────────────────────────────────────────

insert into public.pages (slug, title, meta_title, meta_description, is_system, is_published) values
  ('home', 'Home', 'GET UNSTUCK IN LIFE!',
   'I can help you find your purpose, place in this world & true fulfillment! The 7-Stage, 21-Step Program & Guide.',
   true, true),
  ('about', 'About', 'About Jeremy',
   'Meet Jeremy Pestor, Founder of Pestor''s Pointers & S.i.T.i.N.G Outreach — Standing. in. the. Increasingly. Neglected. Gap.',
   true, true),
  ('contact', 'Contact', 'Contact',
   'Get in touch with Jeremy Pestor. You''ve got questions. We''ve got answers.',
   true, true)
on conflict (slug) do nothing;

-- ────────────────────────────────────────────────────────────────────────────
--  Homepage blocks
-- ────────────────────────────────────────────────────────────────────────────

insert into public.page_blocks (page_id, type, position, content)
select p.id, b.type, b.position, b.content
from public.pages p,
  (values
    ('hero', 0, $json${
      "size": "large",
      "heading": "GET UNSTUCK IN LIFE!",
      "subheading": "The 7-Stage, 21-Step Program & Guide",
      "bodyHeading": "Feel Lost? Stuck somewhere on your journey?",
      "body": "I can help you find your purpose, place in this world & true fulfillment!\n\nLet's get unstuck! Step into the life you were destined to live.",
      "backgroundImage": "https://kajabi-storefronts-production.kajabi-cdn.com/kajabi-storefronts-production/file-uploads/themes/2155355257/settings_images/4e2af3-c6fb-740e-0163-dc383a772c74_looking-at-the-compass-to-figure-out-right-direction-foggy-valley-and-mountains-in-bac-SBI-327990886.png",
      "overlay": "navy",
      "overlayOpacity": 75,
      "align": "center",
      "ctaLabel": "Explore the courses",
      "ctaHref": "/courses"
    }$json$::jsonb),

    ('cards', 1, $json${
      "heading": "What you'll learn on your 60 day journey...",
      "background": "light",
      "columns": 3,
      "cardStyle": "navy",
      "cards": [
        {
          "eyebrow": "01",
          "title": "Your first steps",
          "body": "Finding a connection, roadmap, & 'Big Brother' who can help guide & point you in the right direction by giving you some hope, while discovering where you're at in your life, what you're feeling inside, what's missing, & what you desire to accomplish.",
          "image": "https://kajabi-storefronts-production.kajabi-cdn.com/kajabi-storefronts-production/file-uploads/themes/2155355257/settings_images/f8cff26-3541-bf8e-135-1c8cf3fdc1b1_740fc10e-f7ae-4189-bcc5-d9cc0c97228a.jpg"
        },
        {
          "eyebrow": "02",
          "title": "Growing stronger",
          "body": "Since you are the 'common denominator' in all of your relationships, let's unpack the 'why' beneath the surface as we learn to set healthy boundaries to improve your 'circle of influence'...",
          "image": "https://kajabi-storefronts-production.kajabi-cdn.com/kajabi-storefronts-production/file-uploads/themes/2155355257/settings_images/f8e8e8-74b-845-865e-64d43ee1f24_2b3e726-67a-228-baf4-37ec4ccb5_pexels-andrea-piacquadio-3760137_1_1_.png"
        },
        {
          "eyebrow": "03",
          "title": "Next level destiny",
          "body": "Wanting more for your life & choosing to move forward past your fear as you discover your individual purpose & find satisfaction & eternal fulfillment, while becoming a 'High Value, 1% Person of Excellence!'",
          "image": "https://kajabi-storefronts-production.kajabi-cdn.com/kajabi-storefronts-production/file-uploads/themes/2155355257/settings_images/c3cc15-8eba-365d-a33b-3c6bdc0883c0_2b3e726-67a-228-baf4-37ec4ccb5_pexels-andrea-piacquadio-3760137_1_2_.png"
        }
      ]
    }$json$::jsonb),

    ('hero', 2, $json${
      "size": "medium",
      "heading": "Feel Like Something Is Missing in Your Life?",
      "body": "Maybe you feel emotionally as if you're drowning in the ocean & just want to get your head above water so you can start making some better progress in your individual life?\n\nDo you ever feel emotionally trapped inside a cage & you just want to break free from these invisible chains that keep you down & that keep the REAL YOU from coming out?",
      "backgroundImage": "https://kajabi-storefronts-production.kajabi-cdn.com/kajabi-storefronts-production/file-uploads/themes/2155355257/settings_images/e386514-0a1-c3c7-57-eccf155ab8e_tourist-in-hoodie-in-front-of-rural-landscape-with-mountains-on-the-way-of-the-paul-va-SBI-327903316_1_.jpg",
      "overlay": "dark",
      "overlayOpacity": 70,
      "align": "center",
      "ctaLabel": "Explore More",
      "ctaHref": "/courses"
    }$json$::jsonb),

    ('hero', 3, $json${
      "size": "medium",
      "heading": "I can help guide you (male or female) as your 'Big Bro' as you face life's challenges head on!",
      "body": "Start today with my 7-stage, 21-step program guide to help navigate successfully through life...",
      "backgroundImage": "https://kajabi-storefronts-production.kajabi-cdn.com/kajabi-storefronts-production/file-uploads/themes/2155355257/settings_images/8bcee53-1112-c2-12-c7df16c8a16a_banca-boat-at-las-cabanas-beach-with-stunning-pinagbuyutan-island-in-background-breath-SBI-342307242_1_.jpg",
      "overlay": "navy",
      "overlayOpacity": 75,
      "align": "center"
    }$json$::jsonb),

    ('videoEmbed', 4, $json${
      "url": "https://fast.wistia.net/embed/iframe/2am1ihye3z?videoFoam=true",
      "title": "Pestor's Pointers Introduction",
      "background": "white"
    }$json$::jsonb),

    ('courseGrid', 5, $json${
      "heading": "Course Offerings",
      "viewAllLabel": "View all",
      "limit": 3,
      "background": "light"
    }$json$::jsonb),

    ('pricing', 6, $json${
      "heading": "Join Our Free Trial",
      "subheading": "Get started today before this once in a lifetime opportunity expires.",
      "background": "navy",
      "ctaLabel": "Get Started",
      "emptyCtaLabel": "Get Started Today",
      "emptyCtaHref": "/register"
    }$json$::jsonb),

    ('blogGrid', 7, $json${
      "heading": "Articles & Insights",
      "viewAllLabel": "View all",
      "limit": 3,
      "background": "white"
    }$json$::jsonb)
  ) as b(type, position, content)
where p.slug = 'home'
  and not exists (select 1 from public.page_blocks pb where pb.page_id = p.id);

-- ────────────────────────────────────────────────────────────────────────────
--  About page blocks
-- ────────────────────────────────────────────────────────────────────────────

insert into public.page_blocks (page_id, type, position, content)
select p.id, b.type, b.position, b.content
from public.pages p,
  (values
    ('hero', 0, $json${
      "size": "small",
      "heading": "Hi! … I'm Jeremy Pestor",
      "body": "Founder of 'Pestor's Pointers' & S.i.T.i.N.G Outreach, which stands for \"Standing. in. the. Increasingly. Neglected. Gap.\"",
      "overlay": "navy",
      "overlayOpacity": 100,
      "align": "center"
    }$json$::jsonb),

    ('richText', 1, $json${
      "background": "white",
      "align": "left",
      "image": "",
      "imageStyle": "avatar",
      "imageFallback": "JP",
      "body": "Lost & hurting people I help guide along life's complicated journey by providing a roadmap to help those who have been abandoned by an absent male figure & who feel hopeless & confused, to find the missing pieces to receive confidence, clarity, hope, strength, vision, direction, awareness, & lasting fulfillment in their life as they discover the 3 key ingredients that make up their own, UNIQUE PURPOSE!\n\nRegardless of your view of God, religion, church, or even 'religious people,' as long as we can agree that there is a Higher Power, an Infinite Designer, a Loving Creator, then this program is for YOU!\n\nI come from a non-judgmental & loving 'big brother' perspective to both men & women alike, & I have found in all of my life experiences so far as a single man in my early 40s, that sometimes we just need a guide who's been where we are, who understands us, has felt our pain, & can point us in the right direction to navigate life's complicated journey to find personal FREEDOM.\n\nI start with the relationship people have with themselves & how that plays out in all the other areas of our life, because I've been there & have struggled throughout my lifetime as well, so from day #1, I meet you right where you're at in order to find the REAL YOU, the person who you desire to be, & who you were ALWAYS meant to be!\n\nI can guide you to become the strongest version of you at your core center so your true inner HERO can arise & BREAK FREE from your past and do AMAZING things in your lifetime, because when you become the strongest-centered version of yourself, your entire life, existence, & world, including all of your relationships will improve, whether you're single or currently in a dating relationship!\n\nI look forward to getting to know and coach you personally with this program. Your journey starts TODAY!"
    }$json$::jsonb),

    ('cta', 2, $json${
      "heading": "Join Our Free Trial",
      "body": "Get started today before this once in a lifetime opportunity expires.",
      "background": "white",
      "align": "center",
      "ctaLabel": "Join Our Free Trial",
      "ctaHref": "/billing",
      "secondaryCtaLabel": "Explore the Courses",
      "secondaryCtaHref": "/courses"
    }$json$::jsonb)
  ) as b(type, position, content)
where p.slug = 'about'
  and not exists (select 1 from public.page_blocks pb where pb.page_id = p.id);

-- ────────────────────────────────────────────────────────────────────────────
--  Contact page blocks
-- ────────────────────────────────────────────────────────────────────────────

insert into public.page_blocks (page_id, type, position, content)
select p.id, b.type, b.position, b.content
from public.pages p,
  (values
    ('imageBanner', 0, $json${
      "image": "https://kajabi-storefronts-production.kajabi-cdn.com/kajabi-storefronts-production/file-uploads/themes/2155262639/settings_images/7cb311d-b346-85bc-700b-ac7826a04eee_1681a9cd-010f-490b-8486-e71534a01eea.jpg",
      "alt": "Contact",
      "height": "medium"
    }$json$::jsonb),

    ('richText', 1, $json${
      "heading": "LET'S CONNECT",
      "body": "You've got questions. We've got answers.",
      "background": "white",
      "align": "center",
      "size": "large"
    }$json$::jsonb),

    ('richText', 2, $json${
      "background": "white",
      "align": "left",
      "boxed": true,
      "body": "Are you looking for a side gig to earn some easy money by becoming an affiliate who refers new clients?\n\nIf so, we're hiring!!\n\nDo you need to book a call with my team or have a special circumstance that needs explaining?\n\nHey, you have my attention!\n\nEmail me at jeremypestor@gmail.com and I'll get back to you shortly!\n\n— Jeremy Pestor"
    }$json$::jsonb),

    ('linkCards', 3, $json${
      "background": "white",
      "columns": 4,
      "cards": [
        { "title": "Facebook",  "subtitle": "@Jpestor",        "href": "https://www.facebook.com/Jpestor?mibextid=LQQJ4d" },
        { "title": "Instagram", "subtitle": "@pestorspointers", "href": "https://www.instagram.com/pestorspointers/" },
        { "title": "YouTube",   "subtitle": "@PestorsPointers", "href": "https://www.youtube.com/@PestorsPointers" },
        { "title": "TikTok",    "subtitle": "@pestorspointers", "href": "https://www.tiktok.com/@pestorspointers" }
      ]
    }$json$::jsonb),

    ('cta', 4, $json${
      "heading": "Join Our Free Trial",
      "body": "Get started today before this once in a lifetime opportunity expires.",
      "background": "white",
      "align": "center",
      "ctaLabel": "Get Started Today",
      "ctaHref": "/billing"
    }$json$::jsonb)
  ) as b(type, position, content)
where p.slug = 'contact'
  and not exists (select 1 from public.page_blocks pb where pb.page_id = p.id);
