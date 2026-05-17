-- =============================================================================
-- UniHub Workshop — Seed Data
-- =============================================================================
-- Chạy SAU migration 00001. Dữ liệu mẫu đủ để demo:
--   - 10 students whitelist (KHỚP với data/students_nightly_2026-05-13.csv)
--   - 3 staff (2 organizer + 1 staff) + 3 students có account
--   - 4 workshops: 1 free còn chỗ, 1 free hết chỗ, 1 có phí (có AI summary),
--                  1 đã huỷ
--   - 5 registrations đủ các status
--   - 2 payments (1 succeeded, 1 failed)
--   - 1 check-in
--   - 3 notifications in-app
--
-- LƯU Ý: phần INSERT auth.users chỉ chạy được trên Supabase local
-- (`supabase start`). Trên cloud, tạo user qua Auth API rồi chạy phần từ
-- profiles trở xuống.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. students — 10 dòng, KHỚP CHÍNH XÁC với CSV
-- ----------------------------------------------------------------------------
-- mssv (MSSV) làm PK luôn, không có UUID surrogate.
insert into students (mssv, full_name) values
  ('21127001', 'Nguyễn Văn An'),
  ('21127002', 'Trần Thị Bích Ngọc'),
  ('21127003', 'Lê Minh Hoàng'),
  ('21127004', 'Phạm Quỳnh Anh'),
  ('21127005', 'Đặng Văn Đức'),
  ('22127010', 'Hoàng Thị Mai'),
  ('22127011', 'Vũ Nhật Trường'),
  ('22127012', 'Bùi Khánh Linh'),
  ('23127050', 'Đào Hoàng Đức Mạnh'),
  ('23127051', 'Nguyễn Trần Minh Thư');

-- ----------------------------------------------------------------------------
-- 2. auth.users (chỉ local dev — Supabase cloud dùng Auth API)
-- ----------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        aud, role)
values
  ('aaaaaaa1-0000-0000-0000-000000000001', 'organizer1@unihub.edu',
   '{"display_name":"Ban tổ chức 1"}', crypt('demo-password', gen_salt('bf')),
   now(), now(), now(), 'authenticated', 'authenticated'),
  ('aaaaaaa2-0000-0000-0000-000000000002', 'organizer2@unihub.edu',
   '{"display_name":"Ban tổ chức 2"}', crypt('demo-password', gen_salt('bf')),
   now(), now(), now(), 'authenticated', 'authenticated'),
  ('bbbbbbb1-0000-0000-0000-000000000001', 'staff1@unihub.edu',
   '{"display_name":"Nhân sự check-in 1"}', crypt('demo-password', gen_salt('bf')),
   now(), now(), now(), 'authenticated', 'authenticated'),
  ('dddddd01-0000-0000-0000-000000000001', 'btc@unihub',
   '{"display_name":"Ban tổ chức"}', crypt('123', gen_salt('bf')),
   now(), now(), now(), 'authenticated', 'authenticated'),
  ('dddddd02-0000-0000-0000-000000000002', 'staff@unihub',
   '{"display_name":"Staff"}', crypt('123', gen_salt('bf')),
   now(), now(), now(), 'authenticated', 'authenticated'),
  ('ccccccc1-0000-0000-0000-000000000001', 'an.nguyen@student.unihub.edu',
   '{"display_name":"Nguyễn Văn An"}', crypt('demo-password', gen_salt('bf')),
   now(), now(), now(), 'authenticated', 'authenticated'),
  ('ccccccc2-0000-0000-0000-000000000002', 'ngoc.tran@student.unihub.edu',
   '{"display_name":"Trần Thị Bích Ngọc"}', crypt('demo-password', gen_salt('bf')),
   now(), now(), now(), 'authenticated', 'authenticated'),
  ('ccccccc3-0000-0000-0000-000000000003', 'manh.dao@student.unihub.edu',
   '{"display_name":"Đào Hoàng Đức Mạnh"}', crypt('demo-password', gen_salt('bf')),
   now(), now(), now(), 'authenticated', 'authenticated')
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 3. profiles — mssv giờ là TEXT (MSSV), không phải UUID
-- ----------------------------------------------------------------------------
insert into profiles (id, role, mssv, display_name, phone) values
  ('aaaaaaa1-0000-0000-0000-000000000001', 'organizer', null, 'Ban tổ chức 1', '0901111001'),
  ('aaaaaaa2-0000-0000-0000-000000000002', 'organizer', null, 'Ban tổ chức 2', '0901111002'),
  ('bbbbbbb1-0000-0000-0000-000000000001', 'staff',     null, 'Nhân sự check-in 1', '0902222001'),
  ('dddddd01-0000-0000-0000-000000000001', 'organizer', null, 'Ban tổ chức',        null),
  ('dddddd02-0000-0000-0000-000000000002', 'staff',     null, 'Staff',              null),
  ('ccccccc1-0000-0000-0000-000000000001', 'student', '21127001', 'Nguyễn Văn An',         '0903333001'),
  ('ccccccc2-0000-0000-0000-000000000002', 'student', '21127002', 'Trần Thị Bích Ngọc',    '0903333002'),
  ('ccccccc3-0000-0000-0000-000000000003', 'student', '23127050', 'Đào Hoàng Đức Mạnh',    '0903333009');

-- ----------------------------------------------------------------------------
-- 4. workshops — workshop 3 có sẵn AI summary (gộp vào cùng bảng)
-- ----------------------------------------------------------------------------
insert into workshops (id, title, description, speaker_name, speaker_bio, room,
                       start_time, end_time, capacity, seats_remaining, fee_vnd,
                       pdf_url, summary_md, summary_generated_at,
                       is_published) values
  ('22222222-2222-2222-2222-222222220001',
   'AI cho người mới: prompting hiệu quả',
   'Workshop nhập môn về Prompt Engineering, dành cho sinh viên năm 1-2.',
   'TS. Nguyễn Hoàng Vũ', 'Senior ML Engineer @ FPT AI',
   'Phòng B11.10',
   '2026-05-20 09:00:00+07', '2026-05-20 11:30:00+07',
   60, 58, 0,
   null, null, null,
   true),

  ('22222222-2222-2222-2222-222222220002',
   'CV & phỏng vấn công ty công nghệ',
   'Mock interview + review CV trực tiếp cho 30 ứng viên.',
   'Chị Lê Thu Hà', 'Tech Recruiter @ VNG',
   'Phòng B12.05',
   '2026-05-21 14:00:00+07', '2026-05-21 17:00:00+07',
   30, 0, 0,
   null, null, null,
   true),

  ('22222222-2222-2222-2222-222222220003',
   'Workshop chuyên sâu: System Design',
   'Phí 150.000đ. Bao gồm tài liệu in + cà phê.',
   'Anh Phạm Quốc Bảo', 'Staff Engineer @ Grab',
   'Hội trường E',
   '2026-05-22 13:30:00+07', '2026-05-22 17:00:00+07',
   100, 97, 150000,
   'storage://workshop-pdf/system-design-intro.pdf',
   E'# Tóm tắt nội dung\n\n- Caching multi-layer (CDN, app cache, DB)\n- Sharding strategies\n- Hands-on: thiết kế URL shortener cho 1B users.',
   now() - interval '6 hours',
   true),

  ('22222222-2222-2222-2222-222222220004',
   'Buổi nói chuyện với cựu sinh viên (ĐÃ HUỶ)',
   'Diễn giả bận đột xuất — sẽ dời lịch.',
   'Diễn giả TBD', null,
   'Phòng A03.01',
   '2026-05-23 10:00:00+07', '2026-05-23 11:30:00+07',
   80, 80, 0,
   null, null, null,
   true);

update workshops
   set cancelled_at = now()
 where id = '22222222-2222-2222-2222-222222220004';

-- ----------------------------------------------------------------------------
-- 5. registrations — mssv là TEXT (MSSV)
-- ----------------------------------------------------------------------------
insert into registrations (id, mssv, workshop_id, status, qr_token,
                           expires_at, confirmed_at, created_at) values
  ('33333333-3333-3333-3333-333333330001',
   '21127001', '22222222-2222-2222-2222-222222220001',
   'confirmed', 'qr_an_ai_2026', null, now() - interval '2 days', now() - interval '2 days'),

  ('33333333-3333-3333-3333-333333330002',
   '21127002', '22222222-2222-2222-2222-222222220003',
   'confirmed', 'qr_ngoc_sysdesign_2026', null, now() - interval '1 day', now() - interval '1 day'),

  ('33333333-3333-3333-3333-333333330003',
   '23127050', '22222222-2222-2222-2222-222222220003',
   'pending_payment', null,
   now() + interval '10 minutes', null, now() - interval '5 minutes'),

  ('33333333-3333-3333-3333-333333330004',
   '21127003', '22222222-2222-2222-2222-222222220001',
   'expired', null,
   now() - interval '1 hour', null, now() - interval '2 hours'),

  ('33333333-3333-3333-3333-333333330005',
   '21127004', '22222222-2222-2222-2222-222222220001',
   'cancelled', null, null, null, now() - interval '3 hours');

update registrations
   set cancelled_reason = 'Trùng lịch học'
 where id = '33333333-3333-3333-3333-333333330005';

-- ----------------------------------------------------------------------------
-- 6. payments
-- ----------------------------------------------------------------------------
insert into payments (registration_id, amount_vnd, status, gateway_ref) values
  ('33333333-3333-3333-3333-333333330002', 150000, 'succeeded', 'MOCK_TXN_001'),
  ('33333333-3333-3333-3333-333333330003', 150000, 'failed',    'MOCK_TXN_002');

update payments
   set failure_reason = 'gateway_timeout (circuit breaker OPEN)'
 where gateway_ref = 'MOCK_TXN_002';

-- ----------------------------------------------------------------------------
-- 7. idempotency_keys
-- ----------------------------------------------------------------------------
insert into idempotency_keys (key, endpoint, user_id, response) values
  ('idem_demo_an_ai_001',
   'POST /api/v1/registrations',
   'ccccccc1-0000-0000-0000-000000000001',
   '{"data":{"registration_id":"33333333-3333-3333-3333-333333330001","status":"confirmed"},"error":null}'::jsonb);

-- ----------------------------------------------------------------------------
-- 8. check_ins — 1 cột timestamp duy nhất
-- ----------------------------------------------------------------------------
insert into check_ins (registration_id, staff_user_id, source, checked_in_at) values
  ('33333333-3333-3333-3333-333333330001',
   'bbbbbbb1-0000-0000-0000-000000000001',
   'online', now() - interval '5 minutes');

-- ----------------------------------------------------------------------------
-- 9. notifications (in-app only — email gửi qua adapter, không lưu DB)
-- ----------------------------------------------------------------------------
insert into notifications (user_id, title, body, read_at) values
  ('ccccccc1-0000-0000-0000-000000000001',
   'Xác nhận đăng ký',
   'Bạn đã đăng ký thành công workshop AI cho người mới. Vui lòng giữ mã QR.',
   now() - interval '1 day'),

  ('ccccccc1-0000-0000-0000-000000000001',
   'Check-in thành công',
   'Bạn đã check-in lúc ' || to_char(now() - interval '5 minutes', 'HH24:MI DD/MM') || '.',
   null),

  ('ccccccc3-0000-0000-0000-000000000003',
   'Thanh toán không thành công',
   'Cổng thanh toán đang tạm thời gián đoạn. Chỗ ngồi được giữ thêm 10 phút.',
   null);

-- =============================================================================
-- KẾT THÚC seed.sql
-- =============================================================================
