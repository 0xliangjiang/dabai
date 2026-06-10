# Taobaoke Mini Program MVP Design

## Goal

Build a WeChat mini program for ordinary users to convert Taobao passwords or links into the operator's Taobaoke promotion passwords and links. All resulting Taobaoke commissions belong to the operator's Taobao Alliance account first. The system then attributes orders to users and calculates user commission shares from the operator's profit.

## Scope

The MVP includes:

- WeChat mini program login and user identity.
- Taobao password/link input and conversion.
- Result display with generated Taobaoke password and short link.
- Copy event tracking for attribution.
- Taobaoke order synchronization.
- Automatic order attribution with a manual review path.
- User-facing promotion records and order commission status.
- Admin-facing pending attribution review.
- Configurable user commission sharing ratio.

The MVP does not include:

- Per-user `relation_id`.
- Per-user promotion positions.
- Fully automated guaranteed attribution.
- Multi-level agent hierarchy.
- Wallet withdrawal and payout automation.
- Complex role-based admin console.

## Recommended Approach

Use the standard MVP path:

- Mini program frontend for user actions.
- Server-side API for all Taobao Open Platform calls.
- Scheduled order sync from Taobaoke APIs.
- Hybrid attribution: automatic matching first, user/admin confirmation when confidence is low.

This avoids exposing third-party API keys or PID configuration in the mini program and gives the business a usable first version without depending on `relation_id`.

## Architecture

Repository layout:

```text
miniprogram/
server/
docs/
```

`miniprogram/` contains the WeChat mini program pages and API client.

`server/` contains:

- WeChat login handling.
- Taobaoke conversion service.
- Taobaoke order synchronization.
- Attribution engine.
- Commission ledger.
- Admin review APIs.

`docs/` contains design and implementation documents.

## Mini Program Pages

### Home Conversion

The user pastes a Taobao password, Taobao link, or product link. The page sends the raw content to the server and displays the generated promotion result.

The result page shows:

- Product title.
- Product image when available.
- Estimated price and commission when available.
- Generated Taobaoke password.
- Generated promotion short link.
- Copy buttons for password and link.

Copying a result records a copy event on the server. Attribution uses this copy time as the preferred signal.

### Promotion Records

Shows products the user converted or copied, including copy time, current status, and estimated earnings when available.

### My Orders

Shows attributed orders with commission lifecycle states:

- Estimated.
- Pending settlement.
- Settled.
- Invalid or refunded.
- Pending confirmation.

### Order Claim

Lets the user submit additional evidence when an order was not automatically matched or is disputed. The MVP supports order number suffix and optional screenshot upload.

### Profile

Shows user identity, commission rule copy, and customer service entry.

## UI Direction

Use shadcn/ui for any web admin surface added to the project. shadcn/ui is a good fit for the admin review workflow because it provides clean defaults, editable component source, and strong React composition patterns.

The WeChat mini program frontend cannot directly use shadcn/ui React components. Use TDesign MiniProgram as the preferred mini program UI component library. It fits this project because it is a stable Tencent design system implementation for WeChat MiniProgram, has broad component coverage, and can support a clean AI-era utility interface without looking like a dated rebate app.

The mini program UI should follow this product style direction:

- Quiet, operational screens.
- Clear form controls and status badges.
- Simple cards for repeated conversion and order items.
- Conservative money and commission copy.
- Minimal decorative styling.
- Input-first conversion flow.
- Result panels that make the generated password, generated link, attribution status, and estimated commission easy to scan.

If the implementation includes a web admin app, it should be built with React, Tailwind CSS, and shadcn/ui components such as Button, Input, Table, Badge, Dialog, Tabs, Select, and Toast/Sonner.

## Server APIs

Initial API surface:

```text
POST /api/auth/wechat-login
POST /api/conversions
POST /api/conversions/:id/copy
GET  /api/conversions
GET  /api/orders/me
POST /api/orders/claim
POST /api/jobs/sync-tbk-orders
POST /api/admin/orders/:id/attribute
GET  /api/admin/pending-attributions
```

`POST /api/conversions` accepts raw Taobao content and returns the converted promotion result. It creates a conversion record.

`POST /api/conversions/:id/copy` records that the user copied a generated password or link.

`POST /api/jobs/sync-tbk-orders` runs the Taobaoke order synchronization job. It should be protected by server-side credentials or an internal scheduler token.

Admin APIs must not be exposed to normal mini program users.

The MVP can implement admin review as protected server APIs first. A simple web admin surface can be added in the implementation plan if needed, but admin review must not live in ordinary mini program pages.

## Taobaoke Integration

All Taobao Open Platform calls happen on the server.

The conversion service uses the Taobaoke password/link conversion API, including:

- The raw user input as password or link content.
- The operator's Dingdanxia API key and PID configuration.
- Other operator-level promotion configuration.

The server stores operator credentials and promotion settings in environment variables or encrypted configuration. The mini program never receives `appSecret` or other signing secrets.

Order synchronization periodically pulls recent Taobaoke orders and stores the raw order fields needed for status tracking and attribution.

Recommended sync policy:

- Pull recent orders every 10 to 30 minutes.
- Reconcile historical orders daily for up to 90 days to catch settlement, refund, and status changes.

## Data Model

Core tables:

```text
users
conversions
copy_events
tbk_orders
order_attributions
commission_ledger
order_claims
system_configs
```

### users

Stores mini program users.

Important fields:

- `id`
- `openid`
- `unionid`
- `nickname`
- `avatar_url`
- `created_at`
- `updated_at`

### conversions

Stores each conversion request and generated promotion result.

Important fields:

- `id`
- `user_id`
- `raw_content`
- `item_id`
- `item_title`
- `item_image_url`
- `item_price`
- `commission_rate`
- `generated_password`
- `generated_short_url`
- `generated_click_url`
- `created_at`

### copy_events

Stores copy intent for attribution.

Important fields:

- `id`
- `conversion_id`
- `user_id`
- `copy_type`
- `copied_at`

### tbk_orders

Stores synchronized Taobaoke orders.

Important fields:

- `id`
- `tbk_order_id`
- `item_id`
- `item_title`
- `pay_time`
- `pay_amount`
- `estimated_commission`
- `settled_commission`
- `order_status`
- `raw_payload`
- `synced_at`

### order_attributions

Stores the attribution decision for each Taobaoke order.

Important fields:

- `id`
- `tbk_order_id`
- `user_id`
- `conversion_id`
- `copy_event_id`
- `status`
- `confidence`
- `reason`
- `reviewed_by`
- `reviewed_at`
- `created_at`

Suggested statuses:

- `auto_matched`
- `pending_review`
- `manual_matched`
- `rejected`

### commission_ledger

Stores user commission lifecycle changes.

Important fields:

- `id`
- `user_id`
- `tbk_order_id`
- `amount`
- `ledger_type`
- `status`
- `reason`
- `created_at`

Suggested ledger types:

- `estimated`
- `settled`
- `reversal`

### order_claims

Stores user-submitted evidence for matching.

Important fields:

- `id`
- `user_id`
- `order_suffix`
- `screenshot_url`
- `notes`
- `status`
- `reviewed_by`
- `reviewed_at`
- `created_at`

## Attribution Rules

Attribution uses a two-layer model.

### Automatic Matching

Match orders to users by:

- Same `item_id`.
- Order pay time within a configured window after a copy event.
- Prefer copy events over conversion creation time.

Default window:

- 24 hours after copy event.

Automatic attribution succeeds only when there is one clear candidate.

### Pending Review

Create a pending review attribution when:

- Multiple users copied the same item inside the attribution window.
- The candidate is outside the normal time window.
- The order amount or commission exceeds a configured review threshold.
- Item data is incomplete.
- The order is claimed by a user after sync.

The admin can approve or reject attribution manually.

### User Claims

Users can submit an order number suffix and optional screenshot. Claims do not automatically award commission. They create review context for an admin decision.

## Commission States

User-facing commission must be stateful:

- After payment: show estimated commission.
- After Taobaoke settlement: convert to settled commission.
- After refund or invalid status: reverse or mark invalid.

The UI should use "estimated" language before settlement. It must not promise guaranteed income before the Taobaoke order is valid and settled.

User commission is calculated from the operator's Taobaoke commission by a configurable sharing ratio. The MVP uses one global ratio unless a later implementation plan explicitly adds user groups or agent tiers.

## Compliance and Product Copy

Because the mini program serves ordinary users and displays commission sharing, the product must use conservative language:

- Show commission as estimated before Taobaoke settlement.
- Explain that refunds, invalid orders, delayed settlement, or attribution disputes can change the final amount.
- Avoid promising fixed income or guaranteed rebates.
- Present commission rules in the Profile page and any order detail page where money is shown.
- Keep manual review rules visible enough that users understand why some orders are pending.

The implementation must also follow WeChat mini program requirements for user privacy, uploaded images, and customer service entry. Claim screenshots should be treated as sensitive user-submitted evidence and retained only as long as needed for review and audit.

## Error Handling

Conversion errors:

- Invalid or unsupported content returns a friendly validation message.
- Taobao API failures return a retryable service message.
- Rate limiting returns a short cooldown message.

Order sync errors:

- Failed sync jobs are logged with request ID and retry context.
- Partial sync failures must not delete existing order data.
- Raw payloads are preserved for audit and debugging.

Attribution errors:

- Low-confidence matches enter pending review instead of being silently assigned.
- Manual admin decisions are auditable.

## Security

Security requirements:

- Store Taobao API credentials only on the server.
- Do not expose Dingdanxia API keys, PID configuration, or conversion provider credentials to the mini program.
- Protect job and admin endpoints.
- Authenticate all user APIs.
- Validate uploaded claim screenshots.
- Restrict claim screenshot access to the submitting user and admins.
- Record admin attribution decisions for audit.
- Avoid storing unnecessary personal data.

## Testing Strategy

Server tests:

- Taobao API signing and request construction.
- Conversion record creation.
- Copy event recording.
- Order sync idempotency.
- Attribution with single candidate.
- Attribution with multiple candidates.
- Commission ledger settlement and reversal.

Mini program tests or manual checks:

- Login flow.
- Conversion success.
- Conversion validation failure.
- Copy event creation.
- Promotion records rendering.
- Order list states.
- Order claim submission.

## Open Configuration

These should be configurable without code changes:

- Dingdanxia API key.
- Dingdanxia PID.
- Commission sharing ratio.
- Attribution time window.
- High-value review threshold.
- Order sync interval.
- Historical reconciliation days.
