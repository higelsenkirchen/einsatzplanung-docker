/**
 * Zone-Konfiguration für Gelsenkirchen
 * Enthält Koordinaten, Postleitzahlen und Farben für alle Stadtteile
 */

const CITY_ZONES = [
    "Alt-/Neustadt", "Beckhausen", "Bismarck", "Buer", "Bulmke-Hüllen",
    "Erle", "Feldmark", "Hassel", "Heßler", "Horst", "Resser Mark",
    "Resse", "Rotthausen", "Schalke", "Scholven", "Ückendorf", "Außerhalb"
];

const ZONE_POSTAL_CODES = {
    "Alt-/Neustadt": "45879",
    "Beckhausen": "45899",
    "Bismarck": "45889",
    "Buer": "45894",
    "Bulmke-Hüllen": "45888",
    "Erle": "45891",
    "Feldmark": "45883",
    "Hassel": "45768",
    "Heßler": "45883",
    "Horst": "45899",
    "Resser Mark": "45892",
    "Resse": "45892",
    "Rotthausen": "45884",
    "Schalke": "45881",
    "Scholven": "45896",
    "Ückendorf": "45886",
    "Außerhalb": null
};

const ZONE_COLORS = {
    "Alt-/Neustadt": "#e11d48",
    "Beckhausen": "#b45309",
    "Bismarck": "#7c3aed",
    "Buer": "#0891b2",
    "Bulmke-Hüllen": "#059669",
    "Erle": "#16a34a",
    "Feldmark": "#65a30d",
    "Hassel": "#ca8a04",
    "Heßler": "#ea580c",
    "Horst": "#dc2626",
    "Resser Mark": "#9333ea",
    "Resse": "#2563eb",
    "Rotthausen": "#c026d3",
    "Schalke": "#0284c7",
    "Scholven": "#4f46e5",
    "Ückendorf": "#0d9488",
    "Außerhalb": "#525252"
};

// Relative Koordinaten für Distanzberechnung
// Format: [x, y] wobei x=West-Ost, y=Süd-Nord
const ZONE_COORDINATES = {
    "Alt-/Neustadt": [4, 3.5],
    "Beckhausen": [3.5, 8],
    "Bismarck": [4, 5],
    "Buer": [5, 8],
    "Bulmke-Hüllen": [6, 4],
    "Erle": [6, 6],
    "Feldmark": [4, 4],
    "Hassel": [3, 8],
    "Heßler": [3, 3],
    "Horst": [2, 5],
    "Resser Mark": [6, 9],
    "Resse": [4, 9],
    "Rotthausen": [7, 2],
    "Schalke": [5, 5],
    "Scholven": [2, 8],
    "Ückendorf": [6, 3],
    "Außerhalb": [5, 5]
};

// Distanz zwischen zwei Zonen berechnen (in km, approximiert)
function getZoneDistance(zone1, zone2) {
    if (!zone1 || !zone2) return 5;
    if (zone1 === zone2) return 1;
    if (zone1 === "Außerhalb" || zone2 === "Außerhalb") return 8;
    
    const c1 = ZONE_COORDINATES[zone1];
    const c2 = ZONE_COORDINATES[zone2];
    if (!c1 || !c2) return 5;
    
    const dx = c1[0] - c2[0];
    const dy = c1[1] - c2[1];
    const dist = Math.sqrt(dx * dx + dy * dy) * 1.2;
    
    return Math.round(dist * 10) / 10;
}

// Fahrzeit berechnen (bei durchschnittlich 25 km/h)
function getZoneTravelTime(zone1, zone2, speedKmH = 25) {
    const dist = getZoneDistance(zone1, zone2);
    const timeHours = dist / speedKmH;
    const timeMinutes = Math.round(timeHours * 60);
    return Math.max(timeMinutes, 3);
}

// Zone anhand PLZ ermitteln
function getZoneFromPostalCode(postalCode) {
    if (!postalCode) return null;
    const normalized = String(postalCode).trim();
    
    // Spezielle PLZ-Zuordnungen (mehrere PLZ pro Zone)
    const additionalPLZMapping = {
        "45897": "Buer"  // 45897 gehört auch zu Buer (wie 45894)
    };
    
    // Prüfe zuerst spezielle Zuordnungen
    if (additionalPLZMapping[normalized]) {
        return additionalPLZMapping[normalized];
    }
    
    for (const [zone, plz] of Object.entries(ZONE_POSTAL_CODES)) {
        if (plz && String(plz).trim() === normalized) {
            return zone;
        }
    }
    return null;
}

module.exports = {
    CITY_ZONES,
    ZONE_POSTAL_CODES,
    ZONE_COLORS,
    ZONE_COORDINATES,
    getZoneDistance,
    getZoneTravelTime,
    getZoneFromPostalCode
};

