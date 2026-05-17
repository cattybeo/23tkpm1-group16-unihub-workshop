# Tech Stack — UniHub Workshop

> Liệt kê toàn bộ công nghệ, version thực tế từ `package.json`, và lý do chọn từng thư viện. Cập nhật khi thêm dependency mới.
>
> **Nhóm 16** — Đào Hoàng Đức Mạnh, Nguyễn Trần Minh Thư, Phạm Anh Hào

---

## Frontend (`frontend/package.json`)

### Nền tảng

| Thư viện | Version | Vai trò | Lý do chọn |
|---|---|---|---|
| `react` | ^19.0.0 | UI framework | Phiên bản mới nhất, concurrent rendering, stable |
| `react-dom` | ^19.0.0 | DOM renderer | Đi kèm React |
| `typescript` | ^5.7.0 | Ngôn ngữ | Strict type checking, chia sẻ schema với BE qua Zod |
| `vite` | ^6.2.0 | Build tool + dev server | Khởi động nhanh, HMR tốt, tích hợp PWA plugin dễ |
| `@vitejs/plugin-react-swc` | ^3.7.0 | Compiler plugin | SWC nhanh hơn Babel, ít config |

### Routing & Data fetching

| Thư viện | Version | Vai trò | Lý do chọn |
|---|---|---|---|
| `react-router-dom` | ^6.28.0 | Client-side routing | Chuẩn de-facto React Router v6, data router API |
| `@tanstack/react-query` | ^5.62.0 | Server state management | Tự xử lý cache, retry, loading/error state — không cần Redux cho server state |

### Giao tiếp & Xác thực

| Thư viện | Version | Vai trò | Lý do chọn |
|---|---|---|---|
| `@supabase/supabase-js` | ^2.47.0 | Auth + Realtime + Storage client | Xử lý JWT (phát token khi đăng nhập, tự refresh), subscribe Realtime channel cho số chỗ còn lại |

> **JWT ở FE:** Supabase JS gọi `supabase.auth.signIn()` → nhận `access_token` (JWT). FE đính token này vào header `Authorization: Bearer <token>` mỗi request đến Express. Không cần thư viện JWT riêng.

### Validation

| Thư viện | Version | Vai trò | Lý do chọn |
|---|---|---|---|
| `zod` | ^3.24.0 | Schema validation | Dùng chung schema với BE, validate form trước khi gửi request |

### UI & UX

| Thư viện | Version | Vai trò | Lý do chọn |
|---|---|---|---|
| `tailwindcss` | ^3.4.0 | Utility-first CSS | Không cần viết CSS file riêng, dễ responsive |
| `lucide-react` | ^1.16.0 | Icon set | Nhẹ, tree-shakeable, consistent design |
| `html5-qrcode` | ^2.3.8 | Quét QR (camera) | Hỗ trợ iOS Safari WebRTC camera API, đủ cho check-in |
| `autoprefixer` + `postcss` | ^10.4.0 / ^8.4.0 | CSS toolchain | Bắt buộc để Tailwind build đúng |

### PWA & Offline

| Thư viện | Version | Vai trò | Lý do chọn |
|---|---|---|---|
| `vite-plugin-pwa` | ^0.21.0 | Service Worker + manifest | Precache app shell + check-in page, offline-first |
| `workbox-window` | ^7.0.0 | SW lifecycle management | Detect SW update, trigger sync khi `online` event |

> **Không dùng Background Sync API:** iOS Safari không hỗ trợ. Dùng foreground sync: nút "Đồng bộ ngay" + auto-flush khi `window.addEventListener('online')`.

### Testing

| Thư viện | Version | Vai trò |
|---|---|---|
| `vitest` | ^3.0.0 | Unit test runner |

---

## Backend (`backend/package.json`)

### Nền tảng

| Thư viện | Version | Vai trò | Lý do chọn |
|---|---|---|---|
| `express` | ^4.21.0 | HTTP framework | Minimal, đủ middleware ecosystem, dễ test |
| `typescript` | ^5.7.0 | Ngôn ngữ | Strict mode, type-safe middleware chain |
| `tsx` | ^4.19.0 | TS runner (dev) | Chạy TypeScript trực tiếp không cần compile bước, reload nhanh |

### Giao tiếp & Xác thực

| Thư viện | Version | Vai trò | Lý do chọn |
|---|---|---|---|
| `@supabase/supabase-js` | ^2.47.0 | Auth verify + DB client | `supabaseAdmin.auth.getUser(token)` xác thực JWT, bypass RLS bằng `service_role` key |
| `cors` | ^2.8.5 | CORS middleware | Cho phép FE :5173 gọi BE :3000 trong dev |
| `helmet` | ^8.0.0 | HTTP security headers | Tắt fingerprinting, set CSP, XSS protection mặc định |

> **JWT ở BE:** Không dùng `jsonwebtoken` trực tiếp. BE nhận `Authorization: Bearer <token>` từ FE, gọi `supabaseAdmin.auth.getUser(token)` — Supabase SDK tự verify chữ ký JWT và trả về `{ user }` hoặc lỗi. Middleware `verifyJwt` chỉ wrap call này.

### Validation

| Thư viện | Version | Vai trò | Lý do chọn |
|---|---|---|---|
| `zod` | ^3.24.0 | Schema validation tại entry point | Validate request body trước khi vào service layer, chia sẻ schema với FE |

### Cơ chế bảo vệ hệ thống

| Thư viện | Version | Vai trò | Lý do chọn |
|---|---|---|---|
| `express-rate-limit` | ^7.5.0 | Rate limiting (Token Bucket) | Zero-config, in-memory store đủ cho single instance |
| `opossum` | ^8.1.0 | Circuit breaker | Wrap `MockPaymentGateway`, 3 trạng thái Closed/Open/Half-Open, TypeScript types đầy đủ |

> **Không dùng Redis:** Single instance, không cần distributed state. In-memory đủ cho MVP. Xem ADR-011.

### Tích hợp bên ngoài

| Thư viện | Version | Vai trò | Lý do chọn |
|---|---|---|---|
| `openai` | ^4.70.0 | AI Summary | Official SDK, stream support, dễ swap model |
| `pdf-parse` | ^1.1.1 | Trích văn bản từ PDF | Pure JS, không cần native binary |
| `papaparse` | ^5.4.1 | Parse CSV (DataSync) | Xử lý encoding, header mismatch, partial error — không bị crash khi row lỗi |
| `qrcode` | ^1.5.4 | Sinh mã QR token | Generate base64 PNG gắn vào registration |

### Testing

| Thư viện | Version | Vai trò |
|---|---|---|
| `vitest` | ^3.0.0 | Unit + integration test runner |

---

## Hạ tầng & Dịch vụ ngoài

| Dịch vụ | Vai trò | Ghi chú |
|---|---|---|
| **Supabase** (cloud free tier) | PostgreSQL + Auth + Realtime + Storage | Auth phát JWT, RLS bảo vệ 2 bảng FE truy cập trực tiếp, Realtime broadcast seats |
| **OpenAI API** | LLM cho AI Summary | Gọi từ Express, không dùng Edge Functions |
| **Node EventEmitter** | Notification dispatch in-process | Thay Kafka/BullMQ — đủ cho single instance, YAGNI |

---

## Deploy (localhost demo)

| Thành phần | Port | Lệnh |
|---|---|---|
| Frontend (Vite dev server) | :5173 | `npm run dev` trong `frontend/` |
| Backend (Express + tsx watch) | :3000 | `npm run dev` trong `backend/` |
| Database | cloud | Supabase free tier, không tự host |

---

## Những gì chủ động KHÔNG dùng

| Thứ bị loại | Thay bằng | Lý do |
|---|---|---|
| `jsonwebtoken` | Supabase Auth SDK | Supabase tự verify chữ ký JWT — thêm lib riêng là duplicate |
| Redis | In-memory + Postgres | Single instance, không cần distributed state (ADR-011) |
| Kafka / RabbitMQ / BullMQ | Node EventEmitter | In-process đủ cho MVP, không overhead broker |
| Background Sync API | Foreground sync | iOS Safari không hỗ trợ |
| Native iOS/Android | PWA | Đội nhỏ, camera API đủ, không maintain 2 codebase |
| Stripe / VNPay / MoMo | `MockPaymentGateway` | Ngoài phạm vi đồ án |
