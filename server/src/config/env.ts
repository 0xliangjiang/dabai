import "dotenv/config";

export type AppConfig = {
  nodeEnv: string;
  port: number;
  adminToken: string;
  schedulerToken: string;
  commissionSharingRatio: number;
  dingdanxiaApiKey: string;
  dingdanxiaApiUrl: string;
  dingdanxiaPid: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    nodeEnv: env.NODE_ENV ?? "development",
    port: Number(env.PORT ?? 3001),
    adminToken: env.ADMIN_TOKEN ?? "dev-admin-token",
    schedulerToken: env.SCHEDULER_TOKEN ?? "dev-scheduler-token",
    commissionSharingRatio: Number(env.COMMISSION_SHARING_RATIO ?? 0.5),
    dingdanxiaApiKey: env.DINGDANXIA_API_KEY ?? "",
    dingdanxiaApiUrl: env.DINGDANXIA_API_URL ?? "https://api.tbk.dingdanxia.com/tbk/wn_convert",
    dingdanxiaPid: env.DINGDANXIA_PID ?? ""
  };
}
