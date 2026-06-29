export type AttributionOrder = {
  id: string;
  itemId: string;
  paidAt: Date;
};

export type AttributionCopyEvent = {
  id: string;
  userId: string;
  conversionId: string;
  itemId: string;
  copiedAt: Date;
};

export type AttributionResult =
  | {
      status: "auto_matched";
      confidence: number;
      userId: string;
      conversionId: string;
      copyEventId?: string; // 转化/标题兜底匹配无真实复制事件，可空
      reason: "single_candidate_inside_window" | "title_match_single";
    }
  | {
      status: "pending_review";
      confidence: number;
      userId?: string;
      conversionId?: string;
      copyEventId?: string;
      reason:
        | "multiple_candidates_inside_window"
        | "candidate_outside_window"
        | "title_match_multiple"
        | "title_fuzzy_review";
    }
  | {
      status: "unmatched";
      confidence: 0;
      reason: "no_item_candidates";
    };

export type AttributionOptions = {
  windowHours?: number;
};

const DEFAULT_WINDOW_HOURS = 24;

// 去掉 copyEventId：转化/标题兜底匹配是基于「查询记录」而非「复制事件」，
// 候选的 id 是 conversion id，不能当 copyEventId 写库（否则外键报错）。
export function withoutCopyEvent(result: AttributionResult): AttributionResult {
  if (result.status === "auto_matched" || result.status === "pending_review") {
    const { copyEventId: _drop, ...rest } = result;
    return rest;
  }
  return result;
}

// 标题"同款"判断：转化标题(折淘客 jianjie，常带【】营销前缀/简称)与订单标题(淘宝长标题)
// 来源不同、词序/前缀/装饰各异，纯前缀匹配会漏。改为：去掉括号装饰后，以较短标题为基准，
// 其字符二元组(bigram)≥80% 出现在较长标题里即视为同款。容忍简称/词序差异；
// 误配靠 matchOrderAttribution 的「唯一候选 + 24h 窗」兜住（多候选→待复核，不自动发钱）。
// 自动归因阈值：≥ 此值视为同款（唯一候选才自动）；
// 复核阈值：≥ 此值、< 自动阈值视为"疑似同款"，进待复核由人工确认，不直接丢。
export const TITLE_MATCH_THRESHOLD = 0.8;
export const TITLE_REVIEW_THRESHOLD = 0.55;

// 标题相似度：去括号后以较短标题为基准，其字符二元组在较长标题里的占比（0~1）
export function titleSimilarity(a: string, b: string): number {
  const x = normalizeTitle(a);
  const y = normalizeTitle(b);
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length < 5) return 0; // 太短易撞通用词
  const shortGrams = bigramSet(short);
  if (shortGrams.size === 0) return 0;
  const longGrams = bigramSet(long);
  let shared = 0;
  for (const gram of shortGrams) if (longGrams.has(gram)) shared += 1;
  return shared / shortGrams.size;
}

export function titlesSameProduct(a: string, b: string): boolean {
  return titleSimilarity(a, b) >= TITLE_MATCH_THRESHOLD;
}

// 去掉成对括号及其内含的营销词、再去空白后比较（【益智早教抓握力】彩虹转转塔 → 彩虹转转塔）
function normalizeTitle(s: string): string {
  return s
    .replace(/[【[（(《「][^】\]）)》」]*[】\]）)》」]/g, "") // 成对括号连同内容
    .replace(/[【】[\]（）()《》「」\s]/g, "") // 残余的单边括号/空白
    .toLowerCase();
}

function bigramSet(s: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i + 1 < s.length; i += 1) set.add(s.slice(i, i + 2));
  return set;
}

export function matchOrderAttribution(
  order: AttributionOrder,
  copyEvents: AttributionCopyEvent[],
  options: AttributionOptions = {}
): AttributionResult {
  const windowHours = options.windowHours ?? DEFAULT_WINDOW_HOURS;
  const itemCandidates = copyEvents.filter((event) => event.itemId === order.itemId);

  if (itemCandidates.length === 0) {
    return {
      status: "unmatched",
      confidence: 0,
      reason: "no_item_candidates"
    };
  }

  const windowMs = windowHours * 60 * 60 * 1000;
  const insideWindow = itemCandidates.filter((event) => {
    const diff = order.paidAt.getTime() - event.copiedAt.getTime();
    return diff >= 0 && diff <= windowMs;
  });

  if (insideWindow.length >= 1) {
    // 窗内候选若都属于同一个用户（同一人多次查/复制同款），没有"归给谁"的歧义 → 自动归该用户；
    // 取窗内最近一条。只有候选跨多个不同用户时才进待复核。
    const distinctUsers = new Set(insideWindow.map((event) => event.userId));
    if (distinctUsers.size === 1) {
      const event = [...insideWindow].sort((a, b) => b.copiedAt.getTime() - a.copiedAt.getTime())[0];
      return {
        status: "auto_matched",
        confidence: 1,
        userId: event.userId,
        conversionId: event.conversionId,
        copyEventId: event.id,
        reason: "single_candidate_inside_window"
      };
    }
    return {
      status: "pending_review",
      confidence: 0.5,
      reason: "multiple_candidates_inside_window"
    };
  }

  const latestCandidate = itemCandidates
    .filter((event) => event.copiedAt.getTime() <= order.paidAt.getTime())
    .sort((left, right) => right.copiedAt.getTime() - left.copiedAt.getTime())[0];

  return {
    status: "pending_review",
    confidence: 0.25,
    userId: latestCandidate?.userId,
    conversionId: latestCandidate?.conversionId,
    copyEventId: latestCandidate?.id,
    reason: "candidate_outside_window"
  };
}
