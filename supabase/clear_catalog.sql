-- =============================================================================
-- 清空书目目录（works + editions），便于加强乱码闸后重灌
-- 会级联清空：bookmarks / topic_books / user_book_actions 等对 book_id 的引用
-- 在 Supabase SQL Editor 整段执行
-- =============================================================================

truncate table public.bookmark_topics cascade;
truncate table public.bookmarks cascade;
truncate table public.topic_books cascade;
truncate table public.user_book_actions cascade;
truncate table public.book_editions cascade;
truncate table public.works cascade;
