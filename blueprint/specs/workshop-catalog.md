# Đặc tả: Xem danh sách workshop

## Mô tả

Sinh viên và khách vãng lai xem được danh sách workshop đã công bố, bao gồm thông tin diễn giả, phòng tổ chức, sơ đồ phòng và số chỗ còn lại theo thời gian thực. Workshop chưa công bố hoặc đã huỷ không hiển thị với người dùng thông thường.

## Luồng chính

**Xem danh sách:**

1. Client gọi `GET /api/v1/workshops`. Không cần đăng nhập.
2. Backend kiểm tra cache trong bộ nhớ (TTL 5 giây). Nếu còn hạn, trả ngay.
3. Nếu cache hết hạn, truy vấn cơ sở dữ liệu lấy các workshop đã công bố và chưa huỷ, cập nhật cache.

**Số chỗ theo thời gian thực:**

Frontend đăng ký nhận sự kiện qua Supabase Realtime. Mỗi khi có người đăng ký và `seats_remaining` thay đổi, client nhận thông báo và cập nhật giao diện ngay mà không cần tải lại trang.

**Xem chi tiết:**

1. Client gọi `GET /api/v1/workshops/:id`.
2. Nếu workshop chưa công bố hoặc đã huỷ: trả 404 với mọi người dùng không phải organizer chủ sở hữu. Trả 404 thay vì 403 để không lộ sự tồn tại của workshop.
3. Organizer chủ sở hữu xem được workshop nháp của mình.

## Kịch bản lỗi

| Tình huống | Xử lý |
|---|---|
| Xem workshop chưa công bố (khách, sinh viên) | Trả 404 |
| Organizer xem workshop nháp của người khác | Trả 404 |
| Realtime mất kết nối | Thư viện Supabase tự kết nối lại; số chỗ có thể lệch tối đa vài giây cho đến khi kết nối lại |
| Cache hết hạn lúc workshop vừa bị huỷ | Tối đa 5 giây sau cache tự làm mới và loại bỏ workshop đó; client nhận sự kiện realtime ngay |
| Backend khởi động lại | Cache rỗng, yêu cầu đầu tiên truy vấn trực tiếp, ấm lại trong vòng 1 giây |

## Ràng buộc

- Cache danh sách workshop tối đa 5 giây trong bộ nhớ.
- Bảng `workshops` phải bật Row Level Security với policy chỉ cho phép đọc khi `is_published = true AND cancelled_at IS NULL`.
- Khoá dịch vụ (service role key) chỉ dùng ở backend, không được đưa ra frontend.
- `GET /api/v1/workshops` không yêu cầu xác thực, cho phép cả khách vãng lai.

## Tiêu chí chấp nhận

- Gửi 100 yêu cầu `GET /workshops` trong 1 giây. Cơ sở dữ liệu chỉ nhận đúng 1 truy vấn SELECT.
- Mở 2 tab. Tab A đăng ký workshop 10 chỗ. Tab B (không tải lại trang) thấy số chỗ giảm xuống 9 trong vòng 2 giây.
- Workshop chưa công bố: khách gọi `GET /workshops/:id` nhận 404. Organizer chủ sở hữu nhận 200.
- Workshop vừa bị huỷ: sau tối đa 5 giây không còn xuất hiện trong danh sách. Client nhận sự kiện realtime xoá khỏi giao diện ngay.
