const express = require('express');
const router = express.Router();
const https = require('https');

// Rate-Limiting für Nominatim (1 Request/Sekunde)
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1100; // 1.1 Sekunden (etwas mehr als 1 Sekunde für Sicherheit)

// Warteschlange für Requests
const requestQueue = [];
let isProcessingQueue = false;

// POST /api/geocoding/geocode - Geocodiert eine Adresse zu Koordinaten
router.post('/geocode', async (req, res) => {
    try {
        const { address, postalCode, city } = req.body;
        const startedAt = Date.now();
        // #region agent log
        try {
            if (typeof fetch === 'function') {
                fetch('http://127.0.0.1:7242/ingest/f1c269df-a93b-40b7-9510-757883530d86',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'geocode-backend-pre',hypothesisId:'BG1',location:'backend/routes/geocoding.js:/geocode',message:'geocode request received',data:{hasAddress:!!address,hasPostal:!!postalCode,addressLen:address?String(address).length:0,postalLen:postalCode?String(postalCode).length:0,hasCity:!!city},timestamp:Date.now()})}).catch(()=>{});
            }
        } catch (_) {}
        // #endregion agent log
        
        if (!address && !postalCode) {
            return res.status(400).json({ error: 'Adresse oder Postleitzahl erforderlich' });
        }
        
        // Baue Suchstring für Nominatim
        const searchParts = [];
        if (address) searchParts.push(address);
        if (postalCode) searchParts.push(postalCode);
        if (city) searchParts.push(city);
        else searchParts.push('Gelsenkirchen'); // Default-Stadt
        
        const query = searchParts.join(' ');
        
        // Rate-Limiting: Warte falls nötig
        await waitForRateLimit();
        
        // Nominatim API aufrufen (mit Retry bei Fehler)
        let coordinates = null;
        let retries = 0;
        const maxRetries = 2;
        let lastError = null;
        
        while (retries <= maxRetries && !coordinates) {
            try {
                coordinates = await geocodeWithNominatim(query);
                if (coordinates) break;
            } catch (error) {
                lastError = error;
                retries++;
                
                // Bei HTTP 403 (Forbidden) nicht retry - das würde nur mehr Blockierungen verursachen
                if (error.message.includes('HTTP 403')) {
                    console.error('Geocoding HTTP 403 - keine Retries, um weitere Blockierungen zu vermeiden');
                    break;
                }
                
                if (retries <= maxRetries) {
                    console.log(`Geocoding Retry ${retries}/${maxRetries} für: ${query}`);
                    // Warte länger bei Retry (exponentielles Backoff)
                    await new Promise(resolve => setTimeout(resolve, 2000 * retries));
                } else {
                    console.error(`Geocoding fehlgeschlagen nach ${maxRetries} Versuchen:`, error.message);
                }
            }
        }
        
        if (coordinates) {
            // #region agent log
            try {
                if (typeof fetch === 'function') {
                    fetch('http://127.0.0.1:7242/ingest/f1c269df-a93b-40b7-9510-757883530d86',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'geocode-backend-pre',hypothesisId:'BG2',location:'backend/routes/geocoding.js:/geocode',message:'geocode success',data:{durationMs:Date.now()-startedAt,hasDisplayName:!!coordinates.display_name},timestamp:Date.now()})}).catch(()=>{});
                }
            } catch (_) {}
            // #endregion agent log
            res.json({
                success: true,
                latitude: parseFloat(coordinates.lat),
                longitude: parseFloat(coordinates.lon),
                displayName: coordinates.display_name || query
            });
        } else {
            // Prüfe ob es ein HTTP 403 Fehler war
            const isForbidden = lastError && lastError.message && lastError.message.includes('HTTP 403');
            // #region agent log
            try {
                if (typeof fetch === 'function') {
                    fetch('http://127.0.0.1:7242/ingest/f1c269df-a93b-40b7-9510-757883530d86',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'geocode-backend-pre',hypothesisId:'BG3',location:'backend/routes/geocoding.js:/geocode',message:'geocode failed',data:{durationMs:Date.now()-startedAt,isForbidden:!!isForbidden,hasLastError:!!lastError,lastErrorMsg:lastError?String(lastError.message).slice(0,120):null},timestamp:Date.now()})}).catch(()=>{});
                }
            } catch (_) {}
            // #endregion agent log
            res.status(isForbidden ? 429 : 404).json({
                success: false,
                error: isForbidden 
                    ? 'Nominatim API blockiert Anfrage. Bitte warten Sie einige Minuten und versuchen Sie es erneut.'
                    : 'Adresse konnte nicht gefunden werden'
            });
        }
    } catch (error) {
        console.error('Geocoding-Fehler:', error);
        // #region agent log
        try {
            if (typeof fetch === 'function') {
                fetch('http://127.0.0.1:7242/ingest/f1c269df-a93b-40b7-9510-757883530d86',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'geocode-backend-pre',hypothesisId:'BG4',location:'backend/routes/geocoding.js:/geocode',message:'geocode threw (500)',data:{error:String(error?.message||error).slice(0,160)},timestamp:Date.now()})}).catch(()=>{});
            }
        } catch (_) {}
        // #endregion agent log
        res.status(500).json({
            success: false,
            error: 'Fehler beim Geocoding',
            details: error.message
        });
    }
});

// GET /api/geocoding/reverse - Reverse Geocoding (Koordinaten → Adresse)
router.get('/reverse', async (req, res) => {
    try {
        const lat = parseFloat(req.query.lat);
        const lng = parseFloat(req.query.lng);
        
        if (isNaN(lat) || isNaN(lng)) {
            return res.status(400).json({ error: 'Ungültige Koordinaten' });
        }
        
        // Rate-Limiting
        await waitForRateLimit();
        
        // Reverse Geocoding mit Nominatim
        const address = await reverseGeocodeWithNominatim(lat, lng);
        
        if (address) {
            res.json({
                success: true,
                address: address.display_name,
                latitude: lat,
                longitude: lng
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'Adresse für Koordinaten konnte nicht gefunden werden'
            });
        }
    } catch (error) {
        console.error('Reverse Geocoding-Fehler:', error);
        res.status(500).json({
            success: false,
            error: 'Fehler beim Reverse Geocoding',
            details: error.message
        });
    }
});

// Nominatim Geocoding-Funktion
function geocodeWithNominatim(query) {
    return new Promise((resolve, reject) => {
        const encodedQuery = encodeURIComponent(query);
        const url = `https://nominatim.openstreetmap.org/search?q=${encodedQuery}&format=json&limit=1&addressdetails=1&countrycodes=de`;
        
        const options = {
            headers: {
                // Nominatim erfordert einen gültigen User-Agent mit Kontakt-E-Mail
                'User-Agent': 'Einsatzplanung-App/1.0 (https://github.com/higelsenkirchen/einsatzplanung-docker)',
                'Accept': 'application/json',
                'Accept-Language': 'de-DE,de;q=0.9'
            }
        };
        
        https.get(url, options, (res) => {
            // Prüfe Status-Code
            if (res.statusCode === 403) {
                let errorData = '';
                res.on('data', (chunk) => {
                    errorData += chunk.toString();
                });
                res.on('end', () => {
                    console.error('Nominatim API HTTP 403 (Forbidden):', errorData.substring(0, 500));
                    reject(new Error('Nominatim API blockiert Anfrage (HTTP 403). Mögliche Ursachen: Rate-Limiting überschritten oder User-Agent nicht akzeptiert.'));
                });
                return;
            }
            
            if (res.statusCode !== 200) {
                let errorData = '';
                res.on('data', (chunk) => {
                    errorData += chunk.toString();
                });
                res.on('end', () => {
                    console.error(`Nominatim API HTTP ${res.statusCode}:`, errorData.substring(0, 500));
                    reject(new Error(`Nominatim API Fehler: HTTP ${res.statusCode}`));
                });
                return;
            }
            
            // Prüfe Content-Type
            const contentType = res.headers['content-type'] || '';
            if (!contentType.includes('application/json')) {
                let errorData = '';
                res.on('data', (chunk) => {
                    errorData += chunk.toString();
                });
                res.on('end', () => {
                    console.error('Nominatim API hat HTML statt JSON zurückgegeben:', errorData.substring(0, 200));
                    reject(new Error(`Nominatim API hat ungültigen Content-Type zurückgegeben: ${contentType}`));
                });
                return;
            }
            
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    // Prüfe ob Daten leer sind
                    if (!data || data.trim().length === 0) {
                        return resolve(null);
                    }
                    
                    // Prüfe ob es HTML ist (beginnt mit <)
                    if (data.trim().startsWith('<')) {
                        console.error('Nominatim API hat HTML zurückgegeben:', data.substring(0, 200));
                        return reject(new Error('Nominatim API hat HTML statt JSON zurückgegeben'));
                    }
                    
                    const results = JSON.parse(data);
                    if (results && results.length > 0) {
                        resolve(results[0]);
                    } else {
                        resolve(null);
                    }
                } catch (error) {
                    console.error('JSON Parse Fehler:', error.message);
                    console.error('Daten:', data.substring(0, 200));
                    reject(new Error(`JSON Parse Fehler: ${error.message}`));
                }
            });
        }).on('error', (error) => {
            reject(error);
        });
    });
}

// Reverse Geocoding-Funktion
function reverseGeocodeWithNominatim(lat, lng) {
    return new Promise((resolve, reject) => {
        const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`;
        
        const options = {
            headers: {
                // Nominatim erfordert einen gültigen User-Agent mit Kontakt-E-Mail
                'User-Agent': 'Einsatzplanung-App/1.0 (https://github.com/higelsenkirchen/einsatzplanung-docker)',
                'Accept': 'application/json',
                'Accept-Language': 'de-DE,de;q=0.9'
            }
        };
        
        https.get(url, options, (res) => {
            // Prüfe Status-Code
            if (res.statusCode === 403) {
                let errorData = '';
                res.on('data', (chunk) => {
                    errorData += chunk.toString();
                });
                res.on('end', () => {
                    console.error('Nominatim API HTTP 403 (Forbidden):', errorData.substring(0, 500));
                    reject(new Error('Nominatim API blockiert Anfrage (HTTP 403). Mögliche Ursachen: Rate-Limiting überschritten oder User-Agent nicht akzeptiert.'));
                });
                return;
            }
            
            if (res.statusCode !== 200) {
                let errorData = '';
                res.on('data', (chunk) => {
                    errorData += chunk.toString();
                });
                res.on('end', () => {
                    console.error(`Nominatim API HTTP ${res.statusCode}:`, errorData.substring(0, 500));
                    reject(new Error(`Nominatim API Fehler: HTTP ${res.statusCode}`));
                });
                return;
            }
            
            // Prüfe Content-Type
            const contentType = res.headers['content-type'] || '';
            if (!contentType.includes('application/json')) {
                let errorData = '';
                res.on('data', (chunk) => {
                    errorData += chunk.toString();
                });
                res.on('end', () => {
                    console.error('Nominatim API hat HTML statt JSON zurückgegeben:', errorData.substring(0, 200));
                    reject(new Error(`Nominatim API hat ungültigen Content-Type zurückgegeben: ${contentType}`));
                });
                return;
            }
            
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    // Prüfe ob Daten leer sind
                    if (!data || data.trim().length === 0) {
                        return resolve(null);
                    }
                    
                    // Prüfe ob es HTML ist (beginnt mit <)
                    if (data.trim().startsWith('<')) {
                        console.error('Nominatim API hat HTML zurückgegeben:', data.substring(0, 200));
                        return reject(new Error('Nominatim API hat HTML statt JSON zurückgegeben'));
                    }
                    
                    const result = JSON.parse(data);
                    if (result && result.display_name) {
                        resolve(result);
                    } else {
                        resolve(null);
                    }
                } catch (error) {
                    console.error('JSON Parse Fehler:', error.message);
                    console.error('Daten:', data.substring(0, 200));
                    reject(new Error(`JSON Parse Fehler: ${error.message}`));
                }
            });
        }).on('error', (error) => {
            reject(error);
        });
    });
}

// Rate-Limiting: Wartet bis nächster Request möglich ist
function waitForRateLimit() {
    return new Promise((resolve) => {
        const now = Date.now();
        const timeSinceLastRequest = now - lastRequestTime;
        
        if (timeSinceLastRequest >= MIN_REQUEST_INTERVAL) {
            lastRequestTime = now;
            resolve();
        } else {
            const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
            // Log nur wenn Wartezeit > 100ms
            if (waitTime > 100) {
                console.log(`Rate-Limiting: Warte ${waitTime}ms...`);
            }
            setTimeout(() => {
                lastRequestTime = Date.now();
                resolve();
            }, waitTime);
        }
    });
}

module.exports = router;




