import "dotenv/config";

export type AppConfig = {
  nodeEnv: string;
  port: number;
  adminToken: string;
  schedulerToken: string;
  adzoneId: string;
  commissionSharingRatio: number;
  taobaoAppKey: string;
  taobaoAppSecret: string;
  taobaoApiUrl: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    nodeEnv: env.NODE_ENV ?? "development",
    port: Number(env.PORT ?? 3001),
    adminToken: env.ADMIN_TOKEN ?? "dev-admin-token",
    schedulerToken: env.SCHEDULER_TOKEN ?? "dev-scheduler-token",
    adzoneId: env.TBK_ADZONE_ID ?? "mock-adzone",
    commissionSharingRatio: Number(env.COMMISSION_SHARING_RATIO ?? 0.5),
    taobaoAppKey: env.TAOBAO_APP_KEY ?? "",
    taobaoAppSecret: env.TAOBAO_APP_SECRET ?? "",
    taobaoApiUrl: env.TAOBAO_API_URL ?? "https://eco.taobao.com/router/rest"
  };
}
