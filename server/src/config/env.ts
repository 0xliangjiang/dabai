import "dotenv/config";

export type AppConfig = {
  nodeEnv: string;
  port: number;
  adminToken: string;
  schedulerToken: string;
  adzoneId: string;
  commissionSharingRatio: number;
  provider: string;
  taobaoAppKey: string;
  taobaoAppSecret: string;
  taobaoApiUrl: string;
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
    adzoneId: env.TBK_ADZONE_ID ?? "mock-adzone",
    commissionSharingRatio: Number(env.COMMISSION_SHARING_RATIO ?? 0.5),
    provider: env.TAOBAO_PROVIDER ?? "official",
    taobaoAppKey: env.TAOBAO_APP_KEY ?? "",
    taobaoAppSecret: env.TAOBAO_APP_SECRET ?? "",
    taobaoApiUrl: env.TAOBAO_API_URL ?? "https://eco.taobao.com/router/rest",
    dingdanxiaApiKey: env.DINGDANXIA_API_KEY ?? "",
    dingdanxiaApiUrl: env.DINGDANXIA_API_URL ?? "https://api.tbk.dingdanxia.com/tbk/wn_convert",
    dingdanxiaPid: env.DINGDANXIA_PID ?? ""
  };
}
