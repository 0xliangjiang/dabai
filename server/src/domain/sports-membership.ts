// MySQL/Prisma 日期上限，也是永久会员的到期标记。
export const PERMANENT_MEMBERSHIP_EXPIRY = "9999-12-31T23:59:59.999Z";
const MAX_EXPIRY_MS = Date.parse(PERMANENT_MEMBERSHIP_EXPIRY);

export function extendSportsMembership(current: Date | null, days: number, now: Date): Date {
  const base = Math.max(current?.getTime() ?? 0, now.getTime());
  return new Date(Math.min(MAX_EXPIRY_MS, base + days * 86_400_000));
}
