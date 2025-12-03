# Portainer Deployment Anleitung

## Problem: Backend-Container findet server.js nicht

Wenn der Backend-Container den Fehler `Cannot find module '/app/server.js'` zeigt, liegt das Problem beim Build.

## Lösung 1: Stack komplett neu erstellen

1. **Alten Stack löschen:**
   - Portainer → Stacks → einsatzplanung → "Remove"

2. **Neuen Stack erstellen:**
   - Portainer → Stacks → "Add stack"
   - Name: `einsatzplanung`
   - Repository: `https://github.com/higelsenkirchen/einsatzplanung-docker.git`
   - Branch: `main`
   - Compose-Datei: `docker-compose.portainer.yml` (WICHTIG!)
   - Environment file: `stack.env` (optional)
   - **"Build method" aktivieren:** "Build the image"
   - **"Always pull the image" aktivieren:** Ja
   - **"Rebuild" aktivieren:** Ja

3. **Umgebungsvariablen setzen:**
   ```
   DB_NAME=einsatzplanung
   DB_USER=postgres
   DB_PASSWORD=DEIN_SICHERES_PASSWORT
   DB_PORT=5432
   FRONTEND_PORT=80
   BACKEND_PORT=3000
   ```

4. **Deploy klicken**

## Lösung 2: Build-Logs prüfen

1. **In Portainer:**
   - Stacks → einsatzplanung → Backend-Container → "Logs"
   - Suche nach Debug-Ausgaben:
     - `=== Build context check ===`
     - `✅ server.js found` oder `❌ server.js NOT FOUND!`

2. **Wenn `❌ server.js NOT FOUND!`:**
   - Der Build-Kontext ist falsch
   - Portainer findet die Dateien nicht
   - Siehe Lösung 3

## Lösung 3: Manuelles Build auf dem Server

Falls Portainer die Dateien nicht richtig kopiert:

1. **SSH auf den Server:**
   ```bash
   ssh georg@192.168.86.44
   ```

2. **Repository klonen/aktualisieren:**
   ```bash
   cd /opt
   git clone https://github.com/higelsenkirchen/einsatzplanung-docker.git
   # Oder falls bereits vorhanden:
   cd einsatzplanung-docker
   git pull
   ```

3. **Images manuell bauen:**
   ```bash
   cd einsatzplanung-docker
   docker-compose -f docker-compose.portainer.yml build --no-cache backend
   docker-compose -f docker-compose.portainer.yml build --no-cache frontend
   ```

4. **Stack in Portainer mit lokal gebauten Images:**
   - Verwende `image:` statt `build:` in docker-compose.yml
   - Oder: Stack neu deployen, Portainer sollte die lokal gebauten Images finden

## Lösung 4: Prüfe ob alle Dateien im Repository sind

```bash
# Lokal prüfen:
git ls-files backend/ | grep -E "server.js|package.json|Dockerfile"

# Sollte zeigen:
# backend/Dockerfile
# backend/package.json
# backend/server.js
# backend/routes/api.js
# backend/db/connection.js
# etc.
```

## Wichtigste Punkte:

1. ✅ Verwende `docker-compose.portainer.yml` (ohne Volume-Mounts)
2. ✅ Aktiviere "Build the image" in Portainer
3. ✅ Aktiviere "Always pull the image"
4. ✅ Aktiviere "Rebuild"
5. ✅ Prüfe Build-Logs auf Debug-Ausgaben

## Debug-Befehle:

**Auf dem Server (SSH):**
```bash
# Container-Status prüfen
docker ps -a | grep einsatzplanung

# Backend-Logs prüfen
docker logs einsatzplanung-backend --tail 100

# In Backend-Container schauen
docker exec -it einsatzplanung-backend sh
ls -la /app/
```

**In Portainer:**
- Stacks → einsatzplanung → Backend-Container → "Logs"
- Stacks → einsatzplanung → Backend-Container → "Inspect" → "Logs"

