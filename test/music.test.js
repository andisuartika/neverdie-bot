import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toIdentifier, TrackQueue, pickTracks, fmtDuration } from '../src/music/queue.js';

test('toIdentifier: judul jadi ytsearch, hanya YouTube yang lolos', () => {
  assert.equal(toIdentifier('dewa 19 kangen').identifier, 'ytsearch:dewa 19 kangen');
  assert.equal(toIdentifier('https://youtu.be/abc').ok, true);
  assert.equal(toIdentifier('https://music.youtube.com/watch?v=x').isUrl, true);
  assert.equal(toIdentifier('http://169.254.169.254/x').reason, 'not_youtube');
  assert.equal(toIdentifier('https://evilyoutube.com/x').reason, 'not_youtube');
  assert.equal(toIdentifier('   ').reason, 'empty');
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

const tr = (title, length, isStream = false) => ({ encoded: title, info: { title, author: 'a', length, isStream, uri: 'u' } });

test('pickTracks: search ambil 1, URL playlist ambil semua, saring stream/panjang', () => {
  const opt = { maxTrackMs: 60_000, isUrl: false, requester: 'U' };
  const search = { loadType: 'search', data: [tr('a', 1000), tr('b', 1000)] };
  assert.equal(pickTracks(search, opt).tracks.length, 1);
  const pl = { loadType: 'playlist', data: { tracks: [tr('a', 1000), tr('live', 1, true), tr('long', 999_999)] } };
  const r = pickTracks(pl, { ...opt, isUrl: true });
  assert.equal(r.tracks.length, 1);
  assert.equal(r.skipped, 2);
  assert.equal(r.tracks[0].requester, 'U');
  assert.equal(pickTracks({ loadType: 'empty', data: {} }, opt).error, 'empty');
  assert.equal(pickTracks({ loadType: 'error', data: {} }, opt).error, 'load_error');
  assert.equal(pickTracks({ loadType: 'track', data: tr('x', 999_999) }, opt).error, 'filtered');
});

test('fmtDuration', () => {
  assert.equal(fmtDuration(65_000), '1:05');
  assert.equal(fmtDuration(3_725_000), '1:02:05');
});
