import { createApp } from "./app.js";
import { loadConfig, validateProductionConfig } from "./config/env.js";
import { resolveCommissionOptions, runOrderSync } from "./domain/order-sync.js";
import { withTimeout } from "./integrations/http.js";

const DEFAULT_INTERVAL_MINUTES = 15;

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
      // 单请求已有主动超时，分页也有游标/页数上限；等待任务真正结束后再释放同步锁，
      // 避免 Promise 竞速超时后旧任务仍在后台运行、下一轮与其重叠。
      const cfg = await app.deps.getConfig();
      const interval = cfg.orderSyncIntervalMinutes > 0 ? cfg.orderSyncIntervalMinutes : DEFAULT_INTERVAL_MINUTES;
      const lookback = Math.min(175, Math.max(interval * 2, cfg.orderSyncLookbackMinutes || 170));
      const startTime = new Date(Date.now() - lookback * 60 * 1000);
      const commissionOptions = await resolveCommissionOptions(app.deps.repositories, cfg);
      const { orderClient, taobaoOrderClient, taobaoProductClient } = await app.deps.buildOrderClients();
      const result = await runOrderSync(
        app.deps.repositories,
        { taobaoOrderClient, taobaoProductClient, orderClient },
        { startTime, attributionWindowHours: 24, ...commissionOptions },
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

  // 下一次间隔：读取生效配置；读取本身也加超时兜底，失败回落默认间隔
  const nextDelayMs = async () => {
    try {
      const cfg = await withTimeout(app.deps.getConfig(), 10000, "getConfig");
      const interval = cfg.orderSyncIntervalMinutes > 0 ? cfg.orderSyncIntervalMinutes : DEFAULT_INTERVAL_MINUTES;
      return interval * 60 * 1000;
    } catch {
      return DEFAULT_INTERVAL_MINUTES * 60 * 1000;
    }
  };

  // 自重排调度：把"排下一次"放进 finally，保证任何一轮异常/超时都不会终止循环
  const loop = async () => {
    try {
      await runSync();
    } finally {
      setTimeout(() => void loop(), await nextDelayMs());
    }
  };
  setTimeout(() => void loop(), 3000);
  app.log.info("order sync scheduler started");
}
