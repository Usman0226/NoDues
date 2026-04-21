FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install build dependencies if any (none currently needed for native modules in NoDues)
# COPY package*.json ./
# RUN npm ci

# Production stage
FROM node:20-bookworm-slim

# Create a non-privileged user to run the app
RUN groupadd -r nodues && useradd -r -g nodues -s /sbin/nologin nodues

WORKDIR /app

# Ensure logs directory exists and is writable
RUN mkdir -p logs && chown -R nodues:nodues /app

# Copy dependency manifests
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

COPY . .

# Set specific permissions for security
RUN chown -R nodues:nodues /app

# Use the non-root user
USER nodues

# ENV Defaults
ENV NODE_ENV=production
ENV PORT=5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:5000/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

EXPOSE 5000

CMD ["node", "--max-old-space-size=3072", "server.js"]