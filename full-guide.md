# UniHub Workshop: AI Context Guide

Đây là single source of truth cho AI làm việc trên repo. Mọi quyết định ở đây đã chốt. AI follow, không đề xuất đổi nếu user không hỏi.

## TLDR

Hệ thống đăng ký workshop nội bộ trường ĐH. MVP 2 ngày, demo localhost, không deploy. 3 role: `student`, `organizer`, `scanner`. **Single committee**: mọi `organizer` ngang quyền trên mọi workshop. Lõi kỹ thuật: seat consistency, 12K concurrent target (design goal), offline check-in, payment resilience.

## Hard rules (cấm)

1. KHÔNG ownership check: không field `created_by`, không middleware `requireOwnership`, không error `FORBIDDEN_OWNERSHIP`.
2. KHÔNG Redis. Idempotency + rate limit + cache dùng Postgres + in-memory.
3. KHÔNG `SELECT ... FOR UPDATE` thủ công cho seat. Dùng atomic `UPDATE ... WHERE seats_remaining > 0`.
4. KHÔNG optimistic locking cho seat.
5. KHÔNG Background Sync API (iOS Safari không support). Foreground sync.
6. KHÔNG nhúng role vào JWT claim. Query `profiles` mỗi request.
7. KHÔNG lưu JWT trong `localStorage`. In-memory React state.
8. KHÔNG thêm dependency mới khi chưa có agreement.
9. KHÔNG microservices, Kafka, BullMQ, Edge Functions.
10. KHÔNG real payment gateway, real email provider. Mock.
11. Backend dùng `SUPABASE_SERVICE_ROLE_KEY` bypass RLS. RLS là safety net cho 2 bảng FE chạm: `workshops`, `profiles`. Source of truth phân quyền: Express middleware.
12. Module A KHÔNG import repository module B. Đi qua service interface hoặc EventEmitter.
13. KHÔNG `any` trong TS. Strict mode = strict.
14. KHÔNG secret trong code. Mọi key qua `process.env`. Service role key không chạm FE bundle.
15. KHÔNG sửa schema trực tiếp Supabase dashboard. Migration file trong `supabase/migrations/`.
16. KHÔNG bịa business rule. Thiếu info: hỏi user.

## Stack

| Layer | Tech |
|---|---|
| FE | React 19, Vite 6, TS strict, Tailwind v3, React Router v6, TanStack Query v5, Zod, vite-plugin-pwa, html5-qrcode, Recharts |
| BE | Express 4.21, TS, Zod, opossum, express-rate-limit, node-cron, pdf-parse, PapaParse |
| DB | Supabase (Postgres, Auth, RLS, Realtime, Storage), free tier |
| AI | OpenAI SDK gọi từ Express |
| Test | Vitest |
| Notification | Node `EventEmitter` in-process |

## Architecture

Modular Monolith, 8 bounded context. Layered 4 tầng BE: routes → services → repositories → Supabase. Per-feature style: Catalog/Registration/Payment/Checkin/Identity = Layered. Notification = Event-based. CSV = Batch ETL. AI Summary = Pipe-and-Filter.

Cross-module communication: (a) gọi service interface đồng bộ, hoặc (b) EventEmitter fire-and-forget. Ports & Adapters: services chỉ phụ thuộc TS interface (`INotifier`, `IPaymentGateway`, `IWorkshopRepository`), không import Supabase/OpenAI/nodemailer trực tiếp. Adapter đăng ký DI khi khởi động.

## API conventions

- RESTful, prefix `/api/v1/`. Public duy nhất: `GET /api/v1/workshops`.
- Response envelope: `{ data: T|null, error: { code, message, details? }|null, meta? }`.
- Validate Zod tại entry routes. Schema dùng chung FE/BE qua `shared/`.
- `POST /api/v1/registrations` và `POST /api/v1/payments` BẮT BUỘC header `Idempotency-Key: <uuid>`. Thiếu: 400 `IDEMPOTENCY_KEY_REQUIRED`.
- Error code: UPPER_SNAKE_CASE. Catalog cơ bản: `UNAUTHENTICATED`, `INVALID_TOKEN`, `TOKEN_EXPIRED`, `PROFILE_NOT_FOUND`, `FORBIDDEN_ROLE`, `RESOURCE_NOT_FOUND`, `RATE_LIMIT_EXCEEDED`, `IDEMPOTENCY_KEY_REQUIRED`, `REQUEST_IN_PROGRESS`, `SEATS_SOLD_OUT`, `ALREADY_REGISTERED`, `PAYMENT_UNAVAILABLE`, `TICKET_NOT_FOUND`, `WRONG_WORKSHOP`, `ALREADY_CHECKED_IN`, `PDF_READ_FAILED`, `STATS_UNAVAILABLE`.
- 404 thay vì 403 cho resource ẩn (workshop chưa publish): chống information disclosure.

| HTTP | Khi nào |
|---|---|
| 200/201/202/204 | Success / Created / Accepted (job async) / Deleted |
| 400 | Validation fail, header thiếu |
| 401 | Auth fail (4 code ở trên) |
| 403 | `FORBIDDEN_ROLE` |
| 404 | Không tồn tại HOẶC không có quyền xem |
| 409 | `REQUEST_IN_PROGRESS`, `ALREADY_REGISTERED`, `ALREADY_CHECKED_IN` |
| 429 | `RATE_LIMIT_EXCEEDED` + `Retry-After` header |
| 503 | `PAYMENT_UNAVAILABLE` khi CB OPEN, `STATS_UNAVAILABLE` khi query timeout |

## Database

KHÔNG liệt kê schema ở đây. AI muốn xem schema thật: dùng MCP `supabase` (list_tables, execute_sql) nếu được connect, hoặc đọc `supabase/migrations/`.

Rules tuyệt đối:

- PK = `uuid` (`gen_random_uuid()`).
- Mọi bảng bật RLS. Policy public chỉ trên `workshops` (SELECT khi `is_published AND cancelled_at IS NULL`) và `profiles` (self-read/update). 6 bảng còn lại RLS bật + 0 policy = deny-all.
- snake_case cho table/column.
- Parameterized query, không string interpolation.
- Soft delete cho bảng có FK ngược (`is_active`, `cancelled_at`). No hard delete.
- Constraints nghiệp vụ: `registrations UNIQUE(student_id, workshop_id)`, `check_ins UNIQUE(registration_id)`, `idempotency_keys PRIMARY KEY (key, endpoint)`.

## RBAC

Mô hình: RBAC thuần, 3 role. **KHÔNG ownership.** Middleware chain: `verifyJwt` → `loadProfile` → `requireRole([...])`. Không có middleware ownership. `loadProfile` query `profiles` mỗi request để revoke role có hiệu lực ngay.

| Hành động | Endpoint | student | organizer | scanner | anon |
|---|---|:-:|:-:|:-:|:-:|
| List workshop | `GET /workshops` | Y | Y | Y | Y |
| View public | `GET /workshops/:id` | Y | Y | Y | Y |
| View draft | `GET /workshops/:id` | 404 | Y | 404 | 404 |
| Create/Edit/Cancel WS | `POST/PATCH/DELETE /workshops[/:id]` | N | Y | N | N |
| Register | `POST /registrations` | Y (mình) | N | N | N |
| Xem reg của mình | `GET /registrations/me` | Y | n/a | n/a | N |
| Xem all reg | `GET /admin/registrations` | N | Y | N | N |
| Scan QR + sync | `POST /check-ins[/sync]` | N | Y | Y | N |
| Stats | `GET /admin/stats` | N | Y | N | N |
| AI summary | `POST /workshops/:id/summary` | N | Y | N | N |
| Trigger CSV manual | `POST /admin/csv-import` | N | Y | N | N |

## Critical patterns

| Pattern | Decision | Reference |
|---|---|---|
| Seat reservation | Atomic UPDATE với `WHERE seats_remaining > 0 RETURNING`, wrap transaction cùng INSERT registration. Pessimistic implicit qua row lock. Compensating action khi payment fail: UPDATE +1. | `blueprint/specs/seat-reservation.md`, ADR-004 |
| Idempotency | Postgres `INSERT INTO idempotency_keys ... ON CONFLICT (key, endpoint) DO NOTHING RETURNING`. Thắng: chạy handler, capture response qua proxy `res.json`. Conflict + `in_progress`: 409. Conflict + `done`: return cached. TTL 24h. FE sinh `crypto.randomUUID()` lúc click đầu, lưu React state, retry cùng key. | `blueprint/specs/payment.md`, ADR-008 |
| Circuit breaker | `opossum` wrap `MockPaymentGateway.charge()`. Cấu hình: `timeout: 3000`, `errorThresholdPercentage: 50`, `resetTimeout: 30000`. Phân biệt lỗi 4xx (business, bypass CB) vs 5xx/timeout (system, trip CB). OPEN: trả 503 `PAYMENT_UNAVAILABLE`, giữ chỗ `pending_payment` 15p, cron 1p quét release. | `blueprint/specs/payment.md`, ADR-007 |
| Rate limit | `express-rate-limit` memory store, Token Bucket. Global: 200/15p/IP. Critical (`POST /registrations`): 20/1p/IP. Trả 429 + `Retry-After`. | ADR-006 |
| Notification | Outbox: INSERT `notifications.status='pending'` trong cùng transaction với registration. Emit `RegistrationConfirmed` SAU commit. Listener gọi `Promise.allSettled([inApp, email])`. Worker cron 5p retry `status IN ('pending','failed') AND retry_count<3 AND updated_at < now()-2m`. INotifier interface, thêm kênh = implement + DI register, không sửa logic đăng ký. At-least-once. | `blueprint/specs/notification.md`, ADR-012, ADR-005 |
| Offline check-in | PWA + IndexedDB (`vite-plugin-pwa`). Offline: lưu `{client_id: uuid(), qr_token, workshop_id, scanned_at}` IndexedDB. Sync: foreground (`window.addEventListener('online')` + nút "Đồng bộ ngay"). Endpoint `POST /check-ins/sync` nhận batch, INSERT `ON CONFLICT (registration_id) DO NOTHING`, trả 200 + `{synced, errors}` (Partial Success Pattern, không 4xx cho 1 vé rác). | `blueprint/specs/checkin.md`, ADR-009 |
| CSV import | `node-cron` 02:00 daily. Stream `fs.createReadStream` + PapaParse stream. Validate header `mssv,full_name`. Bulk upsert batch 1000-2000: `INSERT ... ON CONFLICT (mssv) DO UPDATE SET full_name=EXCLUDED.full_name, is_active=true`. Soft delete: `UPDATE students SET is_active=false WHERE mssv NOT IN (<batch)`. KHÔNG hard delete. Empty file: warning, KHÔNG soft-delete (tránh wipe). File naming: `students_nightly_YYYY-MM-DD.csv`, UTF-8. KHÔNG upload UI manual. | `blueprint/specs/csv-import.md`, ADR-013 |
| AI summary | Pipe-and-Filter: `pdf-parse` → clean (regex) → OpenAI (chunking 2000 chars + map-reduce nếu vượt context) → `UPDATE workshops SET ai_summary`. Endpoint `POST /workshops/:id/summary` trả 202, FE nhận qua Supabase Realtime. PDF only, max 5MB, max 3 lần/workshop, text<50 từ reject `PDF_NO_TEXT`, retry OpenAI 429/503 max 3 lần exponential backoff. | `blueprint/specs/ai-summary.md` |
| Analytics dashboard | Read-only `GET /admin/stats`. Aggregate query Postgres (COUNT FILTER, JOIN, GROUP BY). Cache JS Map TTL 60s. Recharts. Query timeout > 5s: 503 `STATS_UNAVAILABLE`. `NULLIF(_, 0)` chống chia 0. | `blueprint/specs/analytics-dashboard.md` |

## ADR table

| # | Decision |
|---|---|
| 001 | Modular Monolith + Layered + Event-based + Batch + Pipe-Filter |
| 002 | PostgreSQL Supabase duy nhất |
| 003 | Strong consistency cho seat + payment; eventual cho display + notification |
| 004 | Pessimistic implicit qua atomic UPDATE cho seat |
| 005 | Service interface trước implementation (DIP/OCP/ISP) |
| 006 | Token Bucket rate limit, express-rate-limit memory store |
| 007 | Circuit breaker opossum 50%/3s/30s |
| 008 | Idempotency Postgres INSERT ON CONFLICT, TTL 24h |
| 009 | PWA + IndexedDB + Foreground sync (bỏ Background Sync API) |
| 010 | RBAC thuần, KHÔNG ownership, 2-layer (middleware + RLS minimal) |
| 011 | KHÔNG Redis ở MVP |
| 012 | Outbox pattern cho notification |
| 013 | CSV import cron 02:00, không upload UI |

## YAGNI (KHÔNG build)

Sharding, read replica, Redis, Kafka/RabbitMQ/BullMQ, microservices, Background Sync API, real payment/email gateway, Telegram notifier impl (chỉ giữ interface), 2PC, ABAC/Casbin/OPA, ownership check, `created_by`, self-signup role, CSV upload UI, localStorage JWT, JWT role claim, multi-instance, Edge Functions.

## Naming

`kebab-case.ts` cho TS file, `PascalCase.tsx` cho React component, `snake_case` cho DB, `/api/v1/kebab-case` routes, `UPPER_SNAKE_CASE` env + error code, `PascalCase` types, prefix `I` cho interface port.

## Folder

```
CLAUDE.md                           # trỏ @blueprint/full-guide.md
blueprint/
  full-guide.md                     # file này
  proposal.md  design.md
  specs/                            # spec từng feature, guide thắng khi mâu thuẫn
frontend/src/{modules,components,hooks,lib}
backend/src/
  modules/{catalog,registration,payment,checkin,notify,identity,datasync,ai-summary}
  middleware/{auth,idempotency,rate-limit,error-handler}
  infra/{supabase,event-bus,di}
  shared/                           # Zod schemas FE/BE
supabase/migrations/                # mọi schema change
```

## Reference index

| Topic | File |
|---|---|
| Auth + RBAC matrix | `blueprint/specs/auth.md`, `blueprint/specs/access-control.md` *(LƯU Ý: 2 file này còn references ownership cũ, ignore phần đó. Guide này thắng.)* |
| Payment + CB + idempotency | `blueprint/specs/payment.md` |
| Offline check-in | `blueprint/specs/checkin.md` |
| CSV import | `blueprint/specs/csv-import.md` |
| AI summary | `blueprint/specs/ai-summary.md` |
| Notification | `blueprint/specs/notification.md` |
| Analytics | `blueprint/specs/analytics-dashboard.md` |
| C4 + high-level | `blueprint/design.md` |
| Problem + scope | `blueprint/proposal.md` |
| DB schema thật | MCP `supabase` (nếu connect) hoặc `supabase/migrations/` |

## Required Vitest

Seat race condition, payment idempotency, circuit breaker state transitions. Test khác: theo spec acceptance criteria.
