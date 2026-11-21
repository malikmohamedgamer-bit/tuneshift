import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Trash2, Wand2 } from 'lucide-react';
import {
  createId,
  evaluateSmartPlaylist,
  FIELD_KIND,
  FIELD_LABEL,
  isGroup,
  OPS_FOR_KIND,
  RULE_FIELDS,
  SORT_FIELDS,
  type Rule,
  type RuleField,
  type RuleGroup,
  type RuleOp,
  type SmartPlaylist,
  type Track,
  type TrackStats,
} from '@tuneshift/core';
import { Button, IconButton, Segmented } from '@tuneshift/ui';
import { toast } from 'sonner';
import { CollectionHeader } from '../components/CollectionHeader';
import { EmptyState } from '../components/common';
import { TrackList } from '../components/TrackList';
import { db } from '../db/db';
import { createPlaylist, saveSmartPlaylist } from '../db/library';
import { useHistory } from '../lib/queries';

const OP_LABEL: Record<RuleOp, string> = {
  is: 'is',
  isNot: 'is not',
  contains: 'contains',
  notContains: "doesn't contain",
  gt: 'more than',
  lt: 'less than',
  between: 'between',
  inLast: 'in the last (days)',
  notInLast: 'not in the last (days)',
  isTrue: 'yes',
  isFalse: 'no',
};

const SORT_LABEL: Record<(typeof SORT_FIELDS)[number], string> = {
  title: 'Title',
  artist: 'Artist',
  dateAdded: 'Date added',
  playCount: 'Play count',
  lastPlayed: 'Last played',
  duration: 'Duration',
  random: 'Random (daily)',
};

const field = 'rounded-chip border border-line bg-surface px-2 py-1.5 text-sm text-fg';

function RuleRow({
  rule,
  onChange,
  onRemove,
}: {
  rule: Rule;
  onChange: (r: Rule) => void;
  onRemove: () => void;
}) {
  const kind = FIELD_KIND[rule.field];
  const ops = OPS_FOR_KIND[kind];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Field"
        className={field}
        value={rule.field}
        onChange={(e) => {
          const f = e.target.value as RuleField;
          onChange({
            ...rule,
            field: f,
            op: OPS_FOR_KIND[FIELD_KIND[f]][0] as RuleOp,
            value: undefined,
            value2: undefined,
          });
        }}
      >
        {RULE_FIELDS.map((f) => (
          <option key={f} value={f}>
            {FIELD_LABEL[f]}
          </option>
        ))}
      </select>
      <select
        aria-label="Condition"
        className={field}
        value={rule.op}
        onChange={(e) => onChange({ ...rule, op: e.target.value as RuleOp })}
      >
        {ops.map((o) => (
          <option key={o} value={o}>
            {OP_LABEL[o]}
          </option>
        ))}
      </select>
      {kind === 'enum' && (
        <select
          aria-label="Value"
          className={field}
          value={String(rule.value ?? 'local')}
          onChange={(e) => onChange({ ...rule, value: e.target.value })}
        >
          <option value="local">Local</option>
          <option value="audius">Audius</option>
          <option value="jamendo">Jamendo</option>
        </select>
      )}
      {kind === 'text' && (
        <input
          aria-label="Value"
          className={field}
          value={String(rule.value ?? '')}
          onChange={(e) => onChange({ ...rule, value: e.target.value })}
        />
      )}
      {(kind === 'number' || kind === 'date') && (
        <input
          aria-label="Value"
          type="number"
          className={`${field} w-24`}
          value={Number(rule.value ?? 0)}
          onChange={(e) => onChange({ ...rule, value: Number(e.target.value) })}
        />
      )}
      {rule.op === 'between' && (
        <>
          <span className="text-sm text-muted">and</span>
          <input
            aria-label="Second value"
            type="number"
            className={`${field} w-24`}
            value={Number(rule.value2 ?? 0)}
            onChange={(e) => onChange({ ...rule, value2: Number(e.target.value) })}
          />
        </>
      )}
      <IconButton label="Remove rule" size="sm" onClick={onRemove}>
        <Trash2 size={15} />
      </IconButton>
    </div>
  );
}

function GroupEditor({
  group,
  onChange,
  depth = 0,
  onRemove,
}: {
  group: RuleGroup;
  onChange: (g: RuleGroup) => void;
  depth?: number;
  onRemove?: () => void;
}) {
  const update = (i: number, r: Rule | RuleGroup) =>
    onChange({ ...group, rules: group.rules.map((x, k) => (k === i ? r : x)) });
  const remove = (i: number) =>
    onChange({ ...group, rules: group.rules.filter((_, k) => k !== i) });
  return (
    <div className={depth ? 'rounded-ctl border border-line p-3' : ''}>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        Match
        <Segmented
          label="Match mode"
          size="sm"
          value={group.match}
          onChange={(m) => onChange({ ...group, match: m })}
          options={[
            { value: 'all', label: 'all (AND)' },
            { value: 'any', label: 'any (OR)' },
          ]}
        />
        of these rules
        {onRemove && (
          <IconButton label="Remove group" size="sm" onClick={onRemove}>
            <Trash2 size={15} />
          </IconButton>
        )}
      </div>
      <div className="space-y-2">
        {group.rules.map((r, i) =>
          isGroup(r) ? (
            <GroupEditor
              key={r.id}
              group={r}
              depth={depth + 1}
              onChange={(g) => update(i, g)}
              onRemove={() => remove(i)}
            />
          ) : (
            <RuleRow
              key={r.id}
              rule={r}
              onChange={(nr) => update(i, nr)}
              onRemove={() => remove(i)}
            />
          ),
        )}
      </div>
      <div className="mt-2 flex gap-2">
        <Button
          size="sm"
          variant="outline"
          icon={<Plus size={14} />}
          onClick={() =>
            onChange({
              ...group,
              rules: [
                ...group.rules,
                { id: createId(), field: 'artist', op: 'contains', value: '' },
              ],
            })
          }
        >
          Rule
        </Button>
        {depth === 0 && (
          <Button
            size="sm"
            variant="ghost"
            icon={<Plus size={14} />}
            onClick={() =>
              onChange({
                ...group,
                rules: [...group.rules, { id: createId(), match: 'any', rules: [] }],
              })
            }
          >
            Group
          </Button>
        )}
      </div>
    </div>
  );
}

export function SmartPlaylistPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const sp = useLiveQuery(() => db.smartPlaylists.get(id), [id]);
  const tracks = useLiveQuery(() => db.tracks.toArray(), [], []);
  const likes = useLiveQuery(
    async () => new Set((await db.likes.toArray()).filter((l) => !l.deleted).map((l) => l.id)),
    [],
    new Set<string>(),
  );
  const assignments = useLiveQuery(
    async () =>
      new Set((await db.assignments.toArray()).filter((a) => !a.deleted).map((a) => a.id)),
    [],
    new Set<string>(),
  );
  const history = useHistory(20000);
  const results = useMemo(() => {
    if (!sp) return [] as Track[];
    const stats = new Map<string, TrackStats>();
    for (const h of history) {
      const s = stats.get(h.trackKey) ?? { playCount: 0, liked: false, hasSavedSound: false };
      s.playCount += h.msListened >= 30_000 ? 1 : 0;
      s.lastPlayed = Math.max(s.lastPlayed ?? 0, h.playedAt);
      stats.set(h.trackKey, s);
    }
    const statsFor = (k: string): TrackStats => ({
      ...(stats.get(k) ?? { playCount: 0 }),
      liked: likes.has(k),
      hasSavedSound: assignments.has(`track:${k}`),
    });
    return evaluateSmartPlaylist(sp, tracks, statsFor);
  }, [sp, tracks, likes, assignments, history]);
  if (sp === undefined) return null;
  if (!sp || sp.deleted) return <EmptyState title="Smart playlist not found" />;
  const save = (patch: Partial<SmartPlaylist>) => void saveSmartPlaylist({ ...sp, ...patch });
  return (
    <div>
      <CollectionHeader
        kind="Smart playlist"
        title={sp.name}
        subtitle={`${results.length} songs · updates live as your library changes`}
        tracks={results}
        context={{ name: sp.name, kind: 'smart', id: sp.id }}
        cover={
          <div
            className="grid h-44 w-44 shrink-0 place-items-center rounded-panel bg-hero text-white shadow-theme sm:h-52 sm:w-52"
            aria-hidden="true"
          >
            <Wand2 size={56} />
          </div>
        }
      >
        <Button
          onClick={() =>
            void createPlaylist(
              `${sp.name} (snapshot)`,
              results.map((t) => t.key),
            ).then((p) => toast.success(`Saved “${p.name}”`))
          }
          disabled={!results.length}
        >
          Save snapshot
        </Button>
        <IconButton
          label="Delete smart playlist"
          onClick={() => {
            save({ deleted: true });
            void nav('/library');
          }}
        >
          <Trash2 size={18} />
        </IconButton>
      </CollectionHeader>
      <section className="mb-8 space-y-4 rounded-card border border-line bg-surface p-4">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Name
          <input
            key={sp.updatedAt}
            defaultValue={sp.name}
            onBlur={(e) => e.target.value.trim() && save({ name: e.target.value.trim() })}
            className={`${field} max-w-sm`}
          />
        </label>
        <GroupEditor group={sp.root} onChange={(root) => save({ root })} />
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label>
            Sort by{' '}
            <select
              className={field}
              value={sp.sort.field}
              onChange={(e) =>
                save({
                  sort: { ...sp.sort, field: e.target.value as SmartPlaylist['sort']['field'] },
                })
              }
            >
              {SORT_FIELDS.map((f) => (
                <option key={f} value={f}>
                  {SORT_LABEL[f]}
                </option>
              ))}
            </select>
          </label>
          <Segmented
            label="Direction"
            size="sm"
            value={sp.sort.dir}
            onChange={(dir) => save({ sort: { ...sp.sort, dir } })}
            options={[
              { value: 'asc', label: 'Ascending' },
              { value: 'desc', label: 'Descending' },
            ]}
          />
          <label>
            Limit{' '}
            <input
              type="number"
              min={0}
              className={`${field} w-24`}
              value={sp.limit ?? 0}
              onChange={(e) => save({ limit: Number(e.target.value) || undefined })}
            />{' '}
            <span className="text-xs text-muted">(0 = no limit)</span>
          </label>
        </div>
      </section>
      {results.length ? (
        <TrackList
          tracks={results}
          label={sp.name}
          context={{ name: sp.name, kind: 'smart', id: sp.id }}
        />
      ) : (
        <EmptyState title="No songs match yet" body="Loosen a rule, or play/like more music." />
      )}
    </div>
  );
}
