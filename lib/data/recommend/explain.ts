import type {
  Book,
  DimensionScores,
  StructuredDemandContext,
} from "@/lib/types";
import { hardRejectByExcludedPrimary } from "@/lib/data/recommend/negative-constraints";

/** Hard filter：legacy exclusions + excludedTopics∩primary_topics */
export function passesExclusions(
  book: Book,
  demand: StructuredDemandContext,
): boolean {
  if (hardRejectByExcludedPrimary(book, demand)) return false;

  for (const ex of demand.exclusions) {
    if (ex === "英文") {
      const blob = `${book.title} ${book.description ?? ""}`;
      const hasCjk = /[\u4e00-\u9fff]/.test(book.title);
      if (!hasCjk && /[a-zA-Z]{4,}/.test(blob)) return false;
    }
    if (ex === "小说") {
      const blob = `${book.title} ${book.description ?? ""} ${book.tags.join(" ")}`;
      if (/小说|fiction|novel/i.test(blob) && !/设计|游戏|关卡|方法/.test(blob)) {
        return false;
      }
    }
    if (ex === "理论" || ex === "重理论") {
      if (
        book.content_style.length === 1 &&
        book.content_style[0] === "theory"
      ) {
        return false;
      }
    }
  }
  return true;
}

/** 用子分生成可解释理由（后续可换 LLM，但须对齐分数） */
export function buildMatchReason(
  book: Book,
  demand: StructuredDemandContext,
  scores: DimensionScores,
): string {
  const bits: string[] = [];

  if (scores.topicScore >= 0.8) {
    bits.push(
      `与当前「${demand.topics.slice(0, 2).join("、") || "需求"}」高度相关`,
    );
  } else if (scores.topicScore >= 0.5) {
    bits.push(
      `主题与「${demand.topics.slice(0, 2).join("、")}」有一定关联（可跨领域参考）`,
    );
  } else {
    bits.push("主题相关度一般，作拓宽阅读备选");
  }

  if (demand.goal?.trim() && scores.goalScore >= 0.8) {
    bits.push(`较贴合「${demand.goal}」场景`);
  } else if (demand.goal?.trim() && scores.goalScore <= 0.2) {
    bits.push(`与「${demand.goal}」目标匹配偏弱`);
  }

  if (scores.styleScore >= 0.8 && demand.styles.length > 0) {
    bits.push(`内容风格偏向你偏好的「${demand.styles[0]}」`);
  } else if (scores.styleScore <= 0.2 && demand.styles.includes("少理论")) {
    bits.push("内容偏理论，与你「少理论」的偏好不完全一致");
  } else if (scores.styleScore <= 0.2 && demand.styles.length > 0) {
    bits.push(`风格与「${demand.styles[0]}」不完全一致`);
  }

  if (scores.topicScore >= 0.5 && (demand.keywords?.length ?? 0) > 0) {
    const kw = demand.keywords!.slice(0, 2).join("、");
    if (scores.topicScore >= 0.8) {
      bits.push(`也贴合本次关注「${kw}」`);
    }
  }

  if (scores.difficultyScore >= 0.8 && demand.difficulty) {
    bits.push("阅读投入匹配");
  } else if (scores.difficultyScore <= 0.2 && demand.difficulty) {
    bits.push("阅读投入略有偏差");
  }

  if (scores.timeScore >= 0.8 && demand.time) {
    bits.push("更适合当前可用时间下的碎片/分段阅读");
  } else if (scores.timeScore <= 0.2 && demand.time) {
    bits.push("当前可用时间下阅读负担可能偏高");
  }

  // 画像只作轻描
  if (scores.profileScore >= 0.8 && scores.topicScore >= 0.5) {
    bits.push("也符合你的长期兴趣方向");
  }

  const summary = book.display_summary?.slice(0, 60);
  if (summary && scores.topicScore >= 0.5) {
    return `${bits.slice(0, 3).join("；")}。`;
  }
  return `${bits.slice(0, 3).join("；")}。`;
}

export function buildExplain(
  book: Book,
  demand: StructuredDemandContext,
  scores: DimensionScores,
) {
  return {
    theme_fit:
      scores.topicScore >= 0.8
        ? `主题强相关（${Math.round(scores.topicScore * 100)}%）`
        : scores.topicScore >= 0.5
          ? `主题相关（${Math.round(scores.topicScore * 100)}%）`
          : `主题弱相关（${Math.round(scores.topicScore * 100)}%）`,
    depth_fit:
      scores.difficultyScore >= 0.8
        ? "阅读投入匹配"
        : scores.difficultyScore <= 0.2
          ? "阅读投入有偏差"
          : "阅读投入适中",
    time_fit:
      scores.timeScore >= 0.8
        ? "可用时间合适"
        : scores.timeScore <= 0.2
          ? "可用时间偏紧"
          : "可用时间一般",
    style:
      book.content_style.length > 0
        ? book.content_style.join(" / ")
        : demand.styles[0] ?? "综合",
  };
}
