# ========================================
# Stage 1: Builder
# ========================================
FROM node:18-alpine AS builder

WORKDIR /app

# Kopiere package files
COPY package*.json ./

# Installiere Dependencies (nur Production)
RUN npm ci --only=production --no-optional && \
    npm cache clean --force

# ========================================
# Stage 2: Production
# ========================================
FROM node:18-alpine

WORKDIR /app

# Sicherheit: Nicht als root laufen
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Kopiere node_modules vom Builder
COPY --from=builder /app/node_modules ./node_modules

# Kopiere Anwendungsdateien
COPY server.js ./
COPY routes ./routes
COPY db ./db
COPY scripts ./scripts
COPY middleware ./middleware
COPY utils ./utils
COPY config ./config

# Setze Besitzer
RUN chown -R nodejs:nodejs /app

# Wechsle zu non-root User
USER nodejs

# Exponiere Port
EXPOSE 3000

# Health Check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Starte Server
CMD ["node", "server.js"]
