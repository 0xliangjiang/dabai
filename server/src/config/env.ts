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
  dingdanxiaJdApiUrl: string;
  dingdanxiaJdGoodsApiUrl: string;
  dingdanxiaJdSiteId: string;
  dingdanxiaJdUnionId: string;
  dingdanxiaJdAuthKey: string;
  dingdanxiaJdSceneId: string;
  dingdanxiaJdPositionId: string;
  dingdanxiaJdPid: string;
  dingdanxiaPddApiUrl: string;
  dingdanxiaPddPid: string;
  dingdanxiaPddCustomParameters: string;
  dingdanxiaVipApiUrl: string;
  dingdanxiaVipChanTag: string;
  dingdanxiaVipStatParam: string;
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
    dingdanxiaPid: env.DINGDANXIA_PID ?? "",
    dingdanxiaJdApiUrl: env.DINGDANXIA_JD_API_URL ?? "https://api.tbk.dingdanxia.com/jd/promotion_common",
    dingdanxiaJdGoodsApiUrl: env.DINGDANXIA_JD_GOODS_API_URL ?? "https://api.tbk.dingdanxia.com/jd/query_goods",
    dingdanxiaJdSiteId: env.DINGDANXIA_JD_SITE_ID ?? "",
    dingdanxiaJdUnionId: env.DINGDANXIA_JD_UNION_ID ?? env.DINGDANXIA_JD_SITE_ID ?? "",
    dingdanxiaJdAuthKey: env.DINGDANXIA_JD_AUTH_KEY ?? "",
    dingdanxiaJdSceneId: env.DINGDANXIA_JD_SCENE_ID ?? "",
    dingdanxiaJdPositionId: env.DINGDANXIA_JD_POSITION_ID ?? "",
    dingdanxiaJdPid: env.DINGDANXIA_JD_PID ?? "",
    dingdanxiaPddApiUrl: env.DINGDANXIA_PDD_API_URL ?? "https://api.tbk.dingdanxia.com/pdd/url_convert",
    dingdanxiaPddPid: env.DINGDANXIA_PDD_PID ?? "",
    dingdanxiaPddCustomParameters: env.DINGDANXIA_PDD_CUSTOM_PARAMETERS ?? "{\"uid\":\"default\"}",
    dingdanxiaVipApiUrl: env.DINGDANXIA_VIP_API_URL ?? "https://api.tbk.dingdanxia.com/vip/url_privilege",
    dingdanxiaVipChanTag: env.DINGDANXIA_VIP_CHAN_TAG ?? "",
    dingdanxiaVipStatParam: env.DINGDANXIA_VIP_STAT_PARAM ?? ""
  };
}
