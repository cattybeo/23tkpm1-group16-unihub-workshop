# Đặc tả: Dashboard thống kê (Analytics Dashboard)

> Trace về `requirement.md` mục "Quản trị", `proposal.md` mục "Người dùng" (ban tổ chức xem báo cáo thống kê), `design.md` ADR-002 (PostgreSQL JOIN cho dashboard).
> **Nhóm 16** — Đào Hoàng Đức Mạnh, Nguyễn Trần Minh Thư, Phạm Anh Hào

---

## Mô tả

Trang admin read-only dành riêng cho **organizer** — cung cấp cái nhìn tổng thể về toàn bộ "Tuần lễ kỹ năng và nghề nghiệp": số lượng đăng ký, tỷ lệ lấp đầy phòng, tỷ lệ tham dự thực tế, và thời điểm đăng ký cao điểm.

Số liệu tính bằng aggregate query trực tiếp từ PostgreSQL (JOIN + COUNT + GROUP BY). Cache in-memory (JS Map, TTL 60s) để tránh query lặp khi nhiều organizer mở dashboard cùng lúc. Không có thao tác ghi tại đây.

---

## Luồng chính

### Truy cập dashboard

```
Browser (organizer)
  │
  ├─ 1. GET /api/v1/admin/stats
  │      Authorization: Bearer JWT
  │
Express API
  ├─ 2. verifyJwt → loadProfile → requireRole(['organizer'])
  │
  ├─ 3. Kiểm tra cache (JS Map, key = 'stats:all')
  │      Cache hit (< 60s)  → trả ngay, bỏ qua bước 4
  │      Cache miss / stale → tiếp tục
  │
  ├─ 4. Chạy các aggregate query PostgreSQL:
  │
  │      -- Tổng quan sự kiện
  │      SELECT
  │        COUNT(*) FILTER (WHERE is_published AND cancelled_at IS NULL)  AS total_workshops,
  │        (SELECT COUNT(*) FROM registrations WHERE status = 'confirmed') AS total_confirmed,
  │        (SELECT COUNT(*) FROM check_ins)                                AS total_checkins,
  │        (SELECT SUM(seats_remaining) FROM workshops
  │         WHERE is_published AND cancelled_at IS NULL
  │           AND start_time > now())                                      AS seats_remaining
  │      FROM workshops;
  │
  │      -- Thống kê từng workshop (JOIN)
  │      SELECT w.id, w.title, w.room, w.capacity, w.start_time, w.end_time,
  │        COUNT(r.id) FILTER (WHERE r.status = 'confirmed') AS confirmed,
  │        COUNT(ci.id)                                       AS checkins,
  │        ROUND(COUNT(r.id) FILTER (WHERE r.status='confirmed')::numeric
  │              / NULLIF(w.capacity,0) * 100, 1)             AS fill_rate,
  │        ROUND(COUNT(ci.id)::numeric
  │              / NULLIF(COUNT(r.id) FILTER (WHERE r.status='confirmed'),0) * 100, 1)
  │                                                           AS attendance_rate
  │      FROM workshops w
  │      LEFT JOIN registrations r ON r.workshop_id = w.id
  │      LEFT JOIN check_ins ci    ON ci.registration_id = r.id
  │      WHERE w.is_published = true
  │      GROUP BY w.id
  │      ORDER BY confirmed DESC;
  │
  │      -- Phân bố đăng ký theo giờ
  │      SELECT date_trunc('hour', created_at) AS hour_bucket, COUNT(*) AS count
  │      FROM registrations
  │      WHERE status IN ('confirmed', 'pending_payment')
  │      GROUP BY hour_bucket ORDER BY hour_bucket;
  │
  ├─ 5. Lưu kết quả vào cache (expiresAt = now + 60s)
  │
  └─ 6. Trả 200 JSON gồm: summary, workshopStats, registrationTimeline,
         topWorkshops (top 5 theo confirmed), csvImport, generatedAt
```

### Xem chi tiết một workshop

`GET /api/v1/admin/stats/workshops/:id` — trả danh sách sinh viên đã đăng ký kèm trạng thái check-in. Dùng khi organizer click vào row trong bảng thống kê.

### Layout trang (wireframe)

```
┌──────────────────────────────────────────────────────────────┐
│  [Tổng workshop: 42]  [Đã đăng ký: 3,812]                   │
│  [Check-in: 2,904]    [Tỷ lệ tham dự: 76%]                  │
├──────────────────────────────────────────────────────────────┤
│  Lượt đăng ký theo giờ (Recharts BarChart)                   │
│  [████ 1203] [█ 412] [██ 680] ...                            │
├──────────────────────────────────────────────────────────────┤
│  Thống kê từng workshop (bảng, click → xem chi tiết SV)      │
│  Workshop          │ Phòng │ ĐK    │ Lấp đầy │ Tham dự      │
│  Kỹ năng PV        │ A101  │ 58/60 │ 96.7%   │ 51 (87.9%)   │
│  ...               │ ...   │ ...   │ ...     │ ...           │
├──────────────────────────────────────────────────────────────┤
│  CSV Import: 02:05 · 11,842 SV hợp lệ · 2 dòng lỗi          │
└──────────────────────────────────────────────────────────────┘
```

Thư viện biểu đồ: **Recharts** (đã có trong stack, không thêm dependency).

---

## Kịch bản lỗi

| Tình huống | Hành vi |
|---|---|
| Query DB timeout (> 5s) | Trả **503** `STATS_UNAVAILABLE` — FE hiển thị "Đang tải, thử lại sau" |
| Chưa có dữ liệu (0 workshop) | Trả 200 với tất cả số liệu = 0, FE hiển thị empty state |
| BE restart (mất cache in-memory) | Request đầu sau restart hit DB bình thường, cache warm lại trong < 1s |
| Student hoặc scanner truy cập | **403** `FORBIDDEN_ROLE` |
| Workshop bị huỷ | Vẫn xuất hiện trong bảng với trạng thái `cancelled`, không tính vào `seats_remaining` |
| `fill_rate` hoặc `attendance_rate` có mẫu số = 0 | `NULLIF(_, 0)` trả `NULL`, FE hiển thị `—` thay vì crash |

---

## Ràng buộc

- Dashboard là **read-only** — endpoint chỉ GET, không có side effect.
- Số liệu có thể cũ tối đa **60 giây** (cache TTL). Chấp nhận được — organizer xem để ra quyết định, không cần accuracy từng giây.
- Không phân trang: dataset đủ nhỏ (~60 workshop, ~12K registrations). Nếu sau này > 200 workshop → thêm lazy load per-workshop.
- Cache in-memory không persistent và không shared giữa instances. Acceptable cho MVP single-instance; scale-out → migrate sang Redis.
- Phân quyền: mọi organizer xem được toàn bộ dashboard (không phân biệt owner/non-owner) — đây là view tổng thể sự kiện, không phải view của từng workshop riêng lẻ.

---

## Tiêu chí chấp nhận

1. Organizer gọi `GET /admin/stats` → **200** với đủ các trường `summary`, `workshopStats`, `registrationTimeline`, `topWorkshops`, `csvImport`.
2. Sau khi 1 sinh viên đăng ký xác nhận → trong vòng **60 giây**, `totalConfirmedRegistrations` trong response tăng thêm 1.
3. Sau khi check-in → `totalCheckIns` tăng và `attendanceRate` được cập nhật trong vòng 60 giây.
4. Student hoặc scanner gọi endpoint → **403**.
5. Click vào row workshop trên bảng → hiển thị danh sách sinh viên đã đăng ký kèm trạng thái check-in (`checkedIn: true/false`).
6. Workshop có 0 đăng ký → `fillRate` và `attendanceRate` hiển thị `—` (không crash do chia cho 0).
7. Biểu đồ Registration Timeline hiển thị đúng số lượt đăng ký theo giờ, giờ đông nhất được highlight rõ.
