import { describe, expect, test } from "vitest";
import { matchOrderAttribution } from "../src/domain/attribution.js";

const baseOrder = {
  id: "order-1",
  itemId: "item-100",
  paidAt: new Date("2026-06-06T08:00:00.000Z")
};

describe("matchOrderAttribution", () => {
  test("auto matches one copy event for the same item inside the attribution window", () => {
    const result = matchOrderAttribution(baseOrder, [
      {
        id: "copy-1",
        userId: "user-1",
        conversionId: "conversion-1",
        itemId: "item-100",
        copiedAt: new Date("2026-06-06T07:30:00.000Z")
      }
    ]);

    expect(result).toEqual({
      status: "auto_matched",
      confidence: 1,
      userId: "user-1",
      conversionId: "conversion-1",
      copyEventId: "copy-1",
      reason: "single_candidate_inside_window"
    });
  });

  test("requires review when multiple users copied the same item inside the window", () => {
    const result = matchOrderAttribution(baseOrder, [
      {
        id: "copy-1",
        userId: "user-1",
        conversionId: "conversion-1",
        itemId: "item-100",
        copiedAt: new Date("2026-06-06T07:30:00.000Z")
      },
      {
        id: "copy-2",
        userId: "user-2",
        conversionId: "conversion-2",
        itemId: "item-100",
        copiedAt: new Date("2026-06-06T07:40:00.000Z")
      }
    ]);

    expect(result.status).toBe("pending_review");
    expect(result.reason).toBe("multiple_candidates_inside_window");
    expect(result.confidence).toBeLessThan(1);
  });

  test("requires review when the only copy event is outside the attribution window", () => {
    const result = matchOrderAttribution(baseOrder, [
      {
        id: "copy-1",
        userId: "user-1",
        conversionId: "conversion-1",
        itemId: "item-100",
        copiedAt: new Date("2026-06-04T07:30:00.000Z")
      }
    ]);

    expect(result.status).toBe("pending_review");
    expect(result.reason).toBe("candidate_outside_window");
  });

  test("does not match copy events for different items", () => {
    const result = matchOrderAttribution(baseOrder, [
      {
        id: "copy-1",
        userId: "user-1",
        conversionId: "conversion-1",
        itemId: "item-999",
        copiedAt: new Date("2026-06-06T07:30:00.000Z")
      }
    ]);

    expect(result).toEqual({
      status: "unmatched",
      confidence: 0,
      reason: "no_item_candidates"
    });
  });
});
