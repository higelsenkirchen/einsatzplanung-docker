FROM node:18-alpine

WORKDIR /app

# Zeige Build-Kontext (Debug)
RUN echo "=== Build context check ===" && \
    ls -la /app/ 2>/dev/null || echo "No files in /app yet"

# Kopiere package files
COPY package*.json ./

# Installiere Dependencies
RUN npm install --production

# Zeige was nach package.json copy vorhanden ist
RUN echo "=== After package.json copy ===" && \
    ls -la /app/

# Kopiere Dateien Schritt für Schritt mit expliziten Pfaden
COPY server.js /app/server.js
COPY routes /app/routes
COPY middleware /app/middleware
COPY db /app/db
COPY scripts /app/scripts

# Verifiziere dass alle Dateien vorhanden sind
RUN echo "=== Final verification ===" && \
    ls -la /app/ && \
    echo "=== Checking server.js ===" && \
    test -f /app/server.js && echo "✅ server.js found" || (echo "❌ server.js NOT FOUND!" && ls -la /app/ && exit 1) && \
    echo "=== Checking routes ===" && \
    test -d /app/routes && echo "✅ routes directory found" || (echo "❌ routes directory NOT FOUND!" && exit 1) && \
    echo "=== Checking middleware ===" && \
    test -d /app/middleware && echo "✅ middleware directory found" || (echo "❌ middleware directory NOT FOUND!" && exit 1) && \
    echo "=== Checking db ===" && \
    test -d /app/db && echo "✅ db directory found" || (echo "❌ db directory NOT FOUND!" && exit 1) && \
    echo "✅✅✅ All files verified successfully!"

# Exponiere Port
EXPOSE 3000

# Starte Server
CMD ["node", "server.js"]
