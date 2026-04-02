create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key,
  nickname text,
  friend_code text,
  friend_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists nickname text;
alter table public.profiles add column if not exists friend_code text;
alter table public.profiles add column if not exists friend_id uuid;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  friend_id uuid not null,
  created_at timestamptz not null default now()
);

alter table public.friendships add column if not exists id uuid default gen_random_uuid();
alter table public.friendships add column if not exists user_id uuid;
alter table public.friendships add column if not exists friend_id uuid;
alter table public.friendships add column if not exists created_at timestamptz not null default now();

create table if not exists public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  description text,
  frequency text,
  target_count integer not null default 1,
  schedule_type text not null default 'daily',
  days_of_week text[] not null default '{}',
  reminder_time text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.routines add column if not exists id uuid default gen_random_uuid();
alter table public.routines add column if not exists user_id uuid;
alter table public.routines add column if not exists title text;
alter table public.routines add column if not exists description text;
alter table public.routines add column if not exists frequency text;
alter table public.routines add column if not exists target_count integer not null default 1;
alter table public.routines add column if not exists schedule_type text not null default 'daily';
alter table public.routines add column if not exists days_of_week text[] not null default '{}';
alter table public.routines add column if not exists reminder_time text;
alter table public.routines add column if not exists created_at timestamptz not null default now();
alter table public.routines add column if not exists updated_at timestamptz not null default now();

create table if not exists public.checkins (
  user_id uuid not null,
  routine_id uuid not null,
  check_date date not null default current_date,
  created_at timestamptz not null default now()
);

alter table public.checkins add column if not exists user_id uuid;
alter table public.checkins add column if not exists routine_id uuid;
alter table public.checkins add column if not exists check_date date not null default current_date;
alter table public.checkins add column if not exists created_at timestamptz not null default now();

create table if not exists public.shared_goals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  friend_id uuid not null,
  title text not null,
  description text,
  points integer not null default 3,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shared_goals add column if not exists id uuid default gen_random_uuid();
alter table public.shared_goals add column if not exists owner_id uuid;
alter table public.shared_goals add column if not exists friend_id uuid;
alter table public.shared_goals add column if not exists title text;
alter table public.shared_goals add column if not exists description text;
alter table public.shared_goals add column if not exists points integer not null default 3;
alter table public.shared_goals add column if not exists created_at timestamptz not null default now();
alter table public.shared_goals add column if not exists updated_at timestamptz not null default now();

create table if not exists public.shared_goal_checkins (
  goal_id uuid not null,
  user_id uuid not null,
  check_date date not null default current_date,
  created_at timestamptz not null default now()
);

alter table public.shared_goal_checkins add column if not exists goal_id uuid;
alter table public.shared_goal_checkins add column if not exists user_id uuid;
alter table public.shared_goal_checkins add column if not exists check_date date not null default current_date;
alter table public.shared_goal_checkins add column if not exists created_at timestamptz not null default now();

create table if not exists public.nudges (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null,
  receiver_id uuid not null,
  message text not null,
  created_at timestamptz not null default now()
);

alter table public.nudges add column if not exists id uuid default gen_random_uuid();
alter table public.nudges add column if not exists sender_id uuid;
alter table public.nudges add column if not exists receiver_id uuid;
alter table public.nudges add column if not exists message text;
alter table public.nudges add column if not exists created_at timestamptz not null default now();

update public.friendships
set id = gen_random_uuid()
where id is null;

update public.routines
set id = gen_random_uuid()
where id is null;

update public.shared_goals
set id = gen_random_uuid()
where id is null;

update public.nudges
set id = gen_random_uuid()
where id is null;

update public.routines
set
  title = coalesce(nullif(btrim(title), ''), '이름 없는 루틴'),
  target_count = case when target_count is null or target_count < 1 then 1 else target_count end,
  schedule_type = case
    when schedule_type in ('daily', 'specific_days') then schedule_type
    else 'daily'
  end,
  frequency = case
    when frequency in ('daily', 'weekly') then frequency
    when schedule_type = 'specific_days' then 'weekly'
    else 'daily'
  end,
  days_of_week = coalesce(days_of_week, '{}'::text[])
where title is null
   or btrim(title) = ''
   or target_count is null
   or target_count < 1
   or schedule_type is null
   or schedule_type not in ('daily', 'specific_days')
   or frequency is null
   or frequency not in ('daily', 'weekly')
   or days_of_week is null;

update public.shared_goals
set
  title = coalesce(nullif(btrim(title), ''), '공동 목표'),
  points = case when points is null or points < 1 then 3 else points end
where title is null
   or btrim(title) = ''
   or points is null
   or points < 1;

update public.nudges
set message = coalesce(nullif(btrim(message), ''), '오늘 루틴 아직 안 했지?')
where message is null
   or btrim(message) = '';

insert into public.profiles (id, friend_code)
select
  u.id,
  upper(left(replace(u.id::text, '-', ''), 8))
from auth.users u
where not exists (
  select 1
  from public.profiles p
  where p.id = u.id
);

update public.profiles
set friend_code = upper(left(replace(id::text, '-', ''), 8))
where friend_code is null
   or btrim(friend_code) = '';

with duplicate_codes as (
  select
    id,
    row_number() over (partition by friend_code order by created_at asc, id asc) as rn
  from public.profiles
  where friend_code is not null
)
update public.profiles p
set friend_code = upper(left(replace(p.id::text, '-', ''), 8))
from duplicate_codes d
where p.id = d.id
  and d.rn > 1;

delete from public.shared_goal_checkins sgc
where not exists (select 1 from public.shared_goals sg where sg.id = sgc.goal_id)
   or not exists (select 1 from auth.users u where u.id = sgc.user_id);

delete from public.checkins c
where not exists (select 1 from public.routines r where r.id = c.routine_id)
   or not exists (select 1 from auth.users u where u.id = c.user_id);

delete from public.nudges n
where not exists (select 1 from auth.users u where u.id = n.sender_id)
   or not exists (select 1 from auth.users u where u.id = n.receiver_id)
   or n.sender_id = n.receiver_id;

delete from public.shared_goals sg
where not exists (select 1 from auth.users u where u.id = sg.owner_id)
   or not exists (select 1 from auth.users u where u.id = sg.friend_id)
   or sg.owner_id = sg.friend_id;

delete from public.friendships f
where not exists (select 1 from auth.users u where u.id = f.user_id)
   or not exists (select 1 from auth.users u where u.id = f.friend_id)
   or f.user_id = f.friend_id;

delete from public.routines r
where not exists (select 1 from auth.users u where u.id = r.user_id);

delete from public.profiles p
where not exists (select 1 from auth.users u where u.id = p.id);

with ranked_profiles as (
  select
    ctid,
    row_number() over (
      partition by id
      order by created_at asc, ctid asc
    ) as rn
  from public.profiles
)
delete from public.profiles p
using ranked_profiles rp
where p.ctid = rp.ctid
  and rp.rn > 1;

with ranked_checkins as (
  select
    ctid,
    row_number() over (
      partition by user_id, routine_id, check_date
      order by created_at asc, ctid asc
    ) as rn
  from public.checkins
)
delete from public.checkins c
using ranked_checkins rc
where c.ctid = rc.ctid
  and rc.rn > 1;

with ranked_shared_checkins as (
  select
    ctid,
    row_number() over (
      partition by goal_id, user_id, check_date
      order by created_at asc, ctid asc
    ) as rn
  from public.shared_goal_checkins
)
delete from public.shared_goal_checkins sgc
using ranked_shared_checkins rsgc
where sgc.ctid = rsgc.ctid
  and rsgc.rn > 1;

with ranked_pairs as (
  select
    ctid,
    row_number() over (
      partition by least(user_id, friend_id), greatest(user_id, friend_id)
      order by created_at asc, ctid asc
    ) as rn
  from public.friendships
)
delete from public.friendships f
using ranked_pairs rp
where f.ctid = rp.ctid
  and rp.rn > 1;

with participant_rows as (
  select ctid, user_id as participant_id, created_at from public.friendships
  union all
  select ctid, friend_id as participant_id, created_at from public.friendships
),
ranked_participants as (
  select
    ctid,
    row_number() over (
      partition by participant_id
      order by created_at asc, ctid asc
    ) as rn
  from participant_rows
),
to_delete as (
  select distinct ctid
  from ranked_participants
  where rn > 1
)
delete from public.friendships f
using to_delete d
where f.ctid = d.ctid;

update public.profiles p
set friend_id = friends.friend_id
from (
  select profile_id, max(friend_id) as friend_id
  from (
    select user_id as profile_id, friend_id from public.friendships
    union all
    select friend_id as profile_id, user_id as friend_id from public.friendships
  ) pairs
  group by profile_id
) friends
where p.id = friends.profile_id;

update public.profiles p
set friend_id = null
where not exists (
  select 1
  from public.friendships f
  where f.user_id = p.id or f.friend_id = p.id
);

create unique index if not exists profiles_friend_code_key
  on public.profiles (friend_code)
  where friend_code is not null;

create unique index if not exists profiles_id_key
  on public.profiles (id);

create unique index if not exists checkins_user_routine_date_key
  on public.checkins (user_id, routine_id, check_date);

create unique index if not exists shared_goal_checkins_goal_user_date_key
  on public.shared_goal_checkins (goal_id, user_id, check_date);

create unique index if not exists friendships_pair_key
  on public.friendships (least(user_id, friend_id), greatest(user_id, friend_id));

create index if not exists routines_user_id_idx
  on public.routines (user_id);

create index if not exists checkins_user_id_check_date_idx
  on public.checkins (user_id, check_date desc);

create index if not exists shared_goals_owner_id_idx
  on public.shared_goals (owner_id);

create index if not exists shared_goals_friend_id_idx
  on public.shared_goals (friend_id);

create index if not exists nudges_sender_receiver_created_at_idx
  on public.nudges (sender_id, receiver_id, created_at desc);

create index if not exists nudges_receiver_sender_created_at_idx
  on public.nudges (receiver_id, sender_id, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_id_fkey
      foreign key (id) references auth.users(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_friend_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_friend_id_fkey
      foreign key (friend_id) references auth.users(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'routines_user_id_fkey'
  ) then
    alter table public.routines
      add constraint routines_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'checkins_user_id_fkey'
  ) then
    alter table public.checkins
      add constraint checkins_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'checkins_routine_id_fkey'
  ) then
    alter table public.checkins
      add constraint checkins_routine_id_fkey
      foreign key (routine_id) references public.routines(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'friendships_user_id_fkey'
  ) then
    alter table public.friendships
      add constraint friendships_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'friendships_friend_id_fkey'
  ) then
    alter table public.friendships
      add constraint friendships_friend_id_fkey
      foreign key (friend_id) references auth.users(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'shared_goals_owner_id_fkey'
  ) then
    alter table public.shared_goals
      add constraint shared_goals_owner_id_fkey
      foreign key (owner_id) references auth.users(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'shared_goals_friend_id_fkey'
  ) then
    alter table public.shared_goals
      add constraint shared_goals_friend_id_fkey
      foreign key (friend_id) references auth.users(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'shared_goal_checkins_goal_id_fkey'
  ) then
    alter table public.shared_goal_checkins
      add constraint shared_goal_checkins_goal_id_fkey
      foreign key (goal_id) references public.shared_goals(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'shared_goal_checkins_user_id_fkey'
  ) then
    alter table public.shared_goal_checkins
      add constraint shared_goal_checkins_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'nudges_sender_id_fkey'
  ) then
    alter table public.nudges
      add constraint nudges_sender_id_fkey
      foreign key (sender_id) references auth.users(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'nudges_receiver_id_fkey'
  ) then
    alter table public.nudges
      add constraint nudges_receiver_id_fkey
      foreign key (receiver_id) references auth.users(id) on delete cascade;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'routines_target_count_check'
  ) then
    alter table public.routines
      add constraint routines_target_count_check
      check (target_count >= 1);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'routines_schedule_type_check'
  ) then
    alter table public.routines
      add constraint routines_schedule_type_check
      check (schedule_type in ('daily', 'specific_days'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'routines_frequency_check'
  ) then
    alter table public.routines
      add constraint routines_frequency_check
      check (frequency is null or frequency in ('daily', 'weekly'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'shared_goals_points_check'
  ) then
    alter table public.shared_goals
      add constraint shared_goals_points_check
      check (points >= 1);
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

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists set_routines_updated_at on public.routines;
create trigger set_routines_updated_at
before update on public.routines
for each row execute function public.touch_updated_at();

drop trigger if exists set_shared_goals_updated_at on public.shared_goals;
create trigger set_shared_goals_updated_at
before update on public.shared_goals
for each row execute function public.touch_updated_at();

create or replace function public.enforce_single_friendship()
returns trigger
language plpgsql
as $$
begin
  if new.user_id = new.friend_id then
    raise exception 'You cannot connect yourself.' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.friendships f
    where f.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and (
        f.user_id in (new.user_id, new.friend_id)
        or f.friend_id in (new.user_id, new.friend_id)
      )
  ) then
    raise exception 'Each user can only have one friend connection.' using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists friendships_guard on public.friendships;
create trigger friendships_guard
before insert or update on public.friendships
for each row execute function public.enforce_single_friendship();

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, friend_code)
  values (
    new.id,
    upper(left(replace(new.id::text, '-', ''), 8))
  )
  on conflict (id) do update
  set friend_code = coalesce(public.profiles.friend_code, excluded.friend_code);

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'on_auth_user_created'
  ) then
    create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user_profile();
  end if;
end
$$;

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.routines enable row level security;
alter table public.checkins enable row level security;
alter table public.shared_goals enable row level security;
alter table public.shared_goal_checkins enable row level security;
alter table public.nudges enable row level security;

drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated
on public.profiles
for select
to authenticated
using (true);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists friendships_select_participants on public.friendships;
create policy friendships_select_participants
on public.friendships
for select
to authenticated
using (auth.uid() = user_id or auth.uid() = friend_id);

drop policy if exists friendships_insert_owner on public.friendships;
create policy friendships_insert_owner
on public.friendships
for insert
to authenticated
with check (
  auth.uid() = user_id
  and auth.uid() <> friend_id
);

drop policy if exists friendships_delete_participants on public.friendships;
create policy friendships_delete_participants
on public.friendships
for delete
to authenticated
using (auth.uid() = user_id or auth.uid() = friend_id);

drop policy if exists routines_select_owner_or_friend on public.routines;
create policy routines_select_owner_or_friend
on public.routines
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

drop policy if exists routines_insert_own on public.routines;
create policy routines_insert_own
on public.routines
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists routines_update_own on public.routines;
create policy routines_update_own
on public.routines
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists routines_delete_own on public.routines;
create policy routines_delete_own
on public.routines
for delete
to authenticated
using (user_id = auth.uid());

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

drop policy if exists checkins_delete_own on public.checkins;
create policy checkins_delete_own
on public.checkins
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists shared_goals_select_participants on public.shared_goals;
create policy shared_goals_select_participants
on public.shared_goals
for select
to authenticated
using (owner_id = auth.uid() or friend_id = auth.uid());

drop policy if exists shared_goals_insert_owner on public.shared_goals;
create policy shared_goals_insert_owner
on public.shared_goals
for insert
to authenticated
with check (
  owner_id = auth.uid()
  and friend_id <> auth.uid()
  and exists (
    select 1
    from public.friendships f
    where (f.user_id = auth.uid() and f.friend_id = friend_id)
       or (f.friend_id = auth.uid() and f.user_id = friend_id)
  )
);

drop policy if exists shared_goals_update_owner on public.shared_goals;
create policy shared_goals_update_owner
on public.shared_goals
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists shared_goals_delete_owner on public.shared_goals;
create policy shared_goals_delete_owner
on public.shared_goals
for delete
to authenticated
using (owner_id = auth.uid());

drop policy if exists shared_goal_checkins_select_participants on public.shared_goal_checkins;
create policy shared_goal_checkins_select_participants
on public.shared_goal_checkins
for select
to authenticated
using (
  exists (
    select 1
    from public.shared_goals sg
    where sg.id = goal_id
      and (sg.owner_id = auth.uid() or sg.friend_id = auth.uid())
  )
);

drop policy if exists shared_goal_checkins_insert_participant on public.shared_goal_checkins;
create policy shared_goal_checkins_insert_participant
on public.shared_goal_checkins
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.shared_goals sg
    where sg.id = goal_id
      and (sg.owner_id = auth.uid() or sg.friend_id = auth.uid())
  )
);

drop policy if exists shared_goal_checkins_delete_participant on public.shared_goal_checkins;
create policy shared_goal_checkins_delete_participant
on public.shared_goal_checkins
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists nudges_select_participants on public.nudges;
create policy nudges_select_participants
on public.nudges
for select
to authenticated
using (sender_id = auth.uid() or receiver_id = auth.uid());

drop policy if exists nudges_insert_sender on public.nudges;
create policy nudges_insert_sender
on public.nudges
for insert
to authenticated
with check (
  sender_id = auth.uid()
  and sender_id <> receiver_id
  and exists (
    select 1
    from public.friendships f
    where (f.user_id = auth.uid() and f.friend_id = receiver_id)
       or (f.friend_id = auth.uid() and f.user_id = receiver_id)
  )
);
