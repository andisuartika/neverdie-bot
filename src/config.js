import 'dotenv/config';

const list = (v) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const num = (v, fallback) => {
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const need = (name) => {
  const v = process.env[name];
  if (!v) {
    console.error(`[config] Variabel ${name} belum diisi di file .env`);
    process.exit(1);
  }
  return v;
};

export const config = {
  tz: process.env.TZ || 'Asia/Makassar',
  dbPath: process.env.DB_PATH || '/data/bot.db',

  discord: {
    token: need('DISCORD_TOKEN'),
    clientId: need('DISCORD_CLIENT_ID'),
    guildId: need('GUILD_ID'),
  },

  ai: {
    // Contoh: http://host.docker.internal:20128/v1  (sesuaikan dengan 9router Bli)
    baseUrl: need('NINEROUTER_BASE_URL').replace(/\/+$/, ''),
    apiKey: need('NINEROUTER_API_KEY'),
    // Nama model harus persis sama dengan yang tampil di 9router.
    modelMember: process.env.AI_MODEL_MEMBER || 'gemini-flash',
    modelStaff: process.env.AI_MODEL_STAFF || process.env.AI_MODEL_MEMBER || 'gemini-flash',
    timeoutMs: num(process.env.AI_TIMEOUT_MS, 30000),
    maxQuestionChars: num(process.env.AI_MAX_QUESTION_CHARS, 1000),
    // Channel yang memakai mode "teknis" (jawaban lebih teliti, cocok untuk kode).
    technicalChannelIds: list(process.env.AI_TECH_CHANNEL_IDS),
  },

  // Ingatan percakapan singkat per pengguna per channel (hapus dengan /reset).
  memory: {
    turns: num(process.env.AI_MEMORY_TURNS, 3), // jumlah tanya-jawab terakhir yang diingat
    ttlMin: num(process.env.AI_MEMORY_TTL_MIN, 30), // lupa setelah sekian menit tidak aktif
    maxChars: num(process.env.AI_MEMORY_MAX_CHARS, 1200), // potong tiap pesan yang disimpan
  },

  // Role (ID, pisahkan koma). Pemilik server otomatis masuk tingkat dev.
  // STAFF_ROLE_IDS (lama) dipakai sebagai admin hanya jika ketiga variabel baru kosong.
  roles: (() => {
    const dev = list(process.env.DEV_ROLE_IDS);
    const admin = list(process.env.ADMIN_ROLE_IDS);
    const moderator = list(process.env.MODERATOR_ROLE_IDS);
    const legacy = list(process.env.STAFF_ROLE_IDS);
    return {
      dev,
      admin: dev.length || admin.length || moderator.length ? admin : legacy,
      moderator,
      programmer: list(process.env.PROGRAMMER_ROLE_IDS),
    };
  })(),

  // Kosong = AI boleh dipakai di semua channel. Isi ID channel untuk membatasi.
  aiChannelIds: list(process.env.AI_CHANNEL_IDS),

  // Batas per tingkat. daily = permintaan per hari (reset tengah malam zona waktu di atas).
  limits: {
    member: {
      daily: num(process.env.LIMIT_MEMBER_DAILY, 10),
      cooldownSec: num(process.env.LIMIT_MEMBER_COOLDOWN_SEC, 20),
      maxTokens: num(process.env.LIMIT_MEMBER_MAX_TOKENS, 500),
    },
    programmer: {
      daily: num(process.env.LIMIT_PROGRAMMER_DAILY, 25),
      cooldownSec: num(process.env.LIMIT_PROGRAMMER_COOLDOWN_SEC, 15),
      maxTokens: num(process.env.LIMIT_PROGRAMMER_MAX_TOKENS, 800),
    },
    // dev = tanpa batas harian dan tanpa jeda
    dev: {
      daily: num(process.env.LIMIT_DEV_DAILY, Infinity),
      cooldownSec: num(process.env.LIMIT_DEV_COOLDOWN_SEC, 0),
      maxTokens: num(process.env.LIMIT_DEV_MAX_TOKENS, 1500),
    },
    admin: {
      daily: num(process.env.LIMIT_ADMIN_DAILY, 100),
      cooldownSec: num(process.env.LIMIT_ADMIN_COOLDOWN_SEC, 5),
      maxTokens: num(process.env.LIMIT_ADMIN_MAX_TOKENS, 1200),
    },
    moderator: {
      daily: num(process.env.LIMIT_MODERATOR_DAILY, 50),
      cooldownSec: num(process.env.LIMIT_MODERATOR_COOLDOWN_SEC, 5),
      maxTokens: num(process.env.LIMIT_MODERATOR_MAX_TOKENS, 1200),
    },
    // Total semua member (di luar dev/admin/moderator) per hari: pagar pengaman biaya.
    globalDaily: num(process.env.LIMIT_GLOBAL_DAILY, 300),
  },
};
