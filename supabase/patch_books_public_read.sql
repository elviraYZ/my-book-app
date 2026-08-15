-- 书目为共享目录：允许 anon / authenticated 只读，便于 SSR 与推荐候选池拉取。
-- 写入仍仅 authenticated（见既有 policy / grant）。

grant select on table public.books to anon, authenticated;

drop policy if exists "Authenticated users can read books" on public.books;
drop policy if exists "Anyone can read books" on public.books;

create policy "Anyone can read books"
  on public.books for select
  to anon, authenticated
  using (true);
