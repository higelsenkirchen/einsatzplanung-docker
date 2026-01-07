const express = require('express');
const router = express.Router();
const puppeteer = require('puppeteer');
const { pool } = require('../db/connection');
const { authenticateToken, checkVariantPermission, createAuditLog } = require('../middleware/auth');

// GET /api/export/pdf - PDF-Export für Wochenplan
router.get('/pdf', authenticateToken, checkVariantPermission, async (req, res) => {
    let browser = null;
    try {
        const variantId = req.query.variant_id;
        const { weekStart, includeStats } = req.query;

        if (!variantId) {
            return res.status(400).json({ error: 'variant_id erforderlich' });
        }

        // Lade Varianten-Name
        const variantResult = await pool.query('SELECT name FROM variants WHERE id = $1', [variantId]);
        if (variantResult.rows.length === 0) {
            return res.status(404).json({ error: 'Variante nicht gefunden' });
        }
        const variantName = variantResult.rows[0].name;

        // Lade Daten
        const eventsResult = await pool.query(
            'SELECT id, title, start, "end", day_index, extended_props FROM events WHERE variant_id = $1 ORDER BY day_index, start',
            [variantId]
        );

        const toursResult = await pool.query(
            'SELECT id, name, employee_id FROM tours WHERE variant_id = $1',
            [variantId]
        );

        const employeesResult = await pool.query(
            'SELECT id, name FROM employees WHERE variant_id = $1',
            [variantId]
        );

        const events = eventsResult.rows;
        const tours = toursResult.rows;
        const employees = employeesResult.rows;

        // HTML für PDF generieren
        const html = generatePDFHTML(events, tours, employees, variantName, weekStart, includeStats === 'true');

        // PDF mit Puppeteer generieren
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });

        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        
        const pdf = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' }
        });

        await browser.close();
        browser = null;

        // Audit Log
        await createAuditLog(req.user.id, variantId, 'export', 'pdf', null, { variantName }, req.ip);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="tourenplan-${variantName}-${Date.now()}.pdf"`);
        res.send(pdf);
    } catch (error) {
        if (browser) {
            await browser.close();
        }
        console.error('Fehler bei PDF-Export:', error);
        res.status(500).json({ error: 'Fehler bei PDF-Export', details: error.message });
    }
});

function generatePDFHTML(events, tours, employees, variantName, weekStart, includeStats) {
    const days = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
    
    // Gruppiere Events nach Tag
    const eventsByDay = {};
    for (let i = 0; i < 7; i++) {
        eventsByDay[i] = events.filter(e => e.day_index === i && !e.extendedProps?.isTravel);
    }

    // Berechne Statistiken
    let totalEvents = 0;
    let totalHours = 0;
    const tourStats = {};
    
    events.forEach(event => {
        if (!event.extendedProps?.isTravel) {
            totalEvents++;
            const duration = parseTimeToMinutes(event.end) - parseTimeToMinutes(event.start);
            totalHours += duration / 60;
            
            const tourId = event.extendedProps?.tour;
            if (tourId) {
                if (!tourStats[tourId]) {
                    tourStats[tourId] = { count: 0, hours: 0, name: tours.find(t => t.id === tourId)?.name || tourId };
                }
                tourStats[tourId].count++;
                tourStats[tourId].hours += duration / 60;
            }
        }
    });

    const weekStartText = weekStart ? ` (Woche ab ${weekStart})` : '';
    
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { 
                    font-family: Arial, sans-serif; 
                    font-size: 10pt; 
                    color: #333;
                    margin: 0;
                    padding: 0;
                }
                h1 { 
                    color: #333; 
                    border-bottom: 3px solid #6366f1; 
                    padding-bottom: 10px; 
                    margin-bottom: 20px;
                }
                h2 {
                    color: #6366f1;
                    margin-top: 25px;
                    margin-bottom: 15px;
                    font-size: 14pt;
                }
                table { 
                    width: 100%; 
                    border-collapse: collapse; 
                    margin-bottom: 20px; 
                    page-break-inside: avoid;
                }
                th { 
                    background: #6366f1; 
                    color: white; 
                    padding: 10px 8px; 
                    text-align: left; 
                    font-weight: bold;
                }
                td { 
                    padding: 8px; 
                    border: 1px solid #ddd; 
                }
                .day-section { 
                    margin-bottom: 30px; 
                    page-break-inside: avoid; 
                }
                .day-header { 
                    background: #e0e7ff; 
                    padding: 12px; 
                    font-weight: bold; 
                    font-size: 12pt;
                    border: 1px solid #6366f1;
                    border-bottom: none;
                }
                .event-row { 
                    background: #f9fafb; 
                }
                .event-row:nth-child(even) {
                    background: #ffffff;
                }
                .tour-badge { 
                    background: #6366f1; 
                    color: white; 
                    padding: 3px 8px; 
                    border-radius: 4px; 
                    font-size: 9pt; 
                    display: inline-block;
                }
                .stats-table {
                    margin-top: 30px;
                }
                .stats-table th {
                    background: #475569;
                }
                .no-events {
                    text-align: center;
                    color: #64748b;
                    font-style: italic;
                    padding: 20px;
                }
                @media print {
                    .day-section {
                        page-break-inside: avoid;
                    }
                }
            </style>
        </head>
        <body>
            <h1>Tourenplanung - Wochenplan${weekStartText}</h1>
            <p style="margin-bottom: 5px;"><strong>Variante:</strong> ${variantName}</p>
            <p style="margin-top: 5px; color: #64748b;">Erstellt am: ${new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
            
            ${days.map((dayName, dayIndex) => {
                const dayEvents = eventsByDay[dayIndex] || [];
                return `
                    <div class="day-section">
                        <div class="day-header">${dayName}</div>
                        ${dayEvents.length > 0 ? `
                            <table>
                                <thead>
                                    <tr>
                                        <th style="width: 20%;">Zeit</th>
                                        <th style="width: 40%;">Einsatz</th>
                                        <th style="width: 20%;">Tour</th>
                                        <th style="width: 20%;">Mitarbeiter</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${dayEvents.map(event => {
                                        const tour = tours.find(t => t.id === event.extendedProps?.tour);
                                        const employee = tour ? employees.find(e => e.id === tour.employee_id) : null;
                                        return `
                                            <tr class="event-row">
                                                <td><strong>${event.start}</strong> - ${event.end}</td>
                                                <td>${event.title}</td>
                                                <td>${tour ? `<span class="tour-badge">${tour.name}</span>` : '<span style="color: #94a3b8;">-</span>'}</td>
                                                <td>${employee ? employee.name : '<span style="color: #94a3b8;">-</span>'}</td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                        ` : `
                            <div class="no-events">Keine Einsätze geplant</div>
                        `}
                    </div>
                `;
            }).join('')}
            
            ${includeStats ? `
                <div style="page-break-before: always; margin-top: 40px;">
                    <h2>Statistiken</h2>
                    <table class="stats-table">
                        <thead>
                            <tr>
                                <th>Kategorie</th>
                                <th>Wert</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><strong>Gesamt Events</strong></td>
                                <td>${totalEvents}</td>
                            </tr>
                            <tr>
                                <td><strong>Gesamt Stunden</strong></td>
                                <td>${totalHours.toFixed(2)} h</td>
                            </tr>
                            <tr>
                                <td><strong>Anzahl Touren</strong></td>
                                <td>${tours.length}</td>
                            </tr>
                            <tr>
                                <td><strong>Anzahl Mitarbeiter</strong></td>
                                <td>${employees.length}</td>
                            </tr>
                        </tbody>
                    </table>
                    
                    ${Object.keys(tourStats).length > 0 ? `
                        <h2>Tour-Statistiken</h2>
                        <table class="stats-table">
                            <thead>
                                <tr>
                                    <th>Tour</th>
                                    <th>Anzahl Events</th>
                                    <th>Stunden</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${Object.values(tourStats).map(stat => `
                                    <tr>
                                        <td>${stat.name}</td>
                                        <td>${stat.count}</td>
                                        <td>${stat.hours.toFixed(2)} h</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    ` : ''}
                </div>
            ` : ''}
        </body>
        </html>
    `;
}

function parseTimeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return (hours || 0) * 60 + (minutes || 0);
}

module.exports = router;

