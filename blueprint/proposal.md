# Project Proposal

> **TL;DR** — UniHub Workshop thay thế Google Form bằng hệ thống đăng ký workshop có kiểm soát chỗ ngồi realtime, thanh toán có phí, check-in offline, và import lịch từ CSV. Thách thức cốt lõi: seat contention + burst 12K users + offline sync.

## Vấn đề

### Bối cảnh

- Trường A tổ chức sự kiện "Tuần lễ kỹ năng và nghề nghiệp".
- Quy mô đang mở rộng nhanh: kéo dài 5 ngày, mỗi ngày có từ 8–12 workshop diễn ra song song tại nhiều địa điểm.

### Hiện trạng

- Sử dụng Google Form để thu thập lượt đăng ký.
- Gửi thông báo hoàn toàn thủ công qua Email.

### Điểm yếu & Hậu quả

- **Overbooking:** Thiếu giới hạn chỗ ngồi realtime — sinh viên vẫn đăng ký được dù workshop đã đầy.
- **Check-in thủ công:** Nhân sự điểm danh tay, tốn thời gian và dễ sai sót.
- **Quản lý thu phí kém:** Không có luồng thanh toán cho workshop có phí.
- **Nghẽn hệ thống:** Không chịu được tải đột biến, email thông báo bị trễ hoặc mất.
- **Thiếu analytics:** Không đo được tỷ lệ tham dự thực tế, chủ đề hot hay thời điểm đông nhất.

## Mục tiêu

- **Tính nhất quán dữ liệu:** Tuyệt đối không để 2 sinh viên cùng nhận được chỗ cuối cùng của một workshop (seat contention → pessimistic locking với `SELECT ... FOR UPDATE` trong transaction, kết hợp rate limit ở edge để serialize burst).
- **Chịu tải cao:** Hệ thống được **thiết kế** để đáp ứng ≥ 12.000 sinh viên truy cập đồng thời trong 10 phút đầu mở đăng ký (60% dồn vào 3 phút đầu). Cơ chế rate limiting bảo vệ backend và đảm bảo công bằng giữa các sinh viên. **Phạm vi MVP không verify load thực tế** — số liệu là mục tiêu thiết kế, không phải kết quả benchmark.
- **Thanh toán minh bạch:** Chống double-charge qua idempotency key. Graceful degradation: khi cổng thanh toán down, các tính năng xem và đăng ký workshop miễn phí vẫn hoạt động bình thường.
- **Check-in offline-first:** Quét mã QR ngay cả khi mất mạng (IndexedDB queue → foreground sync khi reconnect, không dùng Background Sync API vì iOS Safari không hỗ trợ). Khi reconnect: 0% mất dữ liệu, conflict giải quyết theo server timestamp + UNIQUE constraint.
- **Tích hợp một chiều an toàn:** Đọc file CSV export từ hệ thống cũ. Validate nghiêm ngặt (bỏ qua dòng lỗi, loại trùng lặp) — pipeline chạy ngầm, không gián đoạn hệ thống đang chạy.
- **Thông báo plug-in:** Gửi xác nhận qua in-app + email. Kiến trúc cho phép thêm kênh mới (Telegram, v.v.) mà không sửa logic lõi.
- **AI Summary:** Tóm tắt nội dung workshop từ PDF upload (AI provider: cloud LLM, fallback mock nếu rate limit).

**Success metrics:**

| Metric | Mục tiêu | Cách verify ở MVP |
|---|---|---|
| Double-booking | = 0 | Vitest test race condition (concurrent insert), code review pessimistic lock |
| p99 latency đăng ký tại peak | < 500 ms (mục tiêu thiết kế) | Không verify thực tế ở MVP — chỉ chứng minh qua thiết kế (rate limit + DB transaction nhanh) |
| Data loss khi offline → reconnect | 0% | Demo: tắt wifi → check-in → bật wifi → bấm Sync → record xuất hiện DB |
| CSV import | Bỏ qua dòng lỗi, không crash service | Demo: upload file có 2 row sai format → import 8/10, log 2 error |

## Người dùng

- **Sinh viên** (~12.000 người):
  - Xem lịch, danh sách workshop (thông tin diễn giả, phòng, số chỗ trống realtime).
  - Filter, sort theo thời gian, phòng, chủ đề.
  - Đăng ký (miễn phí/có phí), nhận mã QR xác nhận.
  - Check-in khi tham dự.
  - Xem lịch sử giao dịch.

- **Ban tổ chức** (~30–50 người):
  - Quản lý workshop (tạo, đổi phòng, đổi giờ, hủy).
  - Upload file CSV lịch trình định kỳ.
  - Upload file PDF để AI tóm tắt.
  - Xem báo cáo thống kê, số lượng đăng ký.
  - Quản lý giao dịch, xử lý lỗi thanh toán.

- **Nhân sự check-in** (~200–300 người):
  - Chỉ có quyền quét mã QR tại cửa phòng.
  - Hỗ trợ check-in offline khi mất mạng.
  - Dữ liệu tự đồng bộ lên server khi có kết nối trở lại.

## Phạm vi

- **Trong phạm vi:**
  - Luồng đăng ký workshop chịu tải cao, đảm bảo seat consistency.
  - Check-in offline cho nhân sự (PWA via vite-plugin-pwa).
  - Pipeline đọc, validate và import file CSV từ hệ thống cũ.
  - AI tóm tắt nội dung workshop từ PDF.
  - Các cơ chế bảo vệ: rate limiting, circuit breaker, idempotency key.
  - Kiểm soát truy cập RBAC cho 3 nhóm quyền hạn.
  - Hệ thống thông báo plug-in (in-app + email, dễ mở rộng kênh mới).

- **Ngoài phạm vi:**
  - Tích hợp cổng thanh toán thật (dùng mock payment service).
  - Hạ tầng production (chỉ Docker Compose cho local/demo).
  - Hệ thống quản lý sinh viên của trường (chỉ đọc CSV export, không gọi API).
  - Ứng dụng iOS/Android trên store (chỉ build local).

## Rủi ro và ràng buộc

1. **Tranh chấp chỗ ngồi:** Nhiều sinh viên đăng ký cùng một chỗ cuối cùng → dùng pessimistic lock (`SELECT ... FOR UPDATE` trong transaction PostgreSQL) kết hợp rate limit ở edge để serialize burst. Lý do chọn pessimistic thay vì optimistic: với 7.200 request / 3 phút tranh 60 chỗ, conflict xác suất cao → optimistic gây retry storm; pessimistic deterministic, dễ test, dễ giải thích trong demo.
2. **Tải đột biến:** 12.000 user / 10 phút, đỉnh 60% trong 3 phút → rate limiting + caching để bảo vệ backend, fairness FIFO khi burst.
3. **Thanh toán không ổn định:** Timeout giữa chừng → rollback trạng thái + idempotency key để ngăn double-charge; circuit breaker để isolate lỗi khỏi phần còn lại hệ thống.
4. **Đồng bộ offline:** Một số khu vực trong trường mất mạng → IndexedDB lưu tạm, foreground sync flush khi reconnect (auto trên `online` event + nút "Đồng bộ ngay"). Không dùng Background Sync API vì iOS Safari không hỗ trợ. Conflict giải quyết theo server timestamp + UNIQUE constraint trên `(registration_id)`.
5. **Dữ liệu CSV kém chất lượng:** File export đêm có thể lỗi format hoặc trùng lặp → validate nghiêm ngặt từng dòng, bỏ qua dòng lỗi, log chi tiết để ban tổ chức review.
6. **Tích hợp một chiều:** Không có API hệ thống cũ → pipeline import phải xử lý được file lỗi và chạy ngầm mà không block request đang live.
