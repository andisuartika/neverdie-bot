import { writeFileSync } from 'node:fs';
import { Client, Events, GatewayIntentBits, Partials } from 'discord.js';
import { config } from './config.js';
import { openDb, createUsageStore } from './db.js';
import { createMemoryStore } from './memory.js';
import { createAskLog } from './asklog.js';
import { createLimiter } from './limiter.js';
import { createAlerter } from './alerts.js';
import { startMaintenance } from './backup.js';
import { registerModLog } from './modlog.js';
import { sendWelcome } from './welcome.js';
import { handleButton } from './buttons.js';
import { commands } from './commands/index.js';

const db = openDb();
const byName = new Map(commands.map((c) => [c.data.name, c]));

// Hanya slash command dan tombol: tidak perlu intent "Message Content" sama sekali.
// GuildMessages (tanpa isi pesan) hanya untuk log "pesan dihapus". GuildMembers adalah intent
// privileged: aktif hanya jika MEMBER_EVENTS=on (nyalakan juga di Developer Portal).
const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages];
if (config.memberEvents) intents.push(GatewayIntentBits.GuildMembers);
const client = new Client({ intents, partials: [Partials.Message, Partials.GuildMember] });

const askLog = createAskLog(db);
const alerter = createAlerter({
  send: async (content) => {
    if (!config.staffLogChannelId) return;
    const ch = await client.channels.fetch(config.staffLogChannelId).catch(() => null);
    await ch?.send({ content, allowedMentions: { parse: [] } });
  },
});
const ctx = {
  usage: createUsageStore(db),
  memory: createMemoryStore(db),
  askLog,
  limiter: createLimiter(config.ai.concurrency),
  alerter,
};

registerModLog(client, {
  welcome: async (member) => {
    try {
      await sendWelcome(client, member);
    } catch (err) {
      console.error('[welcome] gagal:', err?.message ?? err);
    }
  },
});

client.once(Events.ClientReady, async (c) => {
  console.log(`[bot] masuk sebagai ${c.user.tag}`);
  if (config.memberEvents) {
    // Isi cache member agar perubahan role bisa dibandingkan dengan keadaan sebelumnya.
    await c.guilds.cache.get(config.discord.guildId)?.members.fetch().catch((e) =>
      console.error('[bot] gagal memuat member:', e?.message ?? e),
    );
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.guildId !== config.discord.guildId) return; // hanya server NEVER DIE
  try {
    if (interaction.isButton()) return await handleButton(interaction, ctx);
    if (!interaction.isChatInputCommand()) return;
    const cmd = byName.get(interaction.commandName);
    if (cmd) await cmd.execute(interaction, ctx);
  } catch (err) {
    console.error(`[bot] error (${interaction.commandName ?? interaction.customId}):`, err?.message ?? err);
    const reply = { content: 'Ada error di bot. Coba lagi nanti.', ephemeral: true };
    if (interaction.deferred || interaction.replied) await interaction.followUp(reply).catch(() => {});
    else await interaction.reply(reply).catch(() => {});
  }
});

// Detak untuk healthcheck + penjaga: jika terputus dari Discord > 3 menit, keluar
// supaya Docker (restart: unless-stopped) menghidupkan ulang.
let lastReady = Date.now();
setInterval(() => {
  if (client.isReady()) {
    lastReady = Date.now();
    try {
      writeFileSync('/tmp/nv-health', String(lastReady));
    } catch {
      /* di luar Docker: abaikan */
    }
  } else if (Date.now() - lastReady > 180_000) {
    console.error('[bot] terputus dari Discord > 3 menit, keluar untuk restart');
    process.exit(1);
  }
}, 30_000).unref();

startMaintenance(db, askLog);

const stop = () => {
  console.log('[bot] berhenti...');
  client.destroy();
  db.close();
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);

client.login(config.discord.token);
