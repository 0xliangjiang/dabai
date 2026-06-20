import type { FastifyBaseLogger } from "fastify";
import type { AppConfig } from "../config/env.js";
import { getEffectiveConfig } from "../config/runtime.js";
import { createSubscribeMessageSender } from "../integrations/wechat/subscribe.js";
import type { DealPostRecord, Repositories } from "../repositories/types.js";

export type DealPublishedNotifier = (
  deal: DealPostRecord
) => Promise<{ sent: number; targets: number; error?: string }>;

export function createDealPublishedNotifier(
  baseConfig: AppConfig,
  repositories: Repositories,
  log?: FastifyBaseLogger
): DealPublishedNotifier {
  return async (deal) => {
    // 用最新生效配置（后台可改模板/AppSecret）即时生效
    const config = await getEffectiveConfig(baseConfig, repositories);
    const sender = createSubscribeMessageSender(config);
    const templateId = config.wechatDealTemplateId || (config.nodeEnv === "production" ? "" : "dev-deal-template");
    if (!templateId) {
      log?.warn("deal publish: 未配置订阅模板 WECHAT_DEAL_TEMPLATE_ID，跳过推送");
      return { sent: 0, targets: 0 };
    }

    const targets = await repositories.subscriptions.listUnusedWithOpenid(templateId);
    if (targets.length === 0) {
      log?.info({ dealId: deal.id }, "deal publish: 暂无可推送的订阅用户（一次性订阅需用户重新订阅）");
      return { sent: 0, targets: 0 };
    }

    const usedGrantIds: string[] = [];
    let sent = 0;
    let firstError: string | undefined;
    for (const target of targets) {
      try {
        const result = await sender.send({
          openid: target.openid,
          templateId,
          page: `pages/deal-detail/index?id=${deal.id}`,
          data: {
            // 对应模板字段：thing3=商品名称，time6=发货时间（换模板时同步调整 key）
            thing3: { value: truncate(deal.title || "新线报上架", 20) },
            time6: { value: formatTime(deal.publishedAt ?? new Date()) }
          }
        });
        // 无论成功还是被微信拒绝（如用户撤销订阅），该额度都视为已消耗
        usedGrantIds.push(target.grantId);
        if (result.ok) {
          sent += 1;
        } else {
          firstError = firstError ?? `${result.errcode ?? ""} ${result.errmsg ?? "发送被拒绝"}`.trim();
          log?.warn({ errcode: result.errcode, errmsg: result.errmsg, userId: target.userId }, "subscribe send rejected");
        }
      } catch (error) {
        // 多为获取 access_token 失败（如服务器 IP 不在微信白名单）；该额度不消耗，便于修好后重试
        firstError = firstError ?? (error as Error).message;
        log?.error({ err: error, userId: target.userId }, "subscribe send failed");
      }
    }

    await repositories.subscriptions.markUsed(usedGrantIds);
    log?.info({ dealId: deal.id, targets: targets.length, sent, error: firstError }, "deal publish notification done");
    return { sent, targets: targets.length, error: sent === 0 ? firstError : undefined };
  };
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function formatTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
