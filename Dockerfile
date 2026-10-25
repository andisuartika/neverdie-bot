FROM node:22-bookworm-slim
WORKDIR /app

# Font untuk kartu sambutan (gambar digambar di dalam bot)
# Musik: ffmpeg + python3 (menjalankan yt-dlp) + curl (mengunduh yt-dlp)
RUN apt-get update \
 && apt-get install -y --no-install-recommends fonts-dejavu-core ffmpeg python3 curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# yt-dlp versi terbaru. YTDLP_REFRESH berubah tiap update.sh supaya lapisan ini diunduh ulang
# (YouTube sering berubah; yt-dlp diperbarui hampir setiap hari).
ARG YTDLP_REFRESH=0
RUN echo "yt-dlp refresh: $YTDLP_REFRESH" \
 && curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
 && chmod 755 /usr/local/bin/yt-dlp \
 && python3 /usr/local/bin/yt-dlp --version

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

# Folder data (database SQLite) milik user non-root
RUN mkdir -p /data && chown node:node /data
ENV NODE_ENV=production TZ=Asia/Makassar PYTHONDONTWRITEBYTECODE=1
USER node

CMD ["node", "src/index.js"]
