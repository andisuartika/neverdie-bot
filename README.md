# Bot NEVER DIE

Bot Discord untuk server NEVER DIE. Versi awal: `/ask` (AI lewat 9router) dengan batas pemakaian, `/usage`, `/ping`.

## Fitur batas AI
- Batas harian per orang menurut tingkat: member / programmer / moderator / admin / dev (role ID di `.env`; dev tanpa batas).
- Jeda antar permintaan, batas panjang pertanyaan dan jawaban.
- Batas total harian semua non-staf (pagar biaya).
- Hanya aktif di channel yang diisi di `AI_CHANNEL_IDS`.
- Jatah tersimpan di SQLite (volume Docker), jadi tidak reset saat bot restart. Jatah dikembalikan kalau AI gagal.
- Bot hanya chat biasa: tanpa tool, tanpa akses ke server. Isi percakapan tidak disimpan, hanya jumlah pemakaian.
- Hanya slash command, jadi tidak butuh intent "Message Content".

## Persiapan (sekali saja)
1. Discord Developer Portal -> New Application -> tab **Bot** -> Reset Token (simpan, jangan dibagikan).
2. Tab **OAuth2 -> URL Generator**: scope `bot` + `applications.commands`; izin cukup **Send Messages** dan **Use Slash Commands**. Jangan pilih Administrator. Buka URL-nya untuk mengundang bot.
3. Aktifkan Developer Mode di Discord (Pengaturan -> Lanjutan) untuk menyalin ID server, role, dan channel.

## Menjalankan di home server
```bash
cp .env.example .env      # lalu isi nilainya (nano .env)
chmod 600 .env
docker compose build
docker compose run --rm bot node src/deploy-commands.js   # daftarkan slash command (sekali, dan tiap ada command baru)
docker compose up -d
docker compose logs -f bot
```

## Menguji (opsional, di komputer dengan Node 22)
```bash
npm ci && npm test
```

## Catatan keamanan
- Token dan API key hanya di `.env` (sudah di `.gitignore`). Jangan di-commit atau dikirim lewat chat.
- Jika 9router jalan di Docker, ganti `NINEROUTER_BASE_URL` ke nama service-nya dan sambungkan ke network yang sama.
- Hermes Agent sengaja TIDAK disambungkan. Kalau nanti dibuat, batasi hanya untuk ID Discord pengurus.


## Kualitas AI
- **Ingatan singkat:** NV Bot mengingat beberapa tanya-jawab terakhir per orang per channel (default 3 tanya-jawab, lupa setelah 30 menit). `/reset` menghapusnya.
- **Mode teknis:** channel di `AI_TECH_CHANNEL_IDS` (mis. debug-help) memakai prompt khusus kode dan suhu lebih rendah.
- **Pengaman:** mention (`@everyone`, `<@id>`) dinetralkan, teks "pikiran" model dibuang, prompt tidak bisa dibocorkan.

## Keandalan dan pemantauan
- **Tombol di jawaban:** 👍 👎 untuk menilai, 🔄 untuk menjawab ulang (hanya penanya asli yang bisa menekan; 🔄 memakai jatah).
- **`/stats` (staf):** permintaan hari ini, pengguna unik, rata-rata waktu jawab, persen gagal, kode gagal, penilaian, pemakai teratas, kuota global.
- **Antrean:** `AI_CONCURRENCY` permintaan diproses bersamaan (default 2), antrean maksimum `AI_MAX_QUEUE`.
- **Model cadangan:** isi `AI_MODEL_FALLBACK`; dipakai otomatis jika model utama gagal.
- **Notifikasi staf:** isi `STAFF_LOG_CHANNEL_ID`; bot memberi tahu bila AI gagal 3x berturut-turut dan saat pulih.
- **Cadangan database:** otomatis harian di `/data/backup` (volume `bot-data`), simpan `BACKUP_KEEP` terakhir. Salin keluar: `sudo docker cp neverdie-bot:/data/backup ./backup`.
- **Healthcheck dan penjaga:** `docker ps` menampilkan status healthy; bot keluar sendiri bila terputus dari Discord > 3 menit lalu Docker menghidupkannya kembali.
- **Privasi log:** hanya pertanyaan (bukan jawaban) disimpan di `ask_log` selama `ASK_LOG_RETENTION_DAYS` hari (default 30).

## Panel role, sambutan, log moderasi
- **`/panel-role` (dev/admin):** mengirim panel tombol ambil/lepas role di channel tempat perintah dijalankan. Role yang belum ada dibuat otomatis. Role dikenali lewat **nama** (tanpa emoji): Programmer, Mobile Dev, Web Dev, FPS Player, Mobile Gamer, Santai & Survival. Role dengan izin berbahaya (Administrator, Manage Roles, Ban, dll.) tidak pernah diberikan lewat panel, dan role harus berada di bawah role NV Bot.
- **Sambutan:** saat ada member baru, bot mengirim kartu gambar + teks petunjuk di `WELCOME_CHANNEL_ID`. Matikan sambutan bot lain (mis. Koya) agar tidak dobel.
- **Log moderasi** ke `STAFF_LOG_CHANNEL_ID`: member masuk (menandai akun baru < 7 hari), keluar/kick/ban (beserta pelakunya), perubahan role (beserta pelakunya, perubahan dari panel tidak dicatat), pesan dihapus (isi pesan **tidak** dicatat).
- **Intent Server Members:** sambutan, log masuk/keluar, dan log role butuh intent privileged. Nyalakan di Developer Portal (Bot → Privileged Gateway Intents → Server Members Intent) lalu isi `MEMBER_EVENTS=on`. Tanpa itu bot tetap jalan normal; hanya log pesan dihapus yang aktif.
- **Izin bot yang dibutuhkan:** View Channels, Send Messages, Embed Links, Attach Files, Read Message History, Manage Roles, View Audit Log.

## Musik YouTube (Lavalink)

- Menjalankan: isi `MUSIC=on` dan `LAVALINK_PASSWORD` (acak, panjang) di `.env`, lalu `bash update.sh`.
- Perintah: `/play`, `/skip`, `/pause`, `/queue`, `/volume`, `/stop`. Pengguna harus berada di voice channel.
- Lavalink berjalan sebagai container `neverdie-lavalink` (tidak membuka port ke luar). Plugin YouTube diunduh otomatis saat pertama jalan (butuh internet).
- Jika YouTube mulai menolak (error "load_error"), perbarui versi `youtube-plugin` di `lavalink/application.yml`.
