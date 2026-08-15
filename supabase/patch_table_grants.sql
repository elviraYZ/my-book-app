-- 修复：permission denied for table profiles（及其他表）
-- 原因：开了 RLS 但 authenticated 角色缺少表级 GRANT
-- 在 Supabase SQL Editor 执行一次即可

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.topics to authenticated;
grant select, insert, update, delete on table public.topic_books to authenticated;
grant select, insert, update, delete on table public.bookmarks to authenticated;
grant select, insert, update, delete on table public.bookmark_topics to authenticated;
grant select, insert, update, delete on table public.user_book_actions to authenticated;
grant select, insert, update, delete on table public.recommendation_sessions to authenticated;

-- 书籍：目录可读（含 anon SSR）；写仍仅登录用户
grant select on table public.books to anon, authenticated;
grant insert, update on table public.books to authenticated;

-- 序列（若有）
grant usage, select on all sequences in schema public to authenticated;
