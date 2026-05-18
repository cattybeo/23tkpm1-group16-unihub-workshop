-- Fix: "column reference fee_vnd is ambiguous" in create_registration_with_outbox.
-- RETURNS TABLE declares fee_vnd as an implicit PL/pgSQL output variable, which
-- conflicts with workshops.fee_vnd in the RETURNING clause of the UPDATE.
-- Qualify the column as workshops.fee_vnd to resolve the ambiguity.

create or replace function public.create_registration_with_outbox(
  p_mssv text,
  p_workshop_id uuid,
  p_user_id uuid
)
returns table (
  registration_id uuid,
  workshop_id uuid,
  status registration_status,
  qr_token text,
  fee_vnd integer,
  notification_id uuid
)
language plpgsql
set search_path = public
as $$
declare
  v_workshop record;
  v_existing record;
  v_student_active boolean;
  v_registration_id uuid;
  v_qr_token text := gen_random_uuid()::text;
  v_status registration_status;
  v_expires_at timestamptz;
  v_notification_id uuid;
begin
  select is_active into v_student_active
    from students
   where mssv = p_mssv;

  if not found or v_student_active is not true then
    raise exception 'STUDENT_NOT_VERIFIED';
  end if;

  update workshops
     set seats_remaining = seats_remaining - 1
   where id = p_workshop_id
     and seats_remaining > 0
     and is_published = true
     and cancelled_at is null
   returning id, title, workshops.fee_vnd
        into v_workshop;

  if not found then
    select id, seats_remaining, is_published, cancelled_at
      into v_existing
      from workshops
     where id = p_workshop_id;

    if not found or v_existing.is_published is not true or v_existing.cancelled_at is not null then
      raise exception 'RESOURCE_NOT_FOUND';
    end if;

    raise exception 'SEATS_SOLD_OUT';
  end if;

  v_status := case
    when v_workshop.fee_vnd = 0 then 'confirmed'::registration_status
    else 'pending_payment'::registration_status
  end;
  v_expires_at := case
    when v_status = 'pending_payment' then now() + interval '15 minutes'
    else null
  end;

  insert into registrations (
    mssv,
    workshop_id,
    status,
    qr_token,
    expires_at,
    confirmed_at
  )
  values (
    p_mssv,
    p_workshop_id,
    v_status,
    v_qr_token,
    v_expires_at,
    case when v_status = 'confirmed' then now() else null end
  )
  returning id into v_registration_id;

  if v_status = 'confirmed' then
    insert into notifications (
      user_id,
      registration_id,
      title,
      body,
      status
    )
    values (
      p_user_id,
      v_registration_id,
      'Đăng ký workshop thành công',
      'Bạn đã đăng ký thành công workshop "' || v_workshop.title || '". Mã QR đã sẵn sàng trong Vé của tôi.',
      'pending'
    )
    returning id into v_notification_id;
  end if;

  return query
    select v_registration_id, p_workshop_id, v_status, v_qr_token, v_workshop.fee_vnd, v_notification_id;
end;
$$;
