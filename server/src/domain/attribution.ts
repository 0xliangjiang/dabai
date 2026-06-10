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
      copyEventId: string;
      reason: "single_candidate_inside_window";
    }
  | {
      status: "pending_review";
      confidence: number;
      userId?: string;
      conversionId?: string;
      copyEventId?: string;
      reason: "multiple_candidates_inside_window" | "candidate_outside_window";
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
