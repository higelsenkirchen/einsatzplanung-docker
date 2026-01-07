const express = require('express');
const router = express.Router();
const { pool } = require('../db/connection');

// POST /api/optimize/tours - Automatische Tourenoptimierung
router.post('/tours', async (req, res) => {
    try {
        const variantId = req.query.variant_id || req.body.variant_id;
        const { dayIndex, optimizeFor } = req.body; // optimizeFor: 'time', 'distance', 'cost'

        if (dayIndex === undefined || dayIndex < 0 || dayIndex > 6) {
            return res.status(400).json({ error: 'Ungültiger dayIndex (0-6 erforderlich)' });
        }

        // Lade alle Daten
        const eventsResult = await pool.query(
            'SELECT id, title, start, "end", day_index, extended_props FROM events WHERE variant_id = $1 AND day_index = $2',
            [variantId, dayIndex]
        );
        
        const toursResult = await pool.query(
            'SELECT id, name, employee_id, weekly_hours_limit FROM tours WHERE variant_id = $1',
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

        const tours = toursResult.rows;
        const employees = employeesResult.rows;
        const poolData = poolResult.rows;
        const wageSettings = wageSettingsResult.rows.length > 0 ? wageSettingsResult.rows[0].settings : null;

        // Optimierungsalgorithmus
        const optimized = optimizeTours(events, tours, employees, poolData, wageSettings, optimizeFor || 'time');

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
function optimizeTours(events, tours, employees, poolData, wageSettings, optimizeFor) {
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

                // Bonus für Zone-Konsistenz (20% Reduktion)
                if (hasZoneEvents) {
                    score *= 0.8;
                }

                // Prüfe Arbeitszeitgrenzen
                const newTotalMinutes = workload.totalMinutes + eventDuration;
                
                if (tour.weekly_hours_limit && newTotalMinutes > tour.weekly_hours_limit * 60) {
                    score = Infinity; // Überschreitet Limit
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
                
                assignments.push({
                    eventId: event.id,
                    tourId: bestTour.id,
                    score: bestScore
                });
            }
        });
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

function parseTimeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return (hours || 0) * 60 + (minutes || 0);
}

function calculateTravelTime(poolId1, poolId2, poolData) {
    // Vereinfachte Berechnung - in Produktion mit echten Koordinaten
    if (!poolId1 || !poolId2) return 15; // Default 15 Minuten
    
    const pool1 = poolData.find(p => p.id === poolId1);
    const pool2 = poolData.find(p => p.id === poolId2);
    
    if (!pool1 || !pool2) return 15; // Default 15 Minuten
    
    // Gleiche Zone = 5 Minuten, verschiedene Zone = 15 Minuten
    return pool1.zone === pool2.zone ? 5 : 15;
}

function calculateDistance(poolId1, poolId2, poolData) {
    // Vereinfachte Berechnung
    if (!poolId1 || !poolId2) return 10; // Default 10 km
    
    const pool1 = poolData.find(p => p.id === poolId1);
    const pool2 = poolData.find(p => p.id === poolId2);
    
    if (!pool1 || !pool2) return 10; // Default 10 km
    
    return pool1.zone === pool2.zone ? 2 : 10;
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

