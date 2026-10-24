FROM node:22-bookworm-slim
WORKDIR /app

# Font untuk kartu sambutan (gambar digambar di dalam bot)
RUN apt-get update \
 && apt-get install -y --no-install-recommends fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

# Folder data (database SQLite) milik user non-root
RUN mkdir -p /data && chown node:node /data
ENV NODE_ENV=production TZ=Asia/Makassar
USER node

CMD ["node", "src/index.js"]
