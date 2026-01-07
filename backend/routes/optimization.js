const express = require('express');
const router = express.Router();
const { pool } = require('../db/connection');

// POST /api/optimize/tours - Automatische Tourenoptimierung
router.post('/tours', async (req, res) => {
    try {
        const variantId = req.query.variant_id || req.body.variant_id;
        const { dayIndex, optimizeFor, typeSeparation } = req.body; // optimizeFor: 'time', 'distance', 'cost', typeSeparation: 'strict' | 'flexible'

        if (dayIndex === undefined || dayIndex < 0 || dayIndex > 6) {
            return res.status(400).json({ error: 'Ungültiger dayIndex (0-6 erforderlich)' });
        }

        // Lade alle Daten
        const eventsResult = await pool.query(
            'SELECT id, title, start, "end", day_index, extended_props FROM events WHERE variant_id = $1 AND day_index = $2',
            [variantId, dayIndex]
        );
        
        const toursResult = await pool.query(
            'SELECT id, name, employee_id, weekly_hours_limit, preferred_types FROM tours WHERE variant_id = $1',
            [variantId]
        );
        
        const employeesResult = await pool.query(
            'SELECT id, name, home_zone, transport, wage_group FROM employees WHERE variant_id = $1',
            [variantId]
        );
        
        const poolResult = await pool.query(
            'SELECT id, title, zone, types FROM pool WHERE variant_id = $1',
            [variantId]
        );

        const wageSettingsResult = await pool.query(
            'SELECT settings FROM wage_settings WHERE variant_id = $1 ORDER BY id DESC LIMIT 1',
            [variantId]
        );

        const events = eventsResult.rows.map(row => ({
            id: row.id,
            title: row.title,
            start: row.start,
            end: row.end,
            dayIndex: row.day_index,
            extendedProps: row.extended_props
        }));

        const tours = toursResult.rows.map(row => ({
            id: row.id,
            name: row.name,
            employee_id: row.employee_id,
            weekly_hours_limit: row.weekly_hours_limit,
            preferred_types: row.preferred_types || null
        }));
        const employees = employeesResult.rows;
        const poolData = poolResult.rows;
        const wageSettings = wageSettingsResult.rows.length > 0 ? wageSettingsResult.rows[0].settings : null;

        // Optimierungsalgorithmus
        const optimized = optimizeTours(events, tours, employees, poolData, wageSettings, optimizeFor || 'time', typeSeparation || 'flexible');

        res.json({
            success: true,
            optimizedAssignments: optimized,
            statistics: calculateOptimizationStats(optimized, events, employees)
        });
    } catch (error) {
        console.error('Fehler bei Optimierung:', error);
        res.status(500).json({ error: 'Fehler bei Optimierung', details: error.message });
    }
});

// Optimierungsalgorithmus
function optimizeTours(events, tours, employees, poolData, wageSettings, optimizeFor, typeSeparation) {
    // Filtere nur echte Events (keine Travel-Events)
    const realEvents = events.filter(e => !e.extendedProps?.isTravel);
    
    if (realEvents.length === 0) {
        return {
            assignments: [],
            tourWorkloads: []
        };
    }

    // Gruppiere Events nach Zone
    const eventsByZone = {};
    realEvents.forEach(event => {
        const poolItem = poolData.find(p => p.id === event.extendedProps?.poolId);
        const zone = poolItem?.zone || 'unbekannt';
        if (!eventsByZone[zone]) eventsByZone[zone] = [];
        eventsByZone[zone].push(event);
    });

    // Sortiere Events nach Startzeit
    Object.keys(eventsByZone).forEach(zone => {
        eventsByZone[zone].sort((a, b) => {
            return parseTimeToMinutes(a.start) - parseTimeToMinutes(b.start);
        });
    });

    const assignments = [];
    const tourWorkloads = {};

    // Initialisiere Workloads
    tours.forEach(tour => {
        tourWorkloads[tour.id] = {
            events: [],
            totalMinutes: 0,
            employee: employees.find(e => e.id === tour.employee_id),
            lastZone: null,
            lastEventEnd: null
        };
    });
    
    // Berechne aktuelle Stunden pro Mitarbeiter über alle Touren (für Stundenverteilung)
    const employeeTotalHours = {};
    employees.forEach(emp => {
        employeeTotalHours[emp.id] = {
            currentMinutes: 0,
            targetMinutes: (emp.weekly_hours || 40) * 60, // Wochenstunden in Minuten
            tours: []
        };
    });
    
    // Sammle alle Touren pro Mitarbeiter
    tours.forEach(tour => {
        if (tour.employee_id && employeeTotalHours[tour.employee_id]) {
            employeeTotalHours[tour.employee_id].tours.push(tour.id);
        }
    });

    // Optimierungsstrategie: Nearest Neighbor mit Zone-Priorität
    Object.keys(eventsByZone).forEach(zone => {
        const zoneEvents = eventsByZone[zone];
        
        zoneEvents.forEach(event => {
            let bestTour = null;
            let bestScore = Infinity;

            const eventDuration = parseTimeToMinutes(event.end) - parseTimeToMinutes(event.start);
            const eventStart = parseTimeToMinutes(event.start);

            tours.forEach(tour => {
                const workload = tourWorkloads[tour.id];
                const employee = workload.employee;
                
                // Prüfe ob Tour bereits Events in dieser Zone hat
                const hasZoneEvents = workload.events.some(e => {
                    const ePool = poolData.find(p => p.id === e.extendedProps?.poolId);
                    return ePool?.zone === zone;
                });

                // Berechne Score basierend auf Optimierungskriterium
                let score = 0;
                
                if (optimizeFor === 'time') {
                    // Minimiere Gesamtzeit
                    if (workload.events.length > 0) {
                        const lastEvent = workload.events[workload.events.length - 1];
                        const lastEventEnd = parseTimeToMinutes(lastEvent.end);
                        const travelTime = calculateTravelTime(
                            lastEvent.extendedProps?.poolId,
                            event.extendedProps?.poolId,
                            poolData
                        );
                        const gap = eventStart - lastEventEnd;
                        
                        // Wenn Event zu früh kommt, große Strafe
                        if (gap < 0) {
                            score = Infinity;
                        } else {
                            score = workload.totalMinutes + travelTime + eventDuration;
                        }
                    } else {
                        // Erste Event der Tour - von Home Zone
                        const homeTravelTime = employee?.home_zone === zone ? 5 : 15; // Schätzung
                        score = homeTravelTime + eventDuration;
                    }
                } else if (optimizeFor === 'distance') {
                    // Minimiere Distanz
                    if (workload.events.length > 0) {
                        const lastEvent = workload.events[workload.events.length - 1];
                        score = calculateDistance(
                            lastEvent.extendedProps?.poolId,
                            event.extendedProps?.poolId,
                            poolData
                        );
                    } else {
                        score = employee?.home_zone === zone ? 2 : 10;
                    }
                } else if (optimizeFor === 'cost') {
                    // Minimiere Kosten
                    const employeeCostRate = getEmployeeCostRate(employee, wageSettings);
                    if (workload.events.length > 0) {
                        const lastEvent = workload.events[workload.events.length - 1];
                        const travelTime = calculateTravelTime(
                            lastEvent.extendedProps?.poolId,
                            event.extendedProps?.poolId,
                            poolData
                        );
                        score = (workload.totalMinutes + travelTime + eventDuration) * employeeCostRate;
                    } else {
                        const homeTravelTime = employee?.home_zone === zone ? 5 : 15;
                        score = (homeTravelTime + eventDuration) * employeeCostRate;
                    }
                }

                // Filtere Events nach Leistungstyp wenn Tour-Type-Präferenz existiert
                const tourPreferredTypes = tour.preferred_types;
                if (tourPreferredTypes && Array.isArray(tourPreferredTypes) && tourPreferredTypes.length > 0) {
                    // Hole Event-Types aus Pool-Item
                    const poolItem = poolData.find(p => p.id === event.extendedProps?.poolId);
                    const eventTypes = poolItem?.types || event.extendedProps?.types || [];
                    
                    // Prüfe ob Event-Type mit Tour-Präferenz übereinstimmt
                    const hasMatchingType = eventTypes.some(t => tourPreferredTypes.includes(t));
                    
                    if (!hasMatchingType) {
                        if (typeSeparation === 'strict') {
                            score = Infinity; // Komplett ausschließen bei strikter Trennung
                        } else {
                            score *= 1.3; // 30% Penalty für Type-Mismatch bei flexibler Trennung
                        }
                    }
                }

                // Bonus für Zone-Konsistenz (30% Reduktion wenn mehrere Events in gleicher Zone)
                const zoneEventCount = workload.events.filter(e => {
                    const ePool = poolData.find(p => p.id === e.extendedProps?.poolId);
                    return ePool?.zone === zone;
                }).length;
                
                if (hasZoneEvents) {
                    // Größerer Bonus wenn bereits mehrere Events in dieser Zone
                    if (zoneEventCount >= 2) {
                        score *= 0.7; // 30% Reduktion bei mehreren Events
                    } else {
                        score *= 0.8; // 20% Reduktion bei einem Event
                    }
                }
                
                // Strafe für Zone-Wechsel zu weit entfernten Zonen
                if (workload.lastZone && workload.lastZone !== zone && workload.lastZone !== 'Außerhalb' && zone !== 'Außerhalb') {
                    const zoneDistance = getZoneDistance(workload.lastZone, zone);
                    if (zoneDistance > 5) {
                        score *= 1.1; // 10% Penalty für weit entfernte Zone-Wechsel
                    }
                }
                
                // Prüfe Mitarbeiter-Stundenverteilung über alle Touren
                if (employee && employeeTotalHours[employee.id]) {
                    const empHours = employeeTotalHours[employee.id];
                    // Berechne aktuelle Minuten aus allen Touren dieses Mitarbeiters
                    let currentTotalMinutes = 0;
                    empHours.tours.forEach(tourId => {
                        if (tourWorkloads[tourId]) {
                            currentTotalMinutes += tourWorkloads[tourId].totalMinutes;
                        }
                    });
                    
                    // Füge neue Event-Dauer hinzu für Berechnung
                    const newTotalMinutes = currentTotalMinutes + eventDuration;
                    const targetMinutes = empHours.targetMinutes;
                    
                    // Score-Anpassung basierend auf Stundenverteilung
                    if (targetMinutes > 0) {
                        const hoursDifference = (targetMinutes - newTotalMinutes) / targetMinutes; // -1 bis +1
                        // Bonus wenn Mitarbeiter zu wenige Stunden hat, Penalty wenn zu viele
                        score *= (1 + hoursDifference * 0.2); // Maximal ±20% Anpassung
                    }
                    
                    // Warnung (aber nicht blockieren) wenn Limit überschritten wird
                    if (newTotalMinutes > targetMinutes * 1.2) {
                        // 20% über Limit = sehr hohe Penalty
                        score *= 1.5;
                    }
                }

                // Prüfe Arbeitszeitgrenzen der Tour
                const newTotalMinutes = workload.totalMinutes + eventDuration;
                
                if (tour.weekly_hours_limit && newTotalMinutes > tour.weekly_hours_limit * 60) {
                    score = Infinity; // Überschreitet Tour-Limit
                }

                // Prüfe Zeitkonflikte
                const conflicts = workload.events.some(e => {
                    const eStart = parseTimeToMinutes(e.start);
                    const eEnd = parseTimeToMinutes(e.end);
                    return (eventStart < eEnd && eventStart >= eStart) || 
                           (parseTimeToMinutes(event.end) > eStart && parseTimeToMinutes(event.end) <= eEnd);
                });

                if (conflicts) {
                    score = Infinity;
                }

                if (score < bestScore) {
                    bestScore = score;
                    bestTour = tour;
                }
            });

            if (bestTour && bestScore !== Infinity) {
                const eventDuration = parseTimeToMinutes(event.end) - parseTimeToMinutes(event.start);
                const poolItem = poolData.find(p => p.id === event.extendedProps?.poolId);
                
                tourWorkloads[bestTour.id].events.push(event);
                tourWorkloads[bestTour.id].totalMinutes += eventDuration;
                tourWorkloads[bestTour.id].lastZone = poolItem?.zone || 'unbekannt';
                tourWorkloads[bestTour.id].lastEventEnd = parseTimeToMinutes(event.end);
                
                // Aktualisiere Mitarbeiter-Stunden
                const bestEmployee = tourWorkloads[bestTour.id].employee;
                if (bestEmployee && employeeTotalHours[bestEmployee.id]) {
                    employeeTotalHours[bestEmployee.id].currentMinutes += eventDuration;
                }
                
                assignments.push({
                    eventId: event.id,
                    tourId: bestTour.id,
                    score: bestScore
                });
            }
        });
    });

    // Optimiere Reihenfolge innerhalb jeder Tour
    Object.keys(tourWorkloads).forEach(tourId => {
        if (tourWorkloads[tourId].events.length > 1) {
            tourWorkloads[tourId].events = optimizeTourOrder(tourWorkloads[tourId].events, poolData);
        }
    });
    
    return {
        assignments,
        tourWorkloads: Object.keys(tourWorkloads).map(tourId => ({
            tourId,
            tourName: tours.find(t => t.id === tourId)?.name || tourId,
            events: tourWorkloads[tourId].events.map(e => e.id),
            totalMinutes: tourWorkloads[tourId].totalMinutes,
            totalHours: (tourWorkloads[tourId].totalMinutes / 60).toFixed(2),
            employeeName: tourWorkloads[tourId].employee?.name || 'Kein Mitarbeiter'
        }))
    };
}

// Optimiert die Reihenfolge von Events innerhalb einer Tour (Nearest Neighbor)
function optimizeTourOrder(events, poolData) {
    if (events.length <= 1) return events;
    
    // Sortiere Events nach Startzeit als Ausgangspunkt
    const sortedEvents = [...events].sort((a, b) => {
        return parseTimeToMinutes(a.start) - parseTimeToMinutes(b.start);
    });
    
    const optimized = [];
    const used = new Set();
    
    // Starte mit dem frühesten Event
    let currentEvent = sortedEvents[0];
    optimized.push(currentEvent);
    used.add(currentEvent.id);
    
    // Nearest Neighbor: Finde immer das nächste Event
    while (optimized.length < sortedEvents.length) {
        let nearestEvent = null;
        let nearestDistance = Infinity;
        let nearestTime = Infinity;
        
        sortedEvents.forEach(event => {
            if (used.has(event.id)) return;
            
            const currentPool = poolData.find(p => p.id === currentEvent.extendedProps?.poolId);
            const eventPool = poolData.find(p => p.id === event.extendedProps?.poolId);
            
            if (!currentPool || !eventPool) return;
            
            // Berechne Distanz zwischen Zonen
            const distance = getZoneDistance(currentPool.zone, eventPool.zone);
            
            // Berechne Zeit bis zum nächsten Event
            const currentEnd = parseTimeToMinutes(currentEvent.end);
            const eventStart = parseTimeToMinutes(event.start);
            const timeGap = eventStart - currentEnd;
            
            // Kombinierter Score: Distanz + Zeit-Gap (wenn positiv)
            // Berücksichtige auch, ob Event bereits begonnen hat
            let score = distance;
            if (timeGap >= 0) {
                score += timeGap / 10; // Zeit-Gap als kleiner Faktor
            } else {
                score += 1000; // Sehr große Strafe für Überschneidungen
            }
            
            if (score < nearestDistance) {
                nearestDistance = score;
                nearestEvent = event;
                nearestTime = timeGap;
            }
        });
        
        if (nearestEvent) {
            optimized.push(nearestEvent);
            used.add(nearestEvent.id);
            currentEvent = nearestEvent;
        } else {
            // Falls kein passendes Event gefunden, füge restliche Events hinzu
            sortedEvents.forEach(event => {
                if (!used.has(event.id)) {
                    optimized.push(event);
                    used.add(event.id);
                }
            });
            break;
        }
    }
    
    return optimized;
}

function parseTimeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return (hours || 0) * 60 + (minutes || 0);
}

function calculateTravelTime(poolId1, poolId2, poolData) {
    if (!poolId1 || !poolId2) return 15; // Default 15 Minuten
    
    const pool1 = poolData.find(p => p.id === poolId1);
    const pool2 = poolData.find(p => p.id === poolId2);
    
    if (!pool1 || !pool2) return 15; // Default 15 Minuten
    
    // Berechne Distanz
    const distance = calculateDistance(poolId1, poolId2, poolData);
    
    // Durchschnittsgeschwindigkeit im Stadtverkehr: ~25 km/h
    const avgSpeedKmH = 25;
    const timeHours = distance / avgSpeedKmH;
    const timeMinutes = Math.round(timeHours * 60);
    
    // Minimum 5 Minuten, Maximum 30 Minuten
    return Math.max(5, Math.min(30, timeMinutes));
}

// Haversine-Formel: Berechnet Luftlinie zwischen zwei Koordinaten
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Erdradius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distanz in km
}

// Zone-Koordinaten für Gelsenkirchen (gleiche wie im Frontend)
const ZONE_DISTANCES = {
    coords: {
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
    }
};

// Berechnet Distanz zwischen zwei Zonen direkt
function getZoneDistance(zone1, zone2) {
    if (!zone1 || !zone2) return 5; // Default 5 km
    if (zone1 === zone2) return 1; // Innerhalb einer Zone: 1 km
    if (zone1 === "Außerhalb" || zone2 === "Außerhalb") return 8; // Außerhalb: pauschal 8 km
    
    const c1 = ZONE_DISTANCES.coords[zone1];
    const c2 = ZONE_DISTANCES.coords[zone2];
    
    if (!c1 || !c2) return 5; // Default falls Zone nicht gefunden
    
    // Euklidische Distanz * Faktor (1 Einheit ≈ 1.2 km)
    const dx = c1[0] - c2[0];
    const dy = c1[1] - c2[1];
    const dist = Math.sqrt(dx * dx + dy * dy) * 1.2;
    
    return Math.round(dist * 10) / 10; // Auf 0.1 km runden
}

function calculateDistance(poolId1, poolId2, poolData) {
    if (!poolId1 || !poolId2) return 5; // Default 5 km
    
    const pool1 = poolData.find(p => p.id === poolId1);
    const pool2 = poolData.find(p => p.id === poolId2);
    
    if (!pool1 || !pool2) return 5; // Default 5 km
    
    // Prüfe ob beide Pool-Items Koordinaten haben
    const coords1 = pool1.extended_props?.coordinates || pool1.extendedProps?.coordinates;
    const coords2 = pool2.extended_props?.coordinates || pool2.extendedProps?.coordinates;
    
    if (coords1 && coords2 && 
        typeof coords1.lat === 'number' && typeof coords1.lng === 'number' &&
        typeof coords2.lat === 'number' && typeof coords2.lng === 'number') {
        // Haversine-Berechnung für Luftlinie
        const airDistance = haversineDistance(
            coords1.lat, coords1.lng,
            coords2.lat, coords2.lng
        );
        // Multipliziere mit Straßenfaktor (1.4 = ca. 40% längere Strecke durch Straßen)
        return airDistance * 1.4;
    }
    
    // Fallback: Zone-basierte Distanzberechnung
    return getZoneDistance(pool1.zone, pool2.zone);
}

function getEmployeeCostRate(employee, wageSettings) {
    if (!employee || !wageSettings) return 1.0;
    
    const wageGroups = wageSettings.wageGroups || [];
    const group = wageGroups.find(g => g.id === employee.wage_group);
    
    return group ? (group.hourlyRate || 14) : 14; // Default 14€/h
}

function calculateOptimizationStats(optimized, events, employees) {
    const realEvents = events.filter(e => !e.extendedProps?.isTravel);
    return {
        totalEvents: realEvents.length,
        assignedEvents: optimized.assignments.length,
        unassignedEvents: realEvents.length - optimized.assignments.length,
        toursUsed: optimized.tourWorkloads.filter(tw => tw.events.length > 0).length,
        totalTours: optimized.tourWorkloads.length
    };
}

module.exports = router;

