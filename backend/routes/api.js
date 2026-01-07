const express = require('express');
const router = express.Router();
const { pool } = require('../db/connection');

// GET /api/variants - Lädt alle Varianten
router.get('/variants', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, name, created_at, updated_at FROM variants ORDER BY name');
        res.json(result.rows);
    } catch (error) {
        console.error('Fehler beim Laden der Varianten:', error);
        res.status(500).json({ error: 'Fehler beim Laden der Varianten', details: error.message });
    }
});

// POST /api/variants - Erstellt neue Variante
router.post('/variants', async (req, res) => {
    try {
        const { name } = req.body;
        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'Variantenname ist erforderlich' });
        }
        
        const result = await pool.query(
            'INSERT INTO variants (name) VALUES ($1) RETURNING id, name, created_at, updated_at',
            [name.trim()]
        );
        
        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') {
            res.status(409).json({ error: 'Eine Variante mit diesem Namen existiert bereits' });
        } else {
            console.error('Fehler beim Erstellen der Variante:', error);
            res.status(500).json({ error: 'Fehler beim Erstellen der Variante', details: error.message });
        }
    }
});

// PUT /api/variants/:id - Aktualisiert Variante
router.put('/variants/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;
        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'Variantenname ist erforderlich' });
        }
        
        const result = await pool.query(
            'UPDATE variants SET name = $1 WHERE id = $2 RETURNING id, name, created_at, updated_at',
            [name.trim(), id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Variante nicht gefunden' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') {
            res.status(409).json({ error: 'Eine Variante mit diesem Namen existiert bereits' });
        } else {
            console.error('Fehler beim Aktualisieren der Variante:', error);
            res.status(500).json({ error: 'Fehler beim Aktualisieren der Variante', details: error.message });
        }
    }
});

// DELETE /api/variants/:id - Löscht Variante
router.delete('/variants/:id', async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const variantId = parseInt(id);
        
        if (isNaN(variantId)) {
            return res.status(400).json({ error: 'Ungültige Varianten-ID' });
        }
        
        // Prüfe ob Variante existiert
        const checkResult = await client.query('SELECT id, name FROM variants WHERE id = $1', [variantId]);
        if (checkResult.rows.length === 0) {
            return res.status(404).json({ error: 'Variante nicht gefunden' });
        }
        
        await client.query('BEGIN');
        
        // Lösche Variante (CASCADE sollte automatisch alle zugehörigen Daten löschen)
        const result = await client.query('DELETE FROM variants WHERE id = $1 RETURNING id', [variantId]);
        
        await client.query('COMMIT');
        
        res.json({ success: true, message: 'Variante gelöscht' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Fehler beim Löschen der Variante:', error);
        console.error('Error code:', error.code);
        console.error('Error detail:', error.detail);
        
        // Spezifische Fehlerbehandlung
        if (error.code === '23503') {
            res.status(409).json({ error: 'Variante kann nicht gelöscht werden, da sie noch referenziert wird' });
        } else {
            res.status(500).json({ error: 'Fehler beim Löschen der Variante', details: error.message });
        }
    } finally {
        client.release();
    }
});

// POST /api/variants/:id/duplicate - Dupliziert eine Variante mit allen Daten
router.post('/variants/:id/duplicate', async (req, res) => {
    const client = await pool.connect();
    
    try {
        const { id } = req.params;
        const { name } = req.body;
        
        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'Variantenname ist erforderlich' });
        }
        
        await client.query('BEGIN');
        
        // Prüfe ob Quell-Variante existiert
        const sourceVariantCheck = await client.query('SELECT id, name FROM variants WHERE id = $1', [id]);
        if (sourceVariantCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Quell-Variante nicht gefunden' });
        }
        
        // Lade alle Daten der Quell-Variante
        const sourceVariantId = parseInt(id);
        
        // Events laden
        const eventsResult = await client.query(
            'SELECT id, title, start, "end", day_index, extended_props FROM events WHERE variant_id = $1 ORDER BY day_index, start',
            [sourceVariantId]
        );
        const events = eventsResult.rows.map(row => ({
            id: row.id,
            title: row.title,
            start: row.start,
            end: row.end,
            dayIndex: row.day_index,
            extendedProps: row.extended_props
        }));

        // Pool laden
        const poolResult = await client.query('SELECT id, title, zone, types FROM pool WHERE variant_id = $1', [sourceVariantId]);
        const poolData = poolResult.rows.map(row => ({
            id: row.id,
            title: row.title,
            zone: row.zone,
            types: row.types
        }));

        // Employees laden
        const employeesResult = await client.query('SELECT id, name, weekly_hours, wage_group, transport, home_zone FROM employees WHERE variant_id = $1', [sourceVariantId]);
        const employees = employeesResult.rows.map(row => ({
            id: row.id,
            name: row.name,
            weeklyHours: row.weekly_hours,
            wageGroup: row.wage_group,
            transport: row.transport,
            homeZone: row.home_zone
        }));

        // Tours laden
        const toursResult = await client.query('SELECT id, name, employee_id, weekly_hours_limit FROM tours WHERE variant_id = $1', [sourceVariantId]);
        const tours = toursResult.rows.map(row => ({
            id: row.id,
            name: row.name,
            employeeId: row.employee_id || null,
            weeklyHoursLimit: row.weekly_hours_limit || null
        }));

        // Wage Settings laden
        const wageSettingsResult = await client.query('SELECT settings FROM wage_settings WHERE variant_id = $1 ORDER BY id DESC LIMIT 1', [sourceVariantId]);
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
        const favoritesResult = await client.query('SELECT favorites FROM favorites WHERE variant_id = $1 ORDER BY id DESC LIMIT 1', [sourceVariantId]);
        const favorites = favoritesResult.rows.length > 0 
            ? favoritesResult.rows[0].favorites 
            : [];

        // Erstelle neue Variante
        const newVariantResult = await client.query(
            'INSERT INTO variants (name) VALUES ($1) RETURNING id, name, created_at, updated_at',
            [name.trim()]
        );
        const newVariantId = newVariantResult.rows[0].id;

        // Kopiere Events
        if (events && Array.isArray(events)) {
            for (const event of events) {
                await client.query(
                    'INSERT INTO events (id, variant_id, title, start, "end", day_index, extended_props) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                    [event.id, newVariantId, event.title, event.start, event.end, event.dayIndex, JSON.stringify(event.extendedProps || {})]
                );
            }
        }

        // Kopiere Pool
        if (poolData && Array.isArray(poolData)) {
            for (const item of poolData) {
                await client.query(
                    'INSERT INTO pool (id, variant_id, title, zone, types) VALUES ($1, $2, $3, $4, $5)',
                    [item.id, newVariantId, item.title, item.zone || null, JSON.stringify(item.types || [])]
                );
            }
        }

        // Kopiere Employees
        if (employees && Array.isArray(employees)) {
            for (const employee of employees) {
                await client.query(
                    'INSERT INTO employees (id, variant_id, name, weekly_hours, wage_group, transport, home_zone) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                    [employee.id, newVariantId, employee.name, employee.weeklyHours || null, employee.wageGroup || null, employee.transport || null, employee.homeZone || null]
                );
            }
        }

        // Kopiere Tours
        if (tours && Array.isArray(tours)) {
            for (const tour of tours) {
                await client.query(
                    'INSERT INTO tours (id, variant_id, name, employee_id, weekly_hours_limit) VALUES ($1, $2, $3, $4, $5)',
                    [tour.id, newVariantId, tour.name, tour.employeeId || null, tour.weeklyHoursLimit || null]
                );
            }
        }

        // Kopiere Wage Settings
        if (wageSettings) {
            await client.query(
                'INSERT INTO wage_settings (variant_id, settings) VALUES ($1, $2)',
                [newVariantId, JSON.stringify(wageSettings)]
            );
        }

        // Kopiere Favorites
        if (favorites !== undefined) {
            await client.query(
                'INSERT INTO favorites (variant_id, favorites) VALUES ($1, $2)',
                [newVariantId, JSON.stringify(Array.isArray(favorites) ? favorites : [])]
            );
        }

        await client.query('COMMIT');
        res.status(201).json(newVariantResult.rows[0]);
    } catch (error) {
        await client.query('ROLLBACK');
        if (error.code === '23505') {
            res.status(409).json({ error: 'Eine Variante mit diesem Namen existiert bereits' });
        } else {
            console.error('Fehler beim Duplizieren der Variante:', error);
            res.status(500).json({ error: 'Fehler beim Duplizieren der Variante', details: error.message });
        }
    } finally {
        client.release();
    }
});

// GET /api/data - Lädt alle App-Daten für eine Variante
router.get('/data', async (req, res) => {
    try {
        const variantId = req.query.variant_id || req.headers['x-variant-id'];
        
        if (!variantId) {
            return res.status(400).json({ error: 'variant_id ist erforderlich' });
        }
        
        // Prüfe ob Variante existiert
        const variantCheck = await pool.query('SELECT id FROM variants WHERE id = $1', [variantId]);
        if (variantCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Variante nicht gefunden' });
        }
        // Events laden
        const eventsResult = await pool.query(
            'SELECT id, title, start, "end", day_index, extended_props FROM events WHERE variant_id = $1 ORDER BY day_index, start',
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

        // Pool laden
        const poolResult = await pool.query('SELECT id, title, zone, types FROM pool WHERE variant_id = $1', [variantId]);
        const poolData = poolResult.rows.map(row => ({
            id: row.id,
            title: row.title,
            zone: row.zone,
            types: row.types
        }));

        // Employees laden
        const employeesResult = await pool.query('SELECT id, name, weekly_hours, wage_group, transport, home_zone FROM employees WHERE variant_id = $1', [variantId]);
        const employees = employeesResult.rows.map(row => ({
            id: row.id,
            name: row.name,
            weeklyHours: row.weekly_hours,
            wageGroup: row.wage_group,
            transport: row.transport,
            homeZone: row.home_zone
        }));

        // Tours laden
        const toursResult = await pool.query('SELECT id, name, employee_id, weekly_hours_limit FROM tours WHERE variant_id = $1', [variantId]);
        const tours = toursResult.rows.map(row => ({
            id: row.id,
            name: row.name,
            employeeId: row.employee_id || null,
            weeklyHoursLimit: row.weekly_hours_limit || null
        }));

        // Wage Settings laden
        const wageSettingsResult = await pool.query('SELECT settings FROM wage_settings WHERE variant_id = $1 ORDER BY id DESC LIMIT 1', [variantId]);
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
        const favoritesResult = await pool.query('SELECT favorites FROM favorites WHERE variant_id = $1 ORDER BY id DESC LIMIT 1', [variantId]);
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

// PUT /api/data - Speichert alle App-Daten für eine Variante
router.put('/data', async (req, res) => {
    const client = await pool.connect();
    
    try {
        const variantId = req.query.variant_id || req.headers['x-variant-id'] || req.body.variant_id;
        
        if (!variantId) {
            return res.status(400).json({ error: 'variant_id ist erforderlich' });
        }
        
        // Prüfe ob Variante existiert
        const variantCheck = await client.query('SELECT id FROM variants WHERE id = $1', [variantId]);
        if (variantCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Variante nicht gefunden' });
        }
        
        await client.query('BEGIN');

        const { events, pool: poolData, employees, tours, wageSettings, favorites } = req.body;

        // Events speichern
        await client.query('DELETE FROM events WHERE variant_id = $1', [variantId]);
        if (events && Array.isArray(events)) {
            for (const event of events) {
                await client.query(
                    'INSERT INTO events (id, variant_id, title, start, "end", day_index, extended_props) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                    [event.id, variantId, event.title, event.start, event.end, event.dayIndex, JSON.stringify(event.extendedProps || {})]
                );
            }
        }

        // Pool speichern
        await client.query('DELETE FROM pool WHERE variant_id = $1', [variantId]);
        if (poolData && Array.isArray(poolData)) {
            for (const item of poolData) {
                await client.query(
                    'INSERT INTO pool (id, variant_id, title, zone, types) VALUES ($1, $2, $3, $4, $5)',
                    [item.id, variantId, item.title, item.zone || null, JSON.stringify(item.types || [])]
                );
            }
        }

        // Employees speichern
        await client.query('DELETE FROM employees WHERE variant_id = $1', [variantId]);
        if (employees && Array.isArray(employees)) {
            for (const employee of employees) {
                await client.query(
                    'INSERT INTO employees (id, variant_id, name, weekly_hours, wage_group, transport, home_zone) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                    [employee.id, variantId, employee.name, employee.weeklyHours || null, employee.wageGroup || null, employee.transport || null, employee.homeZone || null]
                );
            }
        }

        // Tours speichern
        await client.query('DELETE FROM tours WHERE variant_id = $1', [variantId]);
        if (tours && Array.isArray(tours)) {
            for (const tour of tours) {
                await client.query(
                    'INSERT INTO tours (id, variant_id, name, employee_id, weekly_hours_limit) VALUES ($1, $2, $3, $4, $5)',
                    [tour.id, variantId, tour.name, tour.employeeId || null, tour.weeklyHoursLimit || null]
                );
            }
        }

        // Wage Settings speichern
        if (wageSettings) {
            await client.query('DELETE FROM wage_settings WHERE variant_id = $1', [variantId]);
            await client.query(
                'INSERT INTO wage_settings (variant_id, settings) VALUES ($1, $2)',
                [variantId, JSON.stringify(wageSettings)]
            );
        }

        // Favorites speichern
        if (favorites !== undefined) {
            await client.query('DELETE FROM favorites WHERE variant_id = $1', [variantId]);
            await client.query(
                'INSERT INTO favorites (variant_id, favorites) VALUES ($1, $2)',
                [variantId, JSON.stringify(Array.isArray(favorites) ? favorites : [])]
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

// GET /api/backup - Erstellt Backup für eine Variante
router.get('/backup', async (req, res) => {
    try {
        const variantId = req.query.variant_id || req.headers['x-variant-id'];
        
        if (!variantId) {
            return res.status(400).json({ error: 'variant_id ist erforderlich' });
        }
        
        // Prüfe ob Variante existiert
        const variantCheck = await pool.query('SELECT id, name FROM variants WHERE id = $1', [variantId]);
        if (variantCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Variante nicht gefunden' });
        }
        
        const variantName = variantCheck.rows[0].name;
        
        // Lade alle Daten für diese Variante
        const eventsResult = await pool.query('SELECT id, title, start, "end", day_index, extended_props FROM events WHERE variant_id = $1', [variantId]);
        const poolResult = await pool.query('SELECT id, title, zone, types FROM pool WHERE variant_id = $1', [variantId]);
        const employeesResult = await pool.query('SELECT id, name, weekly_hours, wage_group, transport, home_zone FROM employees WHERE variant_id = $1', [variantId]);
        const toursResult = await pool.query('SELECT id, name, employee_id, weekly_hours_limit FROM tours WHERE variant_id = $1', [variantId]);
        const wageSettingsResult = await pool.query('SELECT settings FROM wage_settings WHERE variant_id = $1 ORDER BY id DESC LIMIT 1', [variantId]);
        const favoritesResult = await pool.query('SELECT favorites FROM favorites WHERE variant_id = $1 ORDER BY id DESC LIMIT 1', [variantId]);

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
        const filename = `Tourenplanung-Backup-${variantName}-${timestamp}.json`;
        
        const backupDataWithVariant = {
            ...backupData,
            variant_id: parseInt(variantId),
            variant_name: variantName
        };
        
        await pool.query(
            'INSERT INTO backups (filename, data) VALUES ($1, $2)',
            [filename, JSON.stringify(backupDataWithVariant)]
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
        const { data, variant_id } = req.body;
        
        if (!data) {
            return res.status(400).json({ error: 'Keine Backup-Daten bereitgestellt' });
        }
        
        // Verwende variant_id aus Backup oder aus Request
        const targetVariantId = variant_id || data.variant_id;
        
        if (!targetVariantId) {
            return res.status(400).json({ error: 'variant_id ist erforderlich' });
        }
        
        // Prüfe ob Variante existiert
        const variantCheck = await client.query('SELECT id FROM variants WHERE id = $1', [targetVariantId]);
        if (variantCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Variante nicht gefunden' });
        }

        await client.query('BEGIN');

        // Restore mit PUT /api/data Logik
        const { events, pool: poolData, employees, tours, wageSettings, favorites } = data;

        // Events
        await client.query('DELETE FROM events WHERE variant_id = $1', [targetVariantId]);
        if (events && Array.isArray(events)) {
            for (const event of events) {
                await client.query(
                    'INSERT INTO events (id, variant_id, title, start, "end", day_index, extended_props) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                    [event.id, targetVariantId, event.title, event.start, event.end, event.dayIndex, JSON.stringify(event.extendedProps || {})]
                );
            }
        }

        // Pool
        await client.query('DELETE FROM pool WHERE variant_id = $1', [targetVariantId]);
        if (poolData && Array.isArray(poolData)) {
            for (const item of poolData) {
                await client.query(
                    'INSERT INTO pool (id, variant_id, title, zone, types) VALUES ($1, $2, $3, $4, $5)',
                    [item.id, targetVariantId, item.title, item.zone || null, JSON.stringify(item.types || [])]
                );
            }
        }

        // Employees
        await client.query('DELETE FROM employees WHERE variant_id = $1', [targetVariantId]);
        if (employees && Array.isArray(employees)) {
            for (const employee of employees) {
                await client.query(
                    'INSERT INTO employees (id, variant_id, name, weekly_hours, wage_group, transport, home_zone) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                    [employee.id, targetVariantId, employee.name, employee.weeklyHours || null, employee.wageGroup || null, employee.transport || null, employee.homeZone || null]
                );
            }
        }

        // Tours
        await client.query('DELETE FROM tours WHERE variant_id = $1', [targetVariantId]);
        if (tours && Array.isArray(tours)) {
            for (const tour of tours) {
                await client.query(
                    'INSERT INTO tours (id, variant_id, name, employee_id, weekly_hours_limit) VALUES ($1, $2, $3, $4, $5)',
                    [tour.id, targetVariantId, tour.name, tour.employeeId || null, tour.weeklyHoursLimit || null]
                );
            }
        }

        // Wage Settings
        if (wageSettings) {
            await client.query('DELETE FROM wage_settings WHERE variant_id = $1', [targetVariantId]);
            await client.query(
                'INSERT INTO wage_settings (variant_id, settings) VALUES ($1, $2)',
                [targetVariantId, JSON.stringify(wageSettings)]
            );
        }

        // Favorites
        if (favorites !== undefined) {
            await client.query('DELETE FROM favorites WHERE variant_id = $1', [targetVariantId]);
            await client.query(
                'INSERT INTO favorites (variant_id, favorites) VALUES ($1, $2)',
                [targetVariantId, JSON.stringify(Array.isArray(favorites) ? favorites : [])]
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




