/**
 * 匹配度展示校准（仅 UI）。
 * 不改变 scoreCandidate / 排序；只把 raw matchScore 映射到更易读的展示区间。
 *
 * 目标大致：
 * - 强相关 Top：约 85–95
 * - 中等相关：约 65–80
 * - 弱相关：低于 60
 */

/** 单分映射到展示带（仍保持 raw 单调性倾向） */
export function mapRawMatchToDisplayBand(raw: number): number {
  const r = Math.max(0, Math.min(100, raw));
  if (r >= 70) {
    // 70 → 85，100 → 95
    return Math.round(85 + ((r - 70) / 30) * 10);
  }
  if (r >= 50) {
    // 50 → 65，70 → 80
    return Math.round(65 + ((r - 50) / 20) * 15);
  }
  if (r >= 30) {
    // 30 → 42，50 → 59
    return Math.round(42 + ((r - 30) / 20) * 17);
  }
  // 0 → 18，30 → 40
  return Math.round(18 + (r / 30) * 22);
}

/**
 * 对已按 raw 降序排列的列表做展示分校准，并强制展示分非递增（不打乱序）。
 */
/**
 * 将校准后的原始匹配分映射为展示用百分数。
 * @deprecated AI Search 已直接展示 contextMatchScore；勿再调用。
 */
export function calibrateDisplayMatchScores(rawScoresDescending: number[]): number[] {
  if (rawScoresDescending.length === 0) return [];

  const mapped = rawScoresDescending.map(mapRawMatchToDisplayBand);

  // Top1 略抬、尾部略压，增强区分（仍不改变相对顺序）
  const n = mapped.length;
  if (n >= 2) {
    mapped[0] = Math.min(95, Math.max(mapped[0]!, 88));
  }
  if (n >= 3) {
    mapped[1] = Math.min(mapped[0]! - 1, Math.max(82, mapped[1]!));
  }

  for (let i = 1; i < mapped.length; i++) {
    if (mapped[i]! > mapped[i - 1]!) {
      mapped[i] = mapped[i - 1]!;
    }
  }

  // 弱相关档：raw < 50 的展示分压到 < 60
  for (let i = 0; i < mapped.length; i++) {
    const raw = rawScoresDescending[i] ?? 0;
    if (raw < 50 && mapped[i]! >= 60) {
      mapped[i] = Math.min(59, mapped[i]!);
    }
  }

  // 再次保证非递增
  for (let i = 1; i < mapped.length; i++) {
    if (mapped[i]! > mapped[i - 1]!) {
      mapped[i] = mapped[i - 1]!;
    }
  }

  return mapped.map((x) => Math.min(99, Math.max(1, x)));
}
