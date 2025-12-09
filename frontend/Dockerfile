FROM nginx:alpine

# Installiere wget für Health-Check
RUN apk add --no-cache wget

# Kopiere HTML-Datei
COPY index.html /usr/share/nginx/html/

# Kopiere Nginx-Konfiguration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Exponiere Port 80
EXPOSE 80

# Nginx startet automatisch




