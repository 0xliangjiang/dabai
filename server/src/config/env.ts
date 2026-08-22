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
  referralCommissionRatio: number;
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
  minimaxApiUrl: string;
  minimaxApiKey: string;
  minimaxModel: string;
  orderSyncIntervalMinutes: number;
  orderSyncLookbackMinutes: number;
  autoSettleThresholdYuan: number; // 已收货自动结算阈值：佣金≤此值立即结算，超过则延迟
  autoSettleDelayDays: number; // 大额佣金：已收货满此天数后自动结算
  zeppCredentialKey?: string;
  zeppProtocolAesKey?: string;
  zeppProtocolAesIv?: string;
  zeppProxyApiUrl?: string;
  zeppUseProxy?: boolean;
  zeppSpoofIp?: boolean;
  zeppCaptchaRetryTimes?: number;
  zeppCaptchaOcrCommand?: string;
  sportsTrialDays?: number;
  nanrunApiUrl?: string;
  nanrunApiKey?: string;
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
    referralCommissionRatio: Number(env.REFERRAL_COMMISSION_RATIO ?? 0.2),
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
    // MiniMax chat 接口（API Key 直连）：AI 识别促销文案生成线报
    // 如需 GroupId，可直接拼在 URL 上：...chatcompletion_v2?GroupId=xxxx
    minimaxApiUrl: env.MINIMAX_API_URL ?? "https://api.minimax.chat/v1/text/chatcompletion_v2",
    minimaxApiKey: env.MINIMAX_API_KEY ?? "",
    minimaxModel: env.MINIMAX_MODEL ?? "MiniMax-M3",
    orderSyncIntervalMinutes: Number(env.ORDER_SYNC_INTERVAL_MINUTES ?? 15),
    orderSyncLookbackMinutes: Number(env.ORDER_SYNC_LOOKBACK_MINUTES ?? 170),
    autoSettleThresholdYuan: Number(env.AUTO_SETTLE_THRESHOLD_YUAN ?? 20),
    autoSettleDelayDays: Number(env.AUTO_SETTLE_DELAY_DAYS ?? 7),
    zeppCredentialKey: env.ZEPP_CREDENTIAL_KEY ?? "",
    zeppProtocolAesKey: env.ZEPP_PROTOCOL_AES_KEY ?? "xeNtBVqzDc6tuNTh",
    zeppProtocolAesIv: env.ZEPP_PROTOCOL_AES_IV ?? "MAAAYAAAAAAAAABg",
    zeppProxyApiUrl: env.PROXY_API_URL ?? "",
    zeppUseProxy: booleanEnv(env.USE_PROXY, true),
    zeppSpoofIp: booleanEnv(env.ZEPP_SPOOF_IP, true),
    zeppCaptchaRetryTimes: Number(env.CAPTCHA_RETRY_TIMES ?? 5),
    zeppCaptchaOcrCommand: env.ZEPP_CAPTCHA_OCR_COMMAND ?? "python3",
    sportsTrialDays: Number(env.SPORTS_TRIAL_DAYS ?? 3),
    nanrunApiUrl: env.NANRUN_API_URL ?? "https://api.nan.run/api/xiaomisport",
    nanrunApiKey: env.NANRUN_API_KEY ?? "",
  };
}

function booleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
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

  // 仅校验真正的引导项（启动/鉴权/连库必需）。
  // ZTK_*、WECHAT_APP_SECRET、MINIMAX_* 等已支持后台「运营设置」覆盖，可不在 env 配置。
  const missing = [
    ["DATABASE_URL", config.databaseUrl],
    ["ADMIN_TOKEN", config.adminToken],
    ["SCHEDULER_TOKEN", config.schedulerToken],
    ["AUTH_TOKEN_SECRET", config.authTokenSecret],
    ["WECHAT_APP_ID", config.wechatAppId]
  ].filter(([, value]) => !isRealConfigValue(value));

  // 生产环境拒绝弱默认密钥：未设置环境变量时会回落到 dev-* 默认值，
  // 而这些默认值能通过 isRealConfigValue，必须显式拦截避免裸奔。
  const weakDefaults: Array<[string, string, string]> = [
    ["ADMIN_TOKEN", config.adminToken, "dev-admin-token"],
    ["SCHEDULER_TOKEN", config.schedulerToken, "dev-scheduler-token"],
    ["AUTH_TOKEN_SECRET", config.authTokenSecret, "dev-auth-token-secret"]
  ];
  for (const [key, value, weak] of weakDefaults) {
    if (value === weak) missing.push([key, "使用了不安全的默认值，请设置强随机值"]);
  }

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
