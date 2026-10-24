// Peringatan ke staf kalau AI gagal berturut-turut, dan kabar saat pulih.
// Tidak mengirim spam: satu peringatan per `cooldownMs`.
export function createAlerter({ send, threshold = 3, cooldownMs = 30 * 60_000, now = () => Date.now() }) {
  let fails = 0;
  let lastAlert = -Infinity;
  let alerted = false;
  const safe = async (text) => {
    try {
      await send(text);
    } catch (err) {
      console.error('[alert] gagal kirim:', err?.message ?? err);
    }
  };
  return {
    async failure(code) {
      fails++;
      if (fails >= threshold && now() - lastAlert >= cooldownMs) {
        lastAlert = now();
        alerted = true;
        await safe(`⚠️ AI gagal ${fails}x berturut-turut (kode: \`${code}\`). Cek 9router dan log bot.`);
      }
    },
    async success() {
      const wasAlerted = alerted;
      fails = 0;
      alerted = false;
      if (wasAlerted) await safe('✅ AI sudah pulih dan menjawab lagi.');
    },
  };
}
