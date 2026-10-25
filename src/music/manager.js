import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  entersState,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  NoSubscriberBehavior,
  StreamType,
} from '@discordjs/voice';
import { config } from '../config.js';
import { TrackQueue, toIdentifier, filterTracks, isPlaylistUrl } from './queue.js';
import * as ytdlp from './ytdlp.js';

// Pemutar musik: yt-dlp (unduh audio) -> ffmpeg (PCM) -> @discordjs/voice.
// Satu manajer untuk seluruh bot. Status per server disimpan di `states`.
export function createMusic(client, cfg = config.music, deps = ytdlp) {
  const states = new Map(); // guildId -> { connection, player, queue, channelId, volume, resource, handle, ... }
  let ready = false;

  deps
    .version()
    .then((v) => {
      ready = true;
      console.log(`[music] yt-dlp ${v} siap`);
    })
    .catch((e) => console.error('[music] yt-dlp tidak ditemukan:', e?.message ?? e));

  const notify = async (st, text) => {
    const ch = st.textChannelId ? await client.channels.fetch(st.textChannelId).catch(() => null) : null;
    await ch?.send({ content: text, allowedMentions: { parse: [] } }).catch(() => {});
  };

  const clearTimers = (st) => {
    clearTimeout(st.timer);
    clearTimeout(st.aloneTimer);
  };

  function destroy(guildId) {
    const st = states.get(guildId);
    if (!st) return;
    states.delete(guildId);
    clearTimers(st);
    st.queue.clear();
    st.handle?.kill();
    st.player.removeAllListeners();
    st.player.stop(true);
    try {
      st.connection.destroy();
    } catch {
      /* sudah dihancurkan */
    }
  }

  function playNext(guildId) {
    const st = states.get(guildId);
    if (!st) return;
    clearTimeout(st.timer);
    st.handle?.kill();
    st.handle = null;
    const track = st.queue.next();
    if (!track) {
      st.timer = setTimeout(() => destroy(guildId), cfg.idleLeaveSec * 1000);
      return;
    }
    const handle = deps.openStream(track.uri, { maxMin: cfg.maxTrackMin });
    handle.onFail((msg) => {
      console.error('[music] gagal mengambil audio:', msg);
      if (st.handle === handle) notify(st, `⚠️ Gagal memutar **${track.title.slice(0, 100)}** (${shortReason(msg)}). Dilewati.`);
    });
    const resource = createAudioResource(handle.stream, { inputType: StreamType.Raw, inlineVolume: true });
    resource.volume.setVolume(st.volume / 100);
    st.handle = handle;
    st.resource = resource;
    st.player.play(resource);
  }

  const shortReason = (msg) => {
    const m = String(msg).toLowerCase();
    if (m.includes('sign in') || m.includes('login')) return 'YouTube meminta login';
    if (m.includes('unavailable') || m.includes('private')) return 'video tidak tersedia';
    if (m.includes('403') || m.includes('429')) return 'ditolak YouTube';
    return 'gagal memuat audio';
  };

  async function createState(guild, voiceChannelId, textChannelId) {
    const connection = joinVoiceChannel({
      channelId: voiceChannelId,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true,
    });
    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
    } catch {
      connection.destroy();
      return null;
    }
    const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
    connection.subscribe(player);
    const st = {
      connection,
      player,
      queue: new TrackQueue(cfg.maxQueue),
      channelId: voiceChannelId,
      textChannelId,
      volume: cfg.defaultVolume,
      resource: null,
      handle: null,
    };
    states.set(guild.id, st);
    player.on(AudioPlayerStatus.Idle, () => playNext(guild.id));
    player.on('error', (e) => console.error('[music] error pemutar:', e?.message ?? e));
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        // Dipindah atau reconnect sebentar: tunggu; jika tidak, keluar.
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        destroy(guild.id);
      }
    });
    return st;
  }

  const idle = () => ({ status: 'idle' });

  return {
    get ready() {
      return ready;
    },
    state: (guildId) => states.get(guildId),

    // Mengembalikan { ok, ... } supaya perintah tinggal menampilkan hasilnya.
    async enqueue({ guild, voiceChannelId, query, requester, textChannelId }) {
      if (!ready) return { ok: false, reason: 'node_down' };
      const id = toIdentifier(query, cfg.source);
      if (!id.ok) return { ok: false, reason: id.reason };

      let entries;
      try {
        const search = id.isUrl ? id.identifier : id.identifier.replace(/^(yt|sc)search:/, '$1search1:');
        entries = await deps.resolveEntries(search, { playlist: id.isUrl && isPlaylistUrl(id.identifier) });
      } catch (err) {
        console.error('[music] pencarian gagal:', err?.message ?? err);
        return { ok: false, reason: 'load_error' };
      }
      const { tracks, skipped, error } = filterTracks(entries, {
        maxTrackMs: cfg.maxTrackMin * 60_000,
        requester,
        single: !id.isUrl,
      });
      if (error) return { ok: false, reason: error, skipped };

      let st = states.get(guild.id);
      if (st && st.channelId !== voiceChannelId) return { ok: false, reason: 'other_channel' };
      if (!st) {
        st = await createState(guild, voiceChannelId, textChannelId);
        if (!st) return { ok: false, reason: 'voice_failed' };
      }
      if (textChannelId) st.textChannelId = textChannelId;
      const added = st.queue.add(tracks);
      if (!added) return { ok: false, reason: 'queue_full' };
      const startsNow = !st.queue.current && st.player.state.status === AudioPlayerStatus.Idle;
      if (startsNow) playNext(guild.id);
      else clearTimeout(st.timer);
      return { ok: true, added, skipped, first: tracks[0], startsNow, position: st.queue.size };
    },

    async skip(guildId) {
      const st = states.get(guildId);
      if (!st?.queue.current) return idle();
      const skipped = st.queue.current;
      st.player.stop(true); // memicu Idle -> lagu berikutnya
      return { status: 'ok', skipped };
    },

    async stop(guildId) {
      if (!states.has(guildId)) return idle();
      destroy(guildId);
      return { status: 'ok' };
    },

    async togglePause(guildId) {
      const st = states.get(guildId);
      if (!st?.queue.current) return idle();
      const paused = st.player.state.status !== AudioPlayerStatus.Paused;
      if (paused) st.player.pause();
      else st.player.unpause();
      return { status: 'ok', paused };
    },

    async setVolume(guildId, v) {
      const st = states.get(guildId);
      if (!st) return idle();
      st.volume = Math.max(0, Math.min(cfg.maxVolume, Math.round(v)));
      st.resource?.volume?.setVolume(st.volume / 100);
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
      for (const id of [...states.keys()]) destroy(id);
    },
  };
}
