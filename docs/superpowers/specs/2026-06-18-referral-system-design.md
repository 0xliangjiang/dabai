# 二级分销（一层邀请返利）设计

## 需求

用户把小程序分享给新用户，新用户绑定为分享人的**下线**；下线后续产生返利时，上线（邀请人）额外拿一笔提成。一层关系：A 邀请 B，B 的返利给 A 提成；B 再邀请 C 与 A 无关。

确认的关键决策：
1. **一层**：只有直接下线给上线提成。
2. **平台额外出**：提成是平台额外给上线的奖励，下线返利全额不减。
3. **按下线到手返利算**：提成 = 下线该单实际到手返利 × 二级比例；**跟随订单状态**（退款/失效自动冲销）。
4. **绑定规则**：只有新用户首次注册能被绑定；绑定永久且唯一；不能绑自己；一个上线可有任意多下线。
5. **完整邀请页**：小程序新建邀请页（分享按钮 + 下线数 + 累计提成），入口挂「我的」页。
6. **全局统一比例**：后台运营设置在线可改；带总开关；默认比例 20%、开关默认关闭。
7. **二维码/海报本版不做**（需对接微信 getUnlimitedQRCode，后续可选）。

## 核心思路：复用 CommissionLedger，不新建表

提成直接写进现有 `CommissionLedger`：`userId=上线`、`tbkOrderId=下线的订单`、`ledgerType=referral_*`。
因为 `getAvailableBalance` 按 `status=available` 汇总用户的**所有**台账条目，提成会自动并入上线余额、可直接提现，无需额外的余额逻辑。
唯一约束 `@@unique([userId, tbkOrderId, ledgerType])` 天然适配（上线+下线订单+referral 类型，与下线自己的条目不冲突）。

## 数据模型

`User` 增加自关联字段（其余不变）：

```prisma
model User {
  ...
  inviterId String?
  inviter   User?  @relation("Referral", fields: [inviterId], references: [id])
  invitees  User[] @relation("Referral")
  @@index([inviterId])
}
```

`CommissionLedger` 不改表结构，新增 `ledgerType` 取值（列是 String，无需迁移）：`referral_estimated` / `referral_settled` / `referral_reversal`。

## 提成入账（commission.ts + order-sync.ts）

`commission.ts` 新增 `buildReferralLedgerEntry(downlineEntry, inviterId, referralRatio)`：
- 入参是下线那条 `CommissionLedgerEntry`（已含 amountCents/status）。
- 返回：`{ userId: inviterId, tbkOrderId: 同单, amountCents: round(downlineEntry.amountCents × referralRatio), ledgerType: referral_<原type>, status: 同下线, reason: "referral_commission" }`。
- 状态/类型**镜像**下线条目，所以结算、退款冲销自动跟随，无需单独处理。

`order-sync.ts` 的 `processOrder`：给下线 upsert 完返利台账后，若 **二级开关开** 且 **下线 user.inviterId 存在**：
- 用刚算出的下线 entry 调 `buildReferralLedgerEntry`，再 `commissionLedger.upsert` 一条给上线。
- 比例从生效配置读取（见下）。`SyncOrdersOptions` 增加 `referralEnabled`、`referralRatio`。

> 边界：比例 0 或下线返利 0 时仍 upsert（金额 0，无害，保持状态镜像）。上线被封禁/软删不影响入账（其本就无法提现）。

## 绑定流程

- **分享带参**：各 `onShareAppMessage`/`onShareTimeline` 的 path/query 带 `inviter=<当前用户id>`（home / deals / deal-detail / profile / 新邀请页）。userId 是 cuid，可直接作邀请标识。
- **捕获**：`app.js` 的 `onLaunch(options)` 与 `onShow(options)` 读取 `options.query.inviter`，存本地 `pending_inviter`（仅当本地还没有该值时写，避免覆盖）。
- **登录绑定**：`utils/api.js` 的 `loginWithWechat` 把 `pending_inviter` 作为 `inviterId` 发给 `/api/auth/wechat-login`；成功后清掉 `pending_inviter`。
- **后端**：`auth.ts` 接收 `inviterId` 透传给 `findOrCreateByOpenid`；仓储**只在 create 分支**写 `inviterId`（update 分支不动 → 老用户不绑定）。写前校验：邀请人存在且未软删；新用户 id 是新生成的，自己绑自己不可能发生。邀请人无效则置 null（避免 FK 报错导致登录失败）。

## 后台（运营设置）

仿现有「全局返利比例」+「积分兑换开关」：
- 比例：`settings.getReferralRatio()/setReferralRatio()`（key `referral_commission_ratio`），admin 端点 `POST /api/admin/config/referral-ratio`（校验 0~1）。
- 开关：`settings.getReferralEnabled()/setReferralEnabled()`（key `referral_enabled`），admin 端点 `POST /api/admin/config/referral-enabled`。
- `GET /api/admin/config` 增加 `referralCommissionRatio`、`referralEnabled` 字段。
- admin React 页「配置」区增加两个控件（比例输入 + 开关），仿 commissionRatio / exchangeEnabled。
- 生效配置：`getEffectiveConfig` / order-sync 读取时，比例取 DB 覆盖 > 默认 0.2；开关取 DB > 默认 false。

## 小程序（完整邀请页）

- 新页 `pages/invite/`：
  - 「邀请好友/群」按钮（`open-type="share"`，`onShareAppMessage` path 带 `inviter=myId`）+ 朋友圈分享指引（沿用 deal-detail 的朋友圈教程模式）。
  - 展示：下线人数、累计已到账提成、待结算提成。
  - 数据来自新接口 `GET /api/users/me/referral` → `{ enabled, downlineCount, earnedCents, pendingCents }`。
    - `downlineCount` = `User.count(inviterId = me)`。
    - `earnedCents` = 我的 `referral_*` 且 `status=available` 之和；`pendingCents` = `status=pending` 之和。
- 「我的」页加入口卡片/按钮跳邀请页；`referralEnabled` 为关时隐藏。
- 公开 `/api/app-config` 增加 `referralEnabled`，供小程序判断入口显隐。

## 后端接口清单

| 方法 | 路径 | 用途 | 权限 |
|---|---|---|---|
| POST | /api/auth/wechat-login | 增 `inviterId` 入参 | 公开 |
| GET | /api/users/me/referral | 邀请统计 | 登录 |
| GET | /api/app-config | 增 `referralEnabled` | 公开 |
| GET | /api/admin/config | 增 referral 两字段 | admin |
| POST | /api/admin/config/referral-ratio | 改比例 | admin |
| POST | /api/admin/config/referral-enabled | 开关 | admin |

## 仓储改动（prisma + memory 双实现）

- `users.findOrCreateByOpenid(openid, { unionid, inviterId })`：create 时校验并写 inviterId。
- `users.countInvitees(inviterId)`。
- `commissionLedger`：复用现有 `upsert`（已按 userId+order+type 唯一）。
- 新增聚合：`referral.summary(userId)` → `{ downlineCount, earnedCents, pendingCents }`（或拆到 users/commissionLedger 下，实现时定）。
- `settings`：referralRatio / referralEnabled 的 get/set。

## 测试（server vitest）

- `buildReferralLedgerEntry`：金额 = 下线 entry × 比例，四种状态镜像正确（pending/available/reversed、负数冲销）。
- `findOrCreateByOpenid`：新用户带合法 inviter → 绑定；老用户再带 inviter → 不变；inviter 不存在 → null 不报错；登录接口透传。
- `processOrder`/同步：开关开 + 下线有上线 → 生成 referral 台账，金额对、状态随下线；开关关或无上线 → 不生成；订单退款 → referral 冲销。
- `GET /api/users/me/referral`：下线数与提成聚合正确。
- in-memory 仓储补齐以上能力。

## 不做（YAGNI）

- 二维码/海报（getUnlimitedQRCode 对接）——后续可选。
- 两层及以上分销。
- 每用户不同比例（统一全局）。
- 提成单独提现通道（与普通余额合并）。
