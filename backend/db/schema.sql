-- PostgreSQL Schema für Tourenplanungs-App

-- Events (Termine/Einsätze)
CREATE TABLE IF NOT EXISTS events (
    id VARCHAR(255) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    start VARCHAR(10) NOT NULL,
    "end" VARCHAR(10) NOT NULL,
    day_index INTEGER NOT NULL CHECK (day_index >= 0 AND day_index <= 6),
    extended_props JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Pool (Pool-Einträge)
CREATE TABLE IF NOT EXISTS pool (
    id VARCHAR(255) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    zone VARCHAR(255),
    types JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Employees (Mitarbeiter)
CREATE TABLE IF NOT EXISTS employees (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    weekly_hours INTEGER,
    wage_group VARCHAR(100),
    transport VARCHAR(50),
    home_zone VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tours (Touren)
CREATE TABLE IF NOT EXISTS tours (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    employee_id VARCHAR(255),
    weekly_hours_limit INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Wage Settings (Lohnkonfiguration)
CREATE TABLE IF NOT EXISTS wage_settings (
    id SERIAL PRIMARY KEY,
    settings JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Favorites (Favoriten)
CREATE TABLE IF NOT EXISTS favorites (
    id SERIAL PRIMARY KEY,
    favorites JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Backups
CREATE TABLE IF NOT EXISTS backups (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indizes für bessere Performance
CREATE INDEX IF NOT EXISTS idx_events_day_index ON events(day_index);
CREATE INDEX IF NOT EXISTS idx_events_extended_props ON events USING GIN(extended_props);
CREATE INDEX IF NOT EXISTS idx_pool_zone ON pool(zone);
CREATE INDEX IF NOT EXISTS idx_employees_home_zone ON employees(home_zone);
CREATE INDEX IF NOT EXISTS idx_tours_employee_id ON tours(employee_id);
CREATE INDEX IF NOT EXISTS idx_backups_created_at ON backups(created_at DESC);

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




