import { describe, expect, test } from "vitest";
import { extendSportsMembership, PERMANENT_MEMBERSHIP_EXPIRY } from "../src/domain/sports-membership.js";

describe("membership expiry", () => {
  const now = new Date("2026-10-01T00:00:00Z");
  test("preserves permanent membership and caps extensions approaching the database limit", () => {
    const permanent = new Date(PERMANENT_MEMBERSHIP_EXPIRY);
    expect(extendSportsMembership(permanent, 3, now)).toEqual(permanent);
    expect(extendSportsMembership(new Date("9999-12-30T00:00:00Z"), 3650, now)).toEqual(permanent);
  });
  test("extends active membership and starts expired or missing membership from now", () => {
    expect(extendSportsMembership(new Date("2026-10-02T00:00:00Z"), 3, now).toISOString()).toBe("2026-10-05T00:00:00.000Z");
    for (const expiry of [null, new Date("2026-09-01T00:00:00Z")]) {
      expect(extendSportsMembership(expiry, 3, now).toISOString()).toBe("2026-10-04T00:00:00.000Z");
    }
  });
});
