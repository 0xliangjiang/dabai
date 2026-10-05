import { randomBytes } from "node:crypto";
import type { SportsAccountRecord } from "../repositories/types.js";

export const SPORTS_SELF_UNBIND_LIMIT = 3;

export function replacementSportsAccountData(account: SportsAccountRecord) {
  return {
    userId: account.userId, email: generateSportsEmail(), passwordCipher: "",
    zeppUserId: null, loginTokenCipher: null, appTokenCipher: null,
    status: "awaiting_registration", bindStatus: "unbound",
    captchaKey: null, captchaExpiresAt: null,
    membershipExpiresAt: account.membershipExpiresAt, lastTargetSteps: null
  };
}

export function generateSportsEmail(): string {
  return `${randomBytes(20).toString("hex")}@gmail.com`;
}

export class SportsAccountChangedError extends Error {
  constructor() {
    super("运动账号已解绑或更换，请重新点击绑定账号");
  }
}
