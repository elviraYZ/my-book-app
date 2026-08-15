/** 书籍详情页来源与返回路径 */

export type BookDetailFrom =
  | "home"
  | "explore"
  | "recommend"
  | "topics"
  | "bookmarks"
  | "book";

export function bookDetailHref(
  bookId: string,
  opts?: { from?: BookDetailFrom | string; topic?: string | null },
) {
  const params = new URLSearchParams();
  if (opts?.from) params.set("from", opts.from);
  if (opts?.topic) params.set("topic", opts.topic);
  const q = params.toString();
  return q ? `/books/${bookId}?${q}` : `/books/${bookId}`;
}

export function bookDetailBackHref(opts: {
  from?: string | null;
  topic?: string | null;
}): { href: string; label: string } {
  switch (opts.from) {
    case "recommend":
      return { href: "/recommend", label: "返回推荐结果" };
    case "explore":
      return { href: "/explore", label: "返回探索" };
    case "topics":
      return opts.topic
        ? { href: `/topics/${opts.topic}`, label: "返回专题" }
        : { href: "/topics", label: "返回我的专题" };
    case "bookmarks":
      return { href: "/bookmarks", label: "返回我的收藏" };
    case "home":
      return { href: "/", label: "返回首页" };
    case "book":
      // 相关书跳转：尽量沿用进入详情前的来源由调用方传 from；缺省回探索
      return { href: "/explore", label: "返回探索" };
    default:
      return { href: "/", label: "返回首页" };
  }
}
