# Đặc tả: Dashboard thống kê

> Trace về `proposal.md` mục "Người dùng" và `full-guide.md` mục Analytics.
> Bản này phản ánh codebase hiện tại. Không yêu cầu thêm bảng, view, RPC hay dependency mới.

---

## Mô tả

Trang tổng quan admin dành riêng cho `organizer`, cung cấp số liệu vận hành dựa trên các bảng hiện có:

- `workshops`
- `registrations`
- `check_ins`
- `csv_import_logs`

Backend tổng hợp dữ liệu qua service role của Supabase và trả về một response read-only. Frontend chỉ render dữ liệu đã tính sẵn; không tự suy thống kê từ danh sách workshop public nữa.

---

## Endpoint

`GET /api/v1/admin/stats`

Middleware:

```text
verifyJwt -> loadProfile -> requireRole(['organizer'])
```

Cache:

- In-memory cache TTL 60 giây.
- Query timeout 5 giây, timeout trả `503 STATS_UNAVAILABLE`.
- Cache mất sau khi backend restart là chấp nhận được trong MVP single-instance.

Response:

```ts
{
  summary: {
    total_workshops: number
    published_workshops: number
    hidden_workshops: number
    cancelled_workshops: number
    total_capacity: number
    seats_remaining: number
    total_confirmed_registrations: number
    total_pending_payments: number
    total_checkins: number
    fill_rate: number | null
    attendance_rate: number | null
  }
  workshopStats: Array<{
    id: string
    title: string
    room: string
    start_time: string
    end_time: string
    visibility: 'published' | 'hidden' | 'cancelled'
    capacity: number
    seats_remaining: number
    confirmed: number
    pending_payment: number
    cancelled: number
    expired: number
    checkins: number
    fill_rate: number | null
    attendance_rate: number | null
  }>
  registrationTimeline: Array<{ hour: string; count: number }>
  topWorkshops: AdminStatsWorkshop[]
  csvImport: {
    source_file: string | null
    imported_at: string
    imported_count: number
    status: 'completed' | 'failed'
    message: string | null
  } | null
  generatedAt: string
}
```

---

## Luồng chính

```text
Browser organizer
  -> GET /api/v1/admin/stats
  -> Express verifyJwt/loadProfile/requireRole
  -> check in-memory cache
  -> query workshops, registrations, check_ins, csv_import_logs
  -> aggregate in service
  -> 200 response envelope
```

Dashboard hiển thị:

- Tổng workshop đang hoạt động, số workshop đang mở.
- Tổng đăng ký `confirmed`, tổng sức chứa, số pending payment.
- Tỷ lệ lấp đầy và số chỗ còn trống.
- Tổng check-in và tỷ lệ tham dự.
- Timeline đăng ký theo giờ bằng CSS bar chart, không dùng Recharts vì dependency hiện không có trong `frontend/package.json`.
- Bảng thống kê từng workshop: confirmed/capacity, check-in, fill rate, attendance rate, trạng thái published/hidden/cancelled.
- CSV import gần nhất từ `csv_import_logs`.

---

## Quy tắc tính toán

- `fill_rate = confirmed / capacity * 100`; nếu `capacity = 0` thì trả `null`.
- `attendance_rate = checkins / confirmed * 100`; nếu `confirmed = 0` thì trả `null`.
- `total_capacity` và `seats_remaining` chỉ tính workshop chưa bị hủy.
- `registrationTimeline` chỉ tính `confirmed` và `pending_payment`, gom theo giờ từ `registrations.created_at`.
- `csvImport` lấy log mới nhất theo `csv_import_logs.imported_at desc`.

---

## Ngoài phạm vi hiện tại

Các phần dưới đây từng xuất hiện trong spec cũ nhưng hiện chưa có endpoint hoặc chưa có nhu cầu thêm DB, nên không còn là yêu cầu của MVP hiện tại:

- `GET /api/v1/admin/stats/workshops/:id` drill-down danh sách sinh viên theo workshop.
- Recharts chart dependency.
- Database view/RPC riêng cho analytics.
- Bảng analytics snapshot/history.

Nếu cần drill-down sau này, dùng endpoint hiện có `GET /api/v1/admin/registrations?workshop_id=<uuid>` trước khi thêm schema mới.

---

## Tiêu chí nghiệm thu

1. Organizer gọi `GET /api/v1/admin/stats` nhận `200` với `summary`, `workshopStats`, `registrationTimeline`, `topWorkshops`, `csvImport`, `generatedAt`.
2. Student hoặc staff gọi endpoint nhận `403 FORBIDDEN_ROLE`.
3. Dashboard `/admin` dùng endpoint stats, không tự tính từ `GET /workshops`.
4. Chưa có dữ liệu thì response vẫn `200`, các count là `0`, rate là `null`, UI hiển thị `--`.
5. Query quá 5 giây trả `503 STATS_UNAVAILABLE`.
6. Route demo `/admin-dashboard` không còn trong frontend router.
