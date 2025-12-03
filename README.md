# Tourenplanung - Docker Setup

Webbasierte Tourenplanungs-Anwendung für Pflegedienste, läuft auf Docker mit PostgreSQL-Datenbank.

## Voraussetzungen

- Docker und Docker Compose installiert
- Ubuntu Server (oder ähnliches Linux-System)

## Installation

### 1. Repository klonen oder Dateien kopieren

```bash
cd Einsatzplanung-Docker
```

### 2. Umgebungsvariablen konfigurieren

```bash
cp .env.example .env
```

Bearbeite `.env` und passe die Werte an (insbesondere `DB_PASSWORD`).

### 3. Docker-Container starten

```bash
docker-compose up -d
```

Dies startet:
- PostgreSQL Datenbank (Port 5432)
- Backend API (Port 3000)
- Frontend Nginx (Port 80)

### 4. Datenbank initialisieren

Die Datenbank wird automatisch beim ersten Start initialisiert. Das Schema wird von `backend/db/schema.sql` erstellt.

### 5. Bestehende Daten migrieren (optional)

Falls du bestehende Daten aus `PflegePlan.sync.json` importieren möchtest:

```bash
# Daten in Container kopieren (falls nötig)
docker cp PflegePlan.sync.json tourenplanung-backend:/app/

# Migration ausführen
docker exec -it tourenplanung-backend node /app/scripts/migrate.js /app/PflegePlan.sync.json
```

Oder lokal (wenn PostgreSQL lokal läuft):

```bash
cd backend
npm install
node scripts/migrate.js ../PflegePlan.sync.json
```

## Zugriff

- **Frontend**: http://localhost (oder http://[SERVER-IP])
- **Backend API**: http://localhost:3000/api
- **Health Check**: http://localhost/api/health

## Docker-Befehle

### Container starten
```bash
docker-compose up -d
```

### Container stoppen
```bash
docker-compose down
```

### Logs anzeigen
```bash
# Alle Services
docker-compose logs -f

# Nur Backend
docker-compose logs -f backend

# Nur Frontend
docker-compose logs -f frontend

# Nur Datenbank
docker-compose logs -f db
```

### Container neu bauen
```bash
docker-compose build
docker-compose up -d
```

### Datenbank-Backup erstellen
```bash
docker exec tourenplanung-db pg_dump -U postgres tourenplanung > backup.sql
```

### Datenbank-Backup wiederherstellen
```bash
docker exec -i tourenplanung-db psql -U postgres tourenplanung < backup.sql
```

## API-Endpunkte

- `GET /api/data` - Lädt alle App-Daten
- `PUT /api/data` - Speichert alle App-Daten
- `GET /api/backup` - Erstellt Backup
- `POST /api/backup/restore` - Stellt Backup wieder her
- `GET /api/health` - Health Check

## Datenstruktur

Die Anwendung speichert folgende Daten:
- **Events**: Termine/Einsätze
- **Pool**: Pool-Einträge
- **Employees**: Mitarbeiter
- **Tours**: Touren
- **Wage Settings**: Lohnkonfiguration
- **Favorites**: Favoriten

## Troubleshooting

### Backend startet nicht
- Prüfe Logs: `docker-compose logs backend`
- Stelle sicher, dass die Datenbank läuft: `docker-compose ps`
- Prüfe Umgebungsvariablen in `.env`

### Frontend kann Backend nicht erreichen
- Prüfe, ob Backend läuft: `docker-compose ps`
- Prüfe Nginx-Logs: `docker-compose logs frontend`
- Prüfe Netzwerk: `docker network inspect tourenplanung-docker_tourenplanung-network`

### Datenbank-Verbindungsfehler
- Prüfe DB-Logs: `docker-compose logs db`
- Stelle sicher, dass DB-Passwort in `.env` korrekt ist
- Prüfe, ob DB-Container läuft: `docker-compose ps db`

## Entwicklung

### Backend lokal entwickeln

```bash
cd backend
npm install
npm run dev  # Mit nodemon für Auto-Reload
```

### Frontend lokal testen

```bash
cd frontend
# Nginx lokal starten oder einfachen HTTP-Server verwenden
python -m http.server 8000
```

## Backup & Restore

### Automatisches Backup über API

```bash
curl http://localhost/api/backup > backup.json
```

### Backup wiederherstellen

```bash
curl -X POST http://localhost/api/backup/restore \
  -H "Content-Type: application/json" \
  -d @backup.json
```

## Sicherheit

⚠️ **Wichtig**: Ändere das Standard-Passwort in `.env` vor dem produktiven Einsatz!

Für Produktion:
- Verwende starke Passwörter
- Aktiviere SSL/TLS (Reverse Proxy mit Let's Encrypt)
- Beschränke Netzwerk-Zugriff
- Regelmäßige Backups

## Support

Bei Problemen:
1. Prüfe die Logs: `docker-compose logs`
2. Prüfe Container-Status: `docker-compose ps`
3. Prüfe Netzwerk: `docker network ls`




