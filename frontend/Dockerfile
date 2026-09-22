# ── Stage 1: Build Frontend ─────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency manifests and install dependencies
COPY package*.json ./
RUN npm install

# Copy full frontend source code
COPY . .

# Build Arguments for environment configuration at build time
ARG VITE_API_URL=http://localhost:5000
ARG VITE_SOCKET_URL=http://localhost:5000

ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_SOCKET_URL=${VITE_SOCKET_URL}

# Build production bundle
RUN npm run build

# ── Stage 2: Production Runner ──────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5173
ENV HOST=0.0.0.0

COPY --from=builder /app /app

EXPOSE 5173

# Serve production build across all container interfaces
CMD ["node", ".output/server/index.mjs"]
