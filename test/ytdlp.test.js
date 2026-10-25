import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, chmodSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

// yt-dlp palsu: --version, --dump-single-json (metadata), selain itu mengeluarkan nada 1 detik.
const dir = mkdtempSync(join(tmpdir(), 'nv-yt-'));
const fake = join(dir, 'yt-dlp');
writeFileSync(
  fake,
  `#!/usr/bin/env bash
case "$*" in
  *--version*) echo 2099.01.01 ;;
  *--dump-single-json*) echo '{"entries":[{"title":"Lagu A","uploader":"Band","duration":200,"url":"https://youtu.be/a"}]}' ;;
  *gagal*) echo "ERROR: Sign in to confirm you're not a bot" >&2; exit 1 ;;
  *) exec ffmpeg -loglevel error -f lavfi -i sine=frequency=440:duration=1 -f wav - ;;
esac
`,
);
chmodSync(fake, 0o755);
process.env.YTDLP_BIN = fake;
const yt = await import('../src/music/ytdlp.js');

test('normalize: bentuk seragam', () => {
  const n = yt.normalize({ title: 'T', uploader: 'U', duration: 61.4, webpage_url: 'https://w', is_live: false });
  assert.deepEqual(n, { title: 'T', author: 'U', length: 61400, uri: 'https://w', live: false });
  assert.equal(yt.normalize({ title: 'T', url: 'u', live_status: 'is_live' }).live, true);
});

test('version dan resolveEntries memakai yt-dlp', async () => {
  assert.equal(await yt.version(), '2099.01.01');
  const [e] = await yt.resolveEntries('ytsearch1:apa saja');
  assert.equal(e.title, 'Lagu A');
  assert.equal(e.length, 200_000);
  assert.equal(e.uri, 'https://youtu.be/a');
});

test('openStream: audio PCM keluar dari yt-dlp -> ffmpeg', { skip: !hasFfmpeg }, async () => {
  const h = yt.openStream('https://youtu.be/ok');
  let bytes = 0;
  for await (const c of h.stream) bytes += c.length;
  h.kill();
  // 1 detik * 48000 * 2 kanal * 2 byte = 192000
  assert.ok(bytes > 150_000, `bytes=${bytes}`);
});

test('openStream: kegagalan yt-dlp dilaporkan', { skip: !hasFfmpeg }, async () => {
  const h = yt.openStream('https://youtu.be/gagal');
  const msg = await new Promise((resolve) => {
    h.onFail(resolve);
    h.stream.resume();
  });
  h.kill();
  assert.match(msg, /Sign in/);
});
