-- Migration: Füge Adressfelder zu employees Tabelle hinzu
-- Erstellt: 2024

-- Füge Spalten hinzu, falls sie nicht existieren
DO $$ 
BEGIN
    -- address Spalte
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'employees' AND column_name = 'address') THEN
        ALTER TABLE employees ADD COLUMN address VARCHAR(255) DEFAULT NULL;
    END IF;
    
    -- postal_code Spalte
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'employees' AND column_name = 'postal_code') THEN
        ALTER TABLE employees ADD COLUMN postal_code VARCHAR(10) DEFAULT NULL;
    END IF;
    
    -- extended_props Spalte (für Koordinaten)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'employees' AND column_name = 'extended_props') THEN
        ALTER TABLE employees ADD COLUMN extended_props JSONB DEFAULT '{}';
    END IF;
END $$;

-- Erstelle Index für extended_props falls nicht vorhanden
CREATE INDEX IF NOT EXISTS idx_employees_extended_props ON employees USING GIN(extended_props);

