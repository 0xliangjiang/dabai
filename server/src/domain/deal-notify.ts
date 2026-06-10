import type { FastifyBaseLogger } from "fastify";
import type { AppConfig } from "../config/env.js";
import type { SubscribeMessageSender } from "../integrations/wechat/subscribe.js";
import type { DealPostRecord, Repositories } from "../repositories/types.js";

export type DealPublishedNotifier = (deal: DealPostRecord) => Promise<{ sent: number }>;

export function createDealPublishedNotifier(
  config: AppConfig,
  repositories: Repositories,
  sender: SubscribeMessageSender,
  log?: FastifyBaseLogger
): DealPublishedNotifier {
  return async (deal) => {
    const templateId = config.wechatDealTemplateId || (config.nodeEnv === "production" ? "" : "dev-deal-template");
    if (!templateId) {
      return { sent: 0 };
    }

    const targets = await repositories.subscriptions.listUnusedWithOpenid(templateId);
    if (targets.length === 0) {
      return { sent: 0 };
    }

    const usedGrantIds: string[] = [];
    let sent = 0;
    for (const target of targets) {
      try {
        const result = await sender.send({
          openid: target.openid,
          templateId,
          page: `pages/deal-detail/index?id=${deal.id}`,
          data: {
            // 默认对应「新内容/上新提醒」类模板字段，换模板时同步调整
            thing1: { value: truncate(deal.title, 20) },
            time2: { value: formatTime(deal.publishedAt ?? new Date()) }
          }
        });
        // 无论成功还是被微信拒绝（如用户撤销订阅），该额度都视为已消耗
        usedGrantIds.push(target.grantId);
        if (result.ok) {
          sent += 1;
        } else {
          log?.warn({ errcode: result.errcode, errmsg: result.errmsg, userId: target.userId }, "subscribe send rejected");
        }
      } catch (error) {
        log?.error({ err: error, userId: target.userId }, "subscribe send failed");
      }
    }

    await repositories.subscriptions.markUsed(usedGrantIds);
    log?.info({ dealId: deal.id, targets: targets.length, sent }, "deal publish notification done");
    return { sent };
  };
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function formatTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
