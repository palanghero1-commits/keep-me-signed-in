create extension if not exists pg_net;

create table if not exists public.push_delivery_settings (
  id integer primary key default 1 check (id = 1),
  project_url text,
  publishable_key text,
  web_push_trigger_token text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

insert into public.push_delivery_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.push_delivery_settings enable row level security;

drop policy if exists "Admins can view push delivery settings" on public.push_delivery_settings;
drop policy if exists "Admins can insert push delivery settings" on public.push_delivery_settings;
drop policy if exists "Admins can update push delivery settings" on public.push_delivery_settings;

create policy "Admins can view push delivery settings" on public.push_delivery_settings
for select
using (public.is_admin(auth.uid()));

create policy "Admins can insert push delivery settings" on public.push_delivery_settings
for insert
with check (public.is_admin(auth.uid()));

create policy "Admins can update push delivery settings" on public.push_delivery_settings
for update
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create table if not exists public.push_subscriptions (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references public.kitchen_users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  disabled_at timestamp with time zone,
  last_error text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists push_subscriptions_user_id_idx
on public.push_subscriptions (user_id)
where disabled_at is null;

alter table public.push_subscriptions enable row level security;

drop policy if exists "Anyone can view push subscriptions" on public.push_subscriptions;
drop policy if exists "Anyone can insert push subscriptions" on public.push_subscriptions;
drop policy if exists "Anyone can update push subscriptions" on public.push_subscriptions;
drop policy if exists "Anyone can delete push subscriptions" on public.push_subscriptions;

create policy "Anyone can view push subscriptions" on public.push_subscriptions
for select
using (true);

create policy "Anyone can insert push subscriptions" on public.push_subscriptions
for insert
with check (true);

create policy "Anyone can update push subscriptions" on public.push_subscriptions
for update
using (true)
with check (true);

create policy "Anyone can delete push subscriptions" on public.push_subscriptions
for delete
using (true);

alter table public.user_notifications
add column if not exists push_sent_at timestamp with time zone;

alter table public.user_notifications
add column if not exists push_error text;

create or replace function public.touch_push_subscriptions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.touch_push_delivery_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_push_subscriptions_updated_at on public.push_subscriptions;
drop trigger if exists touch_push_delivery_settings_updated_at on public.push_delivery_settings;

create trigger touch_push_subscriptions_updated_at
before update on public.push_subscriptions
for each row
execute function public.touch_push_subscriptions_updated_at();

create trigger touch_push_delivery_settings_updated_at
before update on public.push_delivery_settings
for each row
execute function public.touch_push_delivery_settings_updated_at();

create or replace function public.enqueue_push_notification()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  project_url text;
  anon_key text;
  trigger_token text;
begin
  if new.notification_type <> 'weekly_schedule_updated' then
    return new;
  end if;

  select
    settings.project_url,
    settings.publishable_key,
    settings.web_push_trigger_token
  into
    project_url,
    anon_key,
    trigger_token
  from public.push_delivery_settings as settings
  where settings.id = 1;

  if project_url is null or anon_key is null or trigger_token is null then
    return new;
  end if;

  perform net.http_post(
    url := project_url || '/functions/v1/send-web-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || anon_key,
      'x-web-push-trigger', trigger_token
    ),
    body := jsonb_build_object('notification_id', new.id),
    timeout_milliseconds := 10000
  );

  return new;
exception
  when others then
    return new;
end;
$$;

drop trigger if exists enqueue_push_notification_after_insert on public.user_notifications;

create trigger enqueue_push_notification_after_insert
after insert on public.user_notifications
for each row
execute function public.enqueue_push_notification();
