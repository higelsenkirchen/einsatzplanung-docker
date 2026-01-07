const express = require('express');
const router = express.Router();
const { pool } = require('../db/connection');

// GET /api/optimize/potential - Analysiert Optimierungspotential
router.get('/potential', async (req, res) => {
    try {
        const variantId = req.query.variant_id || req.query.variantId;
        
        if (!variantId) {
            return res.status(400).json({ error: 'variant_id erforderlich' });
        }

        // Lade alle Events der Woche
        const eventsResult = await pool.query(
            `SELECT id, title, start, "end", day_index, extended_props 
             FROM events 
             WHERE variant_id = $1 
             AND (extended_props->>'isTravel' IS NULL OR extended_props->>'isTravel' = 'false')`,
            [variantId]
        );
        
        const toursResult = await pool.query(
            'SELECT id, name, employee_id FROM tours WHERE variant_id = $1',
            [variantId]
        );
        
        const poolResult = await pool.query(
            'SELECT id, title, zone FROM pool WHERE variant_id = $1',
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

        const tours = toursResult.rows;
        const poolData = poolResult.rows;

        // Analysiere Optimierungspotential
        const potential = analyzeOptimizationPotential(events, tours, poolData);

        res.json({
            success: true,
            potential
        });
    } catch (error) {
        console.error('Fehler bei Potential-Analyse:', error);
        res.status(500).json({ error: 'Fehler bei Potential-Analyse', details: error.message });
    }
});

// Analysiert das Optimierungspotential
function analyzeOptimizationPotential(events, tours, poolData) {
    const realEvents = events.filter(e => !e.extendedProps?.isTravel);
    
    if (realEvents.length === 0) {
        return {
            hasPotential: false,
            issues: [],
            recommendations: []
        };
    }

    const issues = [];
    const recommendations = [];
    let totalPotentialSavings = 0;

    // Analysiere pro Tag
    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
        const dayEvents = realEvents.filter(e => e.dayIndex === dayIndex);
        if (dayEvents.length === 0) continue;

        // Prüfe auf unzugewiesene Events
        const unassignedEvents = dayEvents.filter(e => !e.extendedProps?.tour);
        if (unassignedEvents.length > 0) {
            issues.push({
                type: 'unassigned',
                dayIndex,
                count: unassignedEvents.length,
                message: `${unassignedEvents.length} unzugewiesene Event(s) am ${getDayName(dayIndex)}`
            });
        }

        // Prüfe auf große Zeitlücken zwischen Events in Touren
        const eventsByTour = {};
        dayEvents.forEach(event => {
            const tourId = event.extendedProps?.tour;
            if (tourId) {
                if (!eventsByTour[tourId]) eventsByTour[tourId] = [];
                eventsByTour[tourId].push(event);
            }
        });

        Object.keys(eventsByTour).forEach(tourId => {
            const tourEvents = eventsByTour[tourId].sort((a, b) => {
                return parseTimeToMinutes(a.start) - parseTimeToMinutes(b.start);
            });

            for (let i = 0; i < tourEvents.length - 1; i++) {
                const current = tourEvents[i];
                const next = tourEvents[i + 1];
                const currentEnd = parseTimeToMinutes(current.end);
                const nextStart = parseTimeToMinutes(next.start);
                const gap = nextStart - currentEnd;

                if (gap > 30) {
                    // Berechne realistische Fahrzeit
                    const currentPool = poolData.find(p => p.id === current.extendedProps?.poolId);
                    const nextPool = poolData.find(p => p.id === next.extendedProps?.poolId);
                    
                    if (currentPool && nextPool) {
                        const travelTime = calculateTravelTime(
                            current.extendedProps?.poolId,
                            next.extendedProps?.poolId,
                            poolData
                        );
                        const excessGap = gap - travelTime;
                        
                        if (excessGap > 15) {
                            issues.push({
                                type: 'large_gap',
                                dayIndex,
                                tourId,
                                gap: excessGap,
                                message: `Große Zeitlücke (${Math.round(excessGap)}min) am ${getDayName(dayIndex)}`
                            });
                            totalPotentialSavings += excessGap;
                        }
                    }
                }
            }
        });
    }

    // Prüfe auf unausgewogene Tour-Auslastung
    const tourUsage = {};
    tours.forEach(tour => {
        tourUsage[tour.id] = {
            tourId: tour.id,
            tourName: tour.name,
            eventCount: 0,
            days: new Set()
        };
    });

    realEvents.forEach(event => {
        const tourId = event.extendedProps?.tour;
        if (tourId && tourUsage[tourId]) {
            tourUsage[tourId].eventCount++;
            tourUsage[tourId].days.add(event.dayIndex);
        }
    });

    const emptyTours = Object.values(tourUsage).filter(t => t.eventCount === 0);
    if (emptyTours.length > 0) {
        recommendations.push({
            type: 'empty_tours',
            count: emptyTours.length,
            message: `${emptyTours.length} ungenutzte Tour(s) vorhanden`
        });
    }

    return {
        hasPotential: issues.length > 0 || recommendations.length > 0,
        issues,
        recommendations,
        totalPotentialSavings: Math.round(totalPotentialSavings),
        summary: issues.length > 0 
            ? `${issues.length} Optimierungsmöglichkeit(en) gefunden`
            : 'Keine Optimierungsmöglichkeiten gefunden'
    };
}

function getDayName(dayIndex) {
    const days = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
    return days[dayIndex] || 'Tag';
}

// POST /api/optimize/tours - Automatische Tourenoptimierung
router.post('/tours', async (req, res) => {
    try {
        const variantId = req.query.variant_id || req.body.variant_id;
        const { dayIndex, tourId, optimizeFor, typeSeparation, optimizeScope } = req.body; 
        // optimizeFor: 'time', 'distance', 'cost'
        // typeSeparation: 'strict' | 'flexible'
        // optimizeScope: 'day' | 'tour' - 'day' für einzelne Tage, 'tour' für gesamte Touren

        const scope = optimizeScope || 'day';
        
        // Lade Events basierend auf Scope
        let eventsResult;
        if (scope === 'tour' && tourId) {
            // Tour-Optimierung: Lade alle Events der Tour über alle Tage
            eventsResult = await pool.query(
                `SELECT id, title, start, "end", day_index, extended_props 
                 FROM events 
                 WHERE variant_id = $1 
                 AND extended_props->>'tour' = $2
                 AND (extended_props->>'isTravel' IS NULL OR extended_props->>'isTravel' = 'false')`,
                [variantId, tourId]
            );
        } else {
            // Tag-Optimierung: Lade Events eines Tages
            if (dayIndex === undefined || dayIndex < 0 || dayIndex > 6) {
                return res.status(400).json({ error: 'Ungültiger dayIndex (0-6 erforderlich)' });
            }
            eventsResult = await pool.query(
                'SELECT id, title, start, "end", day_index, extended_props FROM events WHERE variant_id = $1 AND day_index = $2',
                [variantId, dayIndex]
            );
        }
        
        const toursResult = await pool.query(
            'SELECT id, name, employee_id, weekly_hours_limit, preferred_types FROM tours WHERE variant_id = $1',
            [variantId]
        );
        
        const employeesResult = await pool.query(
            'SELECT id, name, home_zone, transport, wage_group, address, postal_code, extended_props FROM employees WHERE variant_id = $1',
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
        const employees = employeesResult.rows.map(row => ({
            id: row.id,
            name: row.name,
            home_zone: row.home_zone,
            transport: row.transport,
            wage_group: row.wage_group,
            address: row.address || null,
            postal_code: row.postal_code || null,
            extended_props: row.extended_props || {}
        }));
        const poolData = poolResult.rows;
        const wageSettings = wageSettingsResult.rows.length > 0 ? wageSettingsResult.rows[0].settings : null;

        // Für Tour-Optimierung: Filtere Touren auf die spezifische Tour
        let toursToOptimize = tours;
        if (scope === 'tour' && tourId) {
            toursToOptimize = tours.filter(t => t.id === tourId);
            if (toursToOptimize.length === 0) {
                return res.status(404).json({ error: 'Tour nicht gefunden' });
            }
        }

        // Optimierungsalgorithmus
        const optimized = optimizeTours(events, toursToOptimize, employees, poolData, wageSettings, optimizeFor || 'time', typeSeparation || 'flexible', scope === 'tour');

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
function optimizeTours(events, tours, employees, poolData, wageSettings, optimizeFor, typeSeparation, isTourOptimization = false) {
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
                    // Minimiere zusätzliche Zeit (nicht Gesamtzeit)
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
                            // Score ist die zusätzliche Zeit (travelTime + eventDuration)
                            // plus eine kleine Strafe für große Zeitlücken
                            const timeGapPenalty = gap > 60 ? gap / 10 : 0; // Strafe für große Lücken
                            score = travelTime + eventDuration + timeGapPenalty;
                        }
                    } else {
                        // Erste Event der Tour - von Home Zone
                        const homeTravelTime = employee?.home_zone === zone ? 5 : 15; // Schätzung
                        // Für leere Touren: höherer Score, damit belegte Touren bevorzugt werden
                        score = homeTravelTime + eventDuration + 30; // +30 Minuten Strafe für neue Tour
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
    
    // Setze realistische Abstände zwischen Events
    Object.keys(tourWorkloads).forEach(tourId => {
        if (tourWorkloads[tourId].events.length > 0) {
            adjustEventTimings(tourWorkloads[tourId].events, poolData, employees.find(e => e.id === tours.find(t => t.id === tourId)?.employee_id));
        }
    });
    
    // Sammle alle optimierten Events mit aktualisierten Zeiten
    const optimizedEvents = [];
    Object.keys(tourWorkloads).forEach(tourId => {
        tourWorkloads[tourId].events.forEach(event => {
            optimizedEvents.push({
                id: event.id,
                start: event.start,
                end: event.end,
                dayIndex: event.dayIndex
            });
        });
    });
    
    return {
        assignments,
        optimizedEvents, // Events mit aktualisierten Zeiten
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

// Passt die Startzeiten von Events an, um realistische Abstände basierend auf Fahrzeiten zu setzen
function adjustEventTimings(events, poolData, employee) {
    if (events.length === 0) return;
    
    // Sortiere Events nach aktueller Startzeit
    const sortedEvents = [...events].sort((a, b) => {
        return parseTimeToMinutes(a.start) - parseTimeToMinutes(b.start);
    });
    
    // Starte mit dem ersten Event - behalte seine Startzeit
    let lastEventEnd = parseTimeToMinutes(sortedEvents[0].end);
    let lastPoolId = sortedEvents[0].extendedProps?.poolId;
    
    // Für das erste Event: Prüfe ob es von Home-Zone/Koordinaten kommt
    if (sortedEvents[0].extendedProps?.poolId) {
        const firstPool = poolData.find(p => p.id === sortedEvents[0].extendedProps?.poolId);
        let homeTravelTime = 0;
        
        // Versuche zuerst Koordinaten zu verwenden
        if (employee?.extended_props?.coordinates && firstPool?.extended_props?.coordinates) {
            const empCoords = employee.extended_props.coordinates;
            const poolCoords = firstPool.extended_props.coordinates;
            if (empCoords.lat && empCoords.lng && poolCoords.lat && poolCoords.lng) {
                const distKm = haversineDistance(empCoords.lat, empCoords.lng, poolCoords.lat, poolCoords.lng);
                const distKmWithFactor = distKm * 1.4; // Straßenfaktor
                const avgSpeedKmH = 25;
                homeTravelTime = Math.max(5, Math.round((distKmWithFactor / avgSpeedKmH) * 60));
            }
        }
        
        // Fallback: Zone-basierte Berechnung
        if (homeTravelTime === 0 && employee?.home_zone && firstPool?.zone) {
            homeTravelTime = calculateTravelTime(null, sortedEvents[0].extendedProps?.poolId, poolData, employee.home_zone, firstPool.zone);
        }
        
        if (homeTravelTime > 0) {
            const currentStart = parseTimeToMinutes(sortedEvents[0].start);
            const rawSuggestedStart = currentStart - homeTravelTime;
            // Runde auf nächst höheren 5-Minuten-Schritt
            const suggestedStart = Math.ceil(rawSuggestedStart / 5) * 5;
            // Setze Startzeit nur wenn sie realistisch ist (nicht zu früh)
            if (suggestedStart >= 0 && suggestedStart < currentStart) {
                sortedEvents[0].start = minutesToTime(suggestedStart);
                // Aktualisiere auch lastEventEnd
                lastEventEnd = parseTimeToMinutes(sortedEvents[0].end);
            }
        }
    }
    
    // Passe die folgenden Events an
    for (let i = 1; i < sortedEvents.length; i++) {
        const currentEvent = sortedEvents[i];
        const currentPoolId = currentEvent.extendedProps?.poolId;
        
        if (lastPoolId && currentPoolId) {
            // Berechne realistische Fahrzeit
            const travelTime = calculateTravelTime(lastPoolId, currentPoolId, poolData);
            
            // Neue Startzeit = Ende des letzten Events + Fahrzeit
            // Runde auf nächst höheren 5-Minuten-Schritt
            const rawNewStart = lastEventEnd + travelTime;
            const newStart = Math.ceil(rawNewStart / 5) * 5;
            const currentStart = parseTimeToMinutes(currentEvent.start);
            const eventDuration = parseTimeToMinutes(currentEvent.end) - currentStart;
            
            // Setze neue Startzeit (auch wenn sie früher ist, um Abstände zu optimieren)
            currentEvent.start = minutesToTime(newStart);
            currentEvent.end = minutesToTime(newStart + eventDuration);
        }
        
        // Aktualisiere für nächste Iteration
        lastEventEnd = parseTimeToMinutes(currentEvent.end);
        lastPoolId = currentPoolId;
    }
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

function minutesToTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function calculateTravelTime(poolId1, poolId2, poolData, zone1 = null, zone2 = null) {
    // Wenn von Home-Zone: verwende Zone-Parameter
    if (!poolId1 && zone1 && poolId2) {
        const pool2 = poolData.find(p => p.id === poolId2);
        if (pool2?.zone) {
            const distance = getZoneDistance(zone1, pool2.zone);
            const avgSpeedKmH = 25;
            const timeHours = distance / avgSpeedKmH;
            const timeMinutes = Math.round(timeHours * 60);
            return Math.max(5, Math.min(30, timeMinutes));
        }
    }
    
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

