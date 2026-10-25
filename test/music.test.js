import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toIdentifier, TrackQueue, filterTracks, isPlaylistUrl, fmtDuration } from '../src/music/queue.js';

test('toIdentifier: judul jadi ytsearch, hanya YouTube yang lolos', () => {
  assert.equal(toIdentifier('dewa 19 kangen').identifier, 'ytsearch:dewa 19 kangen');
  assert.equal(toIdentifier('https://youtu.be/abc').ok, true);
  assert.equal(toIdentifier('https://music.youtube.com/watch?v=x').isUrl, true);
  assert.equal(toIdentifier('http://169.254.169.254/x').reason, 'not_youtube');
  assert.equal(toIdentifier('https://evilyoutube.com/x').reason, 'not_youtube');
  assert.equal(toIdentifier('   ').reason, 'empty');
  assert.equal(toIdentifier('hindia', 'soundcloud').identifier, 'scsearch:hindia');
  assert.equal(toIdentifier('https://soundcloud.com/a/b').ok, true);
  // awalan sumber lain dari pengguna tidak dipercaya
  assert.equal(toIdentifier('scsearch:abc').identifier, 'ytsearch:scsearch:abc');
});

test('TrackQueue: batas antrean dan urutan', () => {
  const q = new TrackQueue(2);
  assert.equal(q.add([{ t: 1 }, { t: 2 }, { t: 3 }]), 2);
  assert.equal(q.add([{ t: 4 }]), 0);
  assert.deepEqual(q.next(), { t: 1 });
  assert.equal(q.size, 1);
  q.clear();
  assert.equal(q.current, null);
  assert.equal(q.next(), null);
});

const ent = (title, length, live = false) => ({ title, author: 'a', length, uri: `https://x/${title}`, live });

test('filterTracks: saring live/panjang, pencarian ambil 1, playlist ambil semua', () => {
  const opt = { maxTrackMs: 60_000, requester: 'U' };
  assert.equal(filterTracks([ent('a', 1000), ent('b', 1000)], { ...opt, single: true }).tracks.length, 1);
  const r = filterTracks([ent('a', 1000), ent('live', 1, true), ent('long', 999_999), ent('n', null)], opt);
  assert.equal(r.tracks.length, 2); // 'a' dan 'n' (durasi tidak diketahui tetap lolos)
  assert.equal(r.skipped, 2);
  assert.equal(r.tracks[0].requester, 'U');
  assert.equal(filterTracks([], opt).error, 'empty');
  assert.equal(filterTracks([ent('long', 999_999)], opt).error, 'filtered');
});

test('isPlaylistUrl: hanya daftar putar sungguhan', () => {
  assert.equal(isPlaylistUrl('https://www.youtube.com/playlist?list=PL1'), true);
  assert.equal(isPlaylistUrl('https://soundcloud.com/a/sets/b'), true);
  assert.equal(isPlaylistUrl('https://www.youtube.com/watch?v=x&list=PL1'), false);
});

test('fmtDuration', () => {
  assert.equal(fmtDuration(65_000), '1:05');
  assert.equal(fmtDuration(3_725_000), '1:02:05');
});
