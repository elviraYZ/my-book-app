import { BookmarksPageClient } from "@/components/bookmarks-page-client";

export default async function BookmarksPage() {
  // 收藏列表由客户端拉取（带登录 cookie）
  return <BookmarksPageClient initialBookmarks={[]} />;
}
