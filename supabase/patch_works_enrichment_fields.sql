-- works：primary_topics / concepts 与 use_cases 分离
-- 在 Supabase SQL Editor 执行本 patch

alter table public.works
  add column if not exists primary_topics text[] not null default '{}';

alter table public.works
  add column if not exists concepts text[] not null default '{}';

comment on column public.works.primary_topics is
  '主题材（taxonomy 子集，通常 1–3 个；比 topics 更聚焦）';

comment on column public.works.concepts is
  '自由概念（非 taxonomy；与 use_cases 阅读目的枚举分开）';

comment on column public.works.use_cases is
  '阅读适用场景枚举：工作调研 / 系统学习 / 找灵感 / 快速入门 / 休闲阅读';
