import { describe, expect, test } from "vitest";
import { centsToPoints, pointsToCents } from "../src/domain/points.js";

describe("point conversion", () => {
  test("uses one point per yuan without losing cents", () => {
    expect(centsToPoints(100)).toBe(1);
    expect(centsToPoints(594)).toBe(5.94);
    expect(pointsToCents(1)).toBe(100);
    expect(pointsToCents(5.94)).toBe(594);
  });
});
