require('dotenv').config();
const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes/api');
const authRoutes = require('./routes/auth');
const exportRoutes = require('./routes/export');
const optimizationRoutes = require('./routes/optimization');
const { initializeDatabase } = require('./db/connection');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// API Routes
app.use('/api', apiRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/optimize', optimizationRoutes);

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
            auth: {
                setup: '/api/auth/setup',
                login: '/api/auth/login',
                register: '/api/auth/register',
                me: '/api/auth/me',
                users: '/api/auth/users'
            },
            export: {
                pdf: '/api/export/pdf?variant_id=ID'
            },
            optimize: {
                tours: '/api/optimize/tours'
            }
        }
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Fehler:', err);
    res.status(500).json({ 
        error: 'Interner Serverfehler', 
        message: err.message 
    });
});

// Start server
async function startServer() {
    try {
        // Initialize database schema
        await initializeDatabase();
        
        app.listen(PORT, () => {
            console.log(`🚀 Server läuft auf Port ${PORT}`);
            console.log(`📡 API verfügbar unter http://localhost:${PORT}/api`);
        });
    } catch (error) {
        console.error('❌ Fehler beim Starten des Servers:', error);
        process.exit(1);
    }
}

startServer();




