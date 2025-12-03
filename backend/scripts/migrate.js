#!/usr/bin/env node

/**
 * Migrationsskript: Importiert Daten aus PflegePlan.sync.json in PostgreSQL
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'tourenplanung',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
});

async function migrate() {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Lade JSON-Datei
        const jsonPath = process.argv[2] || path.join(__dirname, '..', 'PflegePlan.sync.json');
        
        if (!fs.existsSync(jsonPath)) {
            console.error(`❌ Datei nicht gefunden: ${jsonPath}`);
            console.log('💡 Verwendung: node scripts/migrate.js [Pfad zur JSON-Datei]');
            process.exit(1);
        }
        
        console.log(`📂 Lade Daten aus: ${jsonPath}`);
        const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        
        // Events
        console.log('📝 Importiere Events...');
        await client.query('DELETE FROM events');
        if (jsonData.events && Array.isArray(jsonData.events)) {
            for (const event of jsonData.events) {
                await client.query(
                    'INSERT INTO events (id, title, start, "end", day_index, extended_props) VALUES ($1, $2, $3, $4, $5, $6)',
                    [event.id, event.title, event.start, event.end, event.dayIndex, JSON.stringify(event.extendedProps || {})]
                );
            }
            console.log(`   ✅ ${jsonData.events.length} Events importiert`);
        }
        
        // Pool
        console.log('📝 Importiere Pool...');
        await client.query('DELETE FROM pool');
        if (jsonData.pool && Array.isArray(jsonData.pool)) {
            for (const item of jsonData.pool) {
                await client.query(
                    'INSERT INTO pool (id, title, zone, types) VALUES ($1, $2, $3, $4)',
                    [item.id, item.title, item.zone || null, JSON.stringify(item.types || [])]
                );
            }
            console.log(`   ✅ ${jsonData.pool.length} Pool-Einträge importiert`);
        }
        
        // Employees
        console.log('📝 Importiere Mitarbeiter...');
        await client.query('DELETE FROM employees');
        if (jsonData.employees && Array.isArray(jsonData.employees)) {
            for (const employee of jsonData.employees) {
                await client.query(
                    'INSERT INTO employees (id, name, weekly_hours, wage_group, transport, home_zone) VALUES ($1, $2, $3, $4, $5, $6)',
                    [employee.id, employee.name, employee.weeklyHours || null, employee.wageGroup || null, employee.transport || null, employee.homeZone || null]
                );
            }
            console.log(`   ✅ ${jsonData.employees.length} Mitarbeiter importiert`);
        }
        
        // Tours
        console.log('📝 Importiere Touren...');
        await client.query('DELETE FROM tours');
        if (jsonData.tours && Array.isArray(jsonData.tours)) {
            for (const tour of jsonData.tours) {
                await client.query(
                    'INSERT INTO tours (id, name, employee_id, weekly_hours_limit) VALUES ($1, $2, $3, $4)',
                    [tour.id, tour.name, tour.employeeId || null, tour.weeklyHoursLimit || null]
                );
            }
            console.log(`   ✅ ${jsonData.tours.length} Touren importiert`);
        }
        
        // Wage Settings
        console.log('📝 Importiere Lohnkonfiguration...');
        await client.query('DELETE FROM wage_settings');
        if (jsonData.wageSettings) {
            await client.query(
                'INSERT INTO wage_settings (settings) VALUES ($1)',
                [JSON.stringify(jsonData.wageSettings)]
            );
            console.log('   ✅ Lohnkonfiguration importiert');
        }
        
        // Favorites
        console.log('📝 Importiere Favoriten...');
        await client.query('DELETE FROM favorites');
        if (jsonData.favorites !== undefined) {
            await client.query(
                'INSERT INTO favorites (favorites) VALUES ($1)',
                [JSON.stringify(Array.isArray(jsonData.favorites) ? jsonData.favorites : [])]
            );
            console.log('   ✅ Favoriten importiert');
        }
        
        await client.query('COMMIT');
        console.log('\n✅ Migration erfolgreich abgeschlossen!');
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('\n❌ Fehler bei der Migration:', error);
        throw error;
    } finally {
        client.release();
    }
}

migrate()
    .then(() => {
        pool.end();
        process.exit(0);
    })
    .catch((error) => {
        console.error(error);
        pool.end();
        process.exit(1);
    });

