import { createApp } from "./app.js";
import { loadConfig, validateProductionConfig } from "./config/env.js";
import { syncJdOrders, syncTaobaoOrders } from "./domain/order-sync.js";

const config = loadConfig();
validateProductionConfig(config);
const app = await createApp();

await app.listen({
  port: config.port,
  host: "0.0.0.0"
});

// 定时订单同步：默认每 15 分钟一次。
// 回看窗口独立配置（默认 170 分钟，控制在折淘客 3 小时上限内）——窗口必须足够宽，
// 才能反复扫到老订单的状态变化（已收货/已结算/退款），否则窄窗口会漏掉。
const syncIntervalMinutes = Number(process.env.ORDER_SYNC_INTERVAL_MINUTES ?? 15);
const lookbackMinutes = Math.min(
  175,
  Math.max(syncIntervalMinutes * 2, Number(process.env.ORDER_SYNC_LOOKBACK_MINUTES ?? 170))
);
const syncEnabled =
  process.env.ORDER_SYNC_ENABLED !== "0" && Number.isFinite(syncIntervalMinutes) && syncIntervalMinutes > 0;

if (syncEnabled) {
  let syncing = false;
  const runSync = async () => {
    if (syncing) return;
    syncing = true;
    try {
      const startTime = new Date(Date.now() - lookbackMinutes * 60 * 1000);
      const globalRatio =
        (await app.deps.repositories.settings.getCommissionSharingRatio()) ?? config.commissionSharingRatio;
      const syncOptions = {
        startTime,
        commissionSharingRatio: globalRatio,
        attributionWindowHours: 24
      };
      const [taobao, jd] = await Promise.all([
        syncTaobaoOrders(app.deps.repositories, app.deps.taobaoOrderClient, syncOptions),
        syncJdOrders(app.deps.repositories, app.deps.orderClient, syncOptions)
      ]);
      app.log.info({ taobao, jd }, "order sync completed");
    } catch (error) {
      app.log.error({ err: error }, "order sync failed");
    } finally {
      syncing = false;
    }
  };

  // 不调用 timer.unref()：HTTP 服务在跑，定时器应一直存活
  setInterval(runSync, syncIntervalMinutes * 60 * 1000);
  // 启动后立即同步一次（延迟 3s 等连接就绪），便于立刻在日志验证调度生效
  setTimeout(() => void runSync(), 3000);
  app.log.info({ syncIntervalMinutes, lookbackMinutes }, "order sync scheduler started");
}
