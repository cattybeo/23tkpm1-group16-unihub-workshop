# Đặc tả: Hệ thống thông báo (Notification)

> Trace về `requirement.md` mục "Thông báo", `design.md` ADR-005 (INotifier interface), ADR-012 (Outbox pattern).
> **Nhóm 16** — Đào Hoàng Đức Mạnh, Nguyễn Trần Minh Thư, Phạm Anh Hào

---

## Mô tả

Sau khi đăng ký workshop thành công, sinh viên nhận thông báo xác nhận qua **2 kênh đồng thời**:

1. **In-app** — lưu vào bảng `notifications`, FE nhận qua Supabase Realtime WebSocket.
2. **Email** — gửi qua Email Provider (SMTP). MVP dùng mock (log console), interface chuẩn để swap adapter thật sau.

Yêu cầu cốt lõi từ đề bài: **dễ dàng bổ sung kênh mới** (Telegram, Zalo...) mà **không sửa logic đăng ký**. Đảm bảo bằng `INotifier` interface + EventEmitter (Event-based, ADR-005).

Scope MVP: in-app implement đầy đủ · email mock · Telegram không implement (chỉ thể hiện interface tương thích).

---

## Luồng chính

### Kiến trúc tổng quan

Registration Service và Notification Service giao tiếp qua **EventEmitter** (fire-and-forget). Kết hợp **Outbox pattern**: notification được INSERT vào DB trong cùng transaction với registration — đảm bảo at-least-once delivery dù BE crash.

```
Registration Service
  │
  ├─ 1. BEGIN transaction
  ├─ 2. UPDATE workshops SET seats_remaining = seats_remaining - 1
  ├─ 3. INSERT registrations (status='confirmed', qr_token)
  ├─ 4. INSERT notifications (status='pending', title, body, user_id)  ← Outbox
  ├─ 5. COMMIT
  │
  └─ 6. EventEmitter.emit('RegistrationConfirmed', { notificationId, userId,
                           userEmail, workshopTitle, qrToken })
         ↑ Emit SAU khi commit — không emit trong transaction

Notification Service (listener bất đồng bộ, không block response)
  │
  ├─ 7.  UPDATE notifications SET status='in_progress'
  ├─ 8a. InAppNotifier.send()   → UPDATE notifications SET status='sent'
  │                               Supabase Realtime broadcast → FE WebSocket
  ├─ 8b. EmailNotifier.send()   → gọi SMTP/mock (không lưu DB)
  └─ 9.  Nếu lỗi → UPDATE notifications SET status='failed', retry_count++
```

### INotifier interface (OCP / DIP)

```typescript
export interface INotifier {
  readonly channel: string;
  send(payload: NotificationPayload): Promise<void>;
}

// Thêm kênh Telegram: chỉ implement class này + đăng ký DI
// Không sửa Registration Service hay Notification Service
export class TelegramNotifier implements INotifier { ... }
```

`NotificationService.dispatch()` dùng `Promise.allSettled()` — 1 kênh lỗi không ảnh hưởng kênh còn lại.

### FE nhận in-app notification

```typescript
supabase
  .channel('my-notifications')
  .on('postgres_changes', {
    event: 'INSERT', schema: 'public', table: 'notifications',
    filter: `user_id=eq.${currentUserId}`,
  }, (payload) => showNotificationToast(payload.new))
  .subscribe();
```

### Background Worker retry

Cron mỗi 5 phút quét `notifications` có `status IN ('pending', 'failed')` và `retry_count < 3` và `updated_at < now() - interval '2 minutes'` → gọi lại `NotificationService.dispatch()`. Sau 3 lần thất bại: giữ `status='failed'` để alert thủ công.

---

## Kịch bản lỗi

| Tình huống | Hành vi |
|---|---|
| Email Provider down khi gửi | `EmailNotifier.send()` throw → log error, in-app vẫn gửi thành công (`Promise.allSettled`) |
| BE crash sau COMMIT nhưng trước emit | Record `status='pending'` còn trong DB → Worker retry trong ≤ 5 phút |
| BE crash giữa khi Notification Service đang xử lý | Record kẹt ở `status='in_progress'` > 2 phút → Worker detect stuck → retry |
| Supabase Realtime WebSocket mất kết nối | SDK tự reconnect; FE poll `GET /api/v1/notifications` khi reconnect để bù notification bị miss |
| 3 lần retry đều thất bại | `status='failed'`, giữ để alert — không ảnh hưởng luồng đăng ký |
| Worker gửi trùng (retry notification đã sent) | InAppNotifier idempotent (chỉ UPDATE, không INSERT thêm). EmailNotifier gửi trùng — at-least-once delivery, chấp nhận ở MVP |

---

## Ràng buộc

- Registration Service chỉ được import `EventEmitter` — **không** import `InAppNotifier`, `EmailNotifier` hay bất kỳ adapter cụ thể nào.
- Emit **sau** khi transaction commit, không trong transaction (tránh emit cho registration chưa tồn tại nếu transaction rollback).
- Gửi thông báo **không block** response trả về user — response trả ngay sau COMMIT.
- **At-least-once delivery** — chấp nhận gửi trùng, không chấp nhận mất.
- Thêm kênh mới: chỉ thêm class implement `INotifier` + đăng ký DI container. **Không sửa** bất kỳ file logic nào khác.

---

## Tiêu chí chấp nhận

1. Đăng ký workshop thành công → record trong `notifications` có `status='sent'` trong vòng vài giây.
2. FE nhận WebSocket event (Supabase Realtime) và hiển thị toast thông báo.
3. Console log email mock xuất hiện với đúng tên workshop và mã QR.
4. **Giả lập crash:** dừng process ngay sau COMMIT → khởi động lại → Worker retry → notification gửi trong ≤ 5 phút.
5. Email adapter throw error → in-app notification vẫn `status='sent'` (2 kênh độc lập nhau).
6. Thêm `TelegramNotifier` vào DI container → không cần sửa bất kỳ file nào khác ngoài file DI registration.
