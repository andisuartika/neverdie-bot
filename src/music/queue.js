// Logika murni (tanpa Discord/yt-dlp) supaya mudah diuji.

const HOSTS = new Set([
  'youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be',
  'soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com', 'on.soundcloud.com',
]);

// Mengembalikan { ok, identifier } untuk dikirim ke yt-dlp, atau { ok:false, reason }.
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

// Antrean per server. Item: { title, author, length, uri, requester }
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

// Saring hasil yt-dlp (entri ternormalisasi) dan beri bentuk item antrean.
export function filterTracks(entries, { maxTrackMs, requester, single = false }) {
  const list = single ? entries.slice(0, 1) : entries;
  let skipped = 0;
  const tracks = [];
  for (const e of list) {
    if (!e?.uri || e.live || (e.length != null && e.length > maxTrackMs)) {
      skipped++;
      continue;
    }
    tracks.push({ title: e.title, author: e.author, length: e.length ?? 0, uri: e.uri, requester });
  }
  return { tracks, skipped, error: tracks.length ? null : list.length ? 'filtered' : 'empty' };
}

// Tautan daftar putar (bukan video yang kebetulan membawa &list=) boleh dimasukkan beberapa lagu sekaligus.
export function isPlaylistUrl(identifier) {
  try {
    const u = new URL(identifier);
    return /\/playlist$/.test(u.pathname) || /\/sets\//.test(u.pathname);
  } catch {
    return false;
  }
}
