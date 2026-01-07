const express = require('express');
const router = express.Router();
const { pool } = require('../db/connection');
const { hashPassword, verifyPassword, createToken, authenticateToken, requireRole, createAuditLog } = require('../middleware/auth');

// POST /api/auth/setup - Ersten Admin-Benutzer erstellen (nur wenn noch keine Benutzer existieren)
router.post('/setup', async (req, res) => {
    try {
        // Prüfe ob users-Tabelle existiert
        try {
            await pool.query('SELECT 1 FROM users LIMIT 1');
        } catch (tableError) {
            if (tableError.code === '42P01') {
                return res.status(500).json({ 
                    error: 'Datenbankfehler: users-Tabelle existiert nicht. Bitte warten Sie, bis die Datenbank initialisiert wurde, oder starten Sie den Backend-Container neu.',
                    details: 'Das Schema wird beim Start des Backend-Containers automatisch erstellt.'
                });
            }
            throw tableError;
        }

        // Prüfe ob bereits Benutzer existieren
        const userCheck = await pool.query('SELECT COUNT(*) as count FROM users');
        if (parseInt(userCheck.rows[0].count) > 0) {
            return res.status(403).json({ error: 'Setup bereits abgeschlossen. Verwende /api/auth/register' });
        }

        const { username, email, password } = req.body;

        if (!username || !email || !password || password.length < 6) {
            return res.status(400).json({ error: 'Benutzername, E-Mail und Passwort (min. 6 Zeichen) sind erforderlich' });
        }

        // Validiere E-Mail Format (einfach)
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Ungültiges E-Mail-Format' });
        }

        const passwordHash = await hashPassword(password);
        
        const result = await pool.query(
            'INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role',
            [username.trim(), email.trim().toLowerCase(), passwordHash, 'admin']
        );

        const token = createToken(result.rows[0]);
        
        res.status(201).json({ 
            success: true,
            message: 'Admin-Benutzer erfolgreich erstellt',
            token,
            user: result.rows[0]
        });
    } catch (error) {
        console.error('Fehler bei Setup:', error);
        console.error('Error stack:', error.stack);
        console.error('Error code:', error.code);
        
        if (error.code === '23505') {
            res.status(409).json({ error: 'Benutzername oder E-Mail bereits vorhanden' });
        } else if (error.code === '42P01') {
            res.status(500).json({ 
                error: 'Datenbankfehler: Tabelle existiert nicht',
                details: 'Bitte warten Sie, bis die Datenbank initialisiert wurde.'
            });
        } else {
            res.status(500).json({ 
                error: 'Fehler bei Setup', 
                details: error.message,
                code: error.code
            });
        }
    }
});

// POST /api/auth/register - Neuen Benutzer registrieren (nur Admin)
router.post('/register', authenticateToken, async (req, res) => {
    try {
        // Nur Admin kann Benutzer erstellen
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Nur Administratoren können Benutzer erstellen' });
        }

        const { username, email, password, role } = req.body;

        if (!username || !email || !password || password.length < 6) {
            return res.status(400).json({ error: 'Benutzername, E-Mail und Passwort (min. 6 Zeichen) sind erforderlich' });
        }

        const passwordHash = await hashPassword(password);
        const result = await pool.query(
            'INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role',
            [username, email, passwordHash, role || 'viewer']
        );

        await createAuditLog(req.user.id, null, 'create', 'user', result.rows[0].id.toString(), { username, email, role }, req.ip);
        
        res.status(201).json({ user: result.rows[0] });
    } catch (error) {
        if (error.code === '23505') {
            res.status(409).json({ error: 'Benutzername oder E-Mail bereits vorhanden' });
        } else {
            console.error('Fehler bei Registrierung:', error);
            res.status(500).json({ error: 'Fehler bei Registrierung', details: error.message });
        }
    }
});

// POST /api/auth/login - Einloggen
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Benutzername und Passwort erforderlich' });
        }

        const result = await pool.query(
            'SELECT id, username, email, password_hash, role, is_active FROM users WHERE username = $1 OR email = $1',
            [username]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
        }

        const user = result.rows[0];

        if (!user.is_active) {
            return res.status(403).json({ error: 'Benutzerkonto ist deaktiviert' });
        }

        const isValid = await verifyPassword(password, user.password_hash);

        if (!isValid) {
            return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
        }

        // Update last_login
        await pool.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

        const token = createToken(user);
        const ipAddress = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'];
        await createAuditLog(user.id, null, 'login', 'auth', null, null, ipAddress);

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Fehler beim Login:', error);
        res.status(500).json({ error: 'Fehler beim Login', details: error.message });
    }
});

// GET /api/auth/me - Aktuellen Benutzer abrufen
router.get('/me', authenticateToken, async (req, res) => {
    res.json({
        id: req.user.id,
        username: req.user.username,
        email: req.user.email,
        role: req.user.role
    });
});

// GET /api/auth/users - Alle Benutzer auflisten (nur Admin)
router.get('/users', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Nur Administratoren können Benutzer auflisten' });
        }

        const result = await pool.query(
            'SELECT id, username, email, role, is_active, created_at, last_login FROM users ORDER BY username'
        );

        res.json(result.rows);
    } catch (error) {
        console.error('Fehler beim Laden der Benutzer:', error);
        res.status(500).json({ error: 'Fehler beim Laden der Benutzer', details: error.message });
    }
});

// PUT /api/auth/users/:id - Benutzer aktualisieren (nur Admin)
router.put('/users/:id', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Nur Administratoren können Benutzer aktualisieren' });
        }

        const { id } = req.params;
        const { username, email, role, is_active } = req.body;

        const updates = [];
        const values = [];
        let paramCount = 1;

        if (username !== undefined) {
            updates.push(`username = $${paramCount++}`);
            values.push(username);
        }
        if (email !== undefined) {
            updates.push(`email = $${paramCount++}`);
            values.push(email);
        }
        if (role !== undefined) {
            updates.push(`role = $${paramCount++}`);
            values.push(role);
        }
        if (is_active !== undefined) {
            updates.push(`is_active = $${paramCount++}`);
            values.push(is_active);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'Keine Felder zum Aktualisieren angegeben' });
        }

        values.push(id);
        const query = `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING id, username, email, role, is_active`;
        
        const result = await pool.query(query, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Benutzer nicht gefunden' });
        }

        await createAuditLog(req.user.id, null, 'update', 'user', id, req.body, req.ip);
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Fehler beim Aktualisieren des Benutzers:', error);
        res.status(500).json({ error: 'Fehler beim Aktualisieren des Benutzers', details: error.message });
    }
});

// POST /api/auth/permissions - Berechtigung für Variante setzen
router.post('/permissions', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { user_id, variant_id, permission_level } = req.body;

        if (!user_id || !variant_id || !permission_level) {
            return res.status(400).json({ error: 'user_id, variant_id und permission_level sind erforderlich' });
        }

        if (!['view', 'edit', 'admin'].includes(permission_level)) {
            return res.status(400).json({ error: 'permission_level muss view, edit oder admin sein' });
        }

        const result = await pool.query(
            'INSERT INTO variant_permissions (user_id, variant_id, permission_level) VALUES ($1, $2, $3) ON CONFLICT (user_id, variant_id) DO UPDATE SET permission_level = $3 RETURNING *',
            [user_id, variant_id, permission_level]
        );

        await createAuditLog(req.user.id, variant_id, 'update', 'permission', user_id.toString(), { permission_level }, req.ip);
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Fehler beim Setzen der Berechtigung:', error);
        res.status(500).json({ error: 'Fehler beim Setzen der Berechtigung', details: error.message });
    }
});

module.exports = router;

