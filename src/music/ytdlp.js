import { spawn } from 'node:child_process';

const BIN = process.env.YTDLP_BIN || 'yt-dlp';
const FFMPEG = process.env.FFMPEG_BIN || 'ffmpeg';
const BASE = ['--no-warnings', '--no-cache-dir', '--js-runtimes', 'node'];

const lastLine = (s) => s.trim().split('\n').filter(Boolean).pop() || '';

function runJson(args, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const p = spawn(BIN, [...BASE, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      p.kill('SIGKILL');
      reject(new Error('timeout'));
    }, timeoutMs);
    p.stdout.on('data', (d) => {
      out += d;
      if (out.length > 8_000_000) p.kill('SIGKILL');
    });
    p.stderr.on('data', (d) => {
      err = (err + d).slice(-2000);
    });
    p.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(lastLine(err) || `exit ${code}`));
      try {
        resolve(JSON.parse(out));
      } catch {
        reject(new Error('bad_json'));
      }
    });
  });
}

// Bentuk seragam untuk satu entri hasil yt-dlp.
export function normalize(e) {
  return {
    title: String(e.title ?? 'Tanpa judul'),
    author: String(e.uploader ?? e.channel ?? ''),
    length: typeof e.duration === 'number' ? Math.round(e.duration * 1000) : null,
    uri: e.webpage_url || e.url || null,
    live: e.is_live === true || e.live_status === 'is_live',
  };
}

export async function version() {
  return new Promise((resolve, reject) => {
    const p = spawn(BIN, ['--version'], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.on('error', reject);
    p.on('close', (c) => (c === 0 ? resolve(out.trim()) : reject(new Error(`exit ${c}`))));
  });
}

// Cari/muat metadata. identifier: "ytsearch1:judul", "scsearch1:judul", atau tautan.
export async function resolveEntries(identifier, { playlist = false, max = 15 } = {}) {
  const args = [
    '--dump-single-json',
    '--flat-playlist',
    '--playlist-end',
    String(max),
    playlist ? '--yes-playlist' : '--no-playlist',
    identifier,
  ];
  const data = await runJson(args);
  return (data.entries ?? [data]).filter(Boolean).map(normalize);
}

// Unduh audio dengan yt-dlp lalu ubah ke PCM 48kHz stereo lewat ffmpeg.
// Mengembalikan { stream, kill, onFail(cb) }.
export function openStream(uri, { maxMin = 15 } = {}) {
  const dl = spawn(
    BIN,
    [
      ...BASE,
      '-f', 'bestaudio/best',
      '--no-playlist',
      '--match-filter', `!is_live & duration<=?${maxMin * 60}`,
      '--quiet',
      '-o', '-',
      uri,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const ff = spawn(
    FFMPEG,
    ['-loglevel', 'error', '-i', 'pipe:0', '-vn', '-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1'],
    { stdio: ['pipe', 'pipe', 'ignore'] },
  );
  let err = '';
  let failCb = null;
  dl.stderr.on('data', (d) => {
    err = (err + d).slice(-2000);
  });
  dl.stdout.on('error', () => {});
  ff.stdin.on('error', () => {});
  dl.stdout.pipe(ff.stdin);
  dl.on('error', (e) => failCb?.(e.message));
  ff.on('error', (e) => failCb?.(e.message));
  dl.on('close', (code) => {
    if (code !== 0 && code !== null) failCb?.(lastLine(err) || `yt-dlp exit ${code}`);
  });
  const kill = () => {
    dl.kill('SIGKILL');
    ff.kill('SIGKILL');
  };
  return {
    stream: ff.stdout,
    kill,
    onFail: (cb) => {
      failCb = cb;
    },
  };
}
