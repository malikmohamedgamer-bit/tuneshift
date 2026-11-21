import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse, parsePlPgSQL } from 'libpg-query';

/** Syntax-checks every migration with the real Postgres parser (libpg_query, WASM). */
const dir = join(import.meta.dirname, '..');
const files = [
  ...readdirSync(join(dir, 'migrations')).map((f) => join(dir, 'migrations', f)),
  join(dir, 'seed.sql'),
];

describe('supabase SQL', () => {
  for (const f of files) {
    it(`parses ${basename(f)}`, async () => {
      const sql = readFileSync(f, 'utf8');
      const tree = (await parse(sql)) as { stmts: unknown[] };
      expect(tree.stmts.length).toBeGreaterThan(0);
      await expect(parsePlPgSQL(sql)).resolves.toBeDefined();
    });
  }

  it('enables RLS on every table it creates', () => {
    const sql = readFileSync(files[0] as string, 'utf8');
    const created = [...sql.matchAll(/create table public\.(\w+)/g)].map((m) => m[1]);
    const rls = new Set(
      [...sql.matchAll(/alter table public\.(\w+) enable row level security/g)].map((m) => m[1]),
    );
    expect(created.length).toBeGreaterThan(8);
    for (const t of created) expect(rls.has(t), `RLS on ${t}`).toBe(true);
  });

  it('never references a service-role key', () => {
    for (const f of files)
      expect(readFileSync(f, 'utf8')).not.toMatch(/service_role_key|SERVICE_ROLE/);
  });
});
