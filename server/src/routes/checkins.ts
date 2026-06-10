import type { FastifyInstance } from "fastify";
import type { Repositories } from "../repositories/types.js";

const BASE_POINTS = 5;
const STREAK_BONUS_POINTS = 30;
const STREAK_BONUS_EVERY = 7;
const CHINA_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;

export async function registerCheckInRoutes(app: FastifyInstance, repositories: Repositories) {
  app.get("/api/checkins/me", async (request) => {
    const today = chinaDateString(new Date());
    const [todayRecord, recentDates, totalPoints] = await Promise.all([
      repositories.checkIns.findByUserAndDate(request.userId, today),
      repositories.checkIns.listRecentDates(request.userId, 400),
      repositories.checkIns.totalPoints(request.userId)
    ]);

    return {
      todayChecked: Boolean(todayRecord),
      streak: computeStreak(recentDates, today),
      totalPoints
    };
  });

  app.post("/api/checkins", async (request, reply) => {
    const today = chinaDateString(new Date());
    const existing = await repositories.checkIns.findByUserAndDate(request.userId, today);
    if (existing) {
      return reply.code(400).send({ error: "今日已签到" });
    }

    const recentDates = await repositories.checkIns.listRecentDates(request.userId, 400);
    const streak = computeStreak(recentDates, today) + 1;
    const points = BASE_POINTS + (streak % STREAK_BONUS_EVERY === 0 ? STREAK_BONUS_POINTS : 0);

    await repositories.checkIns.create({
      userId: request.userId,
      checkInDate: today,
      points
    });
    const totalPoints = await repositories.checkIns.totalPoints(request.userId);

    return {
      todayChecked: true,
      pointsAwarded: points,
      streak,
      totalPoints
    };
  });
}

// 以北京时间为准的日期串 YYYY-MM-DD
export function chinaDateString(date: Date): string {
  return new Date(date.getTime() + CHINA_UTC_OFFSET_MS).toISOString().slice(0, 10);
}

// 截至今天（不含今天）的连续签到天数；dates 为去重的倒序日期串
export function computeStreak(dates: string[], today: string): number {
  const dateSet = new Set(dates);
  let streak = 0;
  let cursor = previousDate(today);
  while (dateSet.has(cursor)) {
    streak += 1;
    cursor = previousDate(cursor);
  }
  return streak;
}

function previousDate(dateString: string): string {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}
