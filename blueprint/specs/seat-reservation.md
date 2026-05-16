# Đặc tả: Giữ chỗ ngồi

## Mô tả

Khi sinh viên đăng ký workshop, hệ thống phải đảm bảo chỉ đúng số chỗ cho phép được cấp, kể cả khi hàng trăm sinh viên bấm đăng ký cùng lúc. Nếu thanh toán thất bại hoặc hết thời gian giữ chỗ, chỗ phải được trả lại để người khác có thể đăng ký.

## Luồng chính

Khi sinh viên gửi yêu cầu đăng ký:

1. Backend chạy một câu `UPDATE workshops SET seats_remaining = seats_remaining - 1 WHERE id = $1 AND seats_remaining > 0` trong transaction. Nếu không có hàng nào bị ảnh hưởng, trả lỗi hết chỗ.
2. Cùng transaction, INSERT một bản ghi vào `registrations` với trạng thái `pending_payment` và một mã QR ngẫu nhiên. Nếu sinh viên đã đăng ký workshop này rồi (vi phạm UNIQUE), transaction rollback, chỗ tự trả lại.
3. Với workshop miễn phí: cập nhật trạng thái thành `confirmed` ngay.
4. Với workshop có phí: giữ nguyên `pending_payment`, chờ kết quả thanh toán.
   - Thanh toán thành công: cập nhật thành `confirmed`.
   - Thanh toán thất bại: cập nhật thành `cancelled`, trả lại 1 chỗ.
   - Cổng thanh toán không khả dụng: giữ `pending_payment` tối đa 15 phút, sau đó cron job tự huỷ và trả chỗ.

## Kịch bản lỗi

| Tình huống | Xử lý |
|---|---|
| Hết chỗ | `rowCount = 0`, trả 409 `SEATS_SOLD_OUT` |
| Sinh viên đăng ký lần 2 cùng workshop | Vi phạm UNIQUE, rollback, trả 409 `ALREADY_REGISTERED` |
| Thanh toán thất bại | Huỷ bản ghi, trả lại 1 chỗ |
| Cổng thanh toán không phản hồi | Giữ chỗ 15 phút, cron job tự dọn nếu không thanh toán kịp |
| Hai thiết bị cùng tài khoản gửi trùng yêu cầu | Middleware idempotency chặn trước khi vào bước giữ chỗ |

## Ràng buộc

- Phải dùng một câu UPDATE duy nhất để trừ chỗ, không dùng SELECT rồi mới UPDATE.
- Không được gọi cổng thanh toán trong khi đang giữ transaction cơ sở dữ liệu.
- Bảng `registrations` phải có ràng buộc UNIQUE trên `(student_id, workshop_id)`.
- Chỗ chưa thanh toán tối đa tồn tại 15 phút. Cron job quét mỗi 60 giây.

## Tiêu chí chấp nhận

- Giả lập 1000 yêu cầu đồng thời cho workshop 10 chỗ. Kết quả: đúng 10 bản ghi `confirmed`, `seats_remaining = 0`, không có bản ghi thừa.
- Sinh viên gửi 2 yêu cầu khác nhau cho cùng workshop. Lần 2 nhận 409, số chỗ chỉ giảm 1.
- Giả lập thanh toán thất bại. Sau khi phản hồi: bản ghi chuyển `cancelled`, số chỗ khôi phục về ban đầu.
- Chèn thủ công 1 bản ghi `pending_payment` với thời gian tạo 20 phút trước. Chạy cron. Bản ghi chuyển `cancelled`, số chỗ cộng lại 1.
