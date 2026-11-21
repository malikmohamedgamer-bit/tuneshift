-- Local development seed (`supabase db reset`). Creates two confirmed test users who are friends,
-- a shared sound and an open party. Passwords are for the LOCAL stack only.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'alex@tuneshift.test', crypt('local-dev-only', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'sam@tuneshift.test', crypt('local-dev-only', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, username, display_name) values
  ('11111111-1111-1111-1111-111111111111', 'alex', 'Alex'),
  ('22222222-2222-2222-2222-222222222222', 'sam', 'Sam')
on conflict (id) do nothing;

insert into public.friendships (requester, addressee, status) values
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'accepted')
on conflict do nothing;

insert into public.shares (code, owner, kind, payload) values
  ('demo2345', '11111111-1111-1111-1111-111111111111', 'sound',
   '{"name":"Seed Nightcore","settings":{"version":1,"speed":1.4,"pitchMode":"tape"}}')
on conflict (code) do nothing;

insert into public.party_rooms (code, host, controller, name) values
  ('party234', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Seed party')
on conflict (code) do nothing;
insert into public.party_members (room_code, user_id) values
  ('party234', '11111111-1111-1111-1111-111111111111')
on conflict do nothing;
