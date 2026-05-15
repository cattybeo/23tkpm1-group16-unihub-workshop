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

- **Overbooking:** Thiếu giới hạn chỗ ngồi realtime, sinh viên vẫn đăng ký được dù workshop đã đầy.
- **Check-in thủ công:** Nhân sự điểm danh tay, tốn thời gian và dễ sai sót.
- **Quản lý thu phí kém:** Không có luồng thanh toán cho workshop có phí.
- **Nghẽn hệ thống:** Không chịu được tải đột biến, email thông báo bị trễ hoặc mất.
- **Thiếu analytics:** Không đo được tỷ lệ tham dự thực tế, chủ đề hot hay thời điểm đông nhất.

## Mục tiêu

- **Tính nhất quán dữ liệu:** Tuyệt đối không để 2 sinh viên cùng nhận được chỗ cuối cùng của một workshop, kể cả khi hàng nghìn sinh viên đăng ký trong cùng một khoảnh khắc.
- **Chịu tải cao:** Hệ thống được thiết kế để đáp ứng ≥ 12.000 sinh viên truy cập đồng thời trong 10 phút đầu mở đăng ký (60% dồn vào 3 phút đầu). (Scope không verify load thực tế, số liệu là mục tiêu thiết kế, không phải benchmark.)
- **Thanh toán minh bạch:** Một giao dịch chỉ được thực hiện đúng một lần, dù client retry bao nhiêu lần. Khi cổng thanh toán down, các tính năng xem và đăng ký workshop miễn phí vẫn hoạt động bình thường (graceful degradation).
- **Check-in offline-first:** Nhân sự quét mã QR và ghi nhận check-in được ngay cả khi mất mạng. Khi kết nối phục hồi: 0% mất dữ liệu, không có check-in trùng cho cùng một sinh viên.
- **Tích hợp một chiều an toàn:** Nhập dữ liệu sinh viên từ file CSV export đêm của hệ thống cũ. File lỗi hoặc dữ liệu trùng không làm gián đoạn hệ thống đang chạy.
- **Thông báo extensible:** Gửi xác nhận đăng ký qua in-app + email. Có thể bổ sung kênh mới (Telegram cho học kỳ sau, ...) mà không phải sửa logic đăng ký.
- **AI Summary:** Tóm tắt nội dung workshop tự động từ PDF do ban tổ chức upload.

**Success metrics:**

| Metric | Mục tiêu | Cách verify |
|---|---|---|
| Double-booking | = 0 | Vitest test race condition, code review pessimistic lock |
| p99 latency đăng ký tại peak | < 500 ms (mục tiêu thiết kế) | Không verify thực tế, chỉ chứng minh qua thiết kế rate limit + DB transaction nhanh |
| Data loss khi offline → reconnect | 0% | Tắt wifi → check-in → bật wifi → bấm sync → record xuất hiện DB |
| CSV import | Bỏ qua dòng lỗi, không crash service | File nightly có 2 row sai format → import 8/10, log 2 error vào csv_import_logs |

## Người dùng

- **Sinh viên** (~12.000 người):
  - Xem lịch, danh sách workshop (thông tin diễn giả, phòng, sơ đồ phòng, số chỗ trống realtime).
  - Filter, sort theo thời gian và phòng.
  - Đăng ký (miễn phí/có phí), nhận mã QR xác nhận qua app + email.
  - Check-in khi tham dự bằng cách hiển thị mã QR cho nhân sự quét.

- **Ban tổ chức** (~30–50 người):
  - Quản lý workshop (tạo, đổi phòng, đổi giờ, hủy).
  - Upload file PDF để AI tóm tắt nội dung workshop.
  - Xem báo cáo thống kê, số lượng đăng ký, tỷ lệ tham dự.
  - Xem log CSV import nightly (kiểm tra dòng lỗi nếu có).
  - Không upload CSV thủ công, hệ thống cũ tự drop file CSV vào shared filesystem mỗi đêm, CSV Import Worker đọc theo lịch.

- **Nhân sự check-in** (~50–100 người):
  - Chỉ có quyền quét mã QR tại cửa phòng.
  - Hỗ trợ check-in offline khi mất mạng.
  - Dữ liệu tự đồng bộ lên server khi có kết nối trở lại.

## Phạm vi

- **Trong phạm vi:**
  - Luồng đăng ký workshop chịu tải cao, đảm bảo seat consistency.
  - Check-in offline cho nhân sự (PWA dùng qua vite-plugin-pwa).
  - Pipeline đọc, validate và import file CSV từ hệ thống cũ.
  - AI tóm tắt nội dung workshop từ PDF.
  - Các cơ chế bảo vệ: rate limiting, circuit breaker, idempotency key.
  - Kiểm soát truy cập RBAC cho 3 nhóm quyền hạn.
  - Hệ thống thông báo extensible (in-app + email, dễ mở rộng kênh mới).

- **Ngoài phạm vi:**
  - Tích hợp cổng thanh toán thật (dùng mock payment service).
  - Hạ tầng production (chỉ chạy localhost cho demo, không deploy).
  - Hệ thống quản lý sinh viên của trường (chỉ đọc CSV export, không gọi API).
  - Ứng dụng iOS/Android native trên app store.

**Lý do chọn PWA thay vì native app cho check-in:** Yêu cầu "nhân sự check-in dùng mobile app" trong requirement được hiểu là "ứng dụng dùng trên mobile", không bắt buộc native. Chọn PWA vì:

1. Team dev nhỏ, không over engineering.
2. Offline capability đủ qua Service Worker + IndexedDB.
3. Chỉ cần camera API cho QR scanner.
4. Không phải maintain 2 codebase iOS/Android.

## Rủi ro và ràng buộc

**Ràng buộc hạ tầng:**

- Chạy localhost cho demo, không deploy production.
- Single instance Express, không scale-out.
- Supabase free tier cho demo.

**Ràng buộc dữ liệu và tích hợp:**

- Không có data thật của trường -> dùng mock CSV và seed data.
- Cổng thanh toán mock -> không tích hợp Stripe/VNPay/MoMo thật.
- Hệ thống cũ chưa có API -> chỉ đọc CSV một chiều, không gọi ngược.

**Ràng buộc thiết bị người dùng:**

- iOS Safari không hỗ trợ Background Sync API → thiết kế offline check-in phải dùng foreground sync (sync khi user quay lại tab + nút "Đồng bộ ngay").
- Một số khu vực trong trường mất mạng - không kiểm soát được hạ tầng wifi.
