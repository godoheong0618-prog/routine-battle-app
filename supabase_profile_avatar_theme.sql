alter table public.profiles add column if not exists avatar_emoji text not null default '😀';
alter table public.profiles add column if not exists theme_color text not null default 'yellow';

update public.profiles
set
  avatar_emoji = coalesce(nullif(btrim(avatar_emoji), ''), '😀'),
  theme_color = case
    when theme_color in ('yellow', 'navy', 'mint', 'pink', 'purple', 'gray') then theme_color
    else 'yellow'
  end
where avatar_emoji is null
   or btrim(avatar_emoji) = ''
   or theme_color is null
   or theme_color not in ('yellow', 'navy', 'mint', 'pink', 'purple', 'gray');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_theme_color_check'
  ) then
    alter table public.profiles
      add constraint profiles_theme_color_check
      check (theme_color in ('yellow', 'navy', 'mint', 'pink', 'purple', 'gray'));
  end if;
end
$$;
