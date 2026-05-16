# Đặc tả: Quản lý workshop

## Mô tả

Ban tổ chức tạo, chỉnh sửa và huỷ workshop qua trang admin. Organizer chỉ có thể sửa hoặc huỷ workshop do chính mình tạo. Khi workshop bị huỷ hoặc đổi phòng, đổi giờ, hệ thống tự gửi thông báo đến sinh viên đã đăng ký.

## Luồng chính

**Tạo workshop:**

1. Organizer gửi `POST /api/v1/workshops` kèm thông tin (tiêu đề, phòng, giờ, số chỗ, học phí...).
2. Hệ thống kiểm tra dữ liệu đầu vào (giờ bắt đầu phải trước giờ kết thúc, số chỗ lớn hơn 0...).
3. Tạo bản ghi với `is_published = false` (nháp). Organizer phải gọi thêm một bước để công bố.

**Sửa workshop:**

1. Organizer gửi `PATCH /api/v1/workshops/:id`.
2. Hệ thống xác minh người gửi là chủ sở hữu (`created_by = người dùng hiện tại`). Nếu không phải, trả 403.
3. Cập nhật thông tin. Nếu thay đổi phòng hoặc giờ, phát sự kiện để gửi thông báo đến sinh viên đã đăng ký.

**Huỷ workshop:**

1. Organizer gọi `DELETE /api/v1/workshops/:id` kèm lý do huỷ.
2. Hệ thống đặt `cancelled_at = thời điểm hiện tại` (không xoá dữ liệu).
3. Phát sự kiện để gửi email thông báo huỷ đến tất cả sinh viên đã đăng ký.

## Kịch bản lỗi

| Tình huống | Xử lý |
|---|---|
| Sinh viên hoặc nhân sự quét QR gọi API tạo/sửa workshop | Trả 403 `FORBIDDEN_ROLE` |
| Organizer A sửa workshop của organizer B | Trả 403 `FORBIDDEN_OWNERSHIP` |
| Workshop không tồn tại | Trả 404 |
| Giờ bắt đầu sau giờ kết thúc, số chỗ bằng 0 | Trả 400 kèm thông tin trường nào sai |
| Giảm số chỗ xuống dưới số đã đăng ký | Trả 409 `SEATS_BELOW_REGISTERED` |
| Huỷ workshop đã bị huỷ trước đó | Bỏ qua, trả 200 không thay đổi gì thêm |

## Ràng buộc

- Mọi yêu cầu sửa và huỷ đều phải qua kiểm tra chủ sở hữu.
- Huỷ workshop chỉ đặt `cancelled_at`, không xoá dữ liệu để giữ lịch sử.
- Lý do huỷ là bắt buộc để đưa vào nội dung thông báo gửi sinh viên.
- Workshop mới tạo mặc định ở trạng thái nháp, phải công bố thủ công.
- Không được giảm tổng số chỗ xuống dưới số sinh viên đã đăng ký thành công.

## Tiêu chí chấp nhận

- Organizer A tạo workshop X. Organizer B gọi `PATCH /workshops/X` nhận 403. Dữ liệu trong cơ sở dữ liệu không thay đổi.
- Sinh viên gọi `POST /workshops` nhận 403. Không có bản ghi mới được tạo.
- Organizer tạo workshop, 3 sinh viên đăng ký. Gọi `DELETE` huỷ. Sau đó bảng `notifications` có 3 bản ghi email mới ở trạng thái chờ gửi.
- Sau khi huỷ, khách gọi `GET /workshops/:id` nhận 404. Danh sách công khai không còn workshop này sau tối đa 5 giây.
- Gửi `POST /workshops` với giờ bắt đầu sau giờ kết thúc nhận 400 kèm tên trường lỗi. Không có bản ghi được tạo.
