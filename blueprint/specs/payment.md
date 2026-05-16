# Đặc tả: Thanh toán an toàn

## Mô tả

Với workshop có phí, sinh viên thanh toán qua cổng thanh toán sau khi chỗ đã được giữ. Hệ thống phải xử lý được hai tình huống: sinh viên bấm thanh toán nhiều lần (chống trừ tiền hai lần), và cổng thanh toán gặp sự cố (không để lỗi lan ra các tính năng khác).

## Luồng chính

**Chống trừ tiền hai lần (Idempotency Key):**

Frontend sinh một mã `Idempotency-Key` (UUID ngẫu nhiên) mỗi khi sinh viên bắt đầu một phiên đăng ký. Mã này được gửi kèm header với mọi yêu cầu. Khi backend nhận yêu cầu:

1. Thử INSERT key vào bảng `idempotency_keys`. Nếu key chưa tồn tại, INSERT thành công và tiếp tục xử lý.
2. Nếu key đã tồn tại và đang xử lý: trả 409.
3. Nếu key đã tồn tại và đã xong: trả lại kết quả cũ ngay mà không gọi cổng thanh toán lần nữa.

Lý do dùng INSERT thay vì SELECT rồi mới INSERT: hai yêu cầu đến cùng lúc nếu dùng SELECT trước đều thấy "chưa có" và cùng tiến hành charge. INSERT nguyên tử đảm bảo chỉ một yêu cầu thắng.

**Xử lý cổng thanh toán không ổn định (Circuit Breaker):**

Mọi lệnh gọi cổng thanh toán đi qua Circuit Breaker (thư viện `opossum`) với 3 trạng thái:

- **Đóng (hoạt động bình thường):** yêu cầu được chuyển đến cổng thanh toán.
- **Mở (sự cố):** kích hoạt khi tỷ lệ lỗi vượt 50% hoặc timeout quá 3 giây. Mọi yêu cầu tiếp theo bị từ chối ngay lập tức mà không gọi đến cổng thanh toán, tránh làm treo backend.
- **Nửa mở (thử lại):** sau 30 giây, cho phép 1 yêu cầu đi qua để kiểm tra. Thành công thì chuyển về đóng, thất bại thì quay lại mở.

Khi Circuit Breaker mở, đăng ký vẫn được tạo với trạng thái `pending_payment` và giữ chỗ trong 15 phút. Sinh viên được thông báo thử lại sau. Các tính năng khác (xem danh sách, tìm kiếm workshop, đăng ký miễn phí) không bị ảnh hưởng.

## Kịch bản lỗi

| Tình huống | Xử lý |
|---|---|
| Sinh viên bấm thanh toán nhiều lần cùng key | Chỉ lần đầu được xử lý, các lần sau nhận lại kết quả cũ |
| Cổng thanh toán phản hồi chậm hơn 3 giây | Circuit Breaker tính là lỗi; bản ghi giữ trạng thái `pending_payment` 15 phút. Phản hồi trả về: `{ error: { code: "PAYMENT_UNAVAILABLE", message: "..." } }`, HTTP 503 |
| Tỷ lệ lỗi từ cổng thanh toán vượt 50% | Circuit Breaker chuyển sang mở; yêu cầu tiếp theo bị từ chối ngay, HTTP 503 với `PAYMENT_UNAVAILABLE` |
| Thẻ hết tiền hoặc thông tin sai (lỗi nghiệp vụ) | Không tính vào tỷ lệ lỗi của Circuit Breaker. Huỷ bản ghi đăng ký, trả lại chỗ, trả 402 |
| Bản ghi `pending_payment` quá 15 phút không thanh toán | Cron job tự chuyển `cancelled` và trả lại chỗ |

## Ràng buộc

- `Idempotency-Key` được giữ trong cơ sở dữ liệu 24 giờ. Sau đó coi như yêu cầu mới.
- Circuit Breaker chỉ tính lỗi hệ thống (mạng, timeout, lỗi 5xx), không tính lỗi nghiệp vụ (thẻ sai, hết tiền).
- Ngưỡng Circuit Breaker: tỷ lệ lỗi 50%, timeout 3 giây, thời gian thử lại 30 giây.
- Khi Circuit Breaker mở, các tính năng không liên quan đến thanh toán phải hoạt động bình thường.

## Tiêu chí chấp nhận

- Gửi 2 yêu cầu cùng `Idempotency-Key` và cùng thông tin. Cơ sở dữ liệu chỉ có 1 bản ghi đăng ký, số chỗ chỉ giảm 1, cổng thanh toán chỉ nhận 1 lần charge.
- Ép cổng thanh toán trả lỗi 500 liên tục 5 lần. Yêu cầu thứ 6 nhận phản hồi "Circuit is open" trong dưới 10ms (không bị treo 3 giây).
- Khi Circuit Breaker mở, đăng ký workshop có phí tạo bản ghi `pending_payment`, số chỗ giảm 1. Gọi kiểm tra số chỗ còn lại xác nhận đã giảm.
- Chạy cron với bản ghi `pending_payment` được tạo 16 phút trước. Bản ghi chuyển `cancelled`, số chỗ cộng lại 1.
