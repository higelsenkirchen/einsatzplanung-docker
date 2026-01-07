-- PostgreSQL Schema für Tourenplanungs-App

-- Variants (Varianten/Personen)
CREATE TABLE IF NOT EXISTS variants (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Events (Termine/Einsätze)
CREATE TABLE IF NOT EXISTS events (
    id VARCHAR(255) NOT NULL,
    variant_id INTEGER NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    start VARCHAR(10) NOT NULL,
    "end" VARCHAR(10) NOT NULL,
    day_index INTEGER NOT NULL CHECK (day_index >= 0 AND day_index <= 6),
    extended_props JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, variant_id)
);

-- Pool (Pool-Einträge)
CREATE TABLE IF NOT EXISTS pool (
    id VARCHAR(255) NOT NULL,
    variant_id INTEGER NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    zone VARCHAR(255),
    types JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, variant_id)
);

-- Employees (Mitarbeiter)
CREATE TABLE IF NOT EXISTS employees (
    id VARCHAR(255) NOT NULL,
    variant_id INTEGER NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    weekly_hours INTEGER,
    wage_group VARCHAR(100),
    transport VARCHAR(50),
    home_zone VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, variant_id)
);

-- Tours (Touren)
CREATE TABLE IF NOT EXISTS tours (
    id VARCHAR(255) NOT NULL,
    variant_id INTEGER NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    employee_id VARCHAR(255),
    weekly_hours_limit INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, variant_id)
);

-- Wage Settings (Lohnkonfiguration)
CREATE TABLE IF NOT EXISTS wage_settings (
    id SERIAL PRIMARY KEY,
    variant_id INTEGER NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
    settings JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(variant_id)
);

-- Favorites (Favoriten)
CREATE TABLE IF NOT EXISTS favorites (
    id SERIAL PRIMARY KEY,
    variant_id INTEGER NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
    favorites JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(variant_id)
);

-- Backups
CREATE TABLE IF NOT EXISTS backups (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Users (Benutzerverwaltung)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'viewer', -- 'admin', 'planner', 'viewer'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);

-- Variant Permissions (Berechtigungen pro Variante)
CREATE TABLE IF NOT EXISTS variant_permissions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    variant_id INTEGER NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
    permission_level VARCHAR(50) NOT NULL DEFAULT 'view', -- 'view', 'edit', 'admin'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, variant_id)
);

-- Audit Logs (Änderungsprotokoll)
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    variant_id INTEGER REFERENCES variants(id),
    action VARCHAR(100) NOT NULL, -- 'create', 'update', 'delete', 'view', 'login'
    entity_type VARCHAR(50) NOT NULL, -- 'event', 'tour', 'employee', 'user', etc.
    entity_id VARCHAR(255),
    changes JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indizes für bessere Performance
CREATE INDEX IF NOT EXISTS idx_variants_name ON variants(name);
CREATE INDEX IF NOT EXISTS idx_events_variant_id ON events(variant_id);
CREATE INDEX IF NOT EXISTS idx_events_day_index ON events(day_index);
CREATE INDEX IF NOT EXISTS idx_events_extended_props ON events USING GIN(extended_props);
CREATE INDEX IF NOT EXISTS idx_pool_variant_id ON pool(variant_id);
CREATE INDEX IF NOT EXISTS idx_pool_zone ON pool(zone);
CREATE INDEX IF NOT EXISTS idx_employees_variant_id ON employees(variant_id);
CREATE INDEX IF NOT EXISTS idx_employees_home_zone ON employees(home_zone);
CREATE INDEX IF NOT EXISTS idx_tours_variant_id ON tours(variant_id);
CREATE INDEX IF NOT EXISTS idx_tours_employee_id ON tours(employee_id);
CREATE INDEX IF NOT EXISTS idx_wage_settings_variant_id ON wage_settings(variant_id);
CREATE INDEX IF NOT EXISTS idx_favorites_variant_id ON favorites(variant_id);
CREATE INDEX IF NOT EXISTS idx_backups_created_at ON backups(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_variant_permissions_user ON variant_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_variant_permissions_variant ON variant_permissions(variant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_variant ON audit_logs(variant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- Trigger für updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pool_updated_at BEFORE UPDATE ON pool
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON employees
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tours_updated_at BEFORE UPDATE ON tours
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_wage_settings_updated_at BEFORE UPDATE ON wage_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_favorites_updated_at BEFORE UPDATE ON favorites
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_variants_updated_at BEFORE UPDATE ON variants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Standard-Variante erstellen (falls noch keine existiert)
INSERT INTO variants (name) VALUES ('Standard')
ON CONFLICT (name) DO NOTHING;




