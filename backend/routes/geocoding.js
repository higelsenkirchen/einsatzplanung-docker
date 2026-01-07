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
        
        while (retries <= maxRetries && !coordinates) {
            try {
                coordinates = await geocodeWithNominatim(query);
                if (coordinates) break;
            } catch (error) {
                retries++;
                if (retries <= maxRetries) {
                    console.log(`Geocoding Retry ${retries}/${maxRetries} für: ${query}`);
                    // Warte länger bei Retry
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } else {
                    console.error(`Geocoding fehlgeschlagen nach ${maxRetries} Versuchen:`, error.message);
                }
            }
        }
        
        if (coordinates) {
            res.json({
                success: true,
                latitude: parseFloat(coordinates.lat),
                longitude: parseFloat(coordinates.lon),
                displayName: coordinates.display_name || query
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'Adresse konnte nicht gefunden werden'
            });
        }
    } catch (error) {
        console.error('Geocoding-Fehler:', error);
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
                'User-Agent': 'Einsatzplanung-App/1.0 (contact@example.com)', // Nominatim erfordert User-Agent
                'Accept': 'application/json'
            }
        };
        
        https.get(url, options, (res) => {
            // Prüfe Status-Code
            if (res.statusCode !== 200) {
                return reject(new Error(`Nominatim API Fehler: HTTP ${res.statusCode}`));
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
                'User-Agent': 'Einsatzplanung-App/1.0 (contact@example.com)',
                'Accept': 'application/json'
            }
        };
        
        https.get(url, options, (res) => {
            // Prüfe Status-Code
            if (res.statusCode !== 200) {
                return reject(new Error(`Nominatim API Fehler: HTTP ${res.statusCode}`));
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
