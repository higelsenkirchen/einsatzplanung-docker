require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
    host: process.env.DB_HOST || 'db',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'tourenplanung',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
});

async function createUsersTable() {
    const client = await pool.connect();
    
    try {
        console.log('Erstelle users-Tabelle...');
        
        // Prüfe ob Tabelle bereits existiert
        const checkResult = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'users'
            );
        `);
        
        if (checkResult.rows[0].exists) {
            console.log('✅ users-Tabelle existiert bereits');
            return;
        }
        
        // Erstelle users-Tabelle
        await client.query(`
            CREATE TABLE users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255) NOT NULL UNIQUE,
                email VARCHAR(255) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                role VARCHAR(50) NOT NULL DEFAULT 'viewer',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP,
                is_active BOOLEAN DEFAULT true
            );
        `);
        
        console.log('✅ users-Tabelle erstellt');
        
        // Erstelle Indizes
        await client.query('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);');
        await client.query('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);');
        console.log('✅ Indizes erstellt');
        
        // Erstelle Trigger
        await client.query(`
            CREATE OR REPLACE FUNCTION update_updated_at_column()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = CURRENT_TIMESTAMP;
                RETURN NEW;
            END;
            $$ language 'plpgsql';
        `);
        
        await client.query(`
            DROP TRIGGER IF EXISTS update_users_updated_at ON users;
            CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
                FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        `);
        console.log('✅ Trigger erstellt');
        
        // Erstelle variant_permissions Tabelle falls nicht vorhanden
        const permCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'variant_permissions'
            );
        `);
        
        if (!permCheck.rows[0].exists) {
            await client.query(`
                CREATE TABLE variant_permissions (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    variant_id INTEGER NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
                    permission_level VARCHAR(50) NOT NULL DEFAULT 'view',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, variant_id)
                );
            `);
            
            await client.query('CREATE INDEX IF NOT EXISTS idx_variant_permissions_user ON variant_permissions(user_id);');
            await client.query('CREATE INDEX IF NOT EXISTS idx_variant_permissions_variant ON variant_permissions(variant_id);');
            console.log('✅ variant_permissions-Tabelle erstellt');
        }
        
        // Erstelle audit_logs Tabelle falls nicht vorhanden
        const auditCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'audit_logs'
            );
        `);
        
        if (!auditCheck.rows[0].exists) {
            await client.query(`
                CREATE TABLE audit_logs (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id),
                    variant_id INTEGER REFERENCES variants(id),
                    action VARCHAR(100) NOT NULL,
                    entity_type VARCHAR(50) NOT NULL,
                    entity_id VARCHAR(255),
                    changes JSONB,
                    ip_address VARCHAR(45),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);
            
            await client.query('CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);');
            await client.query('CREATE INDEX IF NOT EXISTS idx_audit_logs_variant ON audit_logs(variant_id);');
            await client.query('CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);');
            console.log('✅ audit_logs-Tabelle erstellt');
        }
        
        console.log('✅ Alle Tabellen erfolgreich erstellt!');
        
    } catch (error) {
        console.error('❌ Fehler:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

createUsersTable()
    .then(() => {
        console.log('✅ Script erfolgreich abgeschlossen');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Script fehlgeschlagen:', error);
        process.exit(1);
    });

