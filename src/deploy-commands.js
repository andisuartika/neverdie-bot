import { REST, Routes } from 'discord.js';
import { config } from './config.js';
import { commands } from './commands/index.js';

const rest = new REST({ version: '10' }).setToken(config.discord.token);
const body = commands.map((c) => c.data.toJSON());

await rest.put(Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId), { body });
console.log(`[deploy] ${body.length} slash command terdaftar di server ${config.discord.guildId}`);
