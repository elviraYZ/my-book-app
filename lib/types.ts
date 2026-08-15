/** 阅读深度（画像偏好 / Context / 书籍难度共用） */
export type ReadingDepth = "light" | "medium" | "deep";

/** 内容风格：方法 / 案例 / 理论 / 灵感 */
export type ContentStyle = "method" | "case" | "theory" | "inspiration";

/** 推荐来源 */
export type ContextSource = "ai_input" | "explore_filter" | "topic";

/**
 * 用户对书的反馈状态（列表 join 用）。
 * 收藏以 Bookmark / bookmarks 表为准；此处 bookmarked 为派生展示态。
 * 「已读」已从产品移除，不再使用。
 */
export type UserBookStatus = "bookmarked" | "disliked";

/** @deprecated 兼容旧 UI；新代码请用 UserBookStatus + TopicBook */
export type BookStatus = "recommend" | UserBookStatus;

// ---------------------------------------------------------------------------
// Profile — 长期画像（onboarding）
// ---------------------------------------------------------------------------

export type Profile = {
  id: string;
  /** 岗位，可多选 — 必选 */
  roles: string[];
  /** 长期兴趣 — 必选 */
  interests: string[];
  /** 通常为什么读书 — 可选 */
  reading_purposes: string[];
  /** 偏好阅读深度 — 可选 */
  reading_depth: ReadingDepth | null;
  created_at: string;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// Context — 当前需求（AI 提取 / 专题保存）
// ---------------------------------------------------------------------------

/** 推荐会话中的一条自然语言需求（首轮 / 补充） */
export type ContextTurn = {
  id: string;
  text: string;
  created_at: string;
  source?: "initial" | "refine";
};

export type RecommendContext = {
  raw_prompt?: string;
  /** 收到过的全部需求原文（按时间） */
  turns?: ContextTurn[];
  goal?: string;
  /** 阅读目标（可多选） */
  goals?: string[];
  /** 正式主题（canonical taxonomy） */
  themes?: string[];
  /**
   * 本次关注：具体场景/对象/问题（如森林、空间引导）。
   * 不进书库 taxonomy，只服务本轮召回与评分。
   */
  keywords?: string[];
  time_horizon?: string;
  /** 单次可读时长（分钟），可用区间中值或上限 */
  session_minutes?: number;
  session_minutes_min?: number;
  session_minutes_max?: number;
  /** 时长分档：15 | 30 | 60 | 90（与探索筛选一致） */
  session_bucket?: string | null;
  depth?: ReadingDepth;
  preferences?: string[];
  special_notes?: string;
  source?: ContextSource;
  topic_id?: string | null;
  /** 列表展示用 UI 元数据（落在 context jsonb，非独立列） */
  ui?: {
    icon?: "forest" | "myth" | "team" | "loop" | "art" | "game" | "code" | "spark" | "growth";
    category?: string;
    cover_colors?: string[];
  };
};

// ---------------------------------------------------------------------------
// Book — 书籍本体
// ---------------------------------------------------------------------------

export type Book = {
  id: string;
  external_id?: string | null;
  title: string;
  author?: string | null;
  cover_url?: string | null;
  description?: string | null;
  tags: string[];
  reading_minutes?: number | null;
  difficulty?: ReadingDepth | null;
  content_style: ContentStyle[];
  rating?: number | null;
  created_at: string;
  /** UI 占位色（非 DB 字段） */
  cover_color?: string;
  /**
   * 推荐用短摘要（enrichment；可内存生成，MVP 可不落库）。
   * 统一评分前应尽量有值，避免新书裸数据吃亏。
   */
  display_summary?: string | null;
  /** 适用场景枚举：工作调研 / 快速入门 / 找灵感等 */
  use_cases?: string[];
  /** 主题材（topics 子集） */
  primary_topics?: string[];
  /** 自由概念（非 taxonomy；与 use_cases 分开） */
  concepts?: string[];
};

/** 书籍详情页展示（在 Book 上叠加出版信息与结构化解读） */
export type BookDetail = Book & {
  subtitle?: string | null;
  translator?: string | null;
  publisher?: string | null;
  published_date?: string | null;
  pages?: number | null;
  isbn?: string | null;
  isbn_10?: string | null;
  language?: string | null;
  preview_url?: string | null;
  info_url?: string | null;
  /** 同一作品下的版本数（含当前代表版） */
  edition_count?: number;
  rating_count?: number;
  /** 角标，如「高分推荐」 */
  badge?: string | null;
  why_fit?: string[];
  content_intro?: string | null;
  takeaways?: string[];
  toc?: string[];
  scenarios?: string[];
  updated_label?: string;
};

// ---------------------------------------------------------------------------
// Topic — 专题
// ---------------------------------------------------------------------------

export type Topic = {
  id: string;
  user_id?: string;
  title: string;
  context_text: string;
  context: RecommendContext;
  created_at: string;
  updated_at?: string;
  /** 以下为列表页展示用聚合字段（非必落库） */
  book_count?: number;
  bookmarked_count?: number;
  updated_label?: string;
  icon?: "forest" | "myth" | "team" | "loop" | "art" | "game" | "code" | "spark" | "growth";
  /** 列表侧栏分类（如：游戏设计、关卡设计） */
  category?: string;
  cover_colors?: string[];
};

// ---------------------------------------------------------------------------
// Recommendation session + topic_books（推荐结果）
// ---------------------------------------------------------------------------

export type RecommendationExplain = {
  theme_fit?: string;
  time_fit?: string;
  depth_fit?: string;
  style?: string;
};

/**
 * Context 多维软评分子分（0–1 连续值）。
 * 仅推荐响应回传，MVP 不落库。
 */
export type DimensionScores = {
  /** 合成后的 topic 软分（canonical+keyword+semantic） */
  topicScore: number;
  canonicalTopicScore?: number;
  keywordScore?: number;
  semanticScore?: number;
  /** 原始 cosine similarity（若有） */
  semanticSimilarity?: number;
  /**
   * Absolute / core：仅 topic+keyword+semantic（0–1）。
   */
  coreRelevance?: number;
  /** gate 施加的上限；100 表示未封顶 */
  matchScoreCap?: number;
  explicitCoreScore?: number;
  inferredCoreScore?: number;
  admittedByCoreGate?: boolean;
  rawSemanticSimilarity?: number;
  rejectReason?: string | null;
  goalScore: number;
  profileScore: number;
  styleScore: number;
  difficultyScore: number;
  timeScore: number;
  /**
   * 用户可见匹配度 0–100：core 维 + goal/style/depth/time，不含 Profile。
   * 与 matchScore 同值（兼容旧字段）。
   */
  contextMatchScore?: number;
  /** 排序用：contextMatchScore + Profile 微调 */
  sortScore?: number;
  /** 强相关 / 较相关 / 弱相关（只解释分数） */
  relevanceBand?: "strong" | "medium" | "weak";
  /** @deprecated 请用 contextMatchScore；现等于 contextMatchScore */
  matchScore: number;
};

/**
 * LLM / 规则解析后的结构化需求（排序仍由本地 scoring 决定）。
 * searchQueries 仅在本地不足时用于外部补库，不直接展示给用户。
 */
export type StructuredDemandContext = {
  /** 正式主题并集（explicit ∪ inferred），供召回 */
  topics: string[];
  /** 关键词并集（explicit ∪ inferred），供召回；不写入 taxonomy */
  keywords: string[];
  /** 用户原话 / 手选中可证实的正式题材 */
  explicitTopics?: string[];
  /** LLM/Profile 补全的题材（降权，不能单独过强 gate） */
  inferredTopics?: string[];
  /** 用户原话中的自由关注 */
  explicitKeywords?: string[];
  /** 系统补全的自由关注 */
  inferredKeywords?: string[];
  /** 未明确时可为空串；勿脑补。多目标时取 goals[0] 兼容旧路径 */
  goal: string;
  /** 阅读目标（可多选）；空 = 用户未说 */
  goals?: string[];
  styles: string[];
  difficulty: ReadingDepth | null;
  time: string | null;
  exclusions: string[];
  /** 内部检索用，由 topics + keywords 生成 */
  searchQueries: string[];
  /** 0–1：需求可解析置信度；短/歧义 prompt 应偏低 */
  intentConfidence?: number;
};

export type RecommendationSession = {
  id: string;
  user_id: string;
  raw_prompt: string;
  context: RecommendContext;
  created_at: string;
};

/** 专题/会话下的推荐条目（对应 topic_books） */
export type TopicBook = {
  id: string;
  topic_id?: string | null;
  session_id?: string | null;
  book_id: string;
  match_score?: number | null;
  /** 强相关 / 较相关 / 弱相关（解释 match_score，不改分） */
  relevance_band?: "strong" | "medium" | "weak" | null;
  match_reason?: string | null;
  matched_tags: string[];
  rank?: number | null;
  explain: RecommendationExplain;
  /**
   * 多维子分（仅推荐响应；sync 专题时可省略，不强制落库）。
   */
  scores?: DimensionScores;
  created_at: string;
  /** join books 后的展示字段 */
  book?: Book;
  /** 用户对该书的反馈（收藏派生自 bookmarks；不感兴趣来自 user_book_actions） */
  user_status?: UserBookStatus | null;
};

/**
 * 非收藏类反馈（当前仅「不感兴趣」）。
 * 收藏请用 Bookmark，勿再把 bookmarked 写入本表作为唯一数据源。
 */
export type UserBookAction = {
  id: string;
  user_id: string;
  book_id: string;
  status: "disliked";
  topic_id?: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * 全局收藏（对应 DB：bookmarks + bookmark_topics）。
 * 所有被保存的书都属于「我的收藏」；topic_ids 为同时归入的专题（可多选，可为空）。
 */
export type Bookmark = {
  id: string;
  book_id: string;
  topic_ids: string[];
  created_at: string;
  updated_at: string;
  book?: Book;
};

// ---------------------------------------------------------------------------
// API / 探索 UI
// ---------------------------------------------------------------------------

export type RecommendRequest = {
  /**
   * 首轮：完整需求；
   * 结果页再推：仅本次补充文本（可空，表示只改标签/约束）
   */
  prompt: string;
  topic_id?: string;
  /** 已有需求轮次（再推时传入，用于追加历史） */
  previous_turns?: ContextTurn[];
  /** 用户在结果页调整后的正式主题（白名单） */
  themes?: string[];
  /** 本次关注（自由词，可编辑） */
  keywords?: string[];
  /** 阅读目标（可多选；与 goal 二选一，goals 优先） */
  goals?: string[];
  /** @deprecated 用 goals；单目标兼容 */
  goal?: string;
  /** 标准偏好标签（同样来自标签库） */
  preferences?: string[];
  depth?: ReadingDepth | null;
  session_bucket?: string | null;
  /** 自由补充备注（会并入本轮 turn 或 special_notes） */
  special_notes?: string;
  profile?: Pick<
    Profile,
    "roles" | "interests" | "reading_purposes" | "reading_depth"
  >;
};

export type RecommendResponse = {
  ok: boolean;
  session_id?: string;
  context: RecommendContext;
  /** 本轮解析出的结构化需求（便于调试 / 后续 LLM 替换） */
  demand?: StructuredDemandContext;
  books: TopicBook[];
  /** 命中总数（可大于本次返回的 books.length） */
  total_count?: number;
  message?: string;
  /** 是否因本地不足触发了外部补库（MVP 在线默认 false） */
  ingested?: boolean;
  ingested_count?: number;
  /** Coverage：GOOD / THIN / GAP（后台 logging；前台勿直接展示） */
  coverage_status?: "GOOD" | "THIN" | "GAP";
  /** 最高 contextMatchScore（真实分） */
  top_context_match?: number;
  /**
   * Intent Specificity：需求有多具体（不进匹配分）。
   */
  context_specificity?: "LOW" | "MEDIUM" | "HIGH";
  /**
   * 前台 tip 仲裁：none | refinement（可细化）| coverage_gap（库不够）。
   */
  ui_tip?: "none" | "refinement" | "coverage_gap";
  /**
   * @deprecated 用 ui_tip === "coverage_gap"
   */
  show_coverage_tip?: boolean;
  /** 仅 development 返回；正式 UI 不展示 */
  debug?: {
    requestId?: string;
    lexicalCandidateCount?: number;
    semanticCandidateCount?: number;
    primaryCandidateCount?: number;
    unionCandidateCount?: number;
    recallLimitK?: number;
    queryEmbeddingUsed?: boolean;
    /** bookId → 原始 cosine similarity */
    semanticSimilarity?: Record<string, number>;
    /** 足够性与补库诊断（一律基于 raw / absolute） */
    sufficiency?: {
      rawTopScore: number;
      displayTopScore: number;
      qualifiedCountRaw60: number;
      topicCoverage: number;
      keywordCoverage: number;
      semanticCoverage?: number;
      coreContextHits?: number;
      keywordEvidenceHits?: number;
      semanticStrongHits?: number;
      localAbsoluteHits?: number;
      googleTriggered: boolean;
      ingestedWorks: number;
      enough: boolean;
      reasons?: string[];
    };
    /** absolute gate 拒绝样本（dev） */
    rejects?: Array<{
      bookId: string;
      title: string;
      tags?: string[];
      rejectReason: string | null;
      explicitCoreScore: number;
      inferredCoreScore: number;
      coreRelevance: number;
      rawSemanticSimilarity: number;
      topicScore?: number;
      keywordScore?: number;
    }>;
    /** Top N 最终六维分 */
    scores?: Array<{
      bookId: string;
      matchScore: number;
      displayMatchScore?: number;
      topicScore: number;
      canonicalTopicScore?: number;
      keywordScore?: number;
      semanticScore?: number;
      coreRelevance?: number;
      explicitCoreScore?: number;
      inferredCoreScore?: number;
      rawSemanticSimilarity?: number;
      admittedByCoreGate?: boolean;
      rejectReason?: string | null;
      matchScoreCap?: number;
      goalScore: number;
      profileScore: number;
      styleScore: number;
      difficultyScore: number;
      timeScore: number;
    }>;
    /** 各阶段耗时（ms）与 AI 调用次数 */
    timing?: {
      requestId: string;
      totalMs: number;
      contextLlmMs: number;
      queryEmbeddingMs: number;
      semanticBuildQueryMs: number;
      semanticEmbeddingMs: number;
      lexicalRecallMs: number;
      semanticRecallMs: number;
      semanticRpcMs: number;
      semanticFetchWorksMs: number;
      semanticMergeMs: number;
      scoreMs: number;
      sufficiencyMs: number;
      googleIngestMs: number;
      newBookEmbeddingMs: number;
      rerankMs: number;
      contextLlmCalls: number;
      queryEmbeddingCalls: number;
      newBookEmbeddingCalls: number;
      semanticRpcCalls: number;
      semanticWorkFetchCalls: number;
    };
  };
};

/** 首页 / 探索页书籍卡片（可由 Book 投影） */
export type ExploreBook = Pick<
  Book,
  | "id"
  | "title"
  | "author"
  | "rating"
  | "tags"
  | "cover_color"
  | "cover_url"
  | "difficulty"
  | "reading_minutes"
  | "content_style"
  | "description"
>;

/** 探索筛选条件（购物站式多选；空数组 = 不限） */
export type ExploreFilters = {
  genres: string[];
  purposes: string[];
  times: string[];
  difficulties: string[];
};

export type ExploreItem = {
  id: string;
  title: string;
  description: string;
  tag: string;
};
