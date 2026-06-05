export type AppConfig = {
  nodeEnv: string;
  port: number;
  adminToken: string;
  schedulerToken: string;
  adzoneId: string;
  commissionSharingRatio: number;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    nodeEnv: env.NODE_ENV ?? "development",
    port: Number(env.PORT ?? 3001),
    adminToken: env.ADMIN_TOKEN ?? "dev-admin-token",
    schedulerToken: env.SCHEDULER_TOKEN ?? "dev-scheduler-token",
    adzoneId: env.TBK_ADZONE_ID ?? "mock-adzone",
    commissionSharingRatio: Number(env.COMMISSION_SHARING_RATIO ?? 0.5)
  };
}
