# Đặc tả: Đăng ký workshop

## Mô tả

Sinh viên đăng ký tham dự workshop thông qua `POST /api/v1/registrations`. Sau khi đăng ký thành công, sinh viên nhận mã QR để dùng khi check-in. Với workshop có phí, luồng đi qua cổng thanh toán. Hệ thống phải chịu được tải cao (hàng nghìn sinh viên đăng ký trong vài phút) và không cho phép trừ tiền hai lần dù client gửi nhiều yêu cầu trùng nhau.

## Luồng chính

**Trước khi vào xử lý nghiệp vụ**, yêu cầu phải vượt qua 4 tầng bảo vệ theo thứ tự:

1. **Giới hạn tốc độ** (20 yêu cầu/phút/IP): chặn trước khi cần xác thực, giảm tải cho cơ sở dữ liệu.
2. **Xác thực người dùng**: chỉ sinh viên đã đăng nhập mới được đăng ký.
3. **Idempotency key**: header `Idempotency-Key` bắt buộc. Nếu cùng key đã được xử lý thành công, trả lại kết quả cũ mà không chạy lại bất cứ thứ gì.
4. **Xác minh sinh viên**: sinh viên phải tồn tại trong danh sách sinh viên đã nhập từ CSV.

**Workshop miễn phí:**

1. Trừ 1 chỗ ngồi và tạo bản ghi đăng ký trong cùng một transaction.
2. Cập nhật trạng thái thành `confirmed`, sinh mã QR.
3. Tạo thông báo (email + trong ứng dụng) vào bảng outbox trong cùng transaction.
4. Trả về 201 kèm mã QR.

**Workshop có phí:**

1. Trừ 1 chỗ và tạo bản ghi `pending_payment` trong transaction.
2. Gọi cổng thanh toán (ngoài transaction).
   - Thành công: cập nhật `confirmed`, tạo thông báo outbox, trả 201 kèm mã QR.
   - Thất bại (thẻ sai/hết tiền): huỷ bản ghi, trả lại chỗ, trả 402.
   - Cổng thanh toán không khả dụng (Circuit Breaker mở): giữ chỗ 15 phút, trả 503 kèm thời hạn giữ chỗ.

## Kịch bản lỗi

| Tình huống | Xử lý |
|---|---|
| Thiếu header `Idempotency-Key` | Trả 400 `IDEMPOTENCY_KEY_REQUIRED` |
| Cùng key, yêu cầu đang xử lý | Trả 409 `REQUEST_IN_PROGRESS` |
| Cùng key, đã xử lý xong | Trả lại kết quả cũ, không chạy lại |
| Vượt giới hạn tốc độ | Trả 429 kèm header `Retry-After` |
| Sinh viên chưa có trong hệ thống (chưa nhập CSV) | Trả 403 `STUDENT_NOT_VERIFIED` |
| Workshop chưa công bố hoặc đã huỷ | Trả 404 |
| Hết chỗ | Trả 409 `SEATS_SOLD_OUT` |
| Sinh viên đã đăng ký workshop này rồi | Trả 409 `ALREADY_REGISTERED` |
| Thanh toán thất bại (thẻ lỗi) | Huỷ đăng ký, trả lại chỗ, trả 402 `PAYMENT_DECLINED` |
| Cổng thanh toán không khả dụng | Giữ chỗ 15 phút, trả 503 `PAYMENT_UNAVAILABLE` |

## Ràng buộc

- Header `Idempotency-Key` là bắt buộc với mọi yêu cầu POST, không có ngoại lệ.
- Trừ chỗ và tạo bản ghi đăng ký phải nằm trong cùng một transaction. Gọi cổng thanh toán thực hiện ngoài transaction.
- Workshop miễn phí không đi qua cổng thanh toán.
- Mã QR sinh một lần lúc tạo bản ghi, không tái tạo khi cập nhật trạng thái.
- Thông báo xác nhận được ghi vào bảng outbox trong cùng transaction với bước xác nhận đăng ký, đảm bảo không mất khi backend gặp sự cố.
- Giới hạn tốc độ: 20 yêu cầu/phút/IP riêng cho endpoint này (ngoài giới hạn toàn cục 200 yêu cầu/15 phút/IP).

## Tiêu chí chấp nhận

- Sinh viên đăng ký workshop miễn phí. Nhận 201 trong dưới 500ms. Bảng `registrations` có 1 bản ghi `confirmed`, số chỗ giảm 1, bảng `notifications` có 2 bản ghi chờ gửi.
- Gửi 5 yêu cầu cùng `Idempotency-Key` trong 2 giây. Chỉ 1 bản ghi đăng ký được tạo, cổng thanh toán chỉ nhận 1 lần charge.
- Gửi 30 yêu cầu trong 1 phút từ cùng IP. Từ yêu cầu thứ 21 trở đi nhận 429 kèm `Retry-After`.
- Workshop còn 1 chỗ, gửi 50 yêu cầu đồng thời. Đúng 1 yêu cầu nhận 201, 49 còn lại nhận 409 `SEATS_SOLD_OUT`.
- Giả lập Circuit Breaker mở. Đăng ký workshop có phí nhận 503. Bản ghi ở trạng thái `pending_payment`, số chỗ đã giảm. Sau 16 phút chạy cron: bản ghi chuyển `cancelled`, số chỗ khôi phục.
- Sinh viên đăng ký workshop X lần đầu nhận 201. Lần hai (key khác) nhận 409 `ALREADY_REGISTERED`. Chỉ có 1 bản ghi trong cơ sở dữ liệu.
