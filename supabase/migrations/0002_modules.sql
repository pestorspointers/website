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
