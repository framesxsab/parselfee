require('dotenv/config');

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { getDb, closeDb } = require('./db/schema');

const app = express();
const PORT = process.env.PORT || 3000;

// ---- SECURITY ----
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            'default-src': ["'self'"],
            'style-src': ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://unpkg.com"],
            'font-src': ["'self'", "https://fonts.gstatic.com"],
            'script-src': ["'self'", "'unsafe-inline'", "https://unpkg.com"],
            'script-src-attr': ["'unsafe-inline'"],
            'img-src': ["'self'", "data:", "https://tile.openstreetmap.org", "https://*.tile.openstreetmap.org", "https://unpkg.com"],
            'frame-src': ["'self'", "https://www.openstreetmap.org"],
            'connect-src': ["'self'"]
        }
    }
}));

app.use(cors({
    origin: process.env.NODE_ENV === 'production'
        ? process.env.ALLOWED_ORIGIN || false
        : true,
    credentials: true
}));

// Rate limiting
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    message: { error: 'Too many attempts. Try again in 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false
});

const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60,
    message: { error: 'Too many requests. Slow down.' },
    standardHeaders: true,
    legacyHeaders: false
});

// ---- MIDDLEWARE ----
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ---- ROUTES ----
app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/orders', apiLimiter, require('./routes/orders'));
app.use('/api/profile', apiLimiter, require('./routes/profile'));

// SPA fallback — serve index.html for all non-API routes
app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found.' });
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---- ERROR HANDLER ----
app.use((err, req, res, _next) => {
    console.error('[ERROR]', err.message);
    res.status(500).json({ error: 'Internal server error.' });
});

// ---- START ----
// Initialize DB on startup
getDb();

const server = app.listen(PORT, () => {
    console.log(`\n  ╔════════════════════════════════════╗`);
    console.log(`  ║   Parselfee running on port ${PORT}    ║`);
    console.log(`  ║   http://localhost:${PORT}            ║`);
    console.log(`  ╚════════════════════════════════════╝\n`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down...');
    closeDb();
    server.close(() => process.exit(0));
});

process.on('SIGTERM', () => {
    closeDb();
    server.close(() => process.exit(0));
});
