# API

Base URL for local development:

```text
http://localhost:3001
```

User endpoints use:

```text
Authorization: Bearer local_user-1
```

Admin endpoints use:

```text
X-Admin-Token: dev-admin-token
```

Job endpoints use:

```text
X-Scheduler-Token: dev-scheduler-token
```

## Health

```http
GET /health
```

Response:

```json
{
  "ok": true
}
```

## WeChat Login

```http
POST /api/auth/wechat-login
Content-Type: application/json

{
  "code": "mock-login-code"
}
```

Response:

```json
{
  "token": "local_user-1",
  "user": {
    "id": "user-1",
    "openid": "mock_openid_mock-login-code",
    "unionid": null
  }
}
```

The MVP uses mock login behavior. Real WeChat login should exchange `code` with the WeChat API on the server.

## Create Conversion

```http
POST /api/conversions
Authorization: Bearer local_user-1
Content-Type: application/json

{
  "rawContent": "￥abc123￥ 淘宝商品"
}
```

Response:

```json
{
  "id": "conversion-id",
  "userId": "user-1",
  "rawContent": "￥abc123￥ 淘宝商品",
  "itemId": "mock-item-100",
  "itemTitle": "Mock Taobao Item",
  "itemImageUrl": "https://img.alicdn.com/mock-item.png",
  "itemPriceCents": 9900,
  "commissionRate": 0.12,
  "generatedPassword": "￥mockpassword￥",
  "generatedShortUrl": "https://s.click.taobao.com/mock",
  "generatedClickUrl": "https://uland.taobao.com/mock"
}
```

Validation error:

```json
{
  "error": "rawContent is required"
}
```

## Record Copy Event

```http
POST /api/conversions/:id/copy
Authorization: Bearer local_user-1
Content-Type: application/json

{
  "copyType": "password"
}
```

Response:

```json
{
  "id": "copy-event-id",
  "conversionId": "conversion-id",
  "userId": "user-1",
  "itemId": "mock-item-100",
  "copyType": "password"
}
```

## List Conversions

```http
GET /api/conversions
Authorization: Bearer local_user-1
```

Response:

```json
{
  "conversions": []
}
```

## My Orders

```http
GET /api/orders/me
Authorization: Bearer local_user-1
```

Response:

```json
{
  "orders": []
}
```

## Submit Order Claim

```http
POST /api/orders/claim
Authorization: Bearer local_user-1
Content-Type: application/json

{
  "orderSuffix": "1234",
  "notes": "用户补充说明"
}
```

Response:

```json
{
  "status": "pending_review"
}
```

## Sync Taobaoke Orders

```http
POST /api/jobs/sync-tbk-orders
X-Scheduler-Token: dev-scheduler-token
```

Response:

```json
{
  "ok": true,
  "synced": 0
}
```

## Pending Attributions

```http
GET /api/admin/pending-attributions
X-Admin-Token: dev-admin-token
```

Response:

```json
{
  "items": []
}
```

## Manual Attribute Order

```http
POST /api/admin/orders/:id/attribute
X-Admin-Token: dev-admin-token
```

Response:

```json
{
  "id": "order-id",
  "status": "manual_matched"
}
```

