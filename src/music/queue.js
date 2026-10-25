// Logika murni (tanpa Discord/Lavalink) supaya mudah diuji.

const HOSTS = new Set([
  'youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be',
  'soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com', 'on.soundcloud.com',
]);

// Mengembalikan { ok, identifier } untuk dikirim ke Lavalink, atau { ok:false, reason }.
// Hanya YouTube dan SoundCloud yang diterima: tautan lain ditolak (mencegah bot dipakai membuka alamat sembarang).
// source: 'youtube' (ytsearch) atau 'soundcloud' (scsearch) untuk pencarian judul.
export function toIdentifier(input, source = 'youtube') {
  const prefix = source === 'soundcloud' ? 'scsearch' : 'ytsearch';
  const q = String(input ?? '').trim();
  if (!q) return { ok: false, reason: 'empty' };
  if (/^https?:\/\//i.test(q)) {
    let u;
    try {
      u = new URL(q);
    } catch {
      return { ok: false, reason: 'bad_url' };
    }
    if (!HOSTS.has(u.hostname.toLowerCase())) return { ok: false, reason: 'not_youtube' };
    return { ok: true, identifier: u.toString(), isUrl: true };
  }
  return { ok: true, identifier: `${prefix}:${q.slice(0, 200)}`, isUrl: false };
}

export const fmtDuration = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};

// Antrean per server. Item: { encoded, title, author, length, uri, requester }
export class TrackQueue {
  constructor(max = 30) {
    this.max = max;
    this.items = [];
    this.current = null;
  }
  get size() {
    return this.items.length;
  }
  // Menambah sebanyak yang muat; mengembalikan jumlah yang masuk.
  add(tracks) {
    const room = Math.max(0, this.max - this.items.length);
    const take = tracks.slice(0, room);
    this.items.push(...take);
    return take.length;
  }
  next() {
    this.current = this.items.shift() ?? null;
    return this.current;
  }
  clear() {
    this.items = [];
    this.current = null;
  }
}

// Pilih lagu dari hasil Lavalink dan saring yang tidak layak.
export function pickTracks(result, { maxTrackMs, isUrl, requester }) {
  if (!result) return { tracks: [], skipped: 0, error: 'no_result' };
  const { loadType, data } = result;
  if (loadType === 'error') return { tracks: [], skipped: 0, error: 'load_error' };
  if (loadType === 'empty') return { tracks: [], skipped: 0, error: 'empty' };
  let raw;
  if (loadType === 'track') raw = [data];
  else if (loadType === 'playlist') raw = data.tracks;
  else if (loadType === 'search') raw = isUrl ? data : data.slice(0, 1);
  else raw = [];
  let skipped = 0;
  const tracks = [];
  for (const t of raw) {
    const i = t.info;
    if (i.isStream || i.length > maxTrackMs) {
      skipped++;
      continue;
    }
    tracks.push({ encoded: t.encoded, title: i.title, author: i.author, length: i.length, uri: i.uri, requester });
  }
  return { tracks, skipped, error: tracks.length ? null : 'filtered' };
}
