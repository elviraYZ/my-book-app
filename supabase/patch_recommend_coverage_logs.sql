-- Coverage Gap Logging：人工补库前的搜索缺口记录
-- 在 Supabase SQL editor 执行一次即可

create table if not exists public.recommend_coverage_logs (
  id uuid primary key default gen_random_uuid(),
  request_id text,
  prompt text not null default '',
  topics text[] not null default '{}',
  keywords text[] not null default '{}',
  top_match numeric not null default 0,
  core_relevance numeric not null default 0,
  result_count integer not null default 0,
  coverage_status text not null check (coverage_status in ('GOOD', 'THIN', 'GAP')),
  suggested_search_queries text[] not null default '{}',
  high_match_count integer not null default 0,
  reasons text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists recommend_coverage_logs_status_created_idx
  on public.recommend_coverage_logs (coverage_status, created_at desc);

create index if not exists recommend_coverage_logs_created_idx
  on public.recommend_coverage_logs (created_at desc);

alter table public.recommend_coverage_logs enable row level security;

-- 仅 service role / 服务端写入；匿名用户默认不可读
drop policy if exists "coverage_logs_service_insert" on public.recommend_coverage_logs;
-- 无 anon insert policy：走 SUPABASE_SECRET_KEY 的服务端客户端即可绕过 RLS
