FROM node:18-alpine

WORKDIR /app

# Kopiere package files (für besseres Caching)
COPY package*.json ./

# Installiere Dependencies (ohne Puppeteer für schnellere Builds)
# Puppeteer wird optional installiert wenn PDF-Export benötigt wird
RUN npm install --production --ignore-scripts && \
    npm cache clean --force

# Kopiere Anwendungsdateien
COPY server.js ./
COPY routes ./routes
COPY middleware ./middleware
COPY db ./db
COPY scripts ./scripts

# Exponiere Port
EXPOSE 3000

# Starte Server
CMD ["node", "server.js"]
