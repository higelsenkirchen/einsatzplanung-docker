FROM node:18-alpine

WORKDIR /app

# Kopiere package files
COPY package*.json ./

# Installiere Dependencies
RUN npm install --production

# Kopiere Dateien Schritt für Schritt mit expliziten Pfaden
COPY server.js /app/server.js
COPY routes /app/routes
COPY db /app/db
COPY scripts /app/scripts

# Verifiziere dass alle Dateien vorhanden sind
RUN test -f /app/server.js || (echo "ERROR: server.js not found!" && exit 1) && \
    test -d /app/routes || (echo "ERROR: routes directory not found!" && exit 1) && \
    test -d /app/db || (echo "ERROR: db directory not found!" && exit 1) && \
    echo "✅ All files copied successfully"

# Exponiere Port
EXPOSE 3000

# Starte Server
CMD ["node", "server.js"]
