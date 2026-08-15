-- 已跑过 migrate_works_editions 的库补 topic_sources
-- 取值：evidence（规则正文证据）| seed（检索暂挂）| llm（enrichment 补充）
alter table public.works
  add column if not exists topic_sources jsonb not null default '{}'::jsonb;
