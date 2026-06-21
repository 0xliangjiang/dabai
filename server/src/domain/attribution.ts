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
      reason: "multiple_candidates_inside_window" | "candidate_outside_window" | "title_match_multiple";
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

// 标题匹配：精确相等，或一个是另一个的前缀（转化标题常被折淘客截断成订单标题前缀）。
// 两边都要 ≥8 字，避免通用短词误判。
export function titleMatches(a: string, b: string): boolean {
  const x = a.trim();
  const y = b.trim();
  if (x.length < 8 || y.length < 8) return false;
  return x === y || x.startsWith(y) || y.startsWith(x);
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

  if (insideWindow.length === 1) {
    const [event] = insideWindow;
    return {
      status: "auto_matched",
      confidence: 1,
      userId: event.userId,
      conversionId: event.conversionId,
      copyEventId: event.id,
      reason: "single_candidate_inside_window"
    };
  }

  if (insideWindow.length > 1) {
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
