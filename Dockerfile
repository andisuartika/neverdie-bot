FROM node:22-bookworm-slim
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

# Folder data (database SQLite) milik user non-root
RUN mkdir -p /data && chown node:node /data
ENV NODE_ENV=production TZ=Asia/Makassar
USER node

CMD ["node", "src/index.js"]
