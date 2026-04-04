alter table public.friendships add column if not exists battle_title text;
alter table public.friendships add column if not exists wager_text text;
alter table public.friendships add column if not exists battle_status text;
alter table public.friendships add column if not exists battle_started_at timestamptz;

update public.friendships
set battle_status = 'active'
where battle_status is null
   or btrim(battle_status) = ''
   or battle_status not in ('active', 'paused', 'archived');

alter table public.friendships alter column battle_status set default 'active';
alter table public.friendships alter column battle_status set not null;

create index if not exists friendships_battle_status_idx
  on public.friendships (battle_status);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'friendships_battle_status_check'
  ) then
    alter table public.friendships
      add constraint friendships_battle_status_check
      check (battle_status in ('active', 'paused', 'archived'));
  end if;
end
$$;

create or replace function public.prevent_friendship_participant_change()
returns trigger
language plpgsql
as $$
begin
  if old.user_id <> new.user_id or old.friend_id <> new.friend_id then
    raise exception 'Friendship participants cannot be changed.' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists friendships_participants_immutable on public.friendships;
create trigger friendships_participants_immutable
before update on public.friendships
for each row execute function public.prevent_friendship_participant_change();

drop policy if exists friendships_update_participants on public.friendships;
create policy friendships_update_participants
on public.friendships
for update
to authenticated
using (auth.uid() = user_id or auth.uid() = friend_id)
with check (auth.uid() = user_id or auth.uid() = friend_id);
