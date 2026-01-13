/* ==============================================
   DISTANCES.JS - Distanz- und Fahrzeitberechnungen
   ============================================== */

// ============================================
// Distanzmatrix Gelsenkirchen (in km)
// Basierend auf geografischer Lage der Stadtteile
// ============================================
const ZONE_DISTANCES = {
    // Geografische Koordinaten (relativ, für Distanzberechnung)
    // Format: [x, y] wobei x=West-Ost, y=Süd-Nord
    coords: {
        "Alt-/Neustadt": [4, 3.5], // Mittelwert zwischen Altstadt [5,3] und Neustadt [3,4]
        "Beckhausen": [3.5, 8],    // Nordwesten, zwischen Buer und Scholven
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
        "Außerhalb": [5, 5] // Zentrum als Default
    }
};

// Haversine-Formel: Berechne echte Distanz zwischen zwei GPS-Koordinaten (in km)
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Erdradius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Berechne Distanz zwischen zwei Events basierend auf Koordinaten oder Zonen
function getEventDistance(event1, event2) {
    // Versuche zuerst echte Koordinaten zu nutzen
    const coords1 = event1?.extendedProps?.coordinates || event1?.extended_props?.coordinates;
    const coords2 = event2?.extendedProps?.coordinates || event2?.extended_props?.coordinates;
    
    if (coords1?.lat && coords1?.lng && coords2?.lat && coords2?.lng) {
        // Echte Koordinaten vorhanden - nutze Haversine
        const dist = calculateHaversineDistance(coords1.lat, coords1.lng, coords2.lat, coords2.lng);
        // Faktor 1.3 für Straßenumwege (Luftlinie → Fahrtstrecke)
        return Math.round(dist * 1.3 * 10) / 10;
    }
    
    // Fallback auf Zone-basierte Berechnung
    const zone1 = event1?.extendedProps?.zone || event1?.zone;
    const zone2 = event2?.extendedProps?.zone || event2?.zone;
    return getZoneDistance(zone1, zone2);
}

// Berechne Distanz zwischen zwei Zonen (in km, approximiert)
function getZoneDistance(zone1, zone2) {
    if(!zone1 || !zone2) return 5; // Default 5km
    if(zone1 === zone2) return 1; // Innerhalb einer Zone: 1km
    if(zone1 === "Außerhalb" || zone2 === "Außerhalb") return 8; // Außerhalb: pauschal 8km
    
    const c1 = ZONE_DISTANCES.coords[zone1];
    const c2 = ZONE_DISTANCES.coords[zone2];
    if(!c1 || !c2) return 5;
    
    // Euklidische Distanz * Faktor (1 Einheit ≈ 1.2 km)
    const dx = c1[0] - c2[0];
    const dy = c1[1] - c2[1];
    const dist = Math.sqrt(dx*dx + dy*dy) * 1.2;
    
    return Math.round(dist * 10) / 10; // Auf 0.1 km runden
}

// Berechne Fahrzeit basierend auf Distanz (Stadtverkehr ~25 km/h)
function getZoneTravelTime(zone1, zone2) {
    const dist = getZoneDistance(zone1, zone2);
    const speedKmH = appData.wageSettings?.avgSpeed || 25;
    const timeHours = dist / speedKmH;
    const timeMinutes = Math.round(timeHours * 60);
    return Math.max(timeMinutes, 3); // Mindestens 3 Minuten
}

// Farbe basierend auf Entfernung
function getDistanceColor(distanceKm) {
    if(distanceKm <= 1.5) return '#10b981'; // Grün - sehr nah
    if(distanceKm <= 3) return '#22c55e';   // Hellgrün - nah
    if(distanceKm <= 5) return '#84cc16';   // Limette - mittel
    if(distanceKm <= 7) return '#eab308';   // Gelb - weit
    if(distanceKm <= 10) return '#f97316';  // Orange - sehr weit
    return '#ef4444';                        // Rot - extrem weit
}

// Farbe für Fahrtzeit
function getTravelTimeColor(minutes) {
    if(minutes <= 5) return '#10b981';  // Grün
    if(minutes <= 10) return '#22c55e'; // Hellgrün
    if(minutes <= 15) return '#84cc16'; // Limette
    if(minutes <= 20) return '#eab308'; // Gelb
    if(minutes <= 30) return '#f97316'; // Orange
    return '#ef4444';                    // Rot
}

// Berechne Fahrzeit-Vorschläge basierend auf Distanz und Transportmittel
function calculateTravelTimeSuggestions(distanceKm, transport = 'car') {
    if (!distanceKm || distanceKm <= 0) {
        return {
            optimistic: 5,
            realistic: 10,
            pessimistic: 15,
            distance: 0,
            transport: transport
        };
    }
    
    let optimisticSpeed, realisticSpeed, pessimisticSpeed;
    
    if (transport === 'public') {
        // Öffentliche Verkehrsmittel: langsamer wegen Wartezeiten, Umsteigen, etc.
        optimisticSpeed = 18; // Gute Verbindung, wenig Wartezeit
        realisticSpeed = 15; // Durchschnitt mit Wartezeiten
        pessimisticSpeed = 12; // Lange Wartezeiten, Umsteigen
    } else {
        // PKW (car) - Standard
        optimisticSpeed = 30; // Wenig Verkehr
        realisticSpeed = 25; // Durchschnitt Stadtverkehr
        pessimisticSpeed = 20; // Viel Verkehr, Stau
    }
    
    const optimisticMin = Math.max(3, Math.round((distanceKm / optimisticSpeed) * 60));
    const realisticMin = Math.max(5, Math.round((distanceKm / realisticSpeed) * 60));
    const pessimisticMin = Math.max(8, Math.round((distanceKm / pessimisticSpeed) * 60));
    
    return {
        optimistic: optimisticMin,
        realistic: realisticMin,
        pessimistic: pessimisticMin,
        distance: distanceKm,
        transport: transport,
        optimisticSpeed: optimisticSpeed,
        realisticSpeed: realisticSpeed,
        pessimisticSpeed: pessimisticSpeed
    };
}

// Zeige Tooltip mit Fahrzeit-Vorschlägen
let travelTimeTooltip = null;

function showTravelTimeSuggestions(event, travelEvent, distanceKm, fromZone, toZone) {
    // Entferne vorhandenes Tooltip
    hideTravelTimeTooltip();
    
    // Sicherheitsprüfung
    if (!travelEvent || !travelEvent.start || !travelEvent.end) {
        console.warn('showTravelTimeSuggestions: Ungültige Event-Daten');
        return;
    }
    
    // Finde Tour und Mitarbeiter für dieses Travel-Event
    let transport = 'car'; // Default: PKW
    let employeeName = '';
    const tourId = travelEvent.extendedProps?.tour;
    if (tourId && typeof appData !== 'undefined' && appData.tours) {
        const tour = appData.tours.find(t => t.id === tourId);
        if (tour && tour.employeeId && appData.employees) {
            const employee = appData.employees.find(e => e.id === tour.employeeId);
            if (employee) {
                transport = employee.transport || 'car';
                employeeName = employee.name || '';
            }
        }
    }
    
    const suggestions = calculateTravelTimeSuggestions(distanceKm, transport);
    const currentTime = parseTimeToMinutes(travelEvent.end) - parseTimeToMinutes(travelEvent.start);
    
    // Bewertung der aktuellen Fahrzeit
    let assessment = { text: '', color: '', icon: '' };
    if (currentTime < suggestions.optimistic) {
        assessment = { text: 'Zu knapp!', color: '#ef4444', icon: '⚠️' };
    } else if (currentTime <= suggestions.optimistic + 2) {
        assessment = { text: 'Sehr knapp', color: '#f97316', icon: '⏰' };
    } else if (currentTime <= suggestions.realistic) {
        assessment = { text: 'Realistisch', color: '#10b981', icon: '✅' };
    } else if (currentTime <= suggestions.pessimistic) {
        assessment = { text: 'Komfortabel', color: '#3b82f6', icon: '👍' };
    } else {
        assessment = { text: 'Großzügig', color: '#8b5cf6', icon: '☕' };
    }
    
    // Erstelle Tooltip mit Glassmorphism-Effekt
    travelTimeTooltip = document.createElement('div');
    travelTimeTooltip.className = 'travel-time-tooltip';
    travelTimeTooltip.style.cssText = `
        position: fixed;
        background: rgba(18, 18, 26, 0.95);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-left: 3px solid ${assessment.color};
        border-radius: 14px;
        padding: 16px 20px;
        box-shadow: 0 15px 50px rgba(0,0,0,0.5), 0 0 30px ${assessment.color}20;
        z-index: 10000;
        font-size: 0.85rem;
        min-width: 320px;
        pointer-events: none;
        color: #f0f0f5;
        animation: tooltipFadeIn 0.2s ease-out;
    `;
    
    const zoneInfo = fromZone && toZone ? 
        `<div style="margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid var(--border, #333);">
            <strong>📍 Route:</strong> ${fromZone} → ${toZone}
        </div>` : '';
    
    // Prüfe ob Koordinaten verwendet wurden
    const usedCoords = travelEvent.extendedProps?.usedCoordinates;
    const distanceInfo = distanceKm > 0 ? 
        `<div style="margin-bottom:10px; color:var(--text-muted, #94a3b8); font-size:0.8rem;">
            📏 Distanz: <strong>${distanceKm.toFixed(1)} km</strong>
            ${usedCoords ? ' <span style="color:#10b981;">(GPS)</span>' : ' <span style="color:#f59e0b;">(Zone)</span>'}
        </div>` : '';
    
    travelTimeTooltip.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <span style="font-weight:700; color:var(--primary, #6366f1); font-size:0.95rem;">
                ⏱️ Fahrzeit-Analyse
            </span>
            <span style="background:${assessment.color}20; color:${assessment.color}; padding:4px 10px; border-radius:20px; font-size:0.75rem; font-weight:600;">
                ${assessment.icon} ${assessment.text}
            </span>
        </div>
        ${zoneInfo}
        ${distanceInfo}
        ${employeeName ? `<div style="margin-bottom:10px; padding:8px; background:var(--bg-hover, #252540); border-radius:6px; font-size:0.8rem;">
            <span style="color:var(--text-muted, #94a3b8);">👤 Mitarbeiter:in:</span> <strong style="color:var(--primary, #6366f1);">${employeeName}</strong>
            <span style="color:var(--text-muted, #94a3b8); margin-left:8px;">(${transport === 'public' ? '🚌 Öffis' : '🚘 PKW'})</span>
        </div>` : ''}
        <div style="background:var(--bg-hover, #252540); padding:10px; border-radius:8px; margin-bottom:10px;">
            <div style="display:flex; flex-direction:column; gap:8px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="color:var(--text-muted, #94a3b8);">${transport === 'public' ? '🚌' : '🏎️'} Optimistisch (${suggestions.optimisticSpeed} km/h):</span>
                    <span style="font-weight:600; color:#10b981;">${suggestions.optimistic} min</span>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="color:var(--text-muted, #94a3b8);">${transport === 'public' ? '🚌' : '🚗'} Realistisch (${suggestions.realisticSpeed} km/h):</span>
                    <span style="font-weight:600; color:#3b82f6;">${suggestions.realistic} min</span>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="color:var(--text-muted, #94a3b8);">${transport === 'public' ? '🚌' : '🐌'} Pessimistisch (${suggestions.pessimisticSpeed} km/h):</span>
                    <span style="font-weight:600; color:#f59e0b;">${suggestions.pessimistic} min</span>
                </div>
            </div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; padding-top:8px; border-top:1px solid var(--border, #333);">
            <span style="color:var(--text-muted, #94a3b8);">Aktuell eingeplant:</span>
            <span style="font-weight:700; font-size:1.1rem; color:${assessment.color};">${currentTime} min</span>
        </div>
    `;
    
    document.body.appendChild(travelTimeTooltip);
    
    // Positioniere Tooltip neben dem Mauszeiger
    const x = event.clientX + 15;
    const y = event.clientY + 15;
    travelTimeTooltip.style.left = x + 'px';
    travelTimeTooltip.style.top = y + 'px';
    
    // Stelle sicher, dass Tooltip nicht außerhalb des Viewports ist
    requestAnimationFrame(() => {
        if (travelTimeTooltip) {
            const rect = travelTimeTooltip.getBoundingClientRect();
            if (rect.right > window.innerWidth) {
                travelTimeTooltip.style.left = (event.clientX - rect.width - 15) + 'px';
            }
            if (rect.bottom > window.innerHeight) {
                travelTimeTooltip.style.top = (event.clientY - rect.height - 15) + 'px';
            }
        }
    });
}

function hideTravelTimeTooltip() {
    if (travelTimeTooltip) {
        travelTimeTooltip.remove();
        travelTimeTooltip = null;
    }
}
