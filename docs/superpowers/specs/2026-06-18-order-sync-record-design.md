# 订单同步记录（最近一次同步状态）设计

## 背景与目标

订单同步每 ~15 分钟自动跑一次（也可后台手动点「同步订单」），但每次跑的结果目前**只写进服务器日志** `app.log.info`，后台界面完全看不到。运营无法判断：

- 最近到底有没有在跑？
- 上一次成功还是失败了（失败只进日志，静默无感知）？
- 抓了多少单？

**目标（轻量方案）**：把每一次同步跑的结果存下来，后台显示「最近一次同步状态」，让人一眼看清「在不在跑 / 成功没 / 抓了多少 / 是不是卡死了」。不做历史列表 UI。

## 数据模型

新增 Prisma 表 `OrderSyncRun`，**每次同步跑完追加一条**（自动 + 手动都记），后台只读最新一条。

```prisma
model OrderSyncRun {
  id               String   @id @default(cuid())
  trigger          String   // "auto"(定时) | "manual"(后台手动)
  ok               Boolean  // 整体成功/失败
  taobaoSynced     Int      @default(0)
  taobaoAttributed Int      @default(0)
  jdSynced         Int      @default(0)
  jdAttributed     Int      @default(0)
  errorMessage     String?  @db.VarChar(1024) // 失败原因，成功为空
  durationMs       Int      // 本次耗时（毫秒）
  createdAt        DateTime @default(now())

  @@index([createdAt])
}
```

一次同步 = 一条记录（淘宝 + 京东合并）。淘宝成功、京东失败 → `ok=false`，`errorMessage` 写明是哪个平台失败及原因。

**增长**：每 15 分钟一条 ≈ 每天 100 条 / 每年约 3.6 万行，量很小，先不做清理。以后要清，加「只留最近 N 天」很简单。

## 后端改动

### 1. 公共函数 `runOrderSync()`（`server/src/domain/order-sync.ts`）

现在定时循环（`server.ts`）和手动接口（`jobs.ts`）各自调一遍淘宝 + 京东同步，逻辑重复。抽出 `runOrderSync()` 收口「跑淘宝 + 跑京东 → 计时 → 写一条 `OrderSyncRun`」，两边都调它，记录逻辑只有一份。

- 用 `Promise.allSettled` 分别跑淘宝/京东，**单平台失败不影响另一平台的计数照常入账**。
- 任一平台失败 → `ok=false`，`errorMessage` 汇总失败平台与原因（如「京东同步失败：union API 返回 401」）。
- **失败时记录照样落库**——失败才是最该看到的。
- 写库失败只记日志，不抛出（记录功能不能拖垮同步本身）。
- 返回结构化结果，供调用方使用。

签名（示意）：

```ts
export type OrderSyncRunResult = {
  ok: boolean;
  taobaoSynced: number; taobaoAttributed: number;
  jdSynced: number; jdAttributed: number;
  errorMessage: string | null;
  durationMs: number;
};

export async function runOrderSync(
  repositories: Repositories,
  clients: { taobaoOrderClient: TaobaoOrderClient; orderClient: JdOrderClient },
  options: SyncOrdersOptions,
  trigger: "auto" | "manual"
): Promise<OrderSyncRunResult>;
```

### 2. `server.ts` 定时循环改用 `runOrderSync(..., "auto")`

### 3. `jobs.ts` 手动接口改用 `runOrderSync(..., "manual")`

返回体保持兼容现有后台按钮（`{ ok, taobao: { synced, attributed }, jd: { synced, attributed } }`），由 run 结果映射得到。

### 4. 仓储层（`types.ts` + `prisma.ts` + `memory.ts`）

新增 `syncRuns` 仓储：

```ts
syncRuns: {
  record(input: Omit<OrderSyncRunRecord, "id" | "createdAt">): Promise<void>;
  getLatest(): Promise<OrderSyncRunRecord | null>;
};
```

`prisma` 与 `memory` 两套实现都要补（与项目现有双实现一致）。

### 5. 只读接口 `GET /api/admin/sync-status`（`admin.ts`）

返回最新一条记录 + 当前生效同步间隔（供前端算「太久没跑」）：

```ts
{ latest: OrderSyncRunRecord | null, intervalMinutes: number }
```

`intervalMinutes` 取 `getConfig().orderSyncIntervalMinutes`（>0 否则 15）。

## 后台改动（`admin/src/App.tsx`）

概览区新增「订单同步状态」卡片，进入后台时随 `loadData` 一起拉 `/api/admin/sync-status`。

显示规则：

- **成功**：✅ 正常 ·「上次同步 3 分钟前（自动）」·「抓取：淘宝 12 · 京东 5 · 归因 9 · 耗时 2.1s」
- **失败**：❌ 失败（红）·「上次同步 8 分钟前（自动）」·「原因：京东联盟 API 返回 401」
- **太久没跑（兜底）**：最新记录 `createdAt` 距今 > `2 × intervalMinutes` → ⚠️「同步可能已停止」。静默卡死不会有失败记录，只能靠「多久没新记录」判断。
- **从无记录**：⚠️「尚无同步记录」。

「几分钟前」用相对时间展示。

## 测试

- `runOrderSync`：两平台都成功 → `ok=true` 且计数正确并落库一条；单平台抛错 → `ok=false`、`errorMessage` 含该平台、另一平台计数仍入账、记录仍落库。
- `GET /api/admin/sync-status`：有记录返回最新一条 + interval；无记录返回 `latest=null`。
- 复用现有 in-memory 仓储与测试夹具。

## 不做（YAGNI）

- 历史记录列表 UI / 分页查询
- 记录自动清理 / 保留策略
- 按平台拆成两条记录
- 失败告警推送（微信/邮件）
