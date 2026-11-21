import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Check, FileUp, LoaderCircle, X } from 'lucide-react';
import { bestMatch, parseImportText, type ImportRow, type Track } from '@tuneshift/core';
import { Button, cn } from '@tuneshift/ui';
import { toast } from 'sonner';
import { Artwork, EmptyState, PageHeader, SectionHeader, SourceBadge } from '../components/common';
import { audius, jamendo, registry, rememberTracks } from '../lib/sources';
import { createPlaylist } from '../db/library';

interface RowResult {
  row: ImportRow;
  match: Track | null;
  score: number;
  candidates: Track[];
  include: boolean;
}

const MAX_ROWS = 500;

export function ImportPage() {
  const nav = useNavigate();
  const [text, setText] = useState('');
  const [name, setName] = useState('Imported playlist');
  const [results, setResults] = useState<RowResult[] | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const cancel = useRef(false);
  const usable = registry.isUsable('audius') || registry.isUsable('jamendo');

  const run = async () => {
    const rows = parseImportText(text).slice(0, MAX_ROWS);
    if (!rows.length) {
      toast.error('No songs found — paste lines like “Artist – Title” or upload a CSV.');
      return;
    }
    cancel.current = false;
    setResults([]);
    setProgress({ done: 0, total: rows.length });
    const out: RowResult[] = [];
    let done = 0;
    const worker = async (row: ImportRow) => {
      const q = `${row.artist} ${row.title}`.trim();
      const lists = await Promise.allSettled([
        registry.isUsable('audius')
          ? audius.search(q, { type: 'track', limit: 8, offset: 0 })
          : Promise.resolve(null),
        registry.isUsable('jamendo')
          ? jamendo.search(q, { type: 'track', limit: 5, offset: 0 })
          : Promise.resolve(null),
      ]);
      const candidates = lists.flatMap((r) =>
        r.status === 'fulfilled' && r.value ? r.value.tracks : [],
      );
      const best = bestMatch(row, candidates);
      return {
        row,
        match: best?.track ?? null,
        score: best?.score ?? 0,
        candidates,
        include: Boolean(best),
      };
    };
    // Small worker pool keeps us under the APIs' rate limits.
    const queue = [...rows.entries()];
    await Promise.all(
      Array.from({ length: 3 }, async () => {
        while (queue.length && !cancel.current) {
          const [i, row] = queue.shift() as [number, ImportRow];
          out[i] = await worker(row);
          done++;
          setProgress({ done, total: rows.length });
          setResults(out.filter(Boolean));
        }
      }),
    );
    setProgress(null);
  };

  const create = async () => {
    const chosen = (results ?? []).filter((r) => r.include && r.match).map((r) => r.match as Track);
    if (!chosen.length) return;
    await rememberTracks(chosen);
    const p = await createPlaylist(name, [...new Set(chosen.map((t) => t.key))]);
    toast.success(`Created “${p.name}” with ${chosen.length} songs`);
    void nav(`/playlist/${p.id}`);
  };

  const upload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv,.txt,text/plain';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      setText(await f.text());
      setName(f.name.replace(/\.(csv|txt)$/i, ''));
    };
    input.click();
  };

  const matched = results?.filter((r) => r.match) ?? [];
  const unmatched = results?.filter((r) => !r.match) ?? [];
  return (
    <div className="space-y-6">
      <PageHeader
        title="Import a playlist"
        subtitle="Paste “Artist – Title” lines or upload a CSV (e.g. an Exportify export). We match each song on Audius and Jamendo for you to review."
      />
      {!usable ? (
        <EmptyState
          title="Turn on Audius or Jamendo first"
          body="Importing matches songs against the online catalogs."
        />
      ) : (
        <>
          <div className="space-y-3 rounded-card border border-line bg-surface p-4">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              placeholder={'Kordhell – Murder In My Mind\nDVRST - Close Eyes\n…'}
              aria-label="Songs to import"
              className="w-full rounded-ctl border border-line bg-bg p-3 font-mono text-sm"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button icon={<FileUp size={15} />} onClick={upload}>
                Upload CSV / text
              </Button>
              <Button
                variant="primary"
                disabled={!text.trim() || Boolean(progress)}
                onClick={() => void run()}
              >
                Find matches
              </Button>
              {progress && (
                <>
                  <span className="flex items-center gap-2 text-sm text-muted" role="status">
                    <LoaderCircle size={15} className="animate-spin" /> Matching {progress.done}/
                    {progress.total}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => (cancel.current = true)}>
                    Stop
                  </Button>
                </>
              )}
              <span className="ml-auto text-xs text-muted">Up to {MAX_ROWS} songs per import</span>
            </div>
          </div>
          {results && results.length > 0 && (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Playlist name
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="rounded-ctl border border-line bg-surface px-3 py-2 text-sm text-fg"
                  />
                </label>
                <Button
                  variant="primary"
                  disabled={!matched.some((r) => r.include) || Boolean(progress)}
                  onClick={() => void create()}
                >
                  Create playlist ({matched.filter((r) => r.include).length})
                </Button>
              </div>
              <section>
                <SectionHeader
                  title={`Matched (${matched.length})`}
                  subtitle="Untick anything that looks wrong, or pick another candidate."
                />
                <ul className="divide-y divide-line">
                  {matched.map((r) => (
                    <li
                      key={`${r.row.artist}-${r.row.title}`}
                      className="flex items-center gap-3 py-2"
                    >
                      <input
                        type="checkbox"
                        checked={r.include}
                        aria-label={`Include ${r.row.title}`}
                        onChange={(e) =>
                          setResults(
                            (rs) =>
                              rs?.map((x) => (x === r ? { ...x, include: e.target.checked } : x)) ??
                              null,
                          )
                        }
                      />
                      <div className="min-w-0 flex-1 text-sm">
                        <div className="truncate text-muted">
                          {r.row.artist} – {r.row.title}
                        </div>
                        <div className="flex items-center gap-2">
                          <Artwork
                            art={r.match?.artwork}
                            alt=""
                            size="small"
                            className="h-8 w-8"
                            seed={r.match?.title}
                          />
                          <select
                            aria-label={`Match for ${r.row.title}`}
                            className="min-w-0 flex-1 truncate rounded-chip border border-line bg-surface px-2 py-1"
                            value={r.match?.key}
                            onChange={(e) =>
                              setResults(
                                (rs) =>
                                  rs?.map((x) =>
                                    x === r
                                      ? {
                                          ...x,
                                          match:
                                            x.candidates.find((c) => c.key === e.target.value) ??
                                            x.match,
                                        }
                                      : x,
                                  ) ?? null,
                              )
                            }
                          >
                            {r.candidates.map((c) => (
                              <option key={c.key} value={c.key}>
                                {c.artist} – {c.title} ({c.source})
                              </option>
                            ))}
                          </select>
                          {r.match && <SourceBadge source={r.match.source} />}
                        </div>
                      </div>
                      <span
                        className={cn(
                          'text-xs tabular-nums',
                          r.score > 0.85 ? 'text-emerald-300' : 'text-amber-300',
                        )}
                      >
                        {Math.round(r.score * 100)}%
                      </span>
                      <Check size={16} className="text-emerald-400" aria-hidden="true" />
                    </li>
                  ))}
                </ul>
              </section>
              {unmatched.length > 0 && (
                <section>
                  <SectionHeader
                    title={`Not found (${unmatched.length})`}
                    subtitle="These aren't on Audius/Jamendo (or are spelled differently)."
                  />
                  <ul className="space-y-1 text-sm text-muted">
                    {unmatched.map((r) => (
                      <li
                        key={`${r.row.artist}-${r.row.title}`}
                        className="flex items-center gap-2"
                      >
                        <X size={14} className="text-red-400" aria-hidden="true" /> {r.row.artist} –{' '}
                        {r.row.title}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
