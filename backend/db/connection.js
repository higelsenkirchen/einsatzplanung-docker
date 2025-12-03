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
        await pool.query(schema);
        console.log('✅ Datenbankschema initialisiert');
    } catch (error) {
        if (error.code === '42P07') {
            // Schema already exists
            console.log('ℹ️  Datenbankschema bereits vorhanden');
        } else {
            console.error('❌ Fehler beim Initialisieren des Schemas:', error);
            throw error;
        }
    }
}

module.exports = { pool, initializeDatabase };




