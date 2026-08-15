-- =============================================================================
-- 迁移：books → works + book_editions
-- 会清空旧书目及依赖（bookmarks / topic_books / user_book_actions 中的书关联）
-- 在 Supabase SQL Editor 整段执行
-- =============================================================================

-- 1) 清掉依赖旧 books 的数据
truncate table public.bookmark_topics cascade;
truncate table public.bookmarks cascade;
truncate table public.topic_books cascade;
truncate table public.user_book_actions cascade;

-- 2) 卸掉指向 books 的外键后删表
alter table if exists public.topic_books drop constraint if exists topic_books_book_id_fkey;
alter table if exists public.bookmarks drop constraint if exists bookmarks_book_id_fkey;
alter table if exists public.user_book_actions drop constraint if exists user_book_actions_book_id_fkey;

drop table if exists public.books cascade;

-- 3) works（作品）
create table if not exists public.works (
  id uuid primary key default gen_random_uuid(),
  work_key text not null,
  canonical_title text not null,
  primary_author text,
  topics text[] not null default '{}',
  topic_sources jsonb not null default '{}'::jsonb,
  difficulty text check (
    difficulty is null
    or difficulty in ('light', 'medium', 'deep')
  ),
  content_style text[] not null default '{}',
  representative_edition_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists works_work_key_uidx on public.works (work_key);

-- 4) book_editions（版本）
create table if not exists public.book_editions (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.works (id) on delete cascade,
  external_id text,
  source text not null default 'google_books',
  isbn_13 text,
  isbn_10 text,
  language text,
  title text not null,
  description text,
  cover_url text,
  publisher text,
  published_date text,
  page_count integer,
  rating numeric(3, 1),
  ratings_count integer,
  preview_url text,
  info_url text,
  created_at timestamptz not null default now()
);

create unique index if not exists book_editions_external_id_uidx
  on public.book_editions (source, external_id)
  where external_id is not null;

create unique index if not exists book_editions_isbn_13_uidx
  on public.book_editions (isbn_13)
  where isbn_13 is not null;

create index if not exists book_editions_work_id_idx on public.book_editions (work_id);

-- representative → edition（可空，删版时置空）
alter table public.works
  drop constraint if exists works_representative_edition_id_fkey;
alter table public.works
  add constraint works_representative_edition_id_fkey
  foreign key (representative_edition_id)
  references public.book_editions (id)
  on delete set null;

-- 5) 关联表 book_id 现指向 works.id（列名暂保留 book_id，减少应用改动）
alter table public.topic_books
  add constraint topic_books_book_id_fkey
  foreign key (book_id) references public.works (id) on delete cascade;

alter table public.bookmarks
  add constraint bookmarks_book_id_fkey
  foreign key (book_id) references public.works (id) on delete cascade;

alter table public.user_book_actions
  add constraint user_book_actions_book_id_fkey
  foreign key (book_id) references public.works (id) on delete cascade;

-- 6) RLS + grants
alter table public.works enable row level security;
alter table public.book_editions enable row level security;

drop policy if exists "Anyone can read works" on public.works;
create policy "Anyone can read works"
  on public.works for select
  to anon, authenticated
  using (true);

drop policy if exists "Authenticated users can insert works" on public.works;
create policy "Authenticated users can insert works"
  on public.works for insert to authenticated with check (true);

drop policy if exists "Authenticated users can update works" on public.works;
create policy "Authenticated users can update works"
  on public.works for update to authenticated using (true) with check (true);

drop policy if exists "Anyone can read book_editions" on public.book_editions;
create policy "Anyone can read book_editions"
  on public.book_editions for select
  to anon, authenticated
  using (true);

drop policy if exists "Authenticated users can insert book_editions" on public.book_editions;
create policy "Authenticated users can insert book_editions"
  on public.book_editions for insert to authenticated with check (true);

drop policy if exists "Authenticated users can update book_editions" on public.book_editions;
create policy "Authenticated users can update book_editions"
  on public.book_editions for update to authenticated using (true) with check (true);

grant select on table public.works to anon, authenticated;
grant select, insert, update, delete on table public.works to authenticated;
grant select on table public.book_editions to anon, authenticated;
grant select, insert, update, delete on table public.book_editions to authenticated;

-- service role / seed 用 secret key 本身绕过 RLS；仍需表权限时由 dashboard 角色处理
grant all on table public.works to service_role;
grant all on table public.book_editions to service_role;
