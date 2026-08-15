/**
 * Mock 种子数据（仅供 lib/data/mock-store 使用）。
 * 页面 / 组件请从 `@/lib/data` 取数，不要直接 import 本文件。
 */
import type {
  Book,
  BookDetail,
  ContentStyle,
  ExploreBook,
  ExploreItem,
  Profile,
  ReadingDepth,
  RecommendationSession,
  Topic,
  TopicBook,
  UserBookAction,
} from "@/lib/types";

export const mockProfile: Profile = {
  id: "user-demo",
  roles: ["design"],
  interests: ["游戏设计", "关卡设计", "引擎开发"],
  reading_purposes: ["solve", "learn"],
  reading_depth: "light",
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-12T00:00:00Z",
};

export const mockBooks: Book[] = [
  {
    id: "book-lynch",
    external_id: "ol-8225261",
    title: "城市意象",
    author: "Kevin Lynch",
    cover_url: "https://covers.openlibrary.org/b/id/8225261-M.jpg",
    description: "经典的城市空间认知与路径、地标研究。",
    tags: ["空间引导", "关卡设计", "案例"],
    reading_minutes: 25,
    difficulty: "medium",
    content_style: ["case", "theory"],
    rating: 9.2,
    created_at: "2026-08-01T00:00:00Z",
    cover_color: "#2563EB",
  },
  {
    id: "book-schell",
    external_id: "ol-schell",
    title: "游戏设计艺术",
    author: "Jesse Schell",
    cover_url: "https://covers.openlibrary.org/b/id/8225261-M.jpg",
    description: "系统讲解游戏机制、循环与设计透镜。",
    tags: ["游戏设计", "设计理论", "入门"],
    reading_minutes: 40,
    difficulty: "medium",
    content_style: ["method", "theory"],
    rating: 9.1,
    created_at: "2026-08-01T00:00:00Z",
    cover_color: "#2563EB",
  },
  {
    id: "book-levelup",
    title: "Level Up! 游戏设计精髓",
    author: "Scott Rogers",
    description:
      "从关卡节奏到敌人配置，用大量实战案例讲透游戏设计方法。",
    tags: ["关卡设计", "实践案例", "20-30分钟"],
    reading_minutes: 25,
    difficulty: "light",
    content_style: ["case", "method"],
    rating: 9.1,
    created_at: "2026-08-01T00:00:00Z",
    cover_color: "#DC2626",
  },
  {
    id: "book-flow",
    title: "心流",
    author: "Mihaly Csikszentmihalyi",
    description: "最优体验心理学，理解挑战与技能平衡。",
    tags: ["心理学", "玩家动机"],
    reading_minutes: 35,
    difficulty: "medium",
    content_style: ["theory"],
    rating: 8.9,
    created_at: "2026-08-01T00:00:00Z",
    cover_color: "#0891B2",
  },
  {
    id: "book-swink",
    title: "游戏感觉",
    author: "Steve Swink",
    description: "手感、反馈与操作体验设计。",
    tags: ["手感", "反馈设计"],
    reading_minutes: 30,
    difficulty: "medium",
    content_style: ["method", "case"],
    rating: 8.8,
    created_at: "2026-08-01T00:00:00Z",
    cover_color: "#7C3AED",
  },
];

const bookById = Object.fromEntries(mockBooks.map((b) => [b.id, b]));

export const mockTopics: Topic[] = [
  {
    id: "topic-explore-level",
    user_id: "user-demo",
    title: "探索性关卡设计方法",
    context_text: "围绕探索节奏、奖励分布与迷路乐趣，整理可落地的关卡设计方法。",
    context: {
      goal: "掌握探索性关卡设计",
      themes: ["关卡设计", "探索体验"],
      session_minutes: 25,
      session_minutes_min: 20,
      session_minutes_max: 30,
      depth: "medium",
      preferences: ["案例丰富", "实践方法"],
      source: "topic",
      topic_id: "topic-explore-level",
    },
    created_at: "2026-08-10T04:00:00Z",
    updated_at: "2026-08-10T04:00:00Z",
    book_count: 8,
    bookmarked_count: 5,
    updated_label: "更新于 3 天前",
    icon: "game",
    category: "关卡设计",
    cover_colors: ["#3B82F6", "#EF4444", "#F59E0B"],
  },
  {
    id: "topic-forest",
    user_id: "user-demo",
    title: "森林关卡空间引导",
    context_text: "研究开放森林关卡中地标、路径与玩家导航的设计方法。",
    context: {
      raw_prompt: "我这周想快速了解关卡中的空间引导，希望案例多一点，不要太理论。",
      goal: "学习空间引导",
      themes: ["关卡设计", "玩家导航", "空间引导"],
      time_horizon: "本周",
      session_minutes: 25,
      session_minutes_min: 20,
      session_minutes_max: 30,
      depth: "light",
      preferences: ["案例优先", "低理论密度"],
      source: "topic",
      topic_id: "topic-forest",
    },
    created_at: "2026-08-12T02:24:00Z",
    updated_at: "2026-08-12T02:24:00Z",
    book_count: 7,
    bookmarked_count: 5,
    updated_label: "更新于今天 10:24",
    icon: "forest",
    category: "关卡设计",
    cover_colors: ["#3B82F6", "#10B981", "#F59E0B"],
  },
  {
    id: "topic-systems",
    user_id: "user-demo",
    title: "游戏系统设计入门",
    context_text: "从经济、进度与社交系统入手，建立完整的设计词汇表。",
    context: {
      goal: "建立系统设计框架",
      themes: ["游戏设计", "系统设计"],
      session_minutes: 35,
      depth: "medium",
      preferences: ["理论框架", "案例对照"],
      source: "topic",
      topic_id: "topic-systems",
    },
    created_at: "2026-08-09T08:00:00Z",
    updated_at: "2026-08-11T12:00:00Z",
    book_count: 9,
    bookmarked_count: 6,
    updated_label: "更新于昨天 12:00",
    icon: "loop",
    category: "游戏设计",
    cover_colors: ["#2563EB", "#7C3AED", "#059669"],
  },
  {
    id: "topic-shader",
    user_id: "user-demo",
    title: "Unity Shader 入门笔记",
    context_text: "整理常用 Shader 思路与关卡氛围表现相关的技术阅读。",
    context: {
      goal: "补齐 Shader 基础",
      themes: ["引擎开发", "渲染"],
      session_minutes: 40,
      depth: "deep",
      preferences: ["动手实践"],
      source: "topic",
      topic_id: "topic-shader",
    },
    created_at: "2026-08-07T09:00:00Z",
    updated_at: "2026-08-08T09:00:00Z",
    book_count: 5,
    bookmarked_count: 2,
    updated_label: "更新于 5 天前",
    icon: "code",
    category: "引擎开发",
    cover_colors: ["#0EA5E9", "#334155", "#22D3EE"],
  },
  {
    id: "topic-ai-level",
    user_id: "user-demo",
    title: "AI 辅助关卡生成调研",
    context_text: "了解程序化内容生成与 AI 工具在关卡原型中的用法。",
    context: {
      goal: "评估 AI 关卡工作流",
      themes: ["AI与技术", "关卡设计"],
      session_minutes: 30,
      depth: "medium",
      preferences: ["前沿案例"],
      source: "topic",
      topic_id: "topic-ai-level",
    },
    created_at: "2026-08-06T10:00:00Z",
    updated_at: "2026-08-09T16:00:00Z",
    book_count: 6,
    bookmarked_count: 3,
    updated_label: "更新于 4 天前",
    icon: "spark",
    category: "AI与技术",
    cover_colors: ["#6366F1", "#A855F7", "#EC4899"],
  },
  {
    id: "topic-myth",
    user_id: "user-demo",
    title: "东方神话世界观",
    context_text: "整理东方神话母题、神兽体系与世界观构建参考。",
    context: {
      goal: "构建东方神话世界观",
      themes: ["世界观", "叙事", "神话"],
      session_minutes: 30,
      preferences: ["灵感", "设定参考"],
      source: "topic",
      topic_id: "topic-myth",
    },
    created_at: "2026-08-10T08:00:00Z",
    updated_at: "2026-08-11T10:00:00Z",
    book_count: 6,
    bookmarked_count: 4,
    updated_label: "更新于昨天 18:10",
    icon: "myth",
    category: "游戏设计",
    cover_colors: ["#8B5CF6", "#EC4899", "#F97316"],
  },
  {
    id: "topic-team",
    user_id: "user-demo",
    title: "团队管理学习",
    context_text: "提升小团队协作、反馈与目标对齐能力。",
    context: {
      goal: "提升团队管理能力",
      themes: ["团队管理", "协作"],
      session_minutes: 20,
      depth: "medium",
      preferences: ["实践方法"],
      source: "topic",
      topic_id: "topic-team",
    },
    created_at: "2026-08-08T09:15:00Z",
    updated_at: "2026-08-09T09:15:00Z",
    book_count: 5,
    bookmarked_count: 3,
    updated_label: "更新于 3 天前",
    icon: "team",
    category: "个人成长",
    cover_colors: ["#0EA5E9", "#6366F1", "#14B8A6"],
  },
  {
    id: "topic-growth",
    user_id: "user-demo",
    title: "产品思维阅读清单",
    context_text: "用产品与用户视角回看设计决策，沉淀可迁移的阅读笔记。",
    context: {
      goal: "补产品思维",
      themes: ["个人成长", "产品"],
      session_minutes: 15,
      depth: "light",
      preferences: ["轻松阅读"],
      source: "topic",
      topic_id: "topic-growth",
    },
    created_at: "2026-08-05T08:00:00Z",
    updated_at: "2026-08-07T08:00:00Z",
    book_count: 4,
    bookmarked_count: 2,
    updated_label: "更新于 6 天前",
    icon: "growth",
    category: "个人成长",
    cover_colors: ["#14B8A6", "#0EA5E9", "#F59E0B"],
  },
];

export const mockExploreBooks: ExploreBook[] = [
  ...mockBooks,
  {
    id: "book-norman",
    title: "设计心理学",
    author: "Don Norman",
    rating: 8.6,
    tags: ["设计思维", "心理学", "经典"],
    cover_color: "#0F766E",
    difficulty: "light",
    reading_minutes: 20,
    content_style: ["theory", "case"] as ContentStyle[],
    description: "从日常物品出发讲清可用性与用户心智模型，适合产品与关卡引导参考。",
  },
  {
    id: "book-cialdini",
    title: "影响力",
    author: "Robert Cialdini",
    rating: 8.7,
    tags: ["心理学", "说服力", "经典"],
    cover_color: "#B45309",
    difficulty: "medium",
    reading_minutes: 35,
    content_style: ["theory", "case"] as ContentStyle[],
    description: "揭示互惠、承诺、社会认同等说服原则，可迁移到新手引导与留存设计。",
  },
  {
    id: "book-threebody",
    title: "三体",
    author: "刘慈欣",
    rating: 9.4,
    tags: ["科幻", "经典", "休闲"],
    cover_color: "#1E3A8A",
    difficulty: "medium",
    reading_minutes: 45,
    content_style: ["inspiration"] as ContentStyle[],
    description: "硬核科幻与宏大设定，适合需要世界观灵感与节奏张力时阅读。",
  },
].map(
  (b): ExploreBook => ({
    id: b.id,
    title: b.title,
    author: b.author,
    rating: b.rating,
    tags: b.tags,
    cover_color: b.cover_color,
    difficulty: (b.difficulty ?? null) as ReadingDepth | null,
    reading_minutes: b.reading_minutes ?? null,
    content_style: (b.content_style ?? []) as ContentStyle[],
    description: b.description ?? null,
  })
);

export const mockExplore: ExploreItem[] = [
  {
    id: "explore-1",
    title: "系统设计入门",
    description: "从经济系统到社交机制，帮你建立完整的设计词汇表。",
    tag: "游戏设计",
  },
  {
    id: "explore-2",
    title: "玩家动机与留存",
    description: "理解内在动机与外在激励，优化新手引导与长期留存。",
    tag: "产品",
  },
  {
    id: "explore-3",
    title: "视觉叙事技巧",
    description: "用构图、色彩与光影讲故事，适合关卡与过场设计。",
    tag: "美术",
  },
];

/** 非收藏反馈；收藏见 seedBookmarksFromTopics / bookmarks */
export const mockUserBookActions: UserBookAction[] = [];

function makeTopicBook(
  id: string,
  topicId: string,
  bookId: string,
  opts: {
    rank: number;
    match_score: number;
    match_reason: string;
    matched_tags?: string[];
    user_status?: TopicBook["user_status"];
  },
): TopicBook {
  const book = bookById[bookId];
  return {
    id,
    topic_id: topicId,
    book_id: bookId,
    match_score: opts.match_score,
    match_reason: opts.match_reason,
    matched_tags: opts.matched_tags ?? book?.tags?.slice(0, 3) ?? [],
    rank: opts.rank,
    explain: {
      theme_fit: "与当前专题主题相关",
      time_fit: "可按章节碎片阅读",
      style: "案例 + 方法",
    },
    created_at: "2026-08-12T02:30:00Z",
    book,
    user_status: opts.user_status ?? null,
  };
}

/** 每个专题至少有收藏 + 新推荐，供详情页概览展示 */
export const mockTopicBooks: Record<string, TopicBook[]> = {
  "topic-explore-level": [
    makeTopicBook("tb-el-1", "topic-explore-level", "book-levelup", {
      rank: 1,
      match_score: 95,
      match_reason:
        "大量探索节奏与奖励分布案例，贴合「探索性关卡」目标，可按章节碎片阅读。",
      user_status: "bookmarked",
    }),
    makeTopicBook("tb-el-2", "topic-explore-level", "book-lynch", {
      rank: 2,
      match_score: 92,
      match_reason: "地标与路径理论可直接迁移到开放关卡的导航设计。",
      user_status: "bookmarked",
    }),
    makeTopicBook("tb-el-3", "topic-explore-level", "book-swink", {
      rank: 3,
      match_score: 86,
      match_reason: "反馈与手感章节帮助你把探索奖励做得「摸得到」。",
      user_status: "bookmarked",
    }),
    makeTopicBook("tb-el-4", "topic-explore-level", "book-schell", {
      rank: 4,
      match_score: 90,
      match_reason:
        "设计透镜可帮你系统拆解探索动机；篇幅适合中等投入阅读。",
      user_status: null,
    }),
    makeTopicBook("tb-el-5", "topic-explore-level", "book-flow", {
      rank: 5,
      match_score: 84,
      match_reason: "挑战—技能平衡视角，适合校准探索难度曲线。",
      user_status: null,
    }),
  ],
  "topic-forest": [
    makeTopicBook("tb-1", "topic-forest", "book-lynch", {
      rank: 1,
      match_score: 96,
      match_reason:
        "本书系统介绍地标、路径和空间认知，并包含大量实际案例，符合当前「案例优先、短期学习」的需求。",
      matched_tags: ["空间引导", "关卡设计", "案例"],
      user_status: "bookmarked",
    }),
    makeTopicBook("tb-2", "topic-forest", "book-levelup", {
      rank: 2,
      match_score: 88,
      match_reason: "实践案例丰富，适合快速建立关卡结构语感。",
      matched_tags: ["关卡设计", "实践案例"],
      user_status: "bookmarked",
    }),
    makeTopicBook("tb-3", "topic-forest", "book-schell", {
      rank: 3,
      match_score: 82,
      match_reason: "用透镜思维复盘森林关卡的引导与节奏。",
      user_status: null,
    }),
    makeTopicBook("tb-4", "topic-forest", "book-swink", {
      rank: 4,
      match_score: 80,
      match_reason: "补充操作反馈维度，让导航提示更「有手感」。",
      user_status: null,
    }),
  ],
  "topic-systems": [
    makeTopicBook("tb-sys-1", "topic-systems", "book-schell", {
      rank: 1,
      match_score: 94,
      match_reason: "系统讲解机制与循环，是系统设计入门的主干读物。",
      user_status: "bookmarked",
    }),
    makeTopicBook("tb-sys-2", "topic-systems", "book-flow", {
      rank: 2,
      match_score: 85,
      match_reason: "用心流校准进度与难度系统的长期动机。",
      user_status: "bookmarked",
    }),
    makeTopicBook("tb-sys-3", "topic-systems", "book-levelup", {
      rank: 3,
      match_score: 81,
      match_reason: "案例帮你把抽象系统落到可玩结构上。",
      user_status: null,
    }),
  ],
  "topic-shader": [
    makeTopicBook("tb-sh-1", "topic-shader", "book-swink", {
      rank: 1,
      match_score: 78,
      match_reason: "手感与反馈章节可对照材质/特效的「可感知性」。",
      user_status: "bookmarked",
    }),
    makeTopicBook("tb-sh-2", "topic-shader", "book-schell", {
      rank: 2,
      match_score: 72,
      match_reason: "美学透镜帮助你把 Shader 选择对齐玩法表达。",
      user_status: null,
    }),
  ],
  "topic-ai-level": [
    makeTopicBook("tb-ai-1", "topic-ai-level", "book-schell", {
      rank: 1,
      match_score: 80,
      match_reason: "用设计透镜评估 AI 生成内容是否「好玩」而非只是「能生成」。",
      user_status: "bookmarked",
    }),
    makeTopicBook("tb-ai-2", "topic-ai-level", "book-levelup", {
      rank: 2,
      match_score: 76,
      match_reason: "关卡结构案例可当作 AI 生成结果的校验清单。",
      user_status: null,
    }),
  ],
  "topic-myth": [
    makeTopicBook("tb-my-1", "topic-myth", "book-flow", {
      rank: 1,
      match_score: 70,
      match_reason: "最优体验框架可用来设计神话叙事中的沉浸节奏。",
      user_status: "bookmarked",
    }),
    makeTopicBook("tb-my-2", "topic-myth", "book-schell", {
      rank: 2,
      match_score: 74,
      match_reason: "故事与世界观相关透镜，适合东方神话设定拆解。",
      user_status: null,
    }),
  ],
  "topic-team": [
    makeTopicBook("tb-tm-1", "topic-team", "book-schell", {
      rank: 1,
      match_score: 68,
      match_reason: "协作与评审相关章节，可迁移到小团队设计沟通。",
      user_status: "bookmarked",
    }),
    makeTopicBook("tb-tm-2", "topic-team", "book-flow", {
      rank: 2,
      match_score: 66,
      match_reason: "理解成员挑战—技能匹配，有助于分配任务难度。",
      user_status: null,
    }),
  ],
  "topic-growth": [
    makeTopicBook("tb-gr-1", "topic-growth", "book-flow", {
      rank: 1,
      match_score: 75,
      match_reason: "用最优体验理解用户与个人成长节奏，轻松可读。",
      user_status: "bookmarked",
    }),
    makeTopicBook("tb-gr-2", "topic-growth", "book-schell", {
      rank: 2,
      match_score: 70,
      match_reason: "产品/体验视角拆解设计决策，适合补产品思维。",
      user_status: null,
    }),
  ],
};

export const mockRecommendationSession: RecommendationSession = {
  id: "session-demo",
  user_id: "user-demo",
  raw_prompt:
    "我这周想快速了解关卡中的空间引导，希望案例多一点，不要太理论。",
  context: mockTopics[0].context,
  created_at: "2026-08-12T02:20:00Z",
};

/** 详情页结构化字段（按 book id 叠加到 Book 上） */
export const mockBookDetails: Record<
  string,
  Partial<Omit<BookDetail, keyof Book>>
> = {
  "book-levelup": {
    subtitle: "从关卡节奏到敌人配置，用大量实战案例讲透游戏设计方法",
    translator: "李明",
    publisher: "人民邮电出版社",
    published_date: "2019-06",
    pages: 272,
    isbn: "978-7-115-51234-5",
    rating_count: 126,
    badge: "高分推荐",
    why_fit: [
      "案例密度高，直接对应你的「关卡设计」与「节奏控制」目标",
      "章节可拆成 20–30 分钟阅读块，适合本周快速补齐",
      "偏实操方法，理论负担低，和你偏好的轻理论一致",
    ],
    content_intro:
      "作者以多年一线经验，系统讲解关卡结构、敌人配置、奖励节奏与玩家引导。书中大量截图与拆解案例，适合边读边对照自己的关卡迭代。",
    takeaways: [
      "关卡「目标—障碍—奖励」三段节奏模板",
      "敌人配置与难度曲线的可执行检查表",
      "空间引导中的地标、视线与路径设计要点",
      "可复用的关卡评审问题清单",
      "短时阅读下的章节拆读建议",
    ],
    toc: [
      "第1章 游戏设计思维入门",
      "第2章 关卡节奏与玩家动机",
      "第3章 空间引导与地标设计",
      "第4章 敌人与挑战配置",
      "第5章 奖励、进度与回流",
      "第6章 案例拆解：平台跳跃",
      "第7章 案例拆解：探索关卡",
      "第8章 原型与快速迭代",
      "第9章 关卡评审清单",
      "第10章 从阅读到落地练习",
    ],
    scenarios: [
      "关卡设计迭代期",
      "需要快速补案例时",
      "单次 20–30 分钟碎片阅读",
    ],
    updated_label: "3 天前",
  },
  "book-lynch": {
    subtitle: "经典的城市空间认知与路径、地标研究",
    translator: "方益萍 / 何晓军",
    publisher: "华夏出版社",
    published_date: "2001-04",
    pages: 215,
    isbn: "978-7-5080-2398-2",
    rating_count: 892,
    badge: "高分推荐",
    why_fit: [
      "地标、路径、区域概念可直接迁移到关卡空间引导",
      "案例与图示丰富，适合对照自己的关卡草图阅读",
      "篇幅适中，可按章节拆读",
    ],
    content_intro:
      "林奇提出的城市意象五要素（路径、边界、区域、节点、地标），是理解玩家如何「读懂空间」的经典框架。",
    takeaways: [
      "五要素在关卡中的对应物",
      "可识别性与心理地图",
      "节点与地标的层级设计",
    ],
    toc: [
      "第1章 城市的意象",
      "第2章 意象的构成要素",
      "第3章 波士顿、德泽西城与洛杉矶",
      "第4章 城市形态",
      "第5章 新的尺度",
    ],
    scenarios: ["空间引导调研", "开放世界地标规划"],
    updated_label: "1 周前",
  },
  "book-schell": {
    subtitle: "系统讲解游戏机制、循环与设计透镜",
    publisher: "电子工业出版社",
    published_date: "2016-03",
    pages: 520,
    rating_count: 540,
    badge: "经典入门",
    why_fit: [
      "覆盖机制、美学、故事与技术的完整视角",
      "「设计透镜」可直接用于评审你的关卡与系统",
    ],
    content_intro:
      "一本游戏设计百科式入门书，适合建立完整词汇表，再按需深挖感兴趣的章节。",
    takeaways: ["设计透镜清单", "体验驱动的机制设计", "团队协作中的设计沟通"],
    toc: [
      "第1章 游戏设计师是什么",
      "第2章 设计师的角色",
      "第3章 游戏体验",
      "第4章 游戏机制",
      "第5章 设计透镜",
    ],
    scenarios: ["建立设计词汇表", "系统评审会前预习"],
    updated_label: "5 天前",
  },
};

/**
 * 首页 / 新搜索：偏「完整需求」的短句（一行展示会截断，点击填入全文）。
 * 文案参考常见 AI 对话示例：场景 + 目标，比单关键词更清晰。
 */
export const suggestPrompts = [
  "想系统学游戏设计：玩法、原型和平衡",
  "关卡里玩家容易迷路，想学空间引导",
] as const;

export const exploreFilters = [
  "全部",
  "题材",
  "阅读目的",
  "可用时间",
  "难度",
] as const;
