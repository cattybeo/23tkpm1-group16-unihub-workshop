-- Allow authenticated users to subscribe to their own notifications via Realtime.
-- The earlier migration revoked all privileges from anon/authenticated; we
-- re-grant SELECT and constrain it with an RLS policy.

grant select on table notifications to authenticated;

do $$ begin
  create policy notifications_self_select on notifications
    for select to authenticated
    using (user_id = auth.uid());
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table notifications;
exception when duplicate_object then null;
end $$;
