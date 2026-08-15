-- works embedding（pgvector）+ enrichment 字段
-- 默认维度 768 = Gemini gemini-embedding-001 + outputDimensionality=768
-- 必须与 .env EMBEDDING_DIMENSIONS 一致；勿沿用旧 OpenAI 1536

create extension if not exists vector;

alter table public.works
  add column if not exists display_summary text,
  add column if not exists use_cases text[] not null default '{}';

-- 若曾用 1536，请改跑 patch_works_embedding_gemini_768.sql（会清空旧向量）
alter table public.works
  add column if not exists embedding vector(768);

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
