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

// 定时订单同步：默认每 15 分钟一次，窗口取 2 倍间隔避免漏单
const syncIntervalMinutes = Number(process.env.ORDER_SYNC_INTERVAL_MINUTES ?? 15);
const syncEnabled =
  process.env.ORDER_SYNC_ENABLED !== "0" && Number.isFinite(syncIntervalMinutes) && syncIntervalMinutes > 0;

if (syncEnabled) {
  let syncing = false;
  const runSync = async () => {
    if (syncing) return;
    syncing = true;
    try {
      const startTime = new Date(Date.now() - syncIntervalMinutes * 2 * 60 * 1000);
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

  const timer = setInterval(runSync, syncIntervalMinutes * 60 * 1000);
  timer.unref();
  app.log.info({ syncIntervalMinutes }, "order sync scheduler started");
}
