# ĐỒ ÁN MÔN HỌC - UniHub Workshop

## Dánh sách thành viên

| MSSV | Họ và tên | Email |
| ----------- | ----------- |  ----------- |
| 23127417 | Đào Hoàng Đức Mạnh | <dhdmanh23@clc.fitus.edu.vn> |
| 22127403 | Nguyễn Trần Minh Thư | <ntmthu22@clc.fitus.edu.vn> |
| 23127362 | Phạm Anh Hào | <pahao23@clc.fitus.edu.vn> |

## Quy định commit

Format: `<type>(<scope>): <description>`

- `feat:` New feature
- `fix:` Bug fix
- `refactor:` Code restructure
- `test:` Tests
- `chore:` Configs, dependencies, CI, docs, formatting

*Example:* `feat: add offline check-in`

## Tech Stack

| Layer | Công nghệ | Version |
|-------|----------|---------|
| Frontend | React + TypeScript | ^19.0.0 |
| Build Tool | Vite | ^6.2.0 |
| PWA / Offline | vite-plugin-pwa + Workbox | ^0.21.0 |
| CSS | Tailwind CSS | ^3.4.0 |
| Server State | TanStack Query | ^5.62.0 |
| Router | React Router | ^6.28.0 |
| QR Scan | html5-qrcode | ^2.3.8 |
| Backend | Express + TypeScript | ^4.21.0 |
| Validation | Zod (shared FE/BE) | ^3.24.0 |
| Rate Limiting | express-rate-limit | ^7.5.0 |
| Circuit Breaker | opossum | ^8.1.0 |
| QR Generate | qrcode | ^1.5.4 |
| AI Client | openai SDK | ^4.70.0 |
| PDF Parse | pdf-parse | ^1.1.1 |
| CSV Parse | papaparse | ^5.4.1 |
| Database | PostgreSQL via Supabase | cloud |
| Auth | Supabase Auth (JWT + RLS) | — |
| File Storage | Supabase Storage | — |
| Testing | Vitest | ^3.0.0 |

> Chi tiết lý do chọn từng dependency: [`docs/techstack.md`](docs/techstack.md)

## Cấu trúc dự án

```
unihub-workshop/
├── blueprint/               # Tài liệu thiết kế (Phần 1)
│   ├── proposal.md          # Vấn đề, mục tiêu, rủi ro
│   ├── design.md            # C4 Diagram, DB Schema, ADR
│   └── specs/               # Đặc tả chi tiết từng module
│       ├── auth.md          # RBAC & JWT
│       ├── registration.md  # Luồng đăng ký & Concurrency
│       ├── payment.md       # Idempotency & Circuit Breaker
│       └── checkin.md       # Offline sync logic
├── src/                     # Mã nguồn (Phần 2)
│   ├── backend/             # Node.js
│   │   ├── src/
│   │   │   ├── controllers/ # Xử lý logic request
│   │   │   ├── services/    # Business logic (Seat booking, AI)
│   │   │   ├── models/      # Database Schema
│   │   │   ├── middlewares/ # Rate limit, Auth, Circuit breaker
│   │   │   └── workers/     # Cron job xử lý CSV
│   │   └── tests/           # Unit test cho logic quan trọng
│   ├── web-app/             # React/Next.js (Admin & Student)
│   ├── mobile-app/          # React Native/Flutter (Check-in)
│   └── shared/              # Types/Constants dùng chung
├── data/                    # Dữ liệu mẫu
│   ├── seed/                # SQL scripts khởi tạo dữ liệu
│   └── legacy_csv/          # File CSV giả lập từ hệ thống cũ
├── clips/                   # Video trình bày
└── README.md                # Hướng dẫn cài đặt (MANDATORY)
```

## Hướng dẫn cài đặt

### Yêu cầu

- Node.js ≥ 20
- npm ≥ 10
- Tài khoản [Supabase](https://supabase.com) (free tier)
- OpenAI API key (cho AI Summary)

### 1. Clone & cài dependencies

```bash
git clone <repo-url>
cd 23tkpm1-group16-unihub-workshop

# Frontend
cd frontend && npm install && cd ..

# Backend
cd backend && npm install && cd ..
```

### 2. Cấu hình biến môi trường

```bash
# Backend
cp backend/.env.example backend/.env

# Frontend
cp frontend/.env.example frontend/.env
```

Điền các key vào `.env` (xem hướng dẫn lấy key Supabase bên dưới):

```env
# backend/.env
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
OPENAI_API_KEY=sk-...
PAYMENT_MOCK_FAIL_RATE=0
PORT=3000

# frontend/.env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
VITE_API_URL=http://localhost:3000
```

### 3. Khởi tạo database

```bash
# Chạy migrations trên Supabase (SQL Editor hoặc Supabase CLI)
# File: supabase/migrations/
```

### 4. Chạy ứng dụng

```bash
# Terminal 1 — Backend
cd backend && npm run dev

# Terminal 2 — Frontend
cd frontend && npm run dev
```

Truy cập: http://localhost:5173

---

### Lấy Supabase keys

1. Đăng nhập [supabase.com](https://supabase.com) → **New project**
2. Đặt tên project, chọn region (Singapore gần nhất), đặt database password
3. Sau khi project khởi tạo xong (~1 phút), vào **Project Settings** → **API**
4. Copy 3 giá trị:
   - **Project URL** → `SUPABASE_URL` / `VITE_SUPABASE_URL`
   - **anon public** → `SUPABASE_ANON_KEY` / `VITE_SUPABASE_ANON_KEY`
   - **service_role secret** → `SUPABASE_SERVICE_ROLE_KEY` ⚠️ chỉ dùng ở backend, không commit, không đưa lên FE

> ⚠️ `service_role` key có quyền bypass RLS — chỉ để trong `backend/.env`, không bao giờ expose ra client.
