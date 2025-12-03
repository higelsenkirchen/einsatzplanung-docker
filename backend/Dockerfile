FROM node:18-alpine

WORKDIR /app

# Kopiere package files
COPY package*.json ./

# Installiere Dependencies
RUN npm install --production

# Kopiere Anwendungscode
COPY . .

# Exponiere Port
EXPOSE 3000

# Starte Server
CMD ["node", "server.js"]




