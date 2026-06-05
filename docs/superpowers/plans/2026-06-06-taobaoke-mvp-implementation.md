# Taobaoke Mini Program MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first runnable Taobaoke conversion MVP with a WeChat mini program frontend, Node.js server API, and React admin shell.

**Architecture:** Use a TypeScript monorepo with `server/`, `miniprogram/`, and `admin/`. The server owns all Taobao and WeChat integrations, stores data through a Prisma boundary, and exposes typed HTTP APIs. The mini program uses TDesign MiniProgram-compatible page structure, while the admin shell uses React, Tailwind CSS, and shadcn/ui-style local components.

**Tech Stack:** Node.js, TypeScript, npm workspaces, Fastify, Prisma with SQLite for local development, Vitest, WeChat native mini program, TDesign MiniProgram, React, Vite, Tailwind CSS, shadcn/ui-style components.

---

## File Structure

- Create `package.json`: root workspace scripts.
- Create `tsconfig.base.json`: shared TypeScript options.
- Create `server/package.json`: server package scripts and dependencies.
- Create `server/src/app.ts`: Fastify app factory.
- Create `server/src/server.ts`: local server entry.
- Create `server/src/config/env.ts`: environment loading and validation.
- Create `server/src/domain/attribution.ts`: order attribution rules.
- Create `server/src/domain/commission.ts`: commission ledger calculation.
- Create `server/src/domain/conversion.ts`: conversion service boundary.
- Create `server/src/integrations/taobao/client.ts`: Taobao adapter interface and mock/local implementation.
- Create `server/src/routes/*.ts`: route modules for auth, conversions, orders, jobs, admin.
- Create `server/prisma/schema.prisma`: local data model.
- Create `server/tests/*.test.ts`: focused server behavior tests.
- Create `miniprogram/`: native WeChat mini program skeleton using TDesign component references.
- Create `admin/`: Vite React admin shell with local shadcn/ui-style primitives.
- Modify `docs/superpowers/specs/2026-06-06-taobaoke-miniprogram-design.md` only if implementation reveals necessary clarifications.

---

### Task 1: Workspace Baseline

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/vitest.config.ts`

- [ ] **Step 1: Create root workspace configuration**

Add root scripts for install, test, typecheck, and dev.

- [ ] **Step 2: Create server package configuration**

Add Fastify, Prisma, Vitest, TypeScript, and development scripts.

- [ ] **Step 3: Install dependencies**

Run: `npm install`

Expected: lockfile created and dependencies installed.

- [ ] **Step 4: Run baseline verification**

Run: `npm test`

Expected: fails because no tests exist yet or exits with no test files depending Vitest behavior. This is acceptable only before Task 2 starts.

- [ ] **Step 5: Commit**

Run:

```bash
git add package.json package-lock.json tsconfig.base.json server/package.json server/tsconfig.json server/vitest.config.ts
git commit -m "chore: set up TypeScript workspace"
```

---

### Task 2: Attribution and Commission Domain with TDD

**Files:**
- Create: `server/src/domain/attribution.ts`
- Create: `server/src/domain/commission.ts`
- Create: `server/tests/attribution.test.ts`
- Create: `server/tests/commission.test.ts`

- [ ] **Step 1: Write failing attribution tests**

Tests:

- Single copy event with same item inside 24 hours returns `auto_matched`.
- Multiple copy events for same item inside window returns `pending_review`.
- Copy event outside window returns `pending_review`.
- Different item returns `unmatched`.

- [ ] **Step 2: Run attribution tests to verify RED**

Run: `npm test --workspace server -- attribution`

Expected: FAIL because `matchOrderAttribution` does not exist.

- [ ] **Step 3: Implement minimal attribution domain**

Implement `matchOrderAttribution(order, copyEvents, options)` with deterministic return statuses and reasons.

- [ ] **Step 4: Run attribution tests to verify GREEN**

Run: `npm test --workspace server -- attribution`

Expected: PASS.

- [ ] **Step 5: Write failing commission tests**

Tests:

- Estimated Taobaoke commission and global sharing ratio produce user estimated amount.
- Settled commission produces settled ledger entry.
- Invalid/refunded order produces reversal ledger entry.

- [ ] **Step 6: Run commission tests to verify RED**

Run: `npm test --workspace server -- commission`

Expected: FAIL because `buildCommissionLedgerEntry` does not exist.

- [ ] **Step 7: Implement minimal commission domain**

Implement money-safe cent calculation using integer cents.

- [ ] **Step 8: Run domain tests**

Run: `npm test --workspace server`

Expected: PASS.

- [ ] **Step 9: Commit**

Run:

```bash
git add server/src/domain server/tests
git commit -m "feat: add attribution and commission domain logic"
```

---

### Task 3: Server API Skeleton with TDD

**Files:**
- Create: `server/src/app.ts`
- Create: `server/src/server.ts`
- Create: `server/src/config/env.ts`
- Create: `server/src/domain/conversion.ts`
- Create: `server/src/integrations/taobao/client.ts`
- Create: `server/src/routes/auth.ts`
- Create: `server/src/routes/conversions.ts`
- Create: `server/src/routes/orders.ts`
- Create: `server/src/routes/jobs.ts`
- Create: `server/src/routes/admin.ts`
- Create: `server/tests/api.test.ts`

- [ ] **Step 1: Write failing API tests**

Tests:

- `GET /health` returns `{ ok: true }`.
- `POST /api/auth/wechat-login` returns a local session token for a mock code.
- `POST /api/conversions` validates empty input.
- `POST /api/conversions` returns a mock generated password and link for valid input.
- `POST /api/conversions/:id/copy` records copy intent in the local repository.
- `GET /api/orders/me` returns an empty list for a new user.

- [ ] **Step 2: Run API tests to verify RED**

Run: `npm test --workspace server -- api`

Expected: FAIL because app factory and routes do not exist.

- [ ] **Step 3: Implement Fastify app factory and in-memory repositories**

Use in-memory repositories for the first runnable MVP. Keep Prisma schema in Task 4 as the intended persistence model.

- [ ] **Step 4: Implement Taobao conversion adapter boundary**

Provide `TaobaoClient` interface and `MockTaobaoClient` that returns deterministic conversion data when real credentials are absent.

- [ ] **Step 5: Implement route modules**

Register auth, conversion, orders, jobs, and admin routes. Protect admin and job routes with simple token headers from environment config.

- [ ] **Step 6: Run API tests to verify GREEN**

Run: `npm test --workspace server -- api`

Expected: PASS.

- [ ] **Step 7: Run all server tests**

Run: `npm test --workspace server`

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add server/src server/tests
git commit -m "feat: add server API skeleton"
```

---

### Task 4: Prisma Data Model

**Files:**
- Create: `server/prisma/schema.prisma`
- Create: `server/.env.example`
- Modify: `server/package.json`

- [ ] **Step 1: Add Prisma schema**

Define `User`, `Conversion`, `CopyEvent`, `TbkOrder`, `OrderAttribution`, `CommissionLedger`, `OrderClaim`, and `SystemConfig`.

- [ ] **Step 2: Add local environment example**

Include placeholders for Taobao credentials, WeChat app credentials, admin token, scheduler token, SQLite URL, `ADZONE_ID`, and commission ratio.

- [ ] **Step 3: Validate Prisma schema**

Run: `DATABASE_URL="file:./dev.db" npm run prisma --workspace server -- validate`

Expected: PASS.

- [ ] **Step 4: Commit**

Run:

```bash
git add server/prisma/schema.prisma server/.env.example server/package.json
git commit -m "feat: define server persistence model"
```

---

### Task 5: WeChat Mini Program Skeleton with TDesign

**Files:**
- Create: `miniprogram/app.json`
- Create: `miniprogram/app.js`
- Create: `miniprogram/app.wxss`
- Create: `miniprogram/project.config.json`
- Create: `miniprogram/sitemap.json`
- Create: `miniprogram/utils/api.js`
- Create: `miniprogram/pages/home/*`
- Create: `miniprogram/pages/records/*`
- Create: `miniprogram/pages/orders/*`
- Create: `miniprogram/pages/claim/*`
- Create: `miniprogram/pages/profile/*`

- [ ] **Step 1: Create mini program app shell**

Use native WeChat files and declare TDesign components in page JSON files.

- [ ] **Step 2: Build home conversion page**

Implement input-first conversion screen with result panel and copy buttons.

- [ ] **Step 3: Build records, orders, claim, and profile pages**

Use simple list, status, upload placeholder, and profile settings layouts.

- [ ] **Step 4: Add mini program API utility**

Centralize base URL, login token storage, request wrapper, and copy event calls.

- [ ] **Step 5: Run static sanity check**

Run: `find miniprogram -type f | sort`

Expected: all required page files exist.

- [ ] **Step 6: Commit**

Run:

```bash
git add miniprogram
git commit -m "feat: add mini program MVP shell"
```

---

### Task 6: Web Admin Shell with shadcn/ui Style

**Files:**
- Create: `admin/package.json`
- Create: `admin/index.html`
- Create: `admin/postcss.config.js`
- Create: `admin/tailwind.config.ts`
- Create: `admin/tsconfig.json`
- Create: `admin/vite.config.ts`
- Create: `admin/src/main.tsx`
- Create: `admin/src/App.tsx`
- Create: `admin/src/index.css`
- Create: `admin/src/components/ui/button.tsx`
- Create: `admin/src/components/ui/badge.tsx`
- Create: `admin/src/components/ui/table.tsx`
- Create: `admin/src/lib/utils.ts`

- [ ] **Step 1: Create Vite React admin app**

Set up Tailwind-ready CSS and local component primitives following shadcn/ui conventions.

- [ ] **Step 2: Build pending attribution review page**

Render a table of pending orders, confidence, reason, and approve/reject actions.

- [ ] **Step 3: Add API client placeholder**

Use `VITE_API_BASE_URL` and admin token header placeholder.

- [ ] **Step 4: Typecheck admin**

Run: `npm run typecheck --workspace admin`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add admin package.json package-lock.json
git commit -m "feat: add admin review shell"
```

---

### Task 7: Documentation and Full Verification

**Files:**
- Create: `README.md`
- Create: `docs/api.md`
- Modify: `docs/superpowers/specs/2026-06-06-taobaoke-miniprogram-design.md` only if needed.

- [ ] **Step 1: Add README**

Document local setup, server dev, mini program import path, admin dev, environment variables, and current mock Taobao behavior.

- [ ] **Step 2: Add API documentation**

Document request/response examples for the implemented MVP endpoints.

- [ ] **Step 3: Run full verification**

Run:

```bash
npm test
npm run typecheck
DATABASE_URL="file:./dev.db" npm run prisma --workspace server -- validate
```

Expected: all commands PASS.

- [ ] **Step 4: Commit docs**

Run:

```bash
git add README.md docs/api.md docs/superpowers/plans/2026-06-06-taobaoke-mvp-implementation.md
git commit -m "docs: add MVP implementation guide"
```

- [ ] **Step 5: Final status**

Run:

```bash
git status --short
git log --oneline -5
```

Expected: clean working tree and recent implementation commits visible.
