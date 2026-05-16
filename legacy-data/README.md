# `data/` — Seed & sample data

## Cấu trúc file

| File | Vai trò |
|------|---------|
| `students_nightly_YYYY-MM-DD.csv` | Mô phỏng nightly export từ hệ thống quản lý sinh viên cũ. Tên file mang ngày dữ liệu. |
| `../supabase/seed.sql` | Seed cho database sau khi chạy migrations. Dữ liệu sinh viên trong seed KHỚP với CSV cùng ngày. |

## Format CSV nightly export

```
mssv,full_name
21127001,Nguyễn Văn An
...
```

### Quy ước cố ý chọn

- **Header dòng 1**, đúng 2 cột: `mssv`, `full_name`.
- **Encoding UTF-8 không BOM** — bắt buộc để giữ dấu tiếng Việt.
- **Tên không escape, không quote** trừ khi chứa dấu phẩy hoặc xuống dòng (RFC 4180).
- **LF line ending** (`\n`), không CRLF.
- **`mssv`**: MSSV của trường, chuỗi alphanumeric 6-20 ký tự (constraint `students_mssv_format` trong schema). Đây cũng là PRIMARY KEY của bảng `students`.
- **Không có cột `email`, `phone`, `status`**: theo yêu cầu — định danh tối thiểu là đủ. Email/phone lưu ở `profiles` khi sinh viên tự đăng ký account.

### Logic import (xem ADR-001 Batch Sequential)

Pipeline `read → validate → transform → upsert` chạy nightly bởi Express endpoint
`POST /api/v1/admin/csv-import` (hoặc `node-cron` in-process, xem `docs/techstack.md`):

1. **Parse**: `papaparse` đọc file, validate header khớp.
2. **Validate dòng**: regex `mssv`, `full_name` không rỗng.
3. **Diff với DB**:
   - Có trong CSV, không có trong DB → INSERT, `is_active=true`.
   - Có trong cả 2, `full_name` khác → UPDATE.
   - Có trong DB, không có trong CSV → UPDATE `is_active=false` (soft delete, không hard delete để giữ FK toàn vẹn với registrations cũ).
4. **Log**: `console.log` số liệu (inserted/updated/deactivated/skipped). KHÔNG lưu bảng — đề không yêu cầu, YAGNI cho MVP. Nếu sau này cần audit thì thêm bảng `csv_import_logs` ở migration mới.

### Tại sao không gồm email/status?

Quyết định trong hội thoại với mentor:

- Đề bài chỉ yêu cầu "xác thực sinh viên khi đăng ký" → đủ với `mssv`.
- Email lấy từ Supabase Auth khi sinh viên đăng ký tài khoản, không cần đồng bộ.
- Tránh nightly job phải xử lý PII (phone, email) nếu trường không export.
- Trade-off: nếu sau này cần filter workshop theo ngành/khoa → bổ sung cột vào CSV và thêm column tương ứng vào `students`. Migration đơn giản.

## Thêm file CSV mới cho ngày khác

Đặt tên đúng format `students_nightly_YYYY-MM-DD.csv`. Logic import dùng tên file để
parse `source_date` và chống import trùng file (UNIQUE constraint
`csv_import_file_unique`).
