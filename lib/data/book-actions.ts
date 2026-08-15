import { isMockMode } from "@/lib/data/config";
import { mockStore } from "@/lib/data/mock-store";
import type { UserBookAction } from "@/lib/types";

/** 写入非收藏反馈；当前仅支持「不感兴趣」。收藏请用 saveBookmark。 */
export async function setBookAction(
  bookId: string,
  status: "disliked",
  topicId?: string | null,
): Promise<UserBookAction> {
  // 不感兴趣暂仍走本地；后续再落 user_book_actions
  void isMockMode;
  return mockStore.setBookAction(bookId, status, topicId);
}
