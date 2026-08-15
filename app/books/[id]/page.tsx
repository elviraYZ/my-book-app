import { notFound } from "next/navigation";

import { BookDetailClient } from "@/components/book-detail-client";
import { bookDetailBackHref } from "@/lib/book-links";
import { getBook, getRelatedBooks, getTopic } from "@/lib/data";

export default async function BookDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; topic?: string }>;
}) {
  const { id } = await params;
  const { from, topic: topicId } = await searchParams;
  const book = await getBook(id);

  if (!book) {
    notFound();
  }

  const [related, topic] = await Promise.all([
    getRelatedBooks(id, 4),
    from === "topics" && topicId ? getTopic(topicId) : Promise.resolve(null),
  ]);

  const crumbs: { label: string; href?: string }[] = [
    { label: "首页", href: "/" },
  ];

  if (from === "recommend") {
    crumbs.push({ label: "推荐结果", href: "/recommend" });
  } else if (from === "explore") {
    crumbs.push({ label: "探索", href: "/explore" });
  } else if (from === "bookmarks") {
    crumbs.push({ label: "我的收藏", href: "/bookmarks" });
  } else if (from === "topics") {
    crumbs.push({ label: "我的专题", href: "/topics" });
    if (topic) {
      crumbs.push({ label: topic.title, href: `/topics/${topic.id}` });
    }
  } else if (from === "home") {
    // 首页直接进入：面包屑仅首页 > 书名
  }

  crumbs.push({ label: book.title });

  const back = bookDetailBackHref({ from, topic: topicId });

  return (
    <BookDetailClient
      book={book}
      related={related}
      crumbs={crumbs}
      backHref={back.href}
      backLabel={back.label}
      from={from}
      topicId={topicId}
    />
  );
}
