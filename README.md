# ĐỒ ÁN MÔN HỌC - UniHub Workshop

## Dánh sách thành viên

| MSSV | Họ và tên | Email |
| ----------- | ----------- |  ----------- |
| 23127417 | Đào Hoàng Đức Mạnh | <dhdmanh23@clc.fitus.edu.vn> |
| 22127403 | Nguyễn Trần Minh Thư | <ntmthu22@clc.fitus.edu.vn> |
| 23127362 | Phạm Anh Hào | <pahao23@clc.fitus.edu.vn> |

## Quy định commit

Format: `<type>(<scope>): <description>`

- `feat:` New feature
- `fix:` Bug fix
- `refactor:` Code restructure
- `test:` Tests
- `chore:` Configs, dependencies, CI, docs, formatting

*Example:* `feat: add offline check-in`

## Techstack

```
{
  "firstName": "John",
  "lastName": "Smith",
  "age": 25
}
```

## Cấu trúc dự án

```
unihub-workshop/
├── blueprint/               # Tài liệu thiết kế (Phần 1)
│   ├── proposal.md          # Vấn đề, mục tiêu, rủi ro
│   ├── design.md            # C4 Diagram, DB Schema, ADR
│   └── specs/               # Đặc tả chi tiết từng module
│       ├── auth.md          # RBAC & JWT
│       ├── registration.md  # Luồng đăng ký & Concurrency
│       ├── payment.md       # Idempotency & Circuit Breaker
│       └── checkin.md       # Offline sync logic
├── src/                     # Mã nguồn (Phần 2)
│   ├── backend/             # Node.js
│   │   ├── src/
│   │   │   ├── controllers/ # Xử lý logic request
│   │   │   ├── services/    # Business logic (Seat booking, AI)
│   │   │   ├── models/      # Database Schema
│   │   │   ├── middlewares/ # Rate limit, Auth, Circuit breaker
│   │   │   └── workers/     # Cron job xử lý CSV
│   │   └── tests/           # Unit test cho logic quan trọng
│   ├── web-app/             # React/Next.js (Admin & Student)
│   ├── mobile-app/          # React Native/Flutter (Check-in)
│   └── shared/              # Types/Constants dùng chung
├── data/                    # Dữ liệu mẫu
│   ├── seed/                # SQL scripts khởi tạo dữ liệu
│   └── legacy_csv/          # File CSV giả lập từ hệ thống cũ
├── clips/                   # Video trình bày
└── README.md                # Hướng dẫn cài đặt (MANDATORY)
```

## Hướng dẫn cài đặt

**bold text**
*italicized text*
> blockquote

1. First item
2. Second item
3. Third item

- First item
- Second item
- Third item
`code`

---
[title](https://www.example.com)
![alt text](image.jpg)
