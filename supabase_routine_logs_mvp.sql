create extension if not exists pgcrypto;

alter table public.routines add column if not exists repeat_days text[] not null default '{}';
alter table public.routines add column if not exists reminder_time text;
alter table public.routines add column if not exists is_template boolean not null default false;

update public.routines
set repeat_days = case
  when schedule_type = 'specific_days' and days_of_week is not null and cardinality(days_of_week) > 0 then days_of_week
  when frequency = 'weekly' and days_of_week is not null and cardinality(days_of_week) > 0 then days_of_week
  else array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']::text[]
end
where repeat_days is null
   or cardinality(repeat_days) = 0;

create table if not exists public.routine_logs (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.routines(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null default current_date,
  status text not null default 'pending',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.routine_logs add column if not exists id uuid default gen_random_uuid();
alter table public.routine_logs add column if not exists routine_id uuid;
alter table public.routine_logs add column if not exists user_id uuid;
alter table public.routine_logs add column if not exists log_date date not null default current_date;
alter table public.routine_logs add column if not exists status text not null default 'pending';
alter table public.routine_logs add column if not exists note text;
alter table public.routine_logs add column if not exists created_at timestamptz not null default now();
alter table public.routine_logs add column if not exists updated_at timestamptz not null default now();

update public.routine_logs
set
  id = coalesce(id, gen_random_uuid()),
  status = case when status in ('pending', 'done', 'partial', 'rest') then status else 'pending' end,
  log_date = coalesce(log_date, current_date)
where id is null
   or status is null
   or status not in ('pending', 'done', 'partial', 'rest')
   or log_date is null;

do $$
begin
  if to_regclass('public.checkins') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'checkins'
        and column_name = 'check_date'
    ) and not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'checkins'
        and column_name = 'check_in_date'
    ) then
      alter table public.checkins rename column check_date to check_in_date;
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'checkins'
        and column_name = 'check_in_date'
    ) then
      execute $sql$
        insert into public.routine_logs (routine_id, user_id, log_date, status, note, created_at)
        select distinct on (routine_id, user_id, check_in_date)
          routine_id,
          user_id,
          check_in_date,
          'done',
          null,
          coalesce(created_at, now())
        from public.checkins c
        where routine_id is not null
          and user_id is not null
          and check_in_date is not null
          and not exists (
            select 1
            from public.routine_logs rl
            where rl.routine_id = c.routine_id
              and rl.user_id = c.user_id
              and rl.log_date = c.check_in_date
          )
        order by routine_id, user_id, check_in_date, created_at asc
      $sql$;
    end if;
  end if;
end
$$;

with ranked_logs as (
  select
    ctid,
    row_number() over (
      partition by user_id, routine_id, log_date
      order by updated_at desc, created_at desc, ctid desc
    ) as rn
  from public.routine_logs
)
delete from public.routine_logs rl
using ranked_logs ranked
where rl.ctid = ranked.ctid
  and ranked.rn > 1;

create unique index if not exists routine_logs_user_routine_log_date_key
  on public.routine_logs (user_id, routine_id, log_date);

create index if not exists routine_logs_user_log_date_idx
  on public.routine_logs (user_id, log_date desc);

create index if not exists routine_logs_routine_id_idx
  on public.routine_logs (routine_id);

create index if not exists routines_user_template_idx
  on public.routines (user_id, is_template);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'routine_logs_status_check'
  ) then
    alter table public.routine_logs
      add constraint routine_logs_status_check
      check (status in ('pending', 'done', 'partial', 'rest'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'routine_logs_user_id_fkey'
  ) then
    alter table public.routine_logs
      add constraint routine_logs_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'routine_logs_routine_id_fkey'
  ) then
    alter table public.routine_logs
      add constraint routine_logs_routine_id_fkey
      foreign key (routine_id) references public.routines(id) on delete cascade;
  end if;
end
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_routine_logs_updated_at on public.routine_logs;
create trigger set_routine_logs_updated_at
before update on public.routine_logs
for each row execute function public.touch_updated_at();

alter table public.routine_logs enable row level security;

drop policy if exists routine_logs_select_owner_or_friend on public.routine_logs;
create policy routine_logs_select_owner_or_friend
on public.routine_logs
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.friendships f
    where (f.user_id = auth.uid() and f.friend_id = user_id)
       or (f.friend_id = auth.uid() and f.user_id = user_id)
  )
);

drop policy if exists routine_logs_insert_own on public.routine_logs;
create policy routine_logs_insert_own
on public.routine_logs
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.routines r
    where r.id = routine_id
      and r.user_id = auth.uid()
  )
);

drop policy if exists routine_logs_update_own on public.routine_logs;
create policy routine_logs_update_own
on public.routine_logs
for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.routines r
    where r.id = routine_id
      and r.user_id = auth.uid()
  )
);

drop policy if exists routine_logs_delete_own on public.routine_logs;
create policy routine_logs_delete_own
on public.routine_logs
for delete
to authenticated
using (user_id = auth.uid());
