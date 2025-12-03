const express = require('express');
const router = express.Router();
const { pool } = require('../db/connection');

// GET /api/data - Lädt alle App-Daten
router.get('/data', async (req, res) => {
    try {
        // Events laden
        const eventsResult = await pool.query('SELECT id, title, start, "end", day_index, extended_props FROM events ORDER BY day_index, start');
        const events = eventsResult.rows.map(row => ({
            id: row.id,
            title: row.title,
            start: row.start,
            end: row.end,
            dayIndex: row.day_index,
            extendedProps: row.extended_props
        }));

        // Pool laden
        const poolResult = await pool.query('SELECT id, title, zone, types FROM pool');
        const poolData = poolResult.rows.map(row => ({
            id: row.id,
            title: row.title,
            zone: row.zone,
            types: row.types
        }));

        // Employees laden
        const employeesResult = await pool.query('SELECT id, name, weekly_hours, wage_group, transport, home_zone FROM employees');
        const employees = employeesResult.rows.map(row => ({
            id: row.id,
            name: row.name,
            weeklyHours: row.weekly_hours,
            wageGroup: row.wage_group,
            transport: row.transport,
            homeZone: row.home_zone
        }));

        // Tours laden
        const toursResult = await pool.query('SELECT id, name, employee_id, weekly_hours_limit FROM tours');
        const tours = toursResult.rows.map(row => ({
            id: row.id,
            name: row.name,
            employeeId: row.employee_id || null,
            weeklyHoursLimit: row.weekly_hours_limit || null
        }));

        // Wage Settings laden
        const wageSettingsResult = await pool.query('SELECT settings FROM wage_settings ORDER BY id DESC LIMIT 1');
        const wageSettings = wageSettingsResult.rows.length > 0 
            ? wageSettingsResult.rows[0].settings 
            : {
                wageGroups: [],
                surcharges: {},
                revenueRates: {},
                avgSpeed: 30,
                kmRate: 0.3,
                publicTransportMonthly: 30,
                employerFactor: 1.5,
                targetMargin: 50
            };

        // Favorites laden
        const favoritesResult = await pool.query('SELECT favorites FROM favorites ORDER BY id DESC LIMIT 1');
        const favorites = favoritesResult.rows.length > 0 
            ? favoritesResult.rows[0].favorites 
            : [];

        const appData = {
            events,
            pool: poolData,
            employees,
            tours,
            wageSettings,
            favorites
        };

        res.json(appData);
    } catch (error) {
        console.error('Fehler beim Laden der Daten:', error);
        res.status(500).json({ error: 'Fehler beim Laden der Daten', details: error.message });
    }
});

// PUT /api/data - Speichert alle App-Daten
router.put('/data', async (req, res) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');

        const { events, pool: poolData, employees, tours, wageSettings, favorites } = req.body;

        // Events speichern
        await client.query('DELETE FROM events');
        if (events && Array.isArray(events)) {
            for (const event of events) {
                await client.query(
                    'INSERT INTO events (id, title, start, "end", day_index, extended_props) VALUES ($1, $2, $3, $4, $5, $6)',
                    [event.id, event.title, event.start, event.end, event.dayIndex, JSON.stringify(event.extendedProps || {})]
                );
            }
        }

        // Pool speichern
        await client.query('DELETE FROM pool');
        if (poolData && Array.isArray(poolData)) {
            for (const item of poolData) {
                await client.query(
                    'INSERT INTO pool (id, title, zone, types) VALUES ($1, $2, $3, $4)',
                    [item.id, item.title, item.zone || null, JSON.stringify(item.types || [])]
                );
            }
        }

        // Employees speichern
        await client.query('DELETE FROM employees');
        if (employees && Array.isArray(employees)) {
            for (const employee of employees) {
                await client.query(
                    'INSERT INTO employees (id, name, weekly_hours, wage_group, transport, home_zone) VALUES ($1, $2, $3, $4, $5, $6)',
                    [employee.id, employee.name, employee.weeklyHours || null, employee.wageGroup || null, employee.transport || null, employee.homeZone || null]
                );
            }
        }

        // Tours speichern
        await client.query('DELETE FROM tours');
        if (tours && Array.isArray(tours)) {
            for (const tour of tours) {
                await client.query(
                    'INSERT INTO tours (id, name, employee_id, weekly_hours_limit) VALUES ($1, $2, $3, $4)',
                    [tour.id, tour.name, tour.employeeId || null, tour.weeklyHoursLimit || null]
                );
            }
        }

        // Wage Settings speichern
        if (wageSettings) {
            await client.query('DELETE FROM wage_settings');
            await client.query(
                'INSERT INTO wage_settings (settings) VALUES ($1)',
                [JSON.stringify(wageSettings)]
            );
        }

        // Favorites speichern
        if (favorites !== undefined) {
            await client.query('DELETE FROM favorites');
            await client.query(
                'INSERT INTO favorites (favorites) VALUES ($1)',
                [JSON.stringify(Array.isArray(favorites) ? favorites : [])]
            );
        }

        await client.query('COMMIT');
        res.json({ success: true, message: 'Daten erfolgreich gespeichert' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Fehler beim Speichern der Daten:', error);
        res.status(500).json({ error: 'Fehler beim Speichern der Daten', details: error.message });
    } finally {
        client.release();
    }
});

// GET /api/backup - Erstellt Backup
router.get('/backup', async (req, res) => {
    try {
        // Lade alle Daten
        const eventsResult = await pool.query('SELECT id, title, start, "end", day_index, extended_props FROM events');
        const poolResult = await pool.query('SELECT id, title, zone, types FROM pool');
        const employeesResult = await pool.query('SELECT id, name, weekly_hours, wage_group, transport, home_zone FROM employees');
        const toursResult = await pool.query('SELECT id, name, employee_id, weekly_hours_limit FROM tours');
        const wageSettingsResult = await pool.query('SELECT settings FROM wage_settings ORDER BY id DESC LIMIT 1');
        const favoritesResult = await pool.query('SELECT favorites FROM favorites ORDER BY id DESC LIMIT 1');

        const backupData = {
            events: eventsResult.rows.map(row => ({
                id: row.id,
                title: row.title,
                start: row.start,
                end: row.end,
                dayIndex: row.day_index,
                extendedProps: row.extended_props
            })),
            pool: poolResult.rows.map(row => ({
                id: row.id,
                title: row.title,
                zone: row.zone,
                types: row.types
            })),
            employees: employeesResult.rows.map(row => ({
                id: row.id,
                name: row.name,
                weeklyHours: row.weekly_hours,
                wageGroup: row.wage_group,
                transport: row.transport,
                homeZone: row.home_zone
            })),
            tours: toursResult.rows.map(row => ({
                id: row.id,
                name: row.name,
                employeeId: row.employee_id,
                weeklyHoursLimit: row.weekly_hours_limit
            })),
            wageSettings: wageSettingsResult.rows.length > 0 ? wageSettingsResult.rows[0].settings : null,
            favorites: favoritesResult.rows.length > 0 ? favoritesResult.rows[0].favorites : []
        };

        // Speichere Backup in Datenbank
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `Tourenplanung-Backup-${timestamp}.json`;
        
        await pool.query(
            'INSERT INTO backups (filename, data) VALUES ($1, $2)',
            [filename, JSON.stringify(backupData)]
        );

        res.json({
            success: true,
            filename,
            data: backupData,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Fehler beim Erstellen des Backups:', error);
        res.status(500).json({ error: 'Fehler beim Erstellen des Backups', details: error.message });
    }
});

// POST /api/backup/restore - Stellt Backup wieder her
router.post('/backup/restore', async (req, res) => {
    const client = await pool.connect();
    
    try {
        const { data } = req.body;
        
        if (!data) {
            return res.status(400).json({ error: 'Keine Backup-Daten bereitgestellt' });
        }

        await client.query('BEGIN');

        // Restore mit PUT /api/data Logik
        const { events, pool: poolData, employees, tours, wageSettings, favorites } = data;

        // Events
        await client.query('DELETE FROM events');
        if (events && Array.isArray(events)) {
            for (const event of events) {
                await client.query(
                    'INSERT INTO events (id, title, start, "end", day_index, extended_props) VALUES ($1, $2, $3, $4, $5, $6)',
                    [event.id, event.title, event.start, event.end, event.dayIndex, JSON.stringify(event.extendedProps || {})]
                );
            }
        }

        // Pool
        await client.query('DELETE FROM pool');
        if (poolData && Array.isArray(poolData)) {
            for (const item of poolData) {
                await client.query(
                    'INSERT INTO pool (id, title, zone, types) VALUES ($1, $2, $3, $4)',
                    [item.id, item.title, item.zone || null, JSON.stringify(item.types || [])]
                );
            }
        }

        // Employees
        await client.query('DELETE FROM employees');
        if (employees && Array.isArray(employees)) {
            for (const employee of employees) {
                await client.query(
                    'INSERT INTO employees (id, name, weekly_hours, wage_group, transport, home_zone) VALUES ($1, $2, $3, $4, $5, $6)',
                    [employee.id, employee.name, employee.weeklyHours || null, employee.wageGroup || null, employee.transport || null, employee.homeZone || null]
                );
            }
        }

        // Tours
        await client.query('DELETE FROM tours');
        if (tours && Array.isArray(tours)) {
            for (const tour of tours) {
                await client.query(
                    'INSERT INTO tours (id, name, employee_id, weekly_hours_limit) VALUES ($1, $2, $3, $4)',
                    [tour.id, tour.name, tour.employeeId || null, tour.weeklyHoursLimit || null]
                );
            }
        }

        // Wage Settings
        if (wageSettings) {
            await client.query('DELETE FROM wage_settings');
            await client.query(
                'INSERT INTO wage_settings (settings) VALUES ($1)',
                [JSON.stringify(wageSettings)]
            );
        }

        // Favorites
        if (favorites !== undefined) {
            await client.query('DELETE FROM favorites');
            await client.query(
                'INSERT INTO favorites (favorites) VALUES ($1)',
                [JSON.stringify(Array.isArray(favorites) ? favorites : [])]
            );
        }

        await client.query('COMMIT');
        res.json({ success: true, message: 'Backup erfolgreich wiederhergestellt' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Fehler beim Wiederherstellen des Backups:', error);
        res.status(500).json({ error: 'Fehler beim Wiederherstellen des Backups', details: error.message });
    } finally {
        client.release();
    }
});

// GET /api/health - Health Check
router.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ 
            status: 'healthy', 
            database: 'connected',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(503).json({ 
            status: 'unhealthy', 
            database: 'disconnected',
            error: error.message 
        });
    }
});

module.exports = router;




