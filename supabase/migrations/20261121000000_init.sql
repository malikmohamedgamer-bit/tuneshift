-- Tuneshift schema (spec §8). Every table has Row Level Security; users read/write only their own
-- rows, friends can read each other's profiles, share links are readable through an RPC that
-- returns only the requested item.

create extension if not exists citext;

-- ---------------------------------------------------------------- helpers
create or replace function public.touch_synced_at() returns trigger
language plpgsql as $$
begin
  new.synced_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username citext not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null default '' check (char_length(display_name) <= 60),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 500),
  share_activity boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_username_prefix on public.profiles (lower(username::text) text_pattern_ops);

-- ---------------------------------------------------------------- friendships
create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references public.profiles (id) on delete cascade,
  addressee uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester <> addressee),
  unique (requester, addressee)
);
create index friendships_addressee on public.friendships (addressee, status);
create index friendships_requester on public.friendships (requester, status);

create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester = a and f.addressee = b) or (f.requester = b and f.addressee = a))
  );
$$;
revoke all on function public.are_friends(uuid, uuid) from public;
grant execute on function public.are_friends(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------- synced library tables
-- `updated_at` is the client's last-write-wins stamp (ms); `synced_at` is server time used as the
-- incremental pull cursor (immune to device clock skew).

create table public.playlists (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  name text not null,
  description text,
  folder_id text,
  sort_order integer not null default 0,
  data jsonb not null default '{}'::jsonb,
  updated_at bigint not null,
  deleted boolean not null default false,
  synced_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.playlist_tracks (
  user_id uuid not null references auth.users (id) on delete cascade,
  playlist_id text not null,
  position integer not null,
  track_key text not null,
  source text not null check (source in ('local', 'audius', 'jamendo')),
  -- Local files can't be shared or played elsewhere: they sync as metadata only.
  local_only boolean not null default false,
  meta jsonb not null default '{}'::jsonb,
  primary key (user_id, playlist_id, position),
  foreign key (user_id, playlist_id) references public.playlists (user_id, id) on delete cascade
);

create table public.sounds (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  name text not null check (char_length(name) <= 60),
  settings jsonb not null,
  favourite boolean not null default false,
  sort_order integer not null default 0,
  updated_at bigint not null,
  deleted boolean not null default false,
  synced_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.themes (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at bigint not null,
  deleted boolean not null default false,
  synced_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.likes (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null, -- track key
  liked_at bigint not null,
  track jsonb not null default '{}'::jsonb,
  updated_at bigint not null,
  deleted boolean not null default false,
  synced_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.history (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  track_key text not null,
  source text not null,
  title text not null,
  artist text not null,
  genre text,
  played_at bigint not null,
  ms_listened integer not null,
  preset_name text,
  updated_at bigint not null,
  deleted boolean not null default false,
  synced_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Generic per-user records for the remaining synced stores (folders, smart playlists, sound
-- assignments, lyrics offsets, settings).
create table public.user_records (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('playlistFolders', 'smartPlaylists', 'assignments', 'lyricsOffsets', 'settings')),
  id text not null,
  data jsonb not null,
  updated_at bigint not null,
  deleted boolean not null default false,
  synced_at timestamptz not null default now(),
  primary key (user_id, kind, id)
);

do $$
declare t text;
begin
  foreach t in array array['playlists', 'sounds', 'themes', 'likes', 'history', 'user_records'] loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.touch_synced_at()', t || '_synced', t);
    execute format('create index %I on public.%I (user_id, synced_at)', t || '_sync_cursor', t);
  end loop;
end $$;
create index history_recent on public.history (user_id, played_at desc);

-- ---------------------------------------------------------------- shares
create table public.shares (
  code text primary key check (code ~ '^[23456789abcdefghjkmnpqrstuvwxyz]{6,12}$'),
  owner uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('sound', 'playlist', 'theme')),
  payload jsonb not null check (pg_column_size(payload) < 512000),
  created_at timestamptz not null default now()
);
create index shares_owner on public.shares (owner, created_at desc);

-- Anyone with the code (even signed out) can read exactly that one item.
create or replace function public.get_share(share_code text) returns table (kind text, payload jsonb)
language sql stable security definer set search_path = public as $$
  select s.kind, s.payload from public.shares s where s.code = lower(share_code) limit 1;
$$;
revoke all on function public.get_share(text) from public;
grant execute on function public.get_share(text) to anon, authenticated;

-- ---------------------------------------------------------------- listening parties
create table public.party_rooms (
  code text primary key check (code ~ '^[23456789abcdefghjkmnpqrstuvwxyz]{6,12}$'),
  host uuid not null references auth.users (id) on delete cascade,
  controller uuid not null references auth.users (id) on delete cascade,
  name text not null default 'Listening party' check (char_length(name) <= 60),
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create table public.party_members (
  room_code text not null references public.party_rooms (code) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_code, user_id)
);
create index party_members_user on public.party_members (user_id);

create or replace function public.is_party_member(room text, uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.party_members m where m.room_code = room and m.user_id = uid);
$$;
revoke all on function public.is_party_member(text, uuid) from public;
grant execute on function public.is_party_member(text, uuid) to authenticated;

-- Join by code: adds the caller as a member and returns the room.
create or replace function public.join_party(room text) returns setof public.party_rooms
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sign in required'; end if;
  if not exists (select 1 from public.party_rooms r where r.code = lower(room) and r.ended_at is null) then
    raise exception 'party not found';
  end if;
  insert into public.party_members (room_code, user_id) values (lower(room), auth.uid()) on conflict do nothing;
  return query select * from public.party_rooms r where r.code = lower(room);
end $$;
revoke all on function public.join_party(text) from public;
grant execute on function public.join_party(text) to authenticated;

-- ---------------------------------------------------------------- RLS
alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.playlists enable row level security;
alter table public.playlist_tracks enable row level security;
alter table public.sounds enable row level security;
alter table public.themes enable row level security;
alter table public.likes enable row level security;
alter table public.history enable row level security;
alter table public.user_records enable row level security;
alter table public.shares enable row level security;
alter table public.party_rooms enable row level security;
alter table public.party_members enable row level security;

-- Profiles: everyone signed in can look up usernames (needed for friend search); only you edit yours.
create policy "profiles: signed-in users can read" on public.profiles for select to authenticated using (true);
create policy "profiles: insert own" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles: update own" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "profiles: delete own" on public.profiles for delete to authenticated using ((select auth.uid()) = id);

-- Friendships: both sides can see; requester creates; addressee answers; either side removes.
create policy "friendships: participants read" on public.friendships for select to authenticated
  using ((select auth.uid()) in (requester, addressee));
create policy "friendships: request as yourself" on public.friendships for insert to authenticated
  with check ((select auth.uid()) = requester and status = 'pending');
create policy "friendships: addressee answers" on public.friendships for update to authenticated
  using ((select auth.uid()) = addressee) with check ((select auth.uid()) = addressee);
create policy "friendships: either side removes" on public.friendships for delete to authenticated
  using ((select auth.uid()) in (requester, addressee));

-- Own-rows-only for every synced table.
do $$
declare t text;
begin
  foreach t in array array['playlists', 'playlist_tracks', 'sounds', 'themes', 'likes', 'history', 'user_records'] loop
    execute format('create policy %I on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t || ': own rows', t);
  end loop;
end $$;

-- Shares: owners manage their own; reading by code goes through get_share().
create policy "shares: owner reads" on public.shares for select to authenticated using ((select auth.uid()) = owner);
create policy "shares: owner creates" on public.shares for insert to authenticated with check ((select auth.uid()) = owner);
create policy "shares: owner deletes" on public.shares for delete to authenticated using ((select auth.uid()) = owner);

-- Parties: members read their rooms; host creates; host/controller update.
create policy "party_rooms: members read" on public.party_rooms for select to authenticated
  using ((select auth.uid()) = host or public.is_party_member(code, (select auth.uid())));
create policy "party_rooms: host creates" on public.party_rooms for insert to authenticated
  with check ((select auth.uid()) = host and (select auth.uid()) = controller);
create policy "party_rooms: host or controller updates" on public.party_rooms for update to authenticated
  using ((select auth.uid()) in (host, controller));
create policy "party_members: members read" on public.party_members for select to authenticated
  using (public.is_party_member(room_code, (select auth.uid())));
create policy "party_members: leave" on public.party_members for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------- Realtime authorization
-- Private channels: `activity:<user id>` (friends' now-playing) and `party:<code>`.
create policy "realtime: own activity channel" on realtime.messages for insert to authenticated
  with check ((select realtime.topic()) = 'activity:' || (select auth.uid())::text);
create policy "realtime: friends read activity" on realtime.messages for select to authenticated
  using (
    (select realtime.topic()) like 'activity:%'
    and (
      (select realtime.topic()) = 'activity:' || (select auth.uid())::text
      or public.are_friends((select auth.uid()), nullif(split_part((select realtime.topic()), ':', 2), '')::uuid)
    )
  );
create policy "realtime: party members" on realtime.messages for all to authenticated
  using ((select realtime.topic()) like 'party:%' and public.is_party_member(split_part((select realtime.topic()), ':', 2), (select auth.uid())))
  with check ((select realtime.topic()) like 'party:%' and public.is_party_member(split_part((select realtime.topic()), ':', 2), (select auth.uid())));

-- ---------------------------------------------------------------- avatars bucket (≤ 2 MB)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "avatars: public read" on storage.objects for select using (bucket_id = 'avatars');
create policy "avatars: upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars: update own folder" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars: delete own folder" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
