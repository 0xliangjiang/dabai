import "dotenv/config";

export type AppConfig = {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  adminToken: string;
  schedulerToken: string;
  authTokenSecret: string;
  corsOrigins: string[];
  wechatAppId: string;
  wechatAppSecret: string;
  wechatDealTemplateId: string;
  commissionSharingRatio: number;
  jdUnionAppKey: string;
  jdUnionAppSecret: string;
  jdUnionSiteId: string;
  jdUnionPositionId: string;
  dingdanxiaApiKey: string;
  dingdanxiaApiUrl: string;
  dingdanxiaPid: string;
  dingdanxiaJdApiUrl: string;
  dingdanxiaJdGoodsApiUrl: string;
  dingdanxiaJdOrderApiUrl: string;
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
    databaseUrl: resolveDatabaseUrl(env),
    adminToken: env.ADMIN_TOKEN ?? "dev-admin-token",
    schedulerToken: env.SCHEDULER_TOKEN ?? "dev-scheduler-token",
    authTokenSecret: env.AUTH_TOKEN_SECRET ?? "dev-auth-token-secret",
    corsOrigins: (env.CORS_ORIGINS ?? "http://localhost:5173")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    wechatAppId: env.WECHAT_APP_ID ?? "",
    wechatAppSecret: env.WECHAT_APP_SECRET ?? "",
    wechatDealTemplateId: env.WECHAT_DEAL_TEMPLATE_ID ?? "",
    commissionSharingRatio: Number(env.COMMISSION_SHARING_RATIO ?? 0.5),
    jdUnionAppKey: env.JD_UNION_APP_KEY ?? "",
    jdUnionAppSecret: env.JD_UNION_APP_SECRET ?? "",
    jdUnionSiteId: env.JD_UNION_SITE_ID ?? "",
    jdUnionPositionId: env.JD_UNION_POSITION_ID ?? "",
    dingdanxiaApiKey: env.DINGDANXIA_API_KEY ?? "",
    dingdanxiaApiUrl: env.DINGDANXIA_API_URL ?? "https://api.tbk.dingdanxia.com/tbk/wn_convert",
    dingdanxiaPid: env.DINGDANXIA_PID ?? "",
    dingdanxiaJdApiUrl: env.DINGDANXIA_JD_API_URL ?? "https://api.tbk.dingdanxia.com/jd/promotion_common",
    dingdanxiaJdGoodsApiUrl: env.DINGDANXIA_JD_GOODS_API_URL ?? "https://api.tbk.dingdanxia.com/jd/query_goods",
    dingdanxiaJdOrderApiUrl:
      env.DINGDANXIA_JD_ORDER_API_URL ?? "https://api.tbk.dingdanxia.com/jd/order_details2",
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

// 支持两种配置方式：完整 DATABASE_URL，或分离的 DB_* 字段（密码可含特殊字符，自动 URL 编码）
export function resolveDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (env.DATABASE_URL) {
    return env.DATABASE_URL;
  }
  if (env.DB_HOST && env.DB_USER && env.DB_NAME) {
    const user = encodeURIComponent(env.DB_USER);
    const password = encodeURIComponent(env.DB_PASSWORD ?? "");
    const port = env.DB_PORT ?? "3306";
    return `mysql://${user}:${password}@${env.DB_HOST}:${port}/${env.DB_NAME}`;
  }
  return "";
}

export function validateProductionConfig(config: AppConfig): void {
  if (config.nodeEnv !== "production") {
    return;
  }

  const missing = [
    ["DATABASE_URL", config.databaseUrl],
    ["ADMIN_TOKEN", config.adminToken],
    ["SCHEDULER_TOKEN", config.schedulerToken],
    ["AUTH_TOKEN_SECRET", config.authTokenSecret],
    ["WECHAT_APP_ID", config.wechatAppId],
    ["WECHAT_APP_SECRET", config.wechatAppSecret],
    ["DINGDANXIA_API_KEY", config.dingdanxiaApiKey],
    ["DINGDANXIA_PID", config.dingdanxiaPid],
    ["DINGDANXIA_JD_SITE_ID", config.dingdanxiaJdSiteId],
    ["DINGDANXIA_JD_AUTH_KEY", config.dingdanxiaJdAuthKey],
    ["DINGDANXIA_PDD_PID", config.dingdanxiaPddPid]
  ].filter(([, value]) => !isRealConfigValue(value));

  if (!Number.isFinite(config.port) || config.port <= 0) {
    missing.push(["PORT", String(config.port)]);
  }

  if (
    !Number.isFinite(config.commissionSharingRatio) ||
    config.commissionSharingRatio < 0 ||
    config.commissionSharingRatio > 1
  ) {
    missing.push(["COMMISSION_SHARING_RATIO", String(config.commissionSharingRatio)]);
  }

  if (missing.length > 0) {
    throw new Error(`Production config missing or invalid: ${missing.map(([key]) => key).join(", ")}`);
  }
}

function isRealConfigValue(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed !== "" &&
    !trimmed.startsWith("replace-with-") &&
    !trimmed.startsWith("dev-") &&
    trimmed.toLowerCase() !== "your-token"
  );
}
