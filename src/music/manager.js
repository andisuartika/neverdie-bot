import { Shoukaku, Connectors } from 'shoukaku';
import { config } from '../config.js';
import { TrackQueue, toIdentifier, pickTracks } from './queue.js';

// Satu manajer untuk seluruh bot. Status per server disimpan di `states`.
export function createMusic(client, cfg = config.music) {
  const states = new Map(); // guildId -> { player, queue, channelId, volume, timer, aloneTimer }
  let ready = false;

  const shoukaku = new Shoukaku(
    new Connectors.DiscordJS(client),
    [{ name: 'main', url: cfg.lavalinkUrl, auth: cfg.lavalinkPassword }],
    { resume: true, resumeTimeout: 30, reconnectTries: 10, reconnectInterval: 5, moveOnDisconnect: false },
  );
  shoukaku.on('ready', (name) => {
    ready = true;
    console.log(`[music] Lavalink "${name}" terhubung`);
  });
  shoukaku.on('disconnect', (name) => {
    ready = [...shoukaku.nodes.values()].some((n) => n.state === 1);
    console.error(`[music] Lavalink "${name}" terputus`);
  });
  shoukaku.on('error', (name, err) => console.error(`[music] node ${name}:`, err?.message ?? err));

  const clearTimers = (st) => {
    clearTimeout(st.timer);
    clearTimeout(st.aloneTimer);
  };

  async function destroy(guildId) {
    const st = states.get(guildId);
    if (!st) return;
    states.delete(guildId);
    clearTimers(st);
    st.queue.clear();
    await shoukaku.leaveVoiceChannel(guildId).catch(() => {});
  }

  async function playNext(guildId) {
    const st = states.get(guildId);
    if (!st) return;
    clearTimeout(st.timer);
    const track = st.queue.next();
    if (!track) {
      st.timer = setTimeout(() => destroy(guildId), cfg.idleLeaveSec * 1000);
      return;
    }
    try {
      await st.player.playTrack({ track: { encoded: track.encoded } });
    } catch (err) {
      console.error('[music] gagal memutar:', err?.message ?? err);
      return playNext(guildId);
    }
  }

  function wire(guildId, player) {
    player.on('end', (e) => {
      // 'replaced'/'stopped' dipicu oleh kita sendiri (skip/stop): jangan maju dua kali.
      if (e.reason === 'finished' || e.reason === 'loadFailed') playNext(guildId);
    });
    player.on('stuck', () => playNext(guildId));
    player.on('exception', (e) => console.error('[music] exception:', e?.exception?.message ?? e));
    player.on('closed', (e) => {
      console.error('[music] koneksi voice ditutup:', e?.code);
      destroy(guildId);
    });
  }

  const idle = () => ({ status: 'idle' });

  return {
    get ready() {
      return ready;
    },
    state: (guildId) => states.get(guildId),

    // Mengembalikan { ok, ... } supaya perintah tinggal menampilkan hasilnya.
    async enqueue({ guildId, voiceChannelId, shardId, query, requester }) {
      if (!ready) return { ok: false, reason: 'node_down' };
      const id = toIdentifier(query);
      if (!id.ok) return { ok: false, reason: id.reason };
      const node = shoukaku.getIdealNode();
      if (!node) return { ok: false, reason: 'node_down' };

      let result;
      try {
        result = await node.rest.resolve(id.identifier);
      } catch (err) {
        console.error('[music] resolve gagal:', err?.message ?? err);
        return { ok: false, reason: 'load_error' };
      }
      const { tracks, skipped, error } = pickTracks(result, {
        maxTrackMs: cfg.maxTrackMin * 60_000,
        isUrl: id.isUrl,
        requester,
      });
      if (error) return { ok: false, reason: error, skipped };

      let st = states.get(guildId);
      if (st && st.channelId !== voiceChannelId) return { ok: false, reason: 'other_channel' };
      if (!st) {
        const player = await shoukaku.joinVoiceChannel({ guildId, channelId: voiceChannelId, shardId, deaf: true });
        await player.setGlobalVolume(cfg.defaultVolume).catch(() => {});
        st = { player, queue: new TrackQueue(cfg.maxQueue), channelId: voiceChannelId, volume: cfg.defaultVolume };
        states.set(guildId, st);
        wire(guildId, player);
      }
      const added = st.queue.add(tracks);
      if (!added) return { ok: false, reason: 'queue_full' };
      const startsNow = !st.queue.current && !st.player.track;
      if (startsNow) await playNext(guildId);
      else clearTimeout(st.timer);
      return { ok: true, added, skipped, first: tracks[0], startsNow, position: st.queue.size };
    },

    async skip(guildId) {
      const st = states.get(guildId);
      if (!st?.queue.current) return idle();
      const skipped = st.queue.current;
      await playNext(guildId);
      return { status: 'ok', skipped };
    },

    async stop(guildId) {
      if (!states.has(guildId)) return idle();
      await destroy(guildId);
      return { status: 'ok' };
    },

    async togglePause(guildId) {
      const st = states.get(guildId);
      if (!st?.queue.current) return idle();
      const paused = !st.player.paused;
      await st.player.setPaused(paused);
      return { status: 'ok', paused };
    },

    async setVolume(guildId, v) {
      const st = states.get(guildId);
      if (!st) return idle();
      st.volume = Math.max(0, Math.min(cfg.maxVolume, Math.round(v)));
      await st.player.setGlobalVolume(st.volume);
      return { status: 'ok', volume: st.volume };
    },

    // Dipanggil dari voiceStateUpdate: keluar jika bot sendirian di voice channel.
    checkAlone(guild) {
      const st = states.get(guild.id);
      if (!st) return;
      const ch = guild.channels.cache.get(st.channelId);
      const humans = ch?.members.filter((m) => !m.user.bot).size ?? 0;
      clearTimeout(st.aloneTimer);
      if (!humans) st.aloneTimer = setTimeout(() => destroy(guild.id), cfg.aloneLeaveSec * 1000);
    },

    shutdown: async () => {
      for (const id of [...states.keys()]) await destroy(id);
      shoukaku.nodes.forEach((n) => n.disconnect?.(1000, 'shutdown'));
    },
  };
}
