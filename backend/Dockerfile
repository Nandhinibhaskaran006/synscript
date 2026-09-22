# ── Backend Production Dockerfile ────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

# Install native build tools (for node-pty) and interactive shell utilities (bash, python3, coreutils)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    gcc \
    linux-headers \
    bash \
    coreutils \
    git \
    && ln -sf /usr/bin/python3 /usr/bin/python

# Install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source code
COPY . .

# Environment Defaults
ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

# Run the backend server
CMD ["node", "src/server.js"]
