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

服务端会自动读取 `server/.env`。

默认 `TAOBAO_PROVIDER=official`。当 `TAOBAO_APP_KEY`、`TAOBAO_APP_SECRET` 和真实 `TBK_ADZONE_ID` 配齐时，会使用淘宝开放平台 TOP 签名请求调用 `taobao.tbk.tpwd.convert`。如果缺少凭证或 `TBK_ADZONE_ID=mock-adzone`，会回退到 `MockTaobaoClient`，方便本地开发。

真实转链最小配置：

```env
TAOBAO_APP_KEY="your-app-key"
TAOBAO_APP_SECRET="your-app-secret"
TAOBAO_API_URL="https://eco.taobao.com/router/rest"
TBK_ADZONE_ID="your-adzone-id"
```

`taobao.tbk.tpwd.convert` 官方标注为不需要授权，当前转链实现不使用 `TAOBAO_SESSION`。

如果官方接口权限不可用，可以切到订单侠万能高佣转链接口：

```env
TAOBAO_PROVIDER="dingdanxia"
DINGDANXIA_API_KEY="your-dingdanxia-api-key"
DINGDANXIA_API_URL="https://api.tbk.dingdanxia.com/tbk/wn_convert"
DINGDANXIA_PID="mm_xxx_xxx_xxx"
```

订单侠接口仍然应使用你授权到订单侠平台下的淘宝联盟 PID，确保订单和佣金归属可控。

## Mini Program

用微信开发者工具导入：

```text
miniprogram/
```

首次启动或依赖变化后，先安装小程序端 npm 包：

```bash
npm install --prefix miniprogram
```

然后在微信开发者工具里执行：

```text
工具 > 构建 npm
```

如果微信开发者工具没有生成 `miniprogram/miniprogram_npm`，可以用本地脚本生成：

```bash
npm run build:npm --prefix miniprogram
```

页面组件引用使用 `/miniprogram_npm/tdesign-miniprogram/...`，必须构建 npm 或运行上面的脚本后才会生成对应组件目录。

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
- `TAOBAO_API_URL`
- `TBK_ADZONE_ID`
- `TAOBAO_PROVIDER`
- `DINGDANXIA_API_KEY`
- `DINGDANXIA_API_URL`
- `DINGDANXIA_PID`
- `WECHAT_APP_ID`
- `WECHAT_APP_SECRET`
- `COMMISSION_SHARING_RATIO`
- `ADMIN_TOKEN`
- `SCHEDULER_TOKEN`
