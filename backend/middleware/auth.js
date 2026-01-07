const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('../db/connection');

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-key-in-production-min-32-chars';
const JWT_EXPIRY = '7d';

// Passwort hashen
async function hashPassword(password) {
    return await bcrypt.hash(password, 10);
}

// Passwort verifizieren
async function verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
}

// JWT Token erstellen
function createToken(user) {
    return jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRY }
    );
}

// Middleware: Token verifizieren
async function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Kein Token bereitgestellt' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const result = await pool.query('SELECT id, username, email, role, is_active FROM users WHERE id = $1', [decoded.id]);
        
        if (result.rows.length === 0 || !result.rows[0].is_active) {
            return res.status(401).json({ error: 'Benutzer nicht gefunden oder inaktiv' });
        }

        req.user = result.rows[0];
        next();
    } catch (error) {
        return res.status(403).json({ error: 'Ungültiges Token' });
    }
}

// Middleware: Optional Auth (für öffentliche Endpunkte)
async function optionalAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            const result = await pool.query('SELECT id, username, email, role, is_active FROM users WHERE id = $1', [decoded.id]);
            
            if (result.rows.length > 0 && result.rows[0].is_active) {
                req.user = result.rows[0];
            }
        } catch (error) {
            // Token ungültig, aber Endpunkt ist optional auth
        }
    }
    next();
}

// Middleware: Rolle prüfen
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Unzureichende Berechtigung' });
        }
        next();
    };
}

// Middleware: Varianten-Berechtigung prüfen
async function checkVariantPermission(req, res, next) {
    const variantId = req.query.variant_id || req.params.variant_id || req.body.variant_id;
    
    if (!variantId) {
        return res.status(400).json({ error: 'variant_id erforderlich' });
    }

    // Admin hat immer Zugriff
    if (req.user && req.user.role === 'admin') {
        return next();
    }

    // Wenn kein User, dann nur lesen erlauben (für öffentliche Zugriffe)
    if (!req.user) {
        req.variantPermission = 'view';
        return next();
    }

    // Prüfe spezifische Berechtigung
    const result = await pool.query(
        'SELECT permission_level FROM variant_permissions WHERE user_id = $1 AND variant_id = $2',
        [req.user.id, variantId]
    );

    if (result.rows.length === 0) {
        // Keine explizite Berechtigung - Standard: viewer kann lesen
        if (req.user.role === 'viewer' || req.user.role === 'planner') {
            req.variantPermission = 'view';
            return next();
        }
        return res.status(403).json({ error: 'Keine Berechtigung für diese Variante' });
    }

    req.variantPermission = result.rows[0].permission_level;
    next();
}

// Prüfe ob Schreibzugriff erlaubt
function requireEditPermission(req, res, next) {
    if (req.user && req.user.role === 'admin') {
        return next();
    }
    
    if (req.variantPermission === 'edit' || req.variantPermission === 'admin') {
        return next();
    }
    
    return res.status(403).json({ error: 'Keine Schreibberechtigung für diese Variante' });
}

// Audit Log erstellen
async function createAuditLog(userId, variantId, action, entityType, entityId, changes = null, ipAddress = null) {
    try {
        await pool.query(
            'INSERT INTO audit_logs (user_id, variant_id, action, entity_type, entity_id, changes, ip_address) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [userId, variantId, action, entityType, entityId, changes ? JSON.stringify(changes) : null, ipAddress]
        );
    } catch (error) {
        console.error('Fehler beim Erstellen des Audit-Logs:', error);
    }
}

module.exports = {
    hashPassword,
    verifyPassword,
    createToken,
    authenticateToken,
    optionalAuth,
    requireRole,
    checkVariantPermission,
    requireEditPermission,
    createAuditLog
};

