import { createApp } from "./app.js";
import { loadConfig, validateProductionConfig } from "./config/env.js";
import { runOrderSync } from "./domain/order-sync.js";

const config = loadConfig();
validateProductionConfig(config);
const app = await createApp();

await app.listen({
  port: config.port,
  host: "0.0.0.0"
});

// 定时订单同步：间隔与回看窗口都从「生效配置」（后台运营设置 > env > 默认）读取，
// 后台改完即时生效；回看窗口控制在折淘客 3 小时上限内，要够宽才能扫到状态变化。
const syncEnabled = process.env.ORDER_SYNC_ENABLED !== "0";

if (syncEnabled) {
  let syncing = false;
  const runSync = async () => {
    if (syncing) return;
    syncing = true;
    try {
      const cfg = await app.deps.getConfig();
      const interval = cfg.orderSyncIntervalMinutes > 0 ? cfg.orderSyncIntervalMinutes : 15;
      const lookback = Math.min(175, Math.max(interval * 2, cfg.orderSyncLookbackMinutes || 170));
      const startTime = new Date(Date.now() - lookback * 60 * 1000);
      const globalRatio =
        (await app.deps.repositories.settings.getCommissionSharingRatio()) ?? cfg.commissionSharingRatio;
      const referralEnabled = await app.deps.repositories.settings.getReferralEnabled();
      const referralRatio =
        (await app.deps.repositories.settings.getReferralRatio()) ?? cfg.referralCommissionRatio;
      const { orderClient, taobaoOrderClient } = await app.deps.buildOrderClients();
      const syncOptions = {
        startTime,
        commissionSharingRatio: globalRatio,
        attributionWindowHours: 24,
        referralEnabled,
        referralRatio
      };
      const result = await runOrderSync(
        app.deps.repositories,
        { taobaoOrderClient, orderClient },
        syncOptions,
        "auto"
      );
      if (result.ok) {
        app.log.info({ result }, "order sync completed");
      } else {
        app.log.error({ result }, "order sync completed with errors");
      }
    } catch (error) {
      app.log.error({ err: error }, "order sync failed");
    } finally {
      syncing = false;
    }
  };

  // 自重排调度：每轮按最新生效的间隔重新排期，后台改间隔无需重启
  const loop = async () => {
    await runSync();
    const cfg = await app.deps.getConfig().catch(() => config);
    const interval = cfg.orderSyncIntervalMinutes > 0 ? cfg.orderSyncIntervalMinutes : 15;
    setTimeout(() => void loop(), interval * 60 * 1000);
  };
  setTimeout(() => void loop(), 3000);
  app.log.info("order sync scheduler started");
}
