FROM node:18-alpine

WORKDIR /app

# Kopiere package files
COPY package*.json ./

# Installiere Dependencies
RUN npm install --production

# Kopiere ALLE Dateien (außer die in .dockerignore)
COPY . .

# Debug: Zeige alle Dateien im Container
RUN echo "=== Files in /app ===" && \
    ls -la /app/ && \
    echo "=== Checking server.js ===" && \
    test -f /app/server.js && echo "✅ server.js found" || echo "❌ server.js NOT FOUND" && \
    echo "=== Checking routes ===" && \
    ls -la /app/routes/ || echo "❌ routes directory NOT FOUND" && \
    echo "=== Checking db ===" && \
    ls -la /app/db/ || echo "❌ db directory NOT FOUND"

# Exponiere Port
EXPOSE 3000

# Starte Server
CMD ["node", "server.js"]
