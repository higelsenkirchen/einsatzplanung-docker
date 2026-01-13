/* ==============================================
   ZONES.JS - Zonen-Konfiguration für Gelsenkirchen
   ============================================== */

// Stadtteile von Gelsenkirchen
const CITY_ZONES = ["Alt-/Neustadt", "Beckhausen", "Bismarck", "Buer", "Bulmke-Hüllen", "Erle", "Feldmark", "Hassel", "Heßler", "Horst", "Resser Mark", "Resse", "Rotthausen", "Schalke", "Scholven", "Ückendorf", "Außerhalb"];

// Postleitzahlen für Gelsenkirchen Stadtteile
const ZONE_POSTAL_CODES = {
    "Alt-/Neustadt": "45879",  // Altstadt und Neustadt
    "Beckhausen": "45899",
    "Bismarck": "45889",
    "Buer": "45894",
    "Bulmke-Hüllen": "45888",
    "Erle": "45891",
    "Feldmark": "45883",
    "Hassel": "45768",
    "Heßler": "45883",  // Mehrere PLZ möglich, erste verwendet
    "Horst": "45899",
    "Resser Mark": "45892",
    "Resse": "45892",
    "Rotthausen": "45884",
    "Schalke": "45881",
    "Scholven": "45896",
    "Ückendorf": "45886",
    "Außerhalb": null  // Keine PLZ für "Außerhalb"
};

// Hilfsfunktion: Gibt Zone mit PLZ zurück (falls vorhanden)
function getZoneWithPostalCode(zone) {
    if(!zone || zone === "Außerhalb") return zone;
    
    // Spezielle Behandlung für Zonen mit mehreren PLZ
    if (zone === "Buer") {
        return "Buer (45894, 45897)";
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
    
    // Durchsuche ZONE_POSTAL_CODES nach passender PLZ
    for(const [zone, plz] of Object.entries(ZONE_POSTAL_CODES)) {
        if(plz && String(plz).trim() === normalizedPLZ) {
            return zone;
        }
    }
    
    // Keine Zone gefunden
    return null;
}

// Deutlich unterscheidbare Farben für jede Zone
const ZONE_COLORS = {
    "Alt-/Neustadt": "#e11d48",  // Rot-Pink
    "Beckhausen": "#b45309",     // Braun/Terracotta
    "Bismarck": "#7c3aed",      // Violett
    "Buer": "#0891b2",          // Cyan/Türkis
    "Bulmke-Hüllen": "#059669", // Smaragdgrün
    "Erle": "#16a34a",          // Grün
    "Feldmark": "#65a30d",      // Limette
    "Hassel": "#ca8a04",        // Dunkelgelb/Gold
    "Heßler": "#ea580c",        // Orange
    "Horst": "#dc2626",         // Rot
    "Resser Mark": "#9333ea",   // Lila
    "Resse": "#2563eb",         // Blau
    "Rotthausen": "#c026d3",    // Magenta
    "Schalke": "#0284c7",       // Hellblau
    "Scholven": "#4f46e5",      // Indigo
    "Ückendorf": "#0d9488",     // Teal
    "Außerhalb": "#525252"      // Grau
};
