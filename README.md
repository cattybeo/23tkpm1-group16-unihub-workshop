# UniHub Workshop

> Hệ thống đăng ký workshop nội bộ cho trường đại học — thay thế Google Form bằng nền tảng có kiểm soát chỗ ngồi realtime, thanh toán có phí, check-in offline-first, AI Summary từ PDF, và import dữ liệu sinh viên từ CSV nightly.

**Nhóm 16 — 23TKPM1**

| MSSV | Họ và tên | Email |
|------|-----------|-------|
| 23127417 | Đào Hoàng Đức Mạnh | dhdmanh23@clc.fitus.edu.vn |
| 22127403 | Nguyễn Trần Minh Thư | ntmthu22@clc.fitus.edu.vn |
| 23127362 | Phạm Anh Hào | pahao23@clc.fitus.edu.vn |

---

## Mục lục

- [Bối cảnh & Vấn đề](#bối-cảnh--vấn-đề)
- [Tính năng chính](#tính-năng-chính)
- [Kiến trúc hệ thống](#kiến-trúc-hệ-thống)
- [Tech Stack](#tech-stack)
- [Cấu trúc dự án](#cấu-trúc-dự-án)
- [Yêu cầu hệ thống](#yêu-cầu-hệ-thống)
- [Hướng dẫn cài đặt](#hướng-dẫn-cài-đặt)
- [Biến môi trường](#biến-môi-trường)
- [Database Schema](#database-schema)
- [Dữ liệu mẫu & Tài khoản test](#dữ-liệu-mẫu--tài-khoản-test)
- [Trạng thái implementation hiện tại](#trạng-thái-implementation-hiện-tại)
- [Phân quyền (RBAC)](#phân-quyền-rbac)
- [API Overview](#api-overview)
- [Các cơ chế kỹ thuật nổi bật](#các-cơ-chế-kỹ-thuật-nổi-bật)
- [Testing](#testing)
- [Quy định commit](#quy-định-commit)
- [Tài liệu tham khảo](#tài-liệu-tham-khảo)

---

## Bối cảnh & Vấn đề

Trường tổ chức "Tuần lễ kỹ năng và nghề nghiệp" — 5 ngày, 8–12 workshop song song mỗi ngày. Hệ thống hiện tại dùng Google Form dẫn đến:

| Vấn đề | Hậu quả |
|--------|---------|
| Overbooking | Không giới hạn chỗ realtime, sinh viên đăng ký vào workshop đã đầy |
| Check-in thủ công | Điểm danh tay, dễ sai sót |
| Thiếu kiểm soát thu phí | Không có luồng thanh toán |
| Không chịu tải | Mất/trễ thông báo khi đột biến ~12.000 sinh viên |
| Thiếu analytics | Không đo được tỷ lệ tham dự hay workshop nào hot |

**Mục tiêu thiết kế:**

| Mục tiêu | Tiêu chí |
|-----------|----------|
| Seat consistency | 0 double-booking kể cả 12.000 sinh viên đăng ký đồng thời |
| Payment idempotency | Một giao dịch chỉ thực hiện đúng 1 lần dù client retry nhiều lần |
| Offline check-in | 0% data loss khi mất mạng, sync khi kết nối phục hồi |
| CSV import an toàn | File lỗi / dữ liệu trùng không làm crash service đang chạy |
| Thông báo extensible | Thêm kênh mới (Telegram…) mà không sửa logic đăng ký |

> **Phạm vi:** MVP chạy localhost, không deploy production. Cổng thanh toán và email đều là mock. 12.000 user là mục tiêu thiết kế, không phải benchmark thực tế.

---

## Tính năng chính

### Sinh viên
- Duyệt danh sách workshop: tìm kiếm, filter, sort theo thời gian và phòng
- Xem số chỗ còn lại **realtime** (Supabase Realtime WebSocket)
- Đăng ký workshop miễn phí / có phí — nhận mã QR xác nhận
- Xem và quản lý vé của mình

### Ban tổ chức (Organizer)
- Tạo, chỉnh sửa, hủy workshop (hủy = soft-delete `cancelled_at`, tự gửi thông báo đến sinh viên đã đăng ký)
- Upload file ảnh bìa (`cover_image_url`) và sơ đồ phòng (`room_map_url`) lên Supabase Storage
- Upload PDF → hệ thống tự tóm tắt nội dung bằng AI (OpenAI), kết quả lưu vào `summary_md`
- Xem dashboard thống kê: tổng đăng ký, tỷ lệ lấp đầy phòng, tỷ lệ tham dự, biểu đồ đăng ký theo giờ (Recharts)
- Xem log CSV import nightly

### Nhân sự check-in (Scanner)
- Quét mã QR tại cửa phòng bằng PWA (cài ra màn hình chính, UX như app native)
- **Offline-first:** ghi nhận check-in khi mất mạng (lưu IndexedDB), tự đồng bộ khi có mạng trở lại
- Nút "Đồng bộ ngay" để chủ động flush dữ liệu offline

---

## Kiến trúc hệ thống

Hệ thống theo kiểu **Modular Monolith** — một đơn vị triển khai, chia thành 8 bounded context. Backend Express áp dụng **Layered 4 tầng**: `routes → services → repositories → Supabase`.

```
                       VERTICAL (bounded contexts)
       ┌──────────┬──────────┬─────────┬─────────┬──────────┬─────────┐
       │ Catalog  │ Registr. │ Payment │ Checkin │ Notify   │ AI/CSV/ │
       │          │          │         │         │          │ Identity│
H ─────┼──────────┼──────────┼─────────┼─────────┼──────────┼─────────┤
O   R  │ /api/v1/ │ /api/v1/ │ /api/v1/│/api/v1/ │ /api/v1/ │ /api/v1/│
R   O  │workshops │  regist. │payments │checkins │notify    │csv,ai   │
I   U  ├──────────┼──────────┼─────────┼─────────┼──────────┼─────────┤
Z   T  │ Service  │ Service  │ Service │ Service │ Service  │ Service │
O   E  │ (query   │ (seat    │ (CB +   │ (sync   │(EventEm. │ (batch+ │
N   S  │  + cache)│  reserv.)│ idem.)  │  logic) │ + outbox)│ pipeline)│
T      ├──────────┼──────────┼─────────┼─────────┼──────────┼─────────┤
A   D  │ Repo     │ Repo     │ Repo    │ Repo    │ Repo     │ Repo    │
L   B  │workshops │regist.   │idem_keys│check_ins│notif.    │students │
       └──────────┴──────────┴─────────┴─────────┴──────────┴─────────┘

Cross-cutting middleware:
  verifyJwt → loadProfile → requireRole([...]) → (requireOwnership)
  Rate Limit (Token Bucket) · Idempotency · Logger · Error handler
```

**Phong cách kiến trúc theo module:**

| Module | Phong cách |
|--------|-----------|
| Catalog, Registration, Payment, Checkin, Identity | Layered |
| Notification | Event-based (EventEmitter + Outbox pattern) |
| CSV Import | Batch Sequential (ETL pipeline) |
| AI Summary | Pipe-and-Filter |

**Giao tiếp giữa module:** gọi service interface đồng bộ hoặc `EventEmitter` fire-and-forget. Module A không được import repository của module B.

Ports & Adapters: services phụ thuộc TS interface (`INotifier`, `IPaymentGateway`, `IWorkshopRepository`), không import Supabase/OpenAI trực tiếp.

Xem sơ đồ C4 Level 1, Level 2 và High-Level Architecture tại [`blueprint/design.md`](blueprint/design.md) và thư mục [`img/`](img/).

---

## Tech Stack

### Frontend

| Thư viện | Version | Vai trò |
|----------|---------|---------|
| React | ^19.0.0 | UI framework |
| TypeScript | ^5.7.0 | Ngôn ngữ, strict mode |
| Vite + `@vitejs/plugin-react-swc` | ^6.2.0 / ^3.7.0 | Build tool, HMR nhanh |
| Tailwind CSS | ^3.4.0 | Utility-first CSS |
| React Router | ^6.28.0 | Client-side routing |
| TanStack Query | ^5.62.0 | Server state, cache, retry |
| Supabase JS | ^2.47.0 | Auth (JWT + auto-refresh) + Realtime WebSocket |
| Zod | ^3.24.0 | Schema validation (dùng chung với BE) |
| lucide-react | ^1.16.0 | Icon set |
| html5-qrcode | ^2.3.8 | QR scanner qua camera (iOS Safari WebRTC) |
| vite-plugin-pwa | ^0.21.0 | Service Worker + Web App Manifest |
| workbox-window | ^7.0.0 | SW lifecycle & foreground sync |
| Vitest | ^3.0.0 | Test runner |

### Backend

| Thư viện | Version | Vai trò |
|----------|---------|---------|
| Express | ^4.21.0 | HTTP framework |
| TypeScript | ^5.7.0 | Ngôn ngữ, strict mode |
| tsx | ^4.19.0 | TS runner dev (không cần compile bước) |
| Supabase JS | ^2.47.0 | Auth verify JWT + DB client (bypass RLS) |
| Zod | ^3.24.0 | Schema validation tại entry routes |
| cors | ^2.8.5 | CORS cho FE :5173 ↔ BE :3000 |
| helmet | ^8.0.0 | HTTP security headers |
| express-rate-limit | ^7.5.0 | Rate limiting (Token Bucket, in-memory) |
| opossum | ^8.1.0 | Circuit breaker cho payment gateway |
| openai | ^4.70.0 | AI Summary (gọi từ Express, không qua Edge Functions) |
| pdf-parse | ^1.1.1 | Trích văn bản từ PDF (pure JS, không cần native binary) |
| papaparse | ^5.4.1 | Parse CSV nightly (stream, không load toàn bộ vào RAM) |
| qrcode | ^1.5.4 | Sinh mã QR khi đăng ký thành công |
| Vitest | ^3.0.0 | Test runner |

### Hạ tầng & Dịch vụ

| Dịch vụ | Vai trò |
|---------|---------|
| Supabase (PostgreSQL) | Database chính, ACID transactions |
| Supabase Auth | JWT authentication, auto-refresh token |
| Supabase RLS | Row-level security (safety net cho 2 bảng FE truy cập trực tiếp) |
| Supabase Realtime | Push `seats_remaining` và in-app notification realtime |
| Supabase Storage | Lưu ảnh bìa, sơ đồ phòng (bucket `workshop-assets`) |
| OpenAI API | Tóm tắt nội dung workshop từ PDF |
| Node EventEmitter | Notification dispatch in-process (không dùng Kafka/BullMQ) |

> **Không dùng Redis:** single instance, in-memory + Postgres đủ cho MVP (ADR-011).  
> Chi tiết lý do chọn từng dependency: [`docs/techstack.md`](docs/techstack.md)

---

## Cấu trúc dự án

```
unihub-workshop/
├── blueprint/                   # Tài liệu thiết kế (Phần 1 — Blueprint)
│   ├── proposal.md              # Bối cảnh, vấn đề, mục tiêu, phạm vi, rủi ro
│   ├── design.md                # Kiến trúc, C4 Diagram, DB Schema, 13 ADR
│   └── specs/                   # Đặc tả chi tiết từng module
│       ├── auth.md              # RBAC & JWT
│       ├── registration.md      # Luồng đăng ký & Concurrency
│       ├── payment.md           # Idempotency & Circuit Breaker
│       ├── checkin.md           # Offline sync logic (PWA + IndexedDB)
│       ├── ai-summary.md        # Pipe-and-Filter AI pipeline
│       ├── csv-import.md        # Batch ETL nightly
│       ├── notification.md      # Event-based + Outbox pattern
│       ├── analytics-dashboard.md
│       ├── access-control.md
│       ├── seat-reservation.md
│       └── workshop-management.md
├── backend/                     # Express + TypeScript
│   ├── src/
│   │   ├── controllers/         # Xử lý request/response
│   │   ├── services/            # Business logic
│   │   ├── repositories/        # Database access (chỉ gọi qua service interface)
│   │   ├── middlewares/         # verifyJwt, loadProfile, requireRole, rate limit, idempotency
│   │   └── workers/             # Cron: CSV nightly (02:00), seat TTL release (mỗi 60s)
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
├── frontend/                    # React PWA
│   ├── src/
│   │   ├── components/          # Header, MobileNav, WorkshopCard, CapacityIndicator
│   │   ├── pages/               # DiscoverPage, WorkshopDetailPage, MyTicketsPage
│   │   ├── lib/                 # mock-data.ts, tickets-context.tsx
│   │   └── types/               # workshop.ts (Workshop, Ticket interfaces)
│   ├── .env.example
│   ├── package.json
│   └── vite.config.ts           # PWA config, proxy /api → :3000
├── supabase/
│   ├── db_schema.sql            # Full schema idempotent — single source of truth
│   └── seed.sql                 # Dữ liệu mẫu (6 user, 4 workshop, 5 registration...)
├── legacy-data/
│   ├── README.md                # Format CSV nightly, logic import
│   └── students_nightly_2026-05-13.csv   # File CSV mẫu (4 sinh viên)
├── docs/
│   └── techstack.md             # Lý do chọn từng dependency
├── img/                         # Diagram: C4 Level 1/2, DB schema, high-level (PNG + SVG)
├── full-guide.md                # AI context guide — single source of truth khi mâu thuẫn
├── requirement.md               # Yêu cầu đồ án gốc từ giảng viên
└── README.md
```

---

## Yêu cầu hệ thống

- **Node.js** ≥ 20
- **npm** ≥ 10
- Tài khoản [Supabase](https://supabase.com) (free tier là đủ)
- **OpenAI API key** (chỉ cần cho tính năng AI Summary; các tính năng khác chạy bình thường nếu để trống)

---

## Hướng dẫn cài đặt

### 1. Clone repository

```bash
git clone <repo-url>
cd 23tkpm1-group16-unihub-workshop
```

### 2. Cài dependencies

```bash
cd frontend && npm install && cd ..
cd backend && npm install && cd ..
```

### 3. Tạo project Supabase

1. Đăng nhập [supabase.com](https://supabase.com) → **New project**
2. Đặt tên project, chọn region **Singapore**, đặt database password
3. Chờ khởi tạo (~1 phút) → **Project Settings → API**
4. Copy 3 giá trị: **Project URL**, **anon public key**, **service_role secret**

### 4. Cấu hình biến môi trường

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Điền vào `.env` (xem chi tiết tại mục [Biến môi trường](#biến-môi-trường)).

### 5. Khởi tạo database

Vào **Supabase Dashboard → SQL Editor**, chạy lần lượt:

```
1. Paste nội dung supabase/db_schema.sql → Run   (idempotent, chạy lại không lỗi)
2. Paste nội dung supabase/seed.sql      → Run
```

> **Lưu ý seed.sql:** Phần `INSERT INTO auth.users` chỉ chạy được trên **Supabase local** (`supabase start`). Trên **Supabase cloud**, tạo user qua Dashboard → Authentication → Users → Add user, sau đó chạy phần `profiles` trở xuống trong seed.sql.

### 6. Chạy ứng dụng

```bash
# Terminal 1 — Backend (http://localhost:3000)
cd backend && npm run dev

# Terminal 2 — Frontend (http://localhost:5173)
cd frontend && npm run dev
```

---

## Biến môi trường

### `backend/.env`

```env
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...    # ⚠️ Chỉ backend, không commit, không đưa ra FE

OPENAI_API_KEY=sk-...               # Bỏ trống nếu không dùng AI Summary

# Mock payment fail rate: 0.0 = luôn thành công, 1.0 = luôn thất bại (test circuit breaker)
PAYMENT_MOCK_FAIL_RATE=0

PORT=3000
NODE_ENV=development
```

### `frontend/.env`

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_API_URL=http://localhost:3000
```

> ⚠️ `SUPABASE_SERVICE_ROLE_KEY` bypass toàn bộ RLS — **chỉ đặt trong `backend/.env`**, không bao giờ đưa vào FE bundle hoặc commit.

---

## Database Schema

Schema đầy đủ tại [`supabase/db_schema.sql`](supabase/db_schema.sql) — idempotent, single source of truth. Gồm 8 bảng:

| Bảng | Vai trò | Điểm đáng chú ý |
|------|---------|-----------------|
| `students` | Whitelist sinh viên từ CSV nightly | PK = `mssv` (không dùng UUID surrogate). `is_active` cho soft-delete. Constraint `mssv_format: ^[A-Za-z0-9]{6,20}$` |
| `profiles` | Tài khoản, liên kết `auth.users` | Lưu `role`, `mssv` (FK → students, bắt buộc nếu role=student), `must_change_password` |
| `workshops` | Workshop | `seats_remaining`, `is_published`, `cancelled_at` (soft-delete), `created_by` (FK → profiles, dùng cho ownership check), `cover_image_url`, `room_map_url`, `pdf_url`, `summary_md`, `summary_generated_at` |
| `registrations` | Đăng ký | FK `mssv` → students (không phải student_id). Status enum: `pending_payment / confirmed / cancelled / expired`. Constraint: **EXCLUDE USING BTREE (mssv, workshop_id) WHERE status IN ('pending_payment','confirmed')** — cho phép đăng ký lại sau khi cancel/expired |
| `payments` | Lịch sử thanh toán | Tách khỏi registrations vì 1 registration có thể có nhiều payment attempt (CB open→close) |
| `idempotency_keys` | Chống duplicate request | PK = `key` (text). TTL 24h xử lý ở application layer |
| `check_ins` | Lịch sử check-in | `UNIQUE(registration_id)` chống trùng. Enum `source`: online/offline |
| `notifications` | In-app notification | Chỉ lưu in-app. Email gửi qua mock adapter, **không lưu vào bảng này** |

**Enums:** `user_role`, `registration_status`, `payment_status`, `check_in_source`

**Storage bucket:** `workshop-assets` (public, 5MB limit, image/jpeg + png + webp). Path convention: `{workshop_id}/cover.{ext}`, `{workshop_id}/room-map.{ext}`.

**RLS:**
- `workshops`: SELECT khi `is_published = true AND cancelled_at IS NULL` (public read)
- `profiles`: self-read/update
- 6 bảng còn lại: RLS bật + 0 policy = deny-all (backend bypass bằng service_role key)
- Storage `workshop-assets`: read public, insert/update/delete chỉ organizer đã đăng nhập

---

## Dữ liệu mẫu & Tài khoản test

`seed.sql` tạo sẵn dữ liệu đủ để demo tất cả tính năng:

- **4 workshop:** 1 miễn phí còn chỗ, 1 miễn phí hết chỗ, 1 có phí (có AI summary), 1 đã hủy
- **6 user:** 2 organizer, 1 scanner, 3 student (MSSV khớp với CSV mẫu)
- **5 registrations:** đủ các status (confirmed, pending_payment, cancelled...)
- **2 payments:** 1 succeeded, 1 failed
- **1 check-in, 3 in-app notifications**

**Tài khoản test (chạy trên Supabase local):**

| Email | Password | Role |
|-------|----------|------|
| organizer1@unihub.edu | demo-password | organizer |
| organizer2@unihub.edu | demo-password | organizer |
| scanner1@unihub.edu | demo-password | scanner |
| an.nguyen@student.unihub.edu | demo-password | student (MSSV: 21127001) |
| ngoc.tran@student.unihub.edu | demo-password | student (MSSV: 21127002) |
| manh.dao@student.unihub.edu | demo-password | student (MSSV: 23127050) |

**Trên Supabase cloud:** Tạo user qua Dashboard, sau đó gán role thủ công:

```sql
UPDATE profiles SET role = 'organizer' WHERE id = '<user-uuid>';
UPDATE profiles SET role = 'scanner'   WHERE id = '<user-uuid>';
-- Mặc định: role = 'student'
```

**Test circuit breaker:**
```bash
# Trong backend/.env
PAYMENT_MOCK_FAIL_RATE=1.0   # 100% fail → CB mở sau ngưỡng 50%
```

---

## Trạng thái implementation hiện tại

> ⚠️ **Quan trọng:** Frontend hiện tại đang dùng **mock data** (`src/lib/mock-data.ts`), chưa kết nối API backend thực. Đây là trạng thái phát triển dở — backend được thiết kế đầy đủ nhưng FE integration chưa hoàn thiện.

**Frontend (mock data):**
- `DiscoverPage`: hiển thị danh sách workshop từ `MOCK_WORKSHOPS`
- `WorkshopDetailPage`: xem chi tiết, đăng ký với mock payment (20% fail random, setTimeout 2s)
- `MyTicketsPage`: quản lý vé qua React Context (`tickets-context.tsx`)
- Auth, Realtime, QR scanner: chưa kết nối

**Backend (thiết kế đầy đủ):** Schema, spec, middleware, cơ chế kỹ thuật đã được thiết kế và document hoàn chỉnh trong `blueprint/`.

---

## Phân quyền (RBAC)

> **Lưu ý:** Có sự **mâu thuẫn nội bộ** giữa các file tài liệu về ownership check:
> - `full-guide.md` (AI context guide, tuyên bố là nguồn thắng): **KHÔNG ownership** — single committee, mọi organizer ngang quyền
> - `auth.md`, `access-control.md`, `workshop-management.md`, `db_schema.sql` (có cột `created_by`): **CÓ ownership** — organizer chỉ sửa/hủy workshop do mình tạo
>
> Code implement theo spec trong `auth.md` và `access-control.md` (có ownership check).

**Middleware chain:** `verifyJwt → loadProfile → requireRole([...]) → requireOwnership(...)` (ownership chỉ áp cho PATCH/DELETE workshop).

`loadProfile` query DB mỗi request (không đọc từ JWT claim) → đổi role có hiệu lực ngay, không cần đợi token expire.

| Hành động | Endpoint | student | org (owner) | org (non-owner) | scanner | anon |
|-----------|----------|:-------:|:-----------:|:---------------:|:-------:|:----:|
| Xem danh sách workshop | `GET /workshops` | ✓ | ✓ | ✓ | ✓ | ✓ |
| Xem workshop đã publish | `GET /workshops/:id` | ✓ | ✓ | ✓ | ✓ | ✓ |
| Xem workshop chưa publish | `GET /workshops/:id` | 404 | ✓ | ✓ | 404 | 404 |
| Tạo workshop | `POST /workshops` | ✗ | ✓ | ✓ | ✗ | ✗ |
| Sửa workshop | `PATCH /workshops/:id` | ✗ | ✓ | ✗ (403) | ✗ | ✗ |
| Hủy workshop | `DELETE /workshops/:id` | ✗ | ✓ | ✗ (403) | ✗ | ✗ |
| Upload PDF + AI Summary | `POST /workshops/:id/summary` | ✗ | ✓ | ✗ (403) | ✗ | ✗ |
| Đăng ký workshop | `POST /registrations` | ✓ (chỉ mình) | ✗ | ✗ | ✗ | ✗ |
| Xem vé của mình | `GET /registrations/me` | ✓ | — | — | — | ✗ |
| Xem tất cả đăng ký | `GET /admin/registrations` | ✗ | ✓ | ✓ | ✗ | ✗ |
| Quét QR check-in | `POST /check-ins` | ✗ | ✓ | ✓ | ✓ | ✗ |
| Sync offline check-in | `POST /check-ins/sync` | ✗ | ✓ | ✓ | ✓ | ✗ |
| Xem thống kê | `GET /admin/stats` | ✗ | ✓ | ✓ | ✗ | ✗ |
| Trigger CSV import | `POST /admin/csv-import` | ✗ | ✓ | ✓ | ✗ | ✗ |

**HTTP status lỗi auth:**

| Tình huống | HTTP | Error code |
|------------|------|------------|
| Thiếu Authorization header | 401 | `UNAUTHENTICATED` |
| JWT sai định dạng / signature | 401 | `INVALID_TOKEN` |
| JWT hết hạn | 401 | `TOKEN_EXPIRED` |
| Profile không tồn tại trong DB | 401 | `PROFILE_NOT_FOUND` |
| Role không đủ | 403 | `FORBIDDEN_ROLE` |
| Organizer sửa workshop của người khác | 403 | `FORBIDDEN_OWNERSHIP` |
| Workshop chưa publish (student/anon) | 404 | `RESOURCE_NOT_FOUND` (404 thay vì 403 — chống information disclosure) |

---

## API Overview

Prefix `/api/v1/`. Response envelope thống nhất:

```json
{ "data": {}, "error": { "code": "UPPER_SNAKE_CASE", "message": "..." }, "meta": {} }
```

**HTTP status conventions:**

| Code | Khi nào |
|------|---------|
| 200/201/202/204 | Success / Created / Accepted (async job) / Deleted |
| 400 | Validation fail, thiếu header |
| 401 | Auth fail |
| 403 | FORBIDDEN_ROLE hoặc FORBIDDEN_OWNERSHIP |
| 404 | Không tồn tại HOẶC không có quyền xem (chống info disclosure) |
| 409 | REQUEST_IN_PROGRESS, ALREADY_REGISTERED, ALREADY_CHECKED_IN, SEATS_SOLD_OUT |
| 429 | RATE_LIMIT_EXCEEDED + `Retry-After` header |
| 503 | PAYMENT_UNAVAILABLE (CB open), STATS_UNAVAILABLE (query timeout > 5s) |

**Endpoints chính:**

```
# Workshop
GET    /api/v1/workshops                     # Public, no auth
GET    /api/v1/workshops/:id
POST   /api/v1/workshops                     # [organizer]
PATCH  /api/v1/workshops/:id                 # [organizer + owner]
DELETE /api/v1/workshops/:id                 # [organizer + owner]  soft-delete
POST   /api/v1/workshops/:id/summary         # [organizer + owner]  upload PDF → 202 async

# Registration  — BẮT BUỘC header: Idempotency-Key: <uuid>
POST   /api/v1/registrations                 # [student]
GET    /api/v1/registrations/me              # [student]
GET    /api/v1/admin/registrations           # [organizer]

# Payment       — BẮT BUỘC header: Idempotency-Key: <uuid>
POST   /api/v1/payments                      # [student]

# Check-in
POST   /api/v1/check-ins                     # [organizer, scanner]
POST   /api/v1/check-ins/sync                # [organizer, scanner] batch offline sync

# Admin
GET    /api/v1/admin/stats                   # [organizer]  cache 60s
GET    /api/v1/admin/stats/workshops/:id     # [organizer]  danh sách SV đã đăng ký
POST   /api/v1/admin/csv-import              # [organizer]  trigger manual
```

**Error codes:** `UNAUTHENTICATED · INVALID_TOKEN · TOKEN_EXPIRED · PROFILE_NOT_FOUND · FORBIDDEN_ROLE · FORBIDDEN_OWNERSHIP · RESOURCE_NOT_FOUND · RATE_LIMIT_EXCEEDED · IDEMPOTENCY_KEY_REQUIRED · REQUEST_IN_PROGRESS · SEATS_SOLD_OUT · ALREADY_REGISTERED · STUDENT_NOT_VERIFIED · PAYMENT_DECLINED · PAYMENT_UNAVAILABLE · TICKET_NOT_FOUND · WRONG_WORKSHOP · ALREADY_CHECKED_IN · PDF_READ_FAILED · PDF_NO_TEXT · STATS_UNAVAILABLE`

---

## Các cơ chế kỹ thuật nổi bật

### 1. Seat Reservation — Chống double-booking

Atomic `UPDATE` trừ chỗ và `INSERT` registration trong **cùng một transaction**. Gọi cổng thanh toán **ngoài** transaction (tránh giữ row lock trong khi chờ payment response):

```sql
-- Trừ chỗ atomic: rowCount = 0 → SEATS_SOLD_OUT (409)
UPDATE workshops
SET seats_remaining = seats_remaining - 1
WHERE id = $1 AND seats_remaining > 0
RETURNING id;

-- Cùng transaction: EXCLUDE constraint ngăn đăng ký trùng cùng workshop
INSERT INTO registrations (mssv, workshop_id, status, qr_token, expires_at)
VALUES ($1, $2, 'pending_payment', gen_random_uuid(), now() + interval '15 minutes');
```

Vi phạm EXCLUDE constraint → rollback → `seats_remaining` tự khôi phục. Không dùng `SELECT FOR UPDATE` thủ công, không dùng optimistic locking (ADR-004).

### 2. Payment Idempotency — Chống trừ tiền hai lần

Header `Idempotency-Key: <uuid>` bắt buộc. **Atomic INSERT** — an toàn với concurrent retry (tránh race condition của SELECT-then-INSERT):

```typescript
const result = await db.query(`
  INSERT INTO idempotency_keys (key, endpoint, user_id, response)
  VALUES ($1, $2, $3, '{}'::jsonb)
  ON CONFLICT (key) DO NOTHING
  RETURNING key
`, [key, endpoint, userId]);

if (result.rows.length === 0) {
  const existing = await db.query(
    `SELECT response FROM idempotency_keys WHERE key = $1`, [key]
  );
  return res.json(existing.rows[0].response); // Trả cached response
}
// Ta nắm key → chạy business logic, UPDATE response khi xong
```

TTL 24h. Client FE sinh `crypto.randomUUID()` lúc user bấm lần đầu, lưu React state (không `localStorage`); retry cùng phiên dùng cùng key; reload trang → key mới.

### 3. Circuit Breaker — Payment Gateway không ổn định

`opossum` wrap `MockPaymentGateway.charge()`. Cấu hình: `timeout: 3000ms`, `errorThresholdPercentage: 50`, `resetTimeout: 30000ms`.

```
Closed ──(lỗi system > 50% hoặc timeout)──► Open ──(30s)──► Half-Open
                                                               │
                                                      thành công → Closed
                                                      thất bại  → Open
```

Phân biệt lỗi: 4xx (business — thẻ sai, hết tiền) **không tính** vào tỷ lệ lỗi CB; 5xx/timeout (system) mới tính.

Khi CB Open: đăng ký tạo `pending_payment`, giữ chỗ 15 phút, trả `503 PAYMENT_UNAVAILABLE`. Xem workshop, đăng ký miễn phí không bị ảnh hưởng (graceful degradation).

Cron mỗi 60s: quét `pending_payment` quá 15 phút → `expired` + `seats_remaining + 1`.

### 4. Offline Check-in — PWA Foreground Sync

Không dùng Background Sync API — iOS Safari không hỗ trợ. Dùng **Foreground Sync** (100% tương thích):

```
[Offline] QR scan
  → decode payload trên client (không cần server)
  → lưu IndexedDB { id: uuid(), qr_token, workshop_id, scanned_at, status: 'pending' }
  → Hiển thị màn hình vàng "Đã lưu tạm"

[Có mạng] window.addEventListener('online') → auto flush
          Nút "Đồng bộ ngay" → manual flush

POST /check-ins/sync nhận array records
  → Server: INSERT ... ON CONFLICT (registration_id) DO NOTHING
  → Trả 200 + { synced: [...], errors: [...] }
  → Client xóa IndexedDB records đã sync
```

`UNIQUE(registration_id)` + `ON CONFLICT DO NOTHING` → 0 trùng dù client gửi nhiều lần. Endpoint trả `200` dù có vé lỗi trong lô (Partial Success Pattern — không trả 4xx cho 1 vé rác trong batch 100 vé).

Offline trade-off: không validate QR khi offline (không có DB) → chấp nhận quét nhầm vé lỗi, server từ chối ở bước sync → không gây ách tắc đám đông tại cửa phòng.

### 5. AI Summary — Pipe-and-Filter

```
POST /workshops/:id/summary → 202 Accepted (async)

Pipeline chạy ngầm:
  [pdf-parse]   PDF buffer → raw text
  [Cleaning]    regex loại số trang, header/footer, ký tự rác
  [Chunking]    chia 2000 char/đoạn (tránh vượt context window)
  [OpenAI]      tóm tắt từng chunk song song (Map)
  [Reduce]      gộp các bản tóm tắt con
  [Persistence] UPDATE workshops SET summary_md = ..., summary_generated_at = now()
                → Supabase Realtime broadcast → FE cập nhật UI
```

Giới hạn: PDF only, max 5MB, max 3 lần tóm tắt/workshop. Text < 50 từ → `PDF_NO_TEXT`. OpenAI 429/503 → retry tối đa 3 lần exponential backoff.

### 6. Notification — Event-based + Outbox Pattern

```
Registration Service
  ├─ BEGIN transaction
  ├─ UPDATE workshops SET seats_remaining - 1
  ├─ INSERT registrations (confirmed, qr_token)
  ├─ INSERT notifications (in-app)    ← Outbox: cùng transaction, at-least-once
  ├─ COMMIT
  └─ EventEmitter.emit('RegistrationConfirmed')   ← SAU commit (không trong tx)

Notification Service (bất đồng bộ, không block response)
  ├─ InAppNotifier  → Supabase Realtime broadcast → FE WebSocket toast
  └─ EmailNotifier  → SMTP mock (console.log)
  → Promise.allSettled(): 1 kênh lỗi không ảnh hưởng kênh còn lại

Cron 5 phút: retry notifications kẹt (status 'pending'/'failed', retry_count < 3,
             updated_at < now() - 2 phút)
```

Thêm kênh mới: chỉ implement class `INotifier` + đăng ký DI container. Không sửa Registration Service hoặc Notification Service (OCP).

### 7. CSV Import — Batch Sequential ETL

Cron `02:00` hàng ngày (node-cron in-process) hoặc trigger thủ công `POST /admin/csv-import`:

```
Extract   → PapaParse stream (fs.createReadStream + step mode, không load RAM)
Validate  → Header phải có mssv, full_name. Lỗi header: fail-fast toàn file.
            Lỗi từng dòng (MSSV rỗng, full_name rỗng): skip, ghi log → tiếp tục
Transform → trim, dedup trong file
Load      → Bulk upsert lô 1000 dòng:
              INSERT ... ON CONFLICT (mssv) DO UPDATE SET full_name=..., is_active=true
            Soft-delete: UPDATE students SET is_active=false WHERE mssv NOT IN (batch)
            File rỗng (0 dòng): KHÔNG soft-delete (tránh vô tình wipe toàn bộ DB)
            File cũ (source_date ≤ ngày import gần nhất): bỏ qua
```

Chiến lược lỗi: **Partial Success** — service không bao giờ crash do lỗi dữ liệu. Không hard-delete (giữ toàn vẹn FK với `registrations` cũ).

### 8. Rate Limiting

Token Bucket, in-memory (single instance):

| Scope | Ngưỡng | Hành vi khi vượt |
|-------|--------|------------------|
| Global | 200 req / 15 phút / IP | 429 + `Retry-After` |
| `POST /registrations` | 20 req / phút / IP | 429 `RATE_LIMIT_EXCEEDED` |

> Ngưỡng 20 (không phải 10) vì bottleneck thật là DB lock — rate limit chỉ cần shed excess burst, không gây 429 oan cho user retry hợp lệ (network lag → 3 retry + user bấm lại 2 lần ≈ 5 req / 10-20s).

### 9. Workshop Catalog Cache

In-memory JS Map, TTL 5s cho `GET /workshops`. 100 req/s → DB chỉ nhận 1 SELECT. Supabase Realtime push ngay khi `seats_remaining` thay đổi → FE cập nhật UI tức thì không cần reload.

---

## Testing

```bash
cd backend && npm test          # chạy một lần
cd backend && npm run test:watch # watch mode
cd frontend && npm test
```

Framework: **Vitest**.

**Test cases bắt buộc (ADR-required):**

| Test | Kỳ vọng |
|------|---------|
| Race condition seat: 1000 req đồng thời, workshop 10 chỗ | Đúng 10 confirmed, 990 SEATS_SOLD_OUT |
| Idempotency: 5 req cùng key trong 2s | 1 bản ghi, 1 charge |
| Circuit breaker: 5 lỗi system liên tiếp | CB Open, req thứ 6 fail < 10ms (không treo 3s) |
| CSV partial success: 10 dòng, 2 dòng lỗi format | Import 8, log 2, service không crash |
| Offline sync gửi 2 lần cùng records | DB chỉ 1 record (`ON CONFLICT DO NOTHING`) |
| Seat TTL: `pending_payment` tạo 20 phút trước → chạy cron | Status `expired`, `seats_remaining` khôi phục |
| RBAC: student gọi `POST /workshops` | 403 `FORBIDDEN_ROLE` |
| Ownership: organizer B sửa workshop của organizer A | 403 `FORBIDDEN_OWNERSHIP` |
| Anon xem workshop chưa publish | 404 (không 403) |

---

## Quy định commit

Format: `<type>(<scope>): <description>`

| Type | Ý nghĩa |
|------|---------|
| `feat` | Tính năng mới |
| `fix` | Bug fix |
| `refactor` | Tái cấu trúc |
| `test` | Thêm / sửa test |
| `chore` | Config, dependency, docs, format |

```
feat(checkin): add offline sync with IndexedDB foreground flush
fix(registration): handle seats_remaining race condition with atomic UPDATE
test(payment): add circuit breaker state transition tests
chore(deps): upgrade opossum to 8.1.0
```

---

## Tài liệu tham khảo

| File | Nội dung |
|------|---------|
| [`blueprint/proposal.md`](blueprint/proposal.md) | Vấn đề, mục tiêu, phạm vi, rủi ro |
| [`blueprint/design.md`](blueprint/design.md) | Kiến trúc, C4 Diagram, DB Schema, 13 ADR |
| [`docs/techstack.md`](docs/techstack.md) | Lý do chọn từng dependency |
| [`blueprint/specs/`](blueprint/specs/) | Đặc tả 10 module: luồng, kịch bản lỗi, acceptance criteria |
| [`full-guide.md`](full-guide.md) | AI context guide — hard rules, API conventions, critical patterns. Khi mâu thuẫn với spec khác, file này thắng |
| [`supabase/db_schema.sql`](supabase/db_schema.sql) | Schema đầy đủ — single source of truth |
| [`legacy-data/README.md`](legacy-data/README.md) | Format CSV nightly, logic import, lý do không có cột email/phone |
| [`requirement.md`](requirement.md) | Yêu cầu đồ án gốc từ giảng viên |
| [`img/`](img/) | Sơ đồ C4 Level 1/2, DB schema, high-level (PNG + SVG) |
