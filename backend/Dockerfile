FROM node:18-alpine

WORKDIR /app

# Kopiere package files
COPY package*.json ./

# Installiere Dependencies
RUN npm install --production

# Kopiere Anwendungscode (explizit alle notwendigen Dateien)
COPY server.js ./
COPY routes/ ./routes/
COPY db/ ./db/
COPY scripts/ ./scripts/

# Exponiere Port
EXPOSE 3000

# Starte Server
CMD ["node", "server.js"]




