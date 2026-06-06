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

服务端会自动读取 `server/.env`。当前转链使用订单侠接口，支持淘宝、京东、拼多多、唯品会链接自动识别；如果没有配置订单侠 API key，会回退到 `MockTaobaoClient`，方便本地开发。

真实转链最小配置：

```env
DINGDANXIA_API_KEY="your-dingdanxia-api-key"
DINGDANXIA_API_URL="https://api.tbk.dingdanxia.com/tbk/wn_convert"
DINGDANXIA_PID="mm_xxx_xxx_xxx"
```

订单侠接口仍然应使用你授权到订单侠平台下的淘宝联盟 PID，确保订单和佣金归属可控。

其它平台按需配置：

```env
DINGDANXIA_JD_SITE_ID="your-jd-site-id"
DINGDANXIA_JD_POSITION_ID=""
DINGDANXIA_JD_PID=""

DINGDANXIA_PDD_PID="your-pdd-pid"
DINGDANXIA_PDD_CUSTOM_PARAMETERS="{\"uid\":\"default\"}"

DINGDANXIA_VIP_CHAN_TAG=""
DINGDANXIA_VIP_STAT_PARAM=""
```

## Mini Program

用微信开发者工具导入：

```text
miniprogram/
```

小程序端使用原生组件和 ColorUI 风格样式，不需要构建 npm 组件。首次启动只需要按微信开发者工具提示编译项目。

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

- `DINGDANXIA_API_KEY`
- `DINGDANXIA_API_URL`
- `DINGDANXIA_PID`
- `DINGDANXIA_JD_SITE_ID`
- `DINGDANXIA_PDD_PID`
- `DINGDANXIA_VIP_CHAN_TAG`
- `WECHAT_APP_ID`
- `WECHAT_APP_SECRET`
- `COMMISSION_SHARING_RATIO`
- `ADMIN_TOKEN`
- `SCHEDULER_TOKEN`
