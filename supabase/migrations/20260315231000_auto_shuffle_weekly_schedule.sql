create extension if not exists pg_cron;

create table if not exists public.schedule_settings (
  id integer primary key default 1 check (id = 1),
  rotation_user_count integer not null default 5 check (rotation_user_count > 0),
  default_start_time time not null default '09:00:00',
  default_end_time time not null default '10:00:00',
  default_alarm_enabled boolean not null default true,
  default_status text not null default 'pending' check (default_status in ('pending', 'done')),
  auto_shuffle_enabled boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

insert into public.schedule_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.schedule_settings enable row level security;

drop policy if exists "Anyone can view schedule settings" on public.schedule_settings;
drop policy if exists "Admins can insert schedule settings" on public.schedule_settings;
drop policy if exists "Admins can update schedule settings" on public.schedule_settings;

create policy "Anyone can view schedule settings" on public.schedule_settings
for select
using (true);

create policy "Admins can insert schedule settings" on public.schedule_settings
for insert
with check (public.is_admin(auth.uid()));

create policy "Admins can update schedule settings" on public.schedule_settings
for update
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create table if not exists public.user_notifications (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references public.kitchen_users(id) on delete cascade,
  notification_type text not null,
  title text not null,
  body text not null,
  week_start date,
  read_at timestamp with time zone,
  created_at timestamp with time zone not null default now()
);

create unique index if not exists user_notifications_user_week_type_key
on public.user_notifications (user_id, notification_type, week_start);

alter table public.user_notifications enable row level security;

drop policy if exists "Anyone can view notifications" on public.user_notifications;
drop policy if exists "Anyone can update notifications" on public.user_notifications;
drop policy if exists "Admins can insert notifications" on public.user_notifications;

create policy "Anyone can view notifications" on public.user_notifications
for select
using (true);

create policy "Anyone can update notifications" on public.user_notifications
for update
using (true)
with check (true);

create policy "Admins can insert notifications" on public.user_notifications
for insert
with check (public.is_admin(auth.uid()));

create or replace function public.touch_schedule_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_schedule_settings_updated_at on public.schedule_settings;

create trigger touch_schedule_settings_updated_at
before update on public.schedule_settings
for each row
execute function public.touch_schedule_settings_updated_at();

create or replace function public.auto_build_weekly_schedule(target_week_start date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  local_timezone constant text := 'Asia/Singapore';
  target_start date := coalesce(
    target_week_start,
    date_trunc('week', timezone(local_timezone, now()) + interval '1 week')::date
  );
  participant_count integer;
  duty_count integer;
  settings_row public.schedule_settings%rowtype;
  assignment_count integer := 0;
  notified_count integer := 0;
begin
  select *
  into settings_row
  from public.schedule_settings
  where id = 1;

  if settings_row.id is null then
    insert into public.schedule_settings (id)
    values (1)
    on conflict (id) do nothing;

    select *
    into settings_row
    from public.schedule_settings
    where id = 1;
  end if;

  if not settings_row.auto_shuffle_enabled then
    return jsonb_build_object(
      'status', 'disabled',
      'week_start', target_start
    );
  end if;

  select count(*)
  into participant_count
  from (
    select id
    from public.kitchen_users
    order by username, id
    limit settings_row.rotation_user_count
  ) participants;

  select count(*)
  into duty_count
  from public.duties;

  if participant_count < 5 then
    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'not_enough_people',
      'required_people', 5,
      'available_people', participant_count,
      'week_start', target_start
    );
  end if;

  if duty_count = 0 then
    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'no_duties',
      'week_start', target_start
    );
  end if;

  delete from public.duty_assignments
  where assigned_date between target_start and target_start + 4;

  with participants as (
    select
      id,
      row_number() over (order by username, id) - 1 as user_position
    from (
      select id, username
      from public.kitchen_users
      order by username, id
      limit settings_row.rotation_user_count
    ) ordered_users
  ),
  participant_total as (
    select count(*) as count_value
    from participants
  ),
  ordered_duties as (
    select
      id,
      row_number() over (order by name, id) - 1 as duty_position
    from public.duties
  ),
  working_days as (
    select
      (target_start + day_offset)::date as assigned_date,
      day_offset
    from generate_series(0, 4) as day_offset
  )
  insert into public.duty_assignments (
    duty_id,
    user_id,
    assigned_date,
    start_time,
    end_time,
    alarm_enabled,
    status
  )
  select
    ordered_duties.id,
    participants.id,
    working_days.assigned_date,
    settings_row.default_start_time,
    settings_row.default_end_time,
    settings_row.default_alarm_enabled,
    settings_row.default_status
  from working_days
  cross join ordered_duties
  cross join participant_total
  join participants
    on participants.user_position = mod(working_days.day_offset + ordered_duties.duty_position, participant_total.count_value);

  select count(*)
  into assignment_count
  from public.duty_assignments
  where assigned_date between target_start and target_start + 4;

  insert into public.user_notifications (
    user_id,
    notification_type,
    title,
    body,
    week_start,
    read_at
  )
  select distinct
    duty_assignments.user_id,
    'weekly_schedule_updated',
    'Kitchen duties updated',
    format(
      'Your duties for the week of %s were updated on Sunday at 8:00 PM Asia/Singapore.',
      to_char(target_start, 'Mon DD, YYYY')
    ),
    target_start,
    null
  from public.duty_assignments
  where duty_assignments.assigned_date between target_start and target_start + 4
  on conflict (user_id, notification_type, week_start)
  do update
  set
    title = excluded.title,
    body = excluded.body,
    read_at = null,
    created_at = now();

  select count(distinct user_id)
  into notified_count
  from public.duty_assignments
  where assigned_date between target_start and target_start + 4;

  return jsonb_build_object(
    'status', 'ok',
    'week_start', target_start,
    'assignments_created', assignment_count,
    'users_notified', notified_count
  );
end;
$$;

grant execute on function public.auto_build_weekly_schedule(date) to authenticated;

do $$
begin
  perform cron.schedule(
    'sunday-evening-weekly-reshuffle',
    '0 12 * * 0',
    $cron$select public.auto_build_weekly_schedule();$cron$
  );
exception
  when undefined_table or undefined_function then
    null;
end;
$$;

do $$
begin
  execute 'alter publication supabase_realtime add table public.user_notifications';
exception
  when duplicate_object then
    null;
end;
$$;
