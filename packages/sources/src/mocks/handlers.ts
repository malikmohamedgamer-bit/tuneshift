import { http, HttpResponse } from 'msw';
import { AUDIUS_API } from '../audius';
import { JAMENDO_API } from '../jamendo';
import { LRCLIB_API } from '../lrclib';
import {
  audiusPlaylists,
  audiusTracks,
  audiusUsers,
  envelope,
  jamendoBadKey,
  jamendoEnvelope,
  jamendoTracks,
  lrclibRecord,
} from './fixtures';

const matches = (hay: string, q: string | null) =>
  !q ||
  q
    .toLowerCase()
    .split(/\s+/)
    .some((w) => hay.toLowerCase().includes(w));

/** MSW handlers for every external API the app calls. Tests never hit the network. */
export const handlers = [
  http.get(`${AUDIUS_API}/tracks/search`, ({ request }) => {
    const q = new URL(request.url).searchParams.get('query');
    return HttpResponse.json(
      envelope(audiusTracks.filter((t) => matches(`${t.title} ${t.tags ?? ''}`, q))),
    );
  }),
  http.get(`${AUDIUS_API}/tracks/trending`, () => HttpResponse.json(envelope(audiusTracks))),
  http.get(`${AUDIUS_API}/tracks/:id`, ({ params }) => {
    const t = audiusTracks.find((x) => x.id === params.id);
    return t
      ? HttpResponse.json(envelope(t))
      : HttpResponse.json({ error: 'not found' }, { status: 404 });
  }),
  http.get(`${AUDIUS_API}/users/search`, () => HttpResponse.json(envelope(audiusUsers))),
  http.get(`${AUDIUS_API}/users/:id/tracks`, () =>
    HttpResponse.json(envelope(audiusTracks.slice(0, 2))),
  ),
  http.get(`${AUDIUS_API}/users/:id`, ({ params }) => {
    const u = audiusUsers.find((x) => x.id === params.id);
    return u ? HttpResponse.json(envelope(u)) : HttpResponse.json({}, { status: 404 });
  }),
  http.get(`${AUDIUS_API}/playlists/search`, () => HttpResponse.json(envelope(audiusPlaylists))),
  http.get(`${AUDIUS_API}/playlists/:id/tracks`, () =>
    HttpResponse.json(envelope(audiusTracks.slice(0, 2))),
  ),
  http.get(`${AUDIUS_API}/playlists/:id`, ({ params }) =>
    HttpResponse.json(envelope(audiusPlaylists.filter((p) => p.id === params.id))),
  ),
  http.get(`${JAMENDO_API}/tracks/`, ({ request }) => {
    const id = new URL(request.url).searchParams.get('client_id');
    if (id !== 'goodkey123') return HttpResponse.json(jamendoBadKey);
    return HttpResponse.json(jamendoEnvelope(jamendoTracks));
  }),
  http.get(`${LRCLIB_API}/get`, ({ request }) => {
    const title = new URL(request.url).searchParams.get('track_name');
    if (title === 'Night Runner') return HttpResponse.json(lrclibRecord);
    if (title === 'Rate Limited')
      return new HttpResponse(null, { status: 429, headers: { 'Retry-After': '0' } });
    return HttpResponse.json({ code: 404, name: 'TrackNotFound' }, { status: 404 });
  }),
  http.get(`${LRCLIB_API}/search`, ({ request }) => {
    const title = new URL(request.url).searchParams.get('track_name');
    if (title === 'Fuzzy Song')
      return HttpResponse.json([{ ...lrclibRecord, id: 7, trackName: 'Fuzzy Song (Remastered)' }]);
    return HttpResponse.json([]);
  }),
];
