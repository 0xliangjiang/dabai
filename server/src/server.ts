import { createApp } from "./app.js";
import { loadConfig, validateProductionConfig } from "./config/env.js";
import { resolveCommissionOptions, runOrderSync } from "./domain/order-sync.js";
import { withTimeout } from "./integrations/http.js";

// 整轮同步硬超时：即使第三方请求超时已就位，仍兜底防止任何意外挂起永久卡死调度
const SYNC_HARD_TIMEOUT_MS = 5 * 60 * 1000;
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
      // 整轮（含配置读取 + 双平台分页同步）套硬超时：任何意外挂起都会被中断，
      // 保证 syncing 复位、循环能继续——根因（请求无超时）已在客户端修复，这里是兜底。
      const result = await withTimeout(
        (async () => {
          const cfg = await app.deps.getConfig();
          const interval = cfg.orderSyncIntervalMinutes > 0 ? cfg.orderSyncIntervalMinutes : DEFAULT_INTERVAL_MINUTES;
          const lookback = Math.min(175, Math.max(interval * 2, cfg.orderSyncLookbackMinutes || 170));
          const startTime = new Date(Date.now() - lookback * 60 * 1000);
          const commissionOptions = await resolveCommissionOptions(app.deps.repositories, cfg);
          const { orderClient, taobaoOrderClient, taobaoProductClient } = await app.deps.buildOrderClients();
          return runOrderSync(
            app.deps.repositories,
            { taobaoOrderClient, taobaoProductClient, orderClient },
            { startTime, attributionWindowHours: 24, ...commissionOptions },
            "auto"
          );
        })(),
        SYNC_HARD_TIMEOUT_MS,
        "order sync"
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
