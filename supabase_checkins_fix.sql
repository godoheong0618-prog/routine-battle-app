create table if not exists public.checkins (
  user_id uuid not null,
  routine_id uuid not null,
  check_in_date date not null default current_date,
  created_at timestamptz not null default now()
);

do $$
begin
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
end
$$;

alter table public.checkins add column if not exists user_id uuid;
alter table public.checkins add column if not exists routine_id uuid;
alter table public.checkins add column if not exists check_in_date date;
alter table public.checkins add column if not exists created_at timestamptz not null default now();

update public.checkins
set check_in_date = current_date
where check_in_date is null;

alter table public.checkins alter column check_in_date set default current_date;
alter table public.checkins alter column check_in_date set not null;

with ranked_checkins as (
  select
    ctid,
    row_number() over (
      partition by user_id, routine_id, check_in_date
      order by created_at asc, ctid asc
    ) as rn
  from public.checkins
)
delete from public.checkins c
using ranked_checkins rc
where c.ctid = rc.ctid
  and rc.rn > 1;

do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'checkins'
      and indexdef like '%(user_id, routine_id, check_in_date)%'
  ) then
    create unique index checkins_user_routine_check_in_date_key
      on public.checkins (user_id, routine_id, check_in_date);
  end if;
end
$$;

create index if not exists checkins_user_id_check_in_date_idx
  on public.checkins (user_id, check_in_date desc);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'checkins_user_id_fkey'
  ) then
    alter table public.checkins
      add constraint checkins_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'checkins_routine_id_fkey'
  ) then
    alter table public.checkins
      add constraint checkins_routine_id_fkey
      foreign key (routine_id) references public.routines(id) on delete cascade;
  end if;
end
$$;

alter table public.checkins enable row level security;

drop policy if exists checkins_select_owner_or_friend on public.checkins;
create policy checkins_select_owner_or_friend
on public.checkins
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

drop policy if exists checkins_insert_own on public.checkins;
create policy checkins_insert_own
on public.checkins
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

drop policy if exists checkins_update_own on public.checkins;
create policy checkins_update_own
on public.checkins
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists checkins_delete_own on public.checkins;
create policy checkins_delete_own
on public.checkins
for delete
to authenticated
using (user_id = auth.uid());
