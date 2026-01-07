/* ==============================================
   UTILS.JS - Hilfsfunktionen
   ============================================== */

// ID-Generator
function generateId() { 
    return Date.now().toString(36) + Math.random().toString(36).substring(2); 
}

// Zeit in Minuten umwandeln
function parseTimeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

// Minuten in Zeit-String umwandeln
function minutesToTime(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

// Zone mit PLZ zurückgeben
function getZoneWithPostalCode(zone) {
    if (!zone || zone === "Außerhalb") return zone;
    const plz = ZONE_POSTAL_CODES[zone];
    return plz ? `${zone} (${plz})` : zone;
}

// PLZ zu Zone mappen
function getZoneFromPostalCode(postalCode) {
    if (!postalCode) return null;
    const normalizedPLZ = String(postalCode).trim();
    
    for (const [zone, plz] of Object.entries(ZONE_POSTAL_CODES)) {
        if (plz && String(plz).trim() === normalizedPLZ) {
            return zone;
        }
    }
    return null;
}

// Distanz zwischen Zonen berechnen
function getZoneDistance(zone1, zone2) {
    if (!zone1 || !zone2) return 5;
    if (zone1 === zone2) return 1;
    if (zone1 === "Außerhalb" || zone2 === "Außerhalb") return 8;
    
    const c1 = ZONE_DISTANCES.coords[zone1];
    const c2 = ZONE_DISTANCES.coords[zone2];
    if (!c1 || !c2) return 5;
    
    const dx = c1[0] - c2[0];
    const dy = c1[1] - c2[1];
    const dist = Math.sqrt(dx*dx + dy*dy) * 1.2;
    
    return Math.round(dist * 10) / 10;
}

// Fahrzeit berechnen
function getZoneTravelTime(zone1, zone2) {
    const dist = getZoneDistance(zone1, zone2);
    const speedKmH = (typeof appData !== 'undefined' && appData.wageSettings?.avgSpeed) || 25;
    const timeHours = dist / speedKmH;
    const timeMinutes = Math.round(timeHours * 60);
    return Math.max(timeMinutes, 3);
}

// Farbe basierend auf Entfernung
function getDistanceColor(distanceKm) {
    if (distanceKm <= 1.5) return '#10b981';
    if (distanceKm <= 3) return '#22c55e';
    if (distanceKm <= 5) return '#84cc16';
    if (distanceKm <= 7) return '#eab308';
    if (distanceKm <= 10) return '#f97316';
    return '#ef4444';
}

// Farbe für Fahrtzeit
function getTravelTimeColor(minutes) {
    if (minutes <= 5) return '#10b981';
    if (minutes <= 10) return '#22c55e';
    if (minutes <= 15) return '#84cc16';
    if (minutes <= 20) return '#eab308';
    if (minutes <= 30) return '#f97316';
    return '#ef4444';
}

// Fahrzeit-Vorschläge berechnen
function calculateTravelTimeSuggestions(distanceKm) {
    if (!distanceKm || distanceKm <= 0) {
        return {
            optimistic: 5,
            realistic: 10,
            pessimistic: 15,
            distance: 0
        };
    }
    
    const optimisticMin = Math.max(3, Math.round((distanceKm / 30) * 60));
    const realisticMin = Math.max(5, Math.round((distanceKm / 25) * 60));
    const pessimisticMin = Math.max(8, Math.round((distanceKm / 20) * 60));
    
    return {
        optimistic: optimisticMin,
        realistic: realisticMin,
        pessimistic: pessimisticMin,
        distance: distanceKm
    };
}

// Pixel pro Minute (für Zoom)
function getPixelsPerMinute() {
    return (typeof zoomLevel !== 'undefined' && zoomLevel === 5) ? 3 : 1;
}

// Snap-Minuten (für Zoom)
function getSnapMinutes() {
    return typeof zoomLevel !== 'undefined' ? zoomLevel : 15;
}

// Echte Events filtern (keine Fahrzeiten)
function filterRealEvents(events) {
    return events.filter(e => !e.extendedProps?.isTravel);
}

// Gültige Events filtern
function filterValidEvents(events) {
    return events.filter(e => 
        !e.extendedProps?.isTravel && 
        e.dayIndex !== undefined && 
        e.dayIndex >= 0 && 
        e.dayIndex <= 6
    );
}

// Prüft ob dayIndex gültig ist
function isValidDayIndex(dayIndex) {
    return dayIndex !== undefined && dayIndex >= 0 && dayIndex <= 6;
}

// Event-Dauer berechnen (berücksichtigt Rhythmus)
function getEventDuration(evt) {
    const duration = parseTimeToMinutes(evt.end) - parseTimeToMinutes(evt.start);
    if (evt.extendedProps?.rhythm === 'biweekly') {
        return duration / 2;
    }
    if (evt.extendedProps?.rhythm === 'fourweekly') {
        return duration / 4;
    }
    return duration;
}

// Workload berechnen
function calculateWorkload(events, dayIndex) {
    const dayEvents = filterRealEvents(events.filter(e => e.dayIndex === dayIndex));
    let totalMin = 0;
    dayEvents.forEach(e => {
        totalMin += getEventDuration(e);
    });
    return {
        minutes: totalMin,
        percent: Math.round((totalMin / TARGET_WORKLOAD_MINUTES) * 100),
        level: totalMin < TARGET_WORKLOAD_MINUTES * 0.8 ? 'low' : (totalMin <= TARGET_WORKLOAD_MINUTES ? 'medium' : 'high')
    };
}

// Konfliktprüfung
function checkOverlap(events, newEvent, excludeId = null) {
    const newStart = parseTimeToMinutes(newEvent.start);
    const newEnd = parseTimeToMinutes(newEvent.end);
    const newDay = newEvent.dayIndex;
    const newRhythm = newEvent.extendedProps?.rhythm || 'weekly';
    const newTour = newEvent.extendedProps?.tour;
    
    const conflicts = [];
    
    events.forEach(evt => {
        if (evt.id === excludeId) return;
        if (evt.extendedProps?.isTravel) return;
        if (evt.dayIndex !== newDay) return;
        
        const evtTour = evt.extendedProps?.tour;
        if (newTour && evtTour && newTour !== evtTour) return;
        
        const evtStart = parseTimeToMinutes(evt.start);
        const evtEnd = parseTimeToMinutes(evt.end);
        const evtRhythm = evt.extendedProps?.rhythm || 'weekly';
        
        const overlaps = (newStart < evtEnd && newEnd > evtStart);
        
        if (overlaps) {
            if (newRhythm === 'biweekly' && evtRhythm === 'biweekly') {
                return;
            }
            if (newRhythm === 'fourweekly' && evtRhythm === 'fourweekly') {
                return;
            }
            conflicts.push(evt);
        }
    });
    
    return conflicts;
}

function getEventConflicts(evt, allEvents) {
    return checkOverlap(allEvents, evt, evt.id);
}

