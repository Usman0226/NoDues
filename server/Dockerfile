FROM node:20-bookworm-slim AS builder

WORKDIR /app

FROM node:20-bookworm-slim

RUN groupadd -r nodues && useradd -r -g nodues -s /sbin/nologin nodues

WORKDIR /app

RUN mkdir -p logs && chown -R nodues:nodues /app

COPY package*.json ./

RUN npm ci --only=production && npm cache clean --force

COPY . .

RUN chown -R nodues:nodues /app

USER nodues

ENV NODE_ENV=production
ENV PORT=5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:5000/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

EXPOSE 5000

CMD ["node", "--max-old-space-size=1024", "server.js"]