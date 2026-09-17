# ── Backend Production Dockerfile ────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

# Install dependencies (only production deps for lightweight image)
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
