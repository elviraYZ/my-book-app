-- 游研书伴 MVP schema（对齐 PRD 7–9：画像 / Context / 书籍 / 推荐关系 / 反馈）
-- Run in Supabase SQL Editor

create extension if not exists "pgcrypto";
create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- 1. profiles — 长期用户画像
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  roles text[] not null default '{}',
  interests text[] not null default '{}',
  reading_purposes text[] not null default '{}',
  reading_depth text check (
    reading_depth is null
    or reading_depth in ('light', 'medium', 'deep')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. topics — 长期保存的 Context 专题
-- context jsonb 结构见 lib/types.ts → RecommendContext
-- ---------------------------------------------------------------------------
create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  context_text text,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists topics_user_id_idx on public.topics (user_id);

alter table public.topics enable row level security;

create policy "Users can view own topics"
  on public.topics for select
  using (auth.uid() = user_id);

create policy "Users can insert own topics"
  on public.topics for insert
  with check (auth.uid() = user_id);

create policy "Users can update own topics"
  on public.topics for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own topics"
  on public.topics for delete
  using (auth.uid() = user_id);

drop trigger if exists topics_set_updated_at on public.topics;
create trigger topics_set_updated_at
  before update on public.topics
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. works + book_editions — 作品（推荐/去重）与版本（ISBN/封面等）
-- ---------------------------------------------------------------------------
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
  primary_topics text[] not null default '{}',
  display_summary text,
  use_cases text[] not null default '{}',
  concepts text[] not null default '{}',
  -- embedding 维度须与 EMBEDDING_MODEL / EMBEDDING_DIMENSIONS 一致
  -- 默认 Gemini gemini-embedding-001 @ 768（勿沿用 OpenAI 1536）
  embedding vector(768),
  representative_edition_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists works_work_key_uidx on public.works (work_key);

create index if not exists works_embedding_hnsw_idx
  on public.works
  using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

create or replace function public.match_works_by_embedding(
  query_embedding vector(768),
  match_count integer default 40
)
returns table (
  id uuid,
  similarity double precision
)
language sql
stable
as $$
  select
    w.id,
    (1 - (w.embedding <=> query_embedding))::double precision as similarity
  from public.works w
  where w.embedding is not null
  order by w.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

grant execute on function public.match_works_by_embedding(vector, integer)
  to anon, authenticated, service_role;

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

alter table public.works
  drop constraint if exists works_representative_edition_id_fkey;
alter table public.works
  add constraint works_representative_edition_id_fkey
  foreign key (representative_edition_id)
  references public.book_editions (id)
  on delete set null;

alter table public.works enable row level security;
alter table public.book_editions enable row level security;

create policy "Anyone can read works"
  on public.works for select
  to anon, authenticated
  using (true);

create policy "Authenticated users can insert works"
  on public.works for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update works"
  on public.works for update
  to authenticated
  using (true)
  with check (true);

create policy "Anyone can read book_editions"
  on public.book_editions for select
  to anon, authenticated
  using (true);

create policy "Authenticated users can insert book_editions"
  on public.book_editions for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update book_editions"
  on public.book_editions for update
  to authenticated
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- 4. recommendation_sessions — 一次推荐会话（未保存为专题也可存在）
-- ---------------------------------------------------------------------------
create table if not exists public.recommendation_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  raw_prompt text not null,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists recommendation_sessions_user_id_idx
  on public.recommendation_sessions (user_id);

alter table public.recommendation_sessions enable row level security;

create policy "Users can view own recommendation sessions"
  on public.recommendation_sessions for select
  using (auth.uid() = user_id);

create policy "Users can insert own recommendation sessions"
  on public.recommendation_sessions for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own recommendation sessions"
  on public.recommendation_sessions for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 5. topic_books — 专题/会话下的推荐结果（书籍关联 + 可解释字段）
-- ---------------------------------------------------------------------------
create table if not exists public.topic_books (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references public.topics (id) on delete cascade,
  session_id uuid references public.recommendation_sessions (id) on delete cascade,
  book_id uuid not null references public.works (id) on delete cascade,
  match_score numeric(5, 2) check (
    match_score is null
    or (match_score >= 0 and match_score <= 100)
  ),
  match_reason text,
  matched_tags text[] not null default '{}',
  rank integer,
  explain jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint topic_books_owner_check check (
    topic_id is not null or session_id is not null
  )
);

create index if not exists topic_books_topic_id_idx on public.topic_books (topic_id);
create index if not exists topic_books_session_id_idx on public.topic_books (session_id);
create index if not exists topic_books_book_id_idx on public.topic_books (book_id);

alter table public.topic_books enable row level security;

create policy "Users can view topic_books they own"
  on public.topic_books for select
  using (
    exists (
      select 1 from public.topics t
      where t.id = topic_books.topic_id and t.user_id = auth.uid()
    )
    or exists (
      select 1 from public.recommendation_sessions s
      where s.id = topic_books.session_id and s.user_id = auth.uid()
    )
  );

create policy "Users can insert topic_books they own"
  on public.topic_books for insert
  with check (
    exists (
      select 1 from public.topics t
      where t.id = topic_books.topic_id and t.user_id = auth.uid()
    )
    or exists (
      select 1 from public.recommendation_sessions s
      where s.id = topic_books.session_id and s.user_id = auth.uid()
    )
  );

create policy "Users can update topic_books they own"
  on public.topic_books for update
  using (
    exists (
      select 1 from public.topics t
      where t.id = topic_books.topic_id and t.user_id = auth.uid()
    )
    or exists (
      select 1 from public.recommendation_sessions s
      where s.id = topic_books.session_id and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.topics t
      where t.id = topic_books.topic_id and t.user_id = auth.uid()
    )
    or exists (
      select 1 from public.recommendation_sessions s
      where s.id = topic_books.session_id and s.user_id = auth.uid()
    )
  );

create policy "Users can delete topic_books they own"
  on public.topic_books for delete
  using (
    exists (
      select 1 from public.topics t
      where t.id = topic_books.topic_id and t.user_id = auth.uid()
    )
    or exists (
      select 1 from public.recommendation_sessions s
      where s.id = topic_books.session_id and s.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 6. bookmarks — 全局收藏（「我的收藏」）
-- 对齐前端 Bookmark：一书一条；专题归类见 bookmark_topics
-- ---------------------------------------------------------------------------
create table if not exists public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  book_id uuid not null references public.works (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, book_id)
);

create index if not exists bookmarks_user_id_idx on public.bookmarks (user_id);
create index if not exists bookmarks_book_id_idx on public.bookmarks (book_id);

alter table public.bookmarks enable row level security;

create policy "Users can view own bookmarks"
  on public.bookmarks for select
  using (auth.uid() = user_id);

create policy "Users can insert own bookmarks"
  on public.bookmarks for insert
  with check (auth.uid() = user_id);

create policy "Users can update own bookmarks"
  on public.bookmarks for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own bookmarks"
  on public.bookmarks for delete
  using (auth.uid() = user_id);

drop trigger if exists bookmarks_set_updated_at on public.bookmarks;
create trigger bookmarks_set_updated_at
  before update on public.bookmarks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 7. bookmark_topics — 收藏归入专题（多对多，topic_ids）
-- ---------------------------------------------------------------------------
create table if not exists public.bookmark_topics (
  bookmark_id uuid not null references public.bookmarks (id) on delete cascade,
  topic_id uuid not null references public.topics (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (bookmark_id, topic_id)
);

create index if not exists bookmark_topics_topic_id_idx
  on public.bookmark_topics (topic_id);

alter table public.bookmark_topics enable row level security;

create policy "Users can view own bookmark_topics"
  on public.bookmark_topics for select
  using (
    exists (
      select 1 from public.bookmarks b
      where b.id = bookmark_topics.bookmark_id and b.user_id = auth.uid()
    )
  );

create policy "Users can insert own bookmark_topics"
  on public.bookmark_topics for insert
  with check (
    exists (
      select 1 from public.bookmarks b
      where b.id = bookmark_topics.bookmark_id and b.user_id = auth.uid()
    )
    and exists (
      select 1 from public.topics t
      where t.id = bookmark_topics.topic_id and t.user_id = auth.uid()
    )
  );

create policy "Users can delete own bookmark_topics"
  on public.bookmark_topics for delete
  using (
    exists (
      select 1 from public.bookmarks b
      where b.id = bookmark_topics.bookmark_id and b.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 8. user_book_actions — 非收藏反馈（当前仅「不感兴趣」；已读已移除）
-- ---------------------------------------------------------------------------
create table if not exists public.user_book_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  book_id uuid not null references public.works (id) on delete cascade,
  status text not null check (status in ('disliked')),
  topic_id uuid references public.topics (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, book_id)
);

create index if not exists user_book_actions_user_id_idx
  on public.user_book_actions (user_id);
create index if not exists user_book_actions_book_id_idx
  on public.user_book_actions (book_id);

alter table public.user_book_actions enable row level security;

create policy "Users can view own book actions"
  on public.user_book_actions for select
  using (auth.uid() = user_id);

create policy "Users can insert own book actions"
  on public.user_book_actions for insert
  with check (auth.uid() = user_id);

create policy "Users can update own book actions"
  on public.user_book_actions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own book actions"
  on public.user_book_actions for delete
  using (auth.uid() = user_id);

drop trigger if exists user_book_actions_set_updated_at on public.user_book_actions;
create trigger user_book_actions_set_updated_at
  before update on public.user_book_actions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 9. 表级权限（RLS 之外仍需 GRANT，否则报 permission denied for table …）
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.topics to authenticated;
grant select, insert, update, delete on table public.topic_books to authenticated;
grant select, insert, update, delete on table public.bookmarks to authenticated;
grant select, insert, update, delete on table public.bookmark_topics to authenticated;
grant select, insert, update, delete on table public.user_book_actions to authenticated;
grant select, insert, update, delete on table public.recommendation_sessions to authenticated;
grant select on table public.works to anon, authenticated;
grant insert, update on table public.works to authenticated;
grant select on table public.book_editions to anon, authenticated;
grant insert, update on table public.book_editions to authenticated;

grant usage, select on all sequences in schema public to authenticated;
