FROM node:18-alpine

WORKDIR /app

# Kopiere package files
COPY package*.json ./

# Installiere Dependencies
RUN npm install --production

# Kopiere Anwendungscode - verwende COPY . . um sicherzustellen dass alles kopiert wird
COPY . .

# Prüfe ob server.js vorhanden ist (für Debugging)
RUN ls -la /app/ || echo "Files in /app:"

# Exponiere Port
EXPOSE 3000

# Starte Server
CMD ["node", "server.js"]




