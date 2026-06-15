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
  zhetaokeApiUrl: string;
  zhetaokeAppKey: string;
  zhetaokeSid: string;
  zhetaokePid: string;
  zhetaokeRelationId: string;
  zhetaokeJdApiUrl: string;
  zhetaokeJdUnionId: string;
  zhetaokeJdPositionId: string;
  zhetaokeOrderApiUrl: string;
  jdUnionAppKey: string;
  jdUnionAppSecret: string;
  jdUnionSiteId: string;
  jdUnionPositionId: string;
  jdUnionSceneId: string;
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
    zhetaokeApiUrl:
      env.ZTK_API_URL ?? "https://api.zhetaoke.com:10001/api/open_gaoyongzhuanlian_tkl.ashx",
    zhetaokeAppKey: env.ZTK_APP_KEY ?? "",
    zhetaokeSid: env.ZTK_SID ?? "",
    zhetaokePid: env.ZTK_PID ?? "",
    zhetaokeRelationId: env.ZTK_RELATION_ID ?? "",
    zhetaokeJdApiUrl:
      env.ZTK_JD_API_URL ?? "https://api.zhetaoke.com:10001/api/open_jing_union_open_promotion_byunionid_get.ashx",
    zhetaokeJdUnionId: env.ZTK_JD_UNION_ID ?? "",
    zhetaokeJdPositionId: env.ZTK_JD_POSITION_ID ?? "",
    zhetaokeOrderApiUrl:
      env.ZTK_ORDER_API_URL ?? "http://api.zhetaoke.cn:10000/api/open_dingdanchaxun2.ashx",
    jdUnionAppKey: env.JD_UNION_APP_KEY ?? "",
    jdUnionAppSecret: env.JD_UNION_APP_SECRET ?? "",
    jdUnionSiteId: env.JD_UNION_SITE_ID ?? "",
    jdUnionPositionId: env.JD_UNION_POSITION_ID ?? "",
    jdUnionSceneId: env.JD_UNION_SCENE_ID ?? "",
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
    ["ZTK_APP_KEY", config.zhetaokeAppKey],
    ["ZTK_SID", config.zhetaokeSid],
    ["ZTK_PID", config.zhetaokePid],
    ["ZTK_JD_UNION_ID", config.zhetaokeJdUnionId]
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
