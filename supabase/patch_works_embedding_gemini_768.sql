-- 从旧 OpenAI 1536 维迁移到 Gemini 768 维
-- 会 DROP embedding 列（旧向量作废），执行后请 npm run embed:works 重建

drop index if exists public.works_embedding_hnsw_idx;
drop index if exists public.works_embedding_ivfflat_idx;

drop function if exists public.match_works_by_embedding(vector, integer);
drop function if exists public.match_works_by_embedding(vector(1536), integer);
drop function if exists public.match_works_by_embedding(vector(768), integer);

alter table public.works drop column if exists embedding;
alter table public.works add column embedding vector(768);

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
