-- 为 Google Books seed 补充字段（可重复执行）
alter table public.books
  add column if not exists page_count integer,
  add column if not exists preview_url text,
  add column if not exists info_url text,
  add column if not exists published_date text;
