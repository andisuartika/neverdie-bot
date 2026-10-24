import { Client, Events, GatewayIntentBits } from 'discord.js';
import { config } from './config.js';
import { openDb, createUsageStore } from './db.js';
import { createMemoryStore } from './memory.js';
import { commands } from './commands/index.js';

const db = openDb();
const usage = createUsageStore(db);
const memory = createMemoryStore(db);
const byName = new Map(commands.map((c) => [c.data.name, c]));

// Hanya slash command: tidak perlu intent "Message Content" sama sekali.
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (c) => {
  console.log(`[bot] masuk sebagai ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.guildId !== config.discord.guildId) return; // hanya server NEVER DIE
  const cmd = byName.get(interaction.commandName);
  if (!cmd) return;
  try {
    await cmd.execute(interaction, { usage, memory });
  } catch (err) {
    console.error(`[bot] error di /${interaction.commandName}:`, err?.message ?? err);
    const reply = { content: 'Ada error di bot. Coba lagi nanti.', ephemeral: true };
    if (interaction.deferred || interaction.replied) await interaction.followUp(reply).catch(() => {});
    else await interaction.reply(reply).catch(() => {});
  }
});

const stop = () => {
  console.log('[bot] berhenti...');
  client.destroy();
  db.close();
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);

client.login(config.discord.token);
