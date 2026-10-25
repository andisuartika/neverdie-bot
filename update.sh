#!/usr/bin/env bash
# Jalankan di server: ./update.sh
# Menarik kode terbaru, membangun ulang, lalu mendaftarkan slash command.
set -euo pipefail
cd "$(dirname "$0")"

git pull --ff-only
# Unduh yt-dlp terbaru setiap update (YouTube sering berubah)
sudo env YTDLP_REFRESH="$(date +%s)" docker compose up -d --build --remove-orphans
sleep 3
sudo docker exec neverdie-bot node src/deploy-commands.js
sudo docker compose logs --tail 5
