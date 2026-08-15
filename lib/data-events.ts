/** 客户端 mock 数据变更广播（跨页刷新用） */

export const TOPICS_CHANGED = "yoyan:topics-changed";
export const BOOKMARKS_CHANGED = "yoyan:bookmarks-changed";

export function emitTopicsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(TOPICS_CHANGED));
}

export function emitBookmarksChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(BOOKMARKS_CHANGED));
}
