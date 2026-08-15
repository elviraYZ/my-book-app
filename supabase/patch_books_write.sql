-- 允许登录用户写入/更新 books（可重复执行）
-- 若策略已存在会先 drop 再创建

drop policy if exists "Authenticated users can insert books" on public.books;
drop policy if exists "Authenticated users can update books" on public.books;

create policy "Authenticated users can insert books"
  on public.books for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update books"
  on public.books for update
  to authenticated
  using (true)
  with check (true);
