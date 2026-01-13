/**
 * Winston Logger Konfiguration
 * Strukturiertes Logging für das Backend
 */

const winston = require('winston');
const path = require('path');

// Log-Level aus Umgebungsvariable oder Default
const logLevel = process.env.LOG_LEVEL || 'info';

// Custom Format für lesbare Konsolen-Ausgabe
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
        return `${timestamp} [${level}]: ${message} ${metaStr}`;
    })
);

// JSON-Format für Datei-Logs
const fileFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
);

// Logger erstellen
const logger = winston.createLogger({
    level: logLevel,
    defaultMeta: { service: 'tourenplanung-backend' },
    transports: [
        // Konsolen-Output (für Entwicklung und Docker-Logs)
        new winston.transports.Console({
            format: consoleFormat
        })
    ]
});

// Datei-Transports nur hinzufügen wenn nicht in Docker (optional)
if (process.env.LOG_TO_FILE === 'true') {
    const logDir = process.env.LOG_DIR || 'logs';
    
    // Fehler-Log
    logger.add(new winston.transports.File({
        filename: path.join(logDir, 'error.log'),
        level: 'error',
        format: fileFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 5
    }));
    
    // Kombiniertes Log
    logger.add(new winston.transports.File({
        filename: path.join(logDir, 'app.log'),
        format: fileFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 5
    }));
}

// Request-Logger Middleware
const requestLogger = (req, res, next) => {
    const start = Date.now();
    
    res.on('finish', () => {
        const duration = Date.now() - start;
        const logData = {
            method: req.method,
            url: req.originalUrl,
            status: res.statusCode,
            duration: `${duration}ms`,
            ip: req.ip || req.headers['x-forwarded-for']
        };
        
        if (res.statusCode >= 400) {
            logger.warn('HTTP Request', logData);
        } else {
            logger.info('HTTP Request', logData);
        }
    });
    
    next();
};

// Error-Logger Middleware
const errorLogger = (err, req, res, next) => {
    logger.error('Unhandled Error', {
        error: err.message,
        stack: err.stack,
        method: req.method,
        url: req.originalUrl,
        body: req.body
    });
    next(err);
};

// Hilfsfunktionen für strukturiertes Logging
const logInfo = (message, meta = {}) => {
    logger.info(message, meta);
};

const logError = (message, error = null, meta = {}) => {
    const logMeta = { ...meta };
    if (error) {
        logMeta.error = error.message;
        logMeta.stack = error.stack;
    }
    logger.error(message, logMeta);
};

const logWarn = (message, meta = {}) => {
    logger.warn(message, meta);
};

const logDebug = (message, meta = {}) => {
    logger.debug(message, meta);
};

module.exports = {
    logger,
    requestLogger,
    errorLogger,
    logInfo,
    logError,
    logWarn,
    logDebug
};


