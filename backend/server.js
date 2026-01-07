require('dotenv').config();
const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes/api');
const exportRoutes = require('./routes/export');
const optimizationRoutes = require('./routes/optimization');
const geocodingRoutes = require('./routes/geocoding');
const { initializeDatabase } = require('./db/connection');
const { apiLimiter } = require('./middleware/rateLimiter');
const { requestLogger, errorLogger, logInfo, logError } = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request-Logger (vor allen Routes)
app.use(requestLogger);

// Rate-Limiting für API-Routes
app.use('/api', apiLimiter);

// API Routes
app.use('/api', apiRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/optimize', optimizationRoutes);
app.use('/api/geocoding', geocodingRoutes);

// Root endpoint
app.get('/', (req, res) => {
    res.json({ 
        message: 'Tourenplanung Backend API',
        version: '1.0.0',
        endpoints: {
            health: '/api/health',
            variants: '/api/variants',
            data: '/api/data?variant_id=ID',
            backup: '/api/backup?variant_id=ID',
            restore: '/api/backup/restore',
            export: {
                pdf: '/api/export/pdf?variant_id=ID'
            },
            optimize: {
                tours: '/api/optimize/tours'
            },
            geocoding: {
                geocode: '/api/geocoding/geocode',
                reverse: '/api/geocoding/reverse'
            }
        }
    });
});

// Error-Logger Middleware
app.use(errorLogger);

// Error handling middleware
app.use((err, req, res, next) => {
    logError('Unbehandelter Fehler', err, {
        method: req.method,
        url: req.originalUrl
    });
    
    res.status(500).json({ 
        error: 'Interner Serverfehler', 
        message: process.env.NODE_ENV === 'production' 
            ? 'Ein Fehler ist aufgetreten' 
            : err.message 
    });
});

// Start server
async function startServer() {
    try {
        // Initialize database schema
        await initializeDatabase();
        
        app.listen(PORT, () => {
            logInfo(`Server gestartet`, { port: PORT });
            console.log(`🚀 Server läuft auf Port ${PORT}`);
            console.log(`📡 API verfügbar unter http://localhost:${PORT}/api`);
        });
    } catch (error) {
        logError('Fehler beim Starten des Servers', error);
        console.error('❌ Fehler beim Starten des Servers:', error);
        process.exit(1);
    }
}

startServer();




