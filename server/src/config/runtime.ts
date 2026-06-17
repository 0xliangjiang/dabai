import type { AppConfig } from "./env.js";
import type { Repositories } from "../repositories/types.js";

// 可在后台「运营设置」覆盖的配置项（数据库 > env > 默认）
// secret=true 的项「只写不回显」：后台只显示是否已配置，永不返回原值。
type FieldKind = "string" | "number";

export type SettingFieldMeta = {
  key: string; // Setting 表里的 key
  field: keyof AppConfig; // 对应 AppConfig 字段
  kind: FieldKind;
  secret: boolean;
  label: string;
};

export const SETTING_FIELDS: SettingFieldMeta[] = [
  { key: "ztk_pid", field: "zhetaokePid", kind: "string", secret: false, label: "淘宝推广位 PID" },
  { key: "ztk_sid", field: "zhetaokeSid", kind: "string", secret: false, label: "折淘客 SID" },
  { key: "ztk_relation_id", field: "zhetaokeRelationId", kind: "string", secret: false, label: "淘宝渠道 relationId" },
  { key: "ztk_jd_union_id", field: "zhetaokeJdUnionId", kind: "string", secret: false, label: "京东联盟 unionId" },
  { key: "minimax_model", field: "minimaxModel", kind: "string", secret: false, label: "MiniMax 模型" },
  { key: "minimax_api_url", field: "minimaxApiUrl", kind: "string", secret: false, label: "MiniMax 接口地址" },
  { key: "wechat_deal_template_id", field: "wechatDealTemplateId", kind: "string", secret: false, label: "订阅消息模板 ID" },
  { key: "order_sync_interval_minutes", field: "orderSyncIntervalMinutes", kind: "number", secret: false, label: "订单同步间隔(分钟)" },
  { key: "order_sync_lookback_minutes", field: "orderSyncLookbackMinutes", kind: "number", secret: false, label: "订单同步回看窗口(分钟)" },
  // 密钥：只写不回显
  { key: "ztk_app_key", field: "zhetaokeAppKey", kind: "string", secret: true, label: "折淘客 appKey" },
  { key: "minimax_api_key", field: "minimaxApiKey", kind: "string", secret: true, label: "MiniMax API Key" },
  { key: "wechat_app_secret", field: "wechatAppSecret", kind: "string", secret: true, label: "微信 AppSecret" },
  { key: "jd_union_app_secret", field: "jdUnionAppSecret", kind: "string", secret: true, label: "京东联盟 AppSecret" }
];

// 用数据库覆盖合并出生效配置（覆盖为空字符串时视为「未设置」，回落 env）
export function resolveConfig(base: AppConfig, overrides: Record<string, string>): AppConfig {
  const merged: AppConfig = { ...base };
  for (const meta of SETTING_FIELDS) {
    const raw = overrides[meta.key];
    if (raw === undefined || raw === null || raw === "") continue;
    if (meta.kind === "number") {
      const n = Number(raw);
      if (Number.isFinite(n)) {
        (merged[meta.field] as unknown as number) = n;
      }
    } else {
      (merged[meta.field] as unknown as string) = raw;
    }
  }
  return merged;
}

// 取生效配置（每次调用读最新数据库覆盖，改完即时生效，无需重启）
export async function getEffectiveConfig(base: AppConfig, repositories: Repositories): Promise<AppConfig> {
  const overrides = await repositories.settings.getOverrides();
  return resolveConfig(base, overrides);
}

// 给后台展示用：非密钥回显当前值（数据库或 env），密钥只给「是否已配置」
export function buildSettingsView(
  base: AppConfig,
  overrides: Record<string, string>
): Array<{ key: string; label: string; secret: boolean; value: string; configured: boolean }> {
  const effective = resolveConfig(base, overrides);
  return SETTING_FIELDS.map((meta) => {
    const effectiveValue = String(effective[meta.field] ?? "");
    return {
      key: meta.key,
      label: meta.label,
      secret: meta.secret,
      value: meta.secret ? "" : effectiveValue,
      configured: effectiveValue.trim() !== ""
    };
  });
}

export function isValidSettingKey(key: string): boolean {
  return SETTING_FIELDS.some((m) => m.key === key);
}
