import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

/**
 * Runs the migration and seed in a real Postgres (PGlite) on top of small stand-ins for the
 * schemas Supabase provides (auth, storage, realtime, roles), then checks Row Level Security
 * as two different signed-in users. Parsing alone missed a runtime error once; this doesn't.
 */

const dir = join(import.meta.dirname, '..');
const migration = readFileSync(join(dir, 'migrations', '20261121000000_init.sql'), 'utf8');
const seed = readFileSync(join(dir, 'seed.sql'), 'utf8');

const SUPABASE_STANDINS = `
create extension pgcrypto;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (
  instance_id uuid, id uuid primary key, aud text, role text, email text,
  encrypted_password text, email_confirmed_at timestamptz, raw_app_meta_data jsonb,
  raw_user_meta_data jsonb, created_at timestamptz, updated_at timestamptz
);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema storage;
create table storage.buckets (
  id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as
  $$ select string_to_array(name, '/') $$;
create schema realtime;
create table realtime.messages (id bigserial primary key, topic text, extension text, payload jsonb);
alter table realtime.messages enable row level security;
create function realtime.topic() returns text language sql stable as
  $$ select current_setting('realtime.topic', true) $$;
grant usage on schema public, auth, storage, realtime to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
`;

const ALEX = '11111111-1111-1111-1111-111111111111';
const SAM = '22222222-2222-2222-2222-222222222222';

async function asUser(db: PGlite, uid: string | null, sql: string) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? 'authenticated' : 'anon'}`);
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? '']);
    return tx.query<Record<string, unknown>>(sql);
  });
}

describe('supabase migration executes', () => {
  it('applies migration + seed and enforces RLS', async () => {
    const db = await PGlite.create({ extensions: { citext, pgcrypto } });
    await db.exec(SUPABASE_STANDINS);
    await db.exec(migration);
    await db.exec(seed);

    // Every public table has RLS on, and the own-rows policies were created with real names.
    const noRls = await db.query(
      `select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(noRls.rows).toEqual([]);
    const own = await db.query<{ policyname: string }>(
      `select policyname from pg_policies where policyname like '%: own rows' order by 1`,
    );
    expect(own.rows.map((r) => r.policyname)).toContain('playlists: own rows');

    // Own rows only.
    await asUser(
      db,
      ALEX,
      `insert into public.playlists (user_id, id, name, updated_at) values ('${ALEX}', 'p1', 'Mine', 1)`,
    );
    expect((await asUser(db, ALEX, 'select id from public.playlists')).rows).toHaveLength(1);
    expect((await asUser(db, SAM, 'select id from public.playlists')).rows).toHaveLength(0);
    await expect(
      asUser(
        db,
        SAM,
        `insert into public.playlists (user_id, id, name, updated_at) values ('${ALEX}', 'p2', 'Sneaky', 1)`,
      ),
    ).rejects.toThrow(/row-level security/);

    // Profiles readable when signed in, not when signed out.
    expect((await asUser(db, SAM, 'select username from public.profiles')).rows.length).toBe(2);
    expect((await asUser(db, null, 'select username from public.profiles')).rows).toHaveLength(0);

    // Share codes: anyone with the code (even signed out) gets exactly that item.
    const share = await asUser(db, null, `select kind from public.get_share('SEED2345')`);
    expect(share.rows).toEqual([{ kind: 'sound' }]);
    await db.close();
  });
});
