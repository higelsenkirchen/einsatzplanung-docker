const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST || 'db',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'tourenplanung',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Test connection
pool.on('connect', () => {
    console.log('✅ Verbunden mit PostgreSQL');
});

pool.on('error', (err) => {
    console.error('❌ Datenbankfehler:', err);
});

// Initialize database schema
async function initializeDatabase() {
    const fs = require('fs');
    const path = require('path');
    
    try {
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');
        
        // Teile Schema in einzelne Statements auf und führe sie einzeln aus
        // Das verhindert, dass ein Fehler alle vorherigen Statements rückgängig macht
        const statements = schema
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('--'));
        
        const client = await pool.connect();
        
        try {
            for (const statement of statements) {
                try {
                    await client.query(statement);
                } catch (stmtError) {
                    // Ignoriere Fehler für bereits existierende Objekte
                    if (stmtError.code === '42P07' || // Table already exists
                        stmtError.code === '42710' || // Object already exists
                        stmtError.code === '42P16' || // Index already exists
                        stmtError.code === '42723') { // Function already exists
                        // Objekt existiert bereits, das ist OK
                        continue;
                    }
                    // Andere Fehler weiterwerfen
                    throw stmtError;
                }
            }
            console.log('✅ Datenbankschema initialisiert');
        } finally {
            client.release();
        }
        
        // Migration: Bestehende Daten auf Standard-Variante setzen
        await migrateExistingDataToVariants();
    } catch (error) {
        console.error('❌ Fehler beim Initialisieren des Schemas:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        // Wir werfen den Fehler nicht, damit der Server trotzdem startet
        // Falls Tabellen fehlen, werden sie beim nächsten Versuch erstellt
    }
}

// Migration: Setzt bestehende Daten auf Standard-Variante
async function migrateExistingDataToVariants() {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Prüfe ob Varianten-Tabelle existiert
        const tableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'variants'
            );
        `);
        
        if (!tableCheck.rows[0].exists) {
            console.log('ℹ️  Varianten-Tabelle existiert noch nicht, Migration übersprungen');
            await client.query('COMMIT');
            return;
        }
        
        // Hole Standard-Variante (oder erstelle sie)
        let variantResult = await client.query('SELECT id FROM variants WHERE name = $1', ['Standard']);
        let variantId;
        
        if (variantResult.rows.length === 0) {
            const insertResult = await client.query('INSERT INTO variants (name) VALUES ($1) RETURNING id', ['Standard']);
            variantId = insertResult.rows[0].id;
            console.log('✅ Standard-Variante erstellt');
        } else {
            variantId = variantResult.rows[0].id;
        }
        
        // Prüfe ob Tabellen bereits variant_id haben
        const eventsCheck = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'events' AND column_name = 'variant_id'
        `);
        
        if (eventsCheck.rows.length === 0) {
            console.log('ℹ️  Tabellen haben noch keine variant_id, Migration übersprungen');
            await client.query('COMMIT');
            return;
        }
        
        // Prüfe ob bereits Daten mit variant_id existieren
        const existingEventsCheck = await client.query('SELECT COUNT(*) FROM events WHERE variant_id IS NOT NULL');
        if (parseInt(existingEventsCheck.rows[0].count) > 0) {
            console.log('ℹ️  Daten haben bereits variant_id, Migration übersprungen');
            await client.query('COMMIT');
            return;
        }
        
        // Migriere Events (nur wenn variant_id NULL ist)
        const eventsCount = await client.query('SELECT COUNT(*) FROM events WHERE variant_id IS NULL');
        if (parseInt(eventsCount.rows[0].count) > 0) {
            await client.query(`
                UPDATE events 
                SET variant_id = $1 
                WHERE variant_id IS NULL
            `, [variantId]);
            console.log(`✅ ${eventsCount.rows[0].count} Events migriert`);
        }
        
        // Migriere Pool
        const poolCount = await client.query('SELECT COUNT(*) FROM pool WHERE variant_id IS NULL');
        if (parseInt(poolCount.rows[0].count) > 0) {
            await client.query(`
                UPDATE pool 
                SET variant_id = $1 
                WHERE variant_id IS NULL
            `, [variantId]);
            console.log(`✅ ${poolCount.rows[0].count} Pool-Einträge migriert`);
        }
        
        // Migriere Employees
        const employeesCount = await client.query('SELECT COUNT(*) FROM employees WHERE variant_id IS NULL');
        if (parseInt(employeesCount.rows[0].count) > 0) {
            await client.query(`
                UPDATE employees 
                SET variant_id = $1 
                WHERE variant_id IS NULL
            `, [variantId]);
            console.log(`✅ ${employeesCount.rows[0].count} Mitarbeiter migriert`);
        }
        
        // Migriere Tours
        const toursCount = await client.query('SELECT COUNT(*) FROM tours WHERE variant_id IS NULL');
        if (parseInt(toursCount.rows[0].count) > 0) {
            await client.query(`
                UPDATE tours 
                SET variant_id = $1 
                WHERE variant_id IS NULL
            `, [variantId]);
            console.log(`✅ ${toursCount.rows[0].count} Touren migriert`);
        }
        
        // Migriere Wage Settings
        const wageSettingsCount = await client.query('SELECT COUNT(*) FROM wage_settings WHERE variant_id IS NULL');
        if (parseInt(wageSettingsCount.rows[0].count) > 0) {
            await client.query(`
                UPDATE wage_settings 
                SET variant_id = $1 
                WHERE variant_id IS NULL
            `, [variantId]);
            console.log(`✅ Lohnkonfiguration migriert`);
        }
        
        // Migriere Favorites
        const favoritesCount = await client.query('SELECT COUNT(*) FROM favorites WHERE variant_id IS NULL');
        if (parseInt(favoritesCount.rows[0].count) > 0) {
            await client.query(`
                UPDATE favorites 
                SET variant_id = $1 
                WHERE variant_id IS NULL
            `, [variantId]);
            console.log(`✅ Favoriten migriert`);
        }
        
        await client.query('COMMIT');
        console.log('✅ Migration zu Varianten abgeschlossen');
    } catch (error) {
        await client.query('ROLLBACK');
        // Fehler nicht werfen, da Migration optional ist
        console.log('ℹ️  Migration zu Varianten übersprungen:', error.message);
    } finally {
        client.release();
    }
}

module.exports = { pool, initializeDatabase };




