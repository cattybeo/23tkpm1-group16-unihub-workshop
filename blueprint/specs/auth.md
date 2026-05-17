# Đặc tả: Xác thực & Phân quyền (Auth)

> Trace về `requirement.md` mục 6, `design.md` ADR-010.
> **Nhóm 16** — Đào Hoàng Đức Mạnh, Nguyễn Trần Minh Thư, Phạm Anh Hào

---

## Mô tả

Kiểm soát **ai đang gọi** (authentication) và **họ được làm gì** (authorization) trên toàn bộ hệ thống.

- **Authentication:** Supabase Auth làm IdP, JWT Bearer token làm credential. Express API không tự quản lý password.
- **Authorization:** Mô hình **RBAC + ownership check** — 3 role cố định (`student`, `organizer`, `staff`), thực thi tại Express middleware. Organizer chỉ sửa/huỷ workshop do chính mình tạo (`workshops.created_by = req.user.id`).

---

## Luồng chính

### Đăng nhập

```
Browser / PWA ──── signIn(email, password) ────► Supabase Auth
                ◄── { access_token (JWT), refresh_token } ───
```

- `access_token`: JWT ký bằng `SUPABASE_JWT_SECRET`, hết hạn sau **1 giờ**.
- Role **không** nhúng vào JWT claim — query từ bảng `profiles` trong mỗi request để revoke có hiệu lực ngay.
- Supabase JS SDK tự refresh token khi sắp hết hạn. Refresh thất bại → SDK phát event `SIGNED_OUT` → FE redirect `/login`.

### Request có phân quyền — middleware chain

Mọi request đến `/api/v1/*` đi qua 4 middleware theo thứ tự:

```
Request
  │
  ▼
verifyJwt          → parse Authorization header, set req.user.id
  │                  401 nếu thiếu / sai / hết hạn
  ▼
loadProfile        → SELECT profiles WHERE id = req.user.id, set req.user.role
  │                  401 nếu profile không tồn tại
  ▼
requireRole(roles) → so sánh req.user.role với whitelist
  │                  403 FORBIDDEN_ROLE nếu không đủ quyền
  ▼
requireOwnership   → fetch resource, so sánh created_by với req.user.id
  │                  (chỉ áp cho route có ownership: PATCH/DELETE /workshops/:id)
  │                  404 nếu resource không tồn tại
  │                  403 FORBIDDEN_OWNERSHIP nếu không phải owner
  ▼
Controller
```

Ví dụ apply cho route sửa workshop:

```typescript
router.patch('/workshops/:id',
  verifyJwt,
  loadProfile,
  requireRole(['organizer']),
  requireOwnership(workshopRepo.findById, 'created_by'),
  workshopController.update
);
```

### Ma trận quyền hạn

| Hành động | Endpoint | student | organizer (owner) | organizer (non-owner) | staff | anon |
|---|---|:---:|:---:|:---:|:---:|:---:|
| Xem danh sách workshop public | `GET /api/v1/workshops` | ✓ | ✓ | ✓ | ✓ | ✓ |
| Xem chi tiết workshop đã publish | `GET /api/v1/workshops/:id` | ✓ | ✓ | ✓ | ✓ | ✓ |
| Xem workshop chưa publish | `GET /api/v1/workshops/:id` | ✗ | ✓ | ✓ | ✗ | ✗ |
| Tạo workshop | `POST /api/v1/workshops` | ✗ | ✓ | ✓ | ✗ | ✗ |
| Sửa / Huỷ workshop | `PATCH DELETE /workshops/:id` | ✗ | ✓ | ✗ | ✗ | ✗ |
| Đăng ký workshop | `POST /api/v1/registrations` | ✓ | ✗ | ✗ | ✗ | ✗ |
| Xem đăng ký của mình | `GET /api/v1/registrations/me` | ✓ | — | — | — | ✗ |
| Xem toàn bộ đăng ký / thống kê | `GET /api/v1/admin/*` | ✗ | ✓ | ✓ | ✗ | ✗ |
| Quét QR check-in | `POST /api/v1/check-ins` | ✗ | ✓ | ✓ | ✓ | ✗ |
| Upload PDF + gen AI summary | `POST /workshops/:id/summary` | ✗ | ✓ | ✗ | ✗ | ✗ |

> ✓ cho phép · ✗ từ chối (403) · — không áp dụng · **owner** = `workshops.created_by = req.user.id`

---

## Kịch bản lỗi

| Tình huống | HTTP | Error code |
|---|:---:|---|
| Không có `Authorization` header | 401 | `UNAUTHENTICATED` |
| JWT sai định dạng / signature | 401 | `INVALID_TOKEN` |
| JWT hết hạn | 401 | `TOKEN_EXPIRED` — FE redirect `/login` |
| JWT hợp lệ nhưng profile không có trong DB | 401 | `PROFILE_NOT_FOUND` |
| Role không đủ quyền | 403 | `FORBIDDEN_ROLE` + `required: ['organizer']` |
| Organizer A sửa workshop của organizer B | 403 | `FORBIDDEN_OWNERSHIP` |
| Resource không tồn tại | 404 | `RESOURCE_NOT_FOUND` |
| Anon/student truy cập workshop chưa publish | **404** | `RESOURCE_NOT_FOUND` — trả 404 thay vì 403 để không leak sự tồn tại của resource |

---

## Ràng buộc

- `SUPABASE_SERVICE_ROLE_KEY` chỉ tồn tại trong `.env` server-side, **không bao giờ** expose ra FE. Leak key = bypass toàn bộ RLS → rotate emergency.
- FE lưu token trong React state / in-memory, **không** `localStorage` (XSS risk).
- `loadProfile` query DB **mỗi request** — thêm 1 SELECT vào `profiles` nhưng đổi role có hiệu lực ngay, không đợi JWT expire. MVP single-instance chấp nhận được; scale-out → cache role 60s trong Redis.
- Role chỉ được gán thủ công bởi admin — không có self-signup lên role cao hơn.
- **RLS minimal (Lớp 2 — phụ):** `workshops` và `profiles` có SELECT policy cho FE dùng Supabase Realtime/JS. 6 bảng còn lại bật RLS + 0 policy = deny-all. Backend bypass qua `service_role`.

---

## Tiêu chí chấp nhận

1. Anon gọi endpoint cần auth → **401** `UNAUTHENTICATED` (không phải 403).
2. Student gọi `POST /api/v1/workshops` → **403** `FORBIDDEN_ROLE`.
3. Staff gọi `POST /api/v1/workshops` → **403** `FORBIDDEN_ROLE`.
4. Organizer A tạo workshop X → organizer B gọi `PATCH /workshops/X` → **403** `FORBIDDEN_OWNERSHIP`.
5. Organizer A gọi `PATCH /workshops/X` của chính mình → **200** OK.
6. `GET /registrations/me` với student → trả CHỈ registration của student đó, không leak của người khác.
7. JWT hết hạn → **401** `TOKEN_EXPIRED`.
8. Anon gọi `GET /workshops/:id` cho workshop chưa publish → **404** (không phải 403).
9. FE gọi Supabase JS trực tiếp đọc bảng `payments` → 0 rows (RLS deny-all).
10. Admin đổi role user từ `student` → `organizer` → request **tiếp theo** của user đó đã có quyền organizer mà không cần đăng xuất lại.
