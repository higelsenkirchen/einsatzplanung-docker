FROM node:18-alpine

WORKDIR /app

# Kopiere package files (für besseres Caching)
COPY package*.json ./

# Installiere Dependencies (bcryptjs benötigt keine native Kompilierung)
# --no-optional überspringt Puppeteer
RUN npm install --production --no-optional && \
    npm cache clean --force

# Kopiere Anwendungsdateien
COPY server.js ./
COPY routes ./routes
COPY db ./db
COPY scripts ./scripts

# Exponiere Port
EXPOSE 3000

# Starte Server
CMD ["node", "server.js"]
