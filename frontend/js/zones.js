/* ==============================================
   ZONES.JS - Zonen-Konfiguration für Gelsenkirchen
   ============================================== */

// CITY_ZONES, ZONE_POSTAL_CODES, ZONE_COLORS werden jetzt in config.js definiert

// Hilfsfunktion: Gibt Zone mit PLZ zurück (falls vorhanden)
function getZoneWithPostalCode(zone) {
    if(!zone || zone === "Außerhalb") return zone;
    
    // Spezielle Behandlung für Zonen mit mehreren PLZ
    if (zone === "Buer") {
        return "Buer (45894, 45897)";
    }
    
    if (typeof ZONE_POSTAL_CODES === 'undefined') {
        return zone;
    }
    
    const plz = ZONE_POSTAL_CODES[zone];
    return plz ? `${zone} (${plz})` : zone;
}

// Hilfsfunktion: Mappt PLZ zu Zone (umgekehrtes Mapping)
function getZoneFromPostalCode(postalCode) {
    if(!postalCode) return null;
    // Normalisiere PLZ (entferne Leerzeichen, konvertiere zu String)
    const normalizedPLZ = String(postalCode).trim();
    
    // Spezielle PLZ-Zuordnungen (mehrere PLZ pro Zone)
    const additionalPLZMapping = {
        "45897": "Buer"  // 45897 gehört auch zu Buer (wie 45894)
    };
    
    // Prüfe zuerst spezielle Zuordnungen
    if (additionalPLZMapping[normalizedPLZ]) {
        return additionalPLZMapping[normalizedPLZ];
    }
    
    if (typeof ZONE_POSTAL_CODES === 'undefined') {
        return null;
    }
    
    // Durchsuche ZONE_POSTAL_CODES nach passender PLZ
    for(const [zone, plz] of Object.entries(ZONE_POSTAL_CODES)) {
        if(plz && String(plz).trim() === normalizedPLZ) {
            return zone;
        }
    }
    
    // Keine Zone gefunden
    return null;
}

// Zone-Abkürzungen für kompakte Darstellung
const ZONE_ABBREVIATIONS = {
    "Alt-/Neustadt": "Alt-Neu",
    "Beckhausen": "Beckh.",
    "Bismarck": "Bism.",
    "Buer": "Buer",
    "Bulmke-Hüllen": "Bulmke",
    "Erle": "Erle",
    "Feldmark": "Feldm.",
    "Hassel": "Hassel",
    "Heßler": "Heßler",
    "Horst": "Horst",
    "Resser Mark": "R.Mark",
    "Resse": "Resse",
    "Rotthausen": "Rotth.",
    "Schalke": "Schalke",
    "Scholven": "Scholv.",
    "Ückendorf": "Ückend.",
    "Außerhalb": "Außerh."
};

// Hilfsfunktion: Gibt Zone-Abkürzung zurück
function getZoneAbbreviation(zone) {
    if(!zone) return '';
    return ZONE_ABBREVIATIONS[zone] || zone.substring(0, 6);
}
