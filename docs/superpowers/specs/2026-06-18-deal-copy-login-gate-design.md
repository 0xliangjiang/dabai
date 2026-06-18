# 线报复制前的登录/完善资料拦截设计

## 背景与目标

线报通过分享打开 `/pages/deal-detail/index?id=xxx`，当前**完全公开**：新用户不登录就能看、能复制口令/链接（复制是纯前端 `wx.setClipboardData`，不调后端）。

希望在分享裂变的获客时机抓住新用户：**线报内容照常能看（保留传播），但点「复制口令/链接」时拦一道——要求登录 + 设置昵称（头像选填），完成后才放行复制。** 老用户（已有昵称）点复制不受任何打扰。

## 拦截流程

点「复制」时：

```
已登录 且 user.nickname 非空 ？
  ├─ 是 → 直接复制（与现状一致，剪贴板隐私拦截照旧）
  └─ 否 → 打开 copy-gate 浮层，按需依次走：
          1. 未同意隐私 → 隐私同意（复用 privacy-consent 组件）
          2. 未登录    → 「微信登录」按钮 → wx.login + /api/auth/wechat-login
          3. 无昵称    → 选头像(chooseAvatar) + 填昵称 → POST /api/users/me/profile
          4. token 齐 且 昵称齐 → 关浮层，emit pass，deal-detail 复制刚才那一步
```

**放行条件**：有 token **且** `user.nickname` 非空（头像选填，与「我的」页保存逻辑一致）。

## 架构（方式 A：独立组件）

新建组件 `miniprogram/components/copy-gate/`，自包含「隐私 → 登录 → 完善资料」三步浮层：

- **职责**：根据当前登录态/资料状态，显示对应步骤；走完后对外 emit `pass`。
- **对外接口**：
  - 属性 `show`（是否显示）。
  - 事件 `pass`（资料齐全、可以继续原动作）、`close`（用户主动关闭/放弃）。
- **内部状态机**：`privacy → login → profile → done`，每次打开时根据 `hasConsent()` / `getToken()` / `getCurrentUser().nickname` 计算从哪一步进入。
- **复用**：
  - `components/privacy-consent` 处理隐私同意；
  - `utils/api` 的 `loginWithWechat` / `uploadFile` / `request` / `getCurrentUser`；
  - `utils/privacy` 的 `hasConsent` / `setConsent`；
  - 选头像/昵称沿用微信原生 `open-type="chooseAvatar"` + `type="nickname"`，保存走现成 `POST /api/users/me/profile`（头像先传 `/api/uploads/avatar`）。

### deal-detail 集成

- `copyStep` 改为：先判断 `getToken()` 且 `getCurrentUser()?.nickname`。
  - 齐 → 走原复制逻辑。
  - 不齐 → 记住待复制的 step（`this.pendingCopyIndex`），`setData({ showCopyGate: true })`。
- 监听 gate 的 `pass` → 关浮层，调用原复制逻辑复制 `pendingCopyIndex`。
- 监听 gate 的 `close` → 仅关浮层，不复制。

## 数据流

```
用户点复制(step N)
  └─ deal-detail.copyStep
       ├─ 资料齐 → wx.setClipboardData(step N)
       └─ 不齐 → 记住 N，打开 copy-gate
                   copy-gate 内部：隐私→登录→存昵称头像
                   → emit pass → deal-detail 复制 step N
```

## 不动后端

`/api/auth/wechat-login`、`/api/users/me/profile`、`/api/uploads/avatar` 均现成，无需改动。本次纯小程序前端改动。

## 错误处理

- 登录失败 / 保存资料失败 → toast 提示，浮层保持打开，可重试。
- 昵称为空点完成 → toast「请填写昵称」，不放行。
- 隐私拒绝 → toast 提示「同意后才能继续」，停在隐私步。

## 测试（手动验证清单）

小程序无单测框架，落地后按以下清单在开发者工具手动验证：

1. 全新用户（清缓存）打开分享线报 → 能看内容；点复制 → 依次走 隐私→登录→填昵称 → 完成后口令已复制到剪贴板。
2. 已登录但无昵称 → 点复制 → 直接进「填昵称」步；填完复制成功。
3. 老用户（有昵称）点复制 → 无浮层，直接复制。
4. 中途关闭浮层 → 不复制，再次点复制可重新打开。
5. 登录失败 / 保存失败 → toast 提示，浮层不关。

## 不做（YAGNI）

- 不抽取「我的」页的资料编辑面板做公共组件（语境/样式不同，强抽更绕）。
- 不拦截"查看"（线报内容保持公开可看）。
- 不改后端、不加新接口。
- 头像不设为必填。
