# 订单返利核对（刷新返利按钮 + 自动兜底）设计

日期：2026-06-22

## 背景与问题

用户端订单的「已结算 / 待返利」由两层数据决定：

- **订单状态** `TbkOrder.orderStatus`（已付款 paid / 已收货 received / 已结算 settled / 退款 refunded / 失效 invalid）——用户订单列表直接读它。
- **返利台账** `CommissionLedger.status`（pending 待结算 / available 已到账可提现 / reversed 已冲销）——决定积分是否到账、能否提现。

正常订单同步时两者一起更新（`processOrder` 同时写订单状态与台账）。但存在不同步窗口：订单结算发生在归因之后、或个别路径只改了订单状态没重算台账，导致**订单已结算、台账仍停在 pending**，用户看到「待返利」迟迟不到账。

实测场景：管理后台该订单已显示「已结算」（`orderStatus=settled`），但用户返利仍是 pending。

## 目标

1. 用户可在订单上手动「刷新返利」，把已结算订单的返利从待结算刷成已到账。
2. 系统自动兜底，绝大多数情况下用户根本不会卡在「待返利」。
3. 操作幂等、安全（只认订单当前权威状态，重复执行不会重复加钱）。

非目标：代客在淘宝/京东确认收货（第三方无此能力）；实时反查联盟接口（本场景 DB 已是结算态，无需外部调用）。

## 核心：幂等的单订单台账核对

抽取共享函数（放在 `server/src/domain/order-sync.ts`，与 `processOrder` 同源）：

```
reconcileOrderLedger(repositories, order, options): Promise<{ credited, rebateStatus }>
```

逻辑（以订单**当前** `orderStatus` 为权威，复用 `buildCommissionLedgerEntry` / `buildReferralLedgerEntry`）：

- 取 `orders.getAttribution(order.tbkOrderId)`；无归属用户 → 不动，返回 `credited:false`。
- `settled` → upsert 台账为 `settled/available`（积分到账）；有上线则同样 upsert 上线提成 `referral_settled/available`。
- `refunded` / `invalid` → `reverseOrder(user)` + `reverseOrder(inviter)`（冲销）。
- `paid` / `received` → upsert `estimated/pending`（维持待结算）。

幂等性来自 `commissionLedger.upsert`（按 userId+tbkOrderId+ledgerType 维度覆盖）。`processOrder` 重构为调用此函数，保证同步、按钮、自动兜底三处行为一致。

`options` 来源：`commissionSharingRatio`（settings 优先，否则 env）、`referralEnabled`、`referralRatio`（settings）。用户按钮端点按需读取这些设置，与 order-sync 一致。

## 暴露点 1：用户端「刷新返利」按钮

### 接口
- `GET /api/orders/me`：每笔订单新增 `rebateStatus: "pending" | "available" | "reversed" | "none"`（由该用户该订单的台账聚合得出；none=尚无台账）。让前端能区分「待返利 / 已到账」。
- `POST /api/orders/me/:id/recheck`：
  - 校验该订单归属当前用户（`getAttribution(order.tbkOrderId).userId === request.userId`），否则 404。
  - 读取订单当前状态 → `reconcileOrderLedger` → 返回刷新后的单订单（含新的 `rebateStatus`、`userRebateCents`）。
  - 纯读写自身 DB，无外部调用；天然幂等，无需限流（可选加  besteffort 冷却）。

### 前端（`miniprogram/pages/orders`）
- 列表项在「订单已结算（statusClass=green / status=settled）且 `rebateStatus !== 'available'`」时显示「刷新返利」按钮。
- 点按钮 → 调 recheck → 用返回的单订单就地更新该行；toast：
  - 刷成 available → 「返利已到账 +X 积分」并把该单计入已结算积分。
  - 仍 pending → 「订单仍在结算中，确认收货后约 7–15 天到账」。
- 防重复点击：按钮 loading 态。

## 暴露点 2：自动兜底

每轮 `runOrderSync` 结束后，对「订单已是终态（settled/refunded/invalid）但台账仍 pending」的归因订单做一次核对（封顶，如 200 条）：

- 新增仓储查询 `commissionLedger.listStalePending(limit)`：取 `status='pending'` 的台账条目对应的订单中、`orderStatus ∈ {settled,refunded,invalid}` 的（去重到订单维度）。
- 对每笔调用 `reconcileOrderLedger`。失败单条 try/catch 不影响整体（与现有 per-order 容错一致）。
- 封顶数量打日志，避免静默截断。

这样新结算的订单在下一轮同步就自动到账，按钮只作为即时兜底。

## 测试（memory 仓储 + vitest）

- reconcile：pending→settled 翻 available 且金额正确；含上线提成同步翻转；refunded 冲销；重复执行幂等（金额不翻倍）。
- recheck 端点：归属校验（他人订单 404）；已结算订单刷新后 rebateStatus=available。
- 自动兜底：构造「订单 settled + 台账 pending」→ 跑一轮 → 台账变 available。
- `/api/orders/me` 返回 rebateStatus 字段正确。

## 影响面

- `server/src/domain/order-sync.ts`：抽 `reconcileOrderLedger`，processOrder 复用，runOrderSync 末尾加兜底。
- `server/src/routes/orders.ts`：新增 recheck 端点；listByUser 透出 rebateStatus。
- `server/src/repositories/{types,prisma,memory}.ts`：orders.listByUser 加 rebateStatus；commissionLedger.listStalePending。
- `miniprogram/pages/orders/*`：按钮 + 交互。
- 不改 admin 改状态路径（其已正确更新台账），仅共享 reconcile 不强制重构它，降低风险。
