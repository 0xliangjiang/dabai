# Taobaoke WX MVP

淘宝客转链 MVP，包含微信小程序端、服务端 API 和 Web 管理后台骨架。

## Structure

```text
miniprogram/   微信小程序端，使用 TDesign MiniProgram 组件路径
server/        Fastify API、淘宝客 mock 转链、归因和佣金领域逻辑
admin/         React + Tailwind + shadcn/ui 风格后台
docs/          设计、计划和 API 文档
```

## Local Setup

```bash
npm install
```

## Server

```bash
cp server/.env.example server/.env
npm run dev --workspace server
```

默认服务地址：`http://localhost:3001`。

当前淘宝转链使用 `MockTaobaoClient`，在没有真实淘宝开放平台凭证时返回固定的测试商品、淘口令和链接。真实接入时替换 `server/src/integrations/taobao/client.ts` 中的适配器实现，并继续把签名和密钥保留在服务端。

## Mini Program

用微信开发者工具导入：

```text
miniprogram/
```

本地联调时需要服务端运行在 `http://localhost:3001`，并在微信开发者工具里关闭本地 URL 校验或配置合法域名。

## Admin

```bash
npm run dev --workspace admin
```

默认后台开发地址：`http://localhost:5173`。

后台当前是订单归因复核页面骨架，使用本地 shadcn/ui 风格组件，后续可接入 `/api/admin/pending-attributions` 和 `/api/admin/orders/:id/attribute`。

## Verification

```bash
npm test
npm run typecheck
DATABASE_URL="file:./dev.db" npm run prisma --workspace server -- validate
```

## Environment

See `server/.env.example`.

Important values:

- `TAOBAO_APP_KEY`
- `TAOBAO_APP_SECRET`
- `TAOBAO_SESSION`
- `TBK_ADZONE_ID`
- `WECHAT_APP_ID`
- `WECHAT_APP_SECRET`
- `COMMISSION_SHARING_RATIO`
- `ADMIN_TOKEN`
- `SCHEDULER_TOKEN`

