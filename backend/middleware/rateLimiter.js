/**
 * Rate Limiter Middleware
 * Begrenzt die Anzahl der API-Anfragen pro Zeitfenster
 */

const rateLimit = require('express-rate-limit');

// Standard API Rate-Limiter
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 Minuten
    max: 200, // max 200 Anfragen pro Fenster
    message: { 
        error: 'Zu viele Anfragen',
        message: 'Bitte warten Sie einige Minuten und versuchen Sie es erneut.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Requests nach IP zählen
    keyGenerator: (req) => {
        return req.ip || req.headers['x-forwarded-for'] || 'unknown';
    }
});

// Strikterer Limiter für sensible Endpunkte (z.B. Varianten-Operationen)
const strictLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 Stunde
    max: 50, // max 50 Anfragen pro Stunde
    message: {
        error: 'Rate-Limit erreicht',
        message: 'Zu viele Anfragen für diesen Endpunkt. Bitte später erneut versuchen.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Sehr strenger Limiter für Massen-Operationen
const bulkLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 Minute
    max: 10, // max 10 Anfragen pro Minute
    message: {
        error: 'Rate-Limit für Bulk-Operationen erreicht',
        message: 'Bitte warten Sie eine Minute vor dem nächsten Bulk-Vorgang.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

module.exports = {
    apiLimiter,
    strictLimiter,
    bulkLimiter
};

