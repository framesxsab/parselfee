require('dotenv/config');

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const path = require('path');
const { config } = require('./config');
const { getDb, closeDb } = require('./db/schema');
const { csrfProtection } = require('./middleware/csrf');

const app = express();
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

if (config.isProduction && config.allowedOrigins.length === 0) {
    console.warn('[WARN] ALLOWED_ORIGIN is not set. Cross-origin browser API calls will be blocked.');
}

app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy);

// ---- SECURITY ----
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            'default-src': config.csp.defaultSrc,
            'style-src': config.csp.styleSrc,
            'font-src': config.csp.fontSrc,
            'script-src': config.csp.scriptSrc,
            'script-src-attr': config.csp.scriptSrcAttr,
            'img-src': config.csp.imgSrc,
            'frame-src': config.csp.frameSrc,
            'connect-src': config.csp.connectSrc
        }
    }
}));

app.use(cors({
    origin(origin, callback) {
        if (!config.isProduction) return callback(null, true);
        if (!origin) return callback(null, true);
        if (config.allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true
}));

const authLimiter = rateLimit({
    windowMs: config.rateLimit.authWindowMs,
    max: config.rateLimit.authMax,
    message: { error: 'Too many attempts. Try again later.' },
    standardHeaders: true,
    legacyHeaders: false
});

const apiLimiter = rateLimit({
    windowMs: config.rateLimit.apiWindowMs,
    max: config.rateLimit.apiMax,
    message: { error: 'Too many requests. Slow down.' },
    standardHeaders: true,
    legacyHeaders: false
});

// ---- MIDDLEWARE ----
app.use(express.json({ limit: config.requestBodyLimit }));
app.use(cookieParser());

// Request ID tracing
app.use((req, res, next) => {
    req.id = req.get('X-Request-ID') || crypto.randomUUID();
    res.set('X-Request-ID', req.id);
    next();
});

app.use('/api', (req, res, next) => {
    if (BODY_METHODS.has(req.method) && !req.is('application/json')) {
        return res.status(415).json({ error: 'Content-Type must be application/json.' });
    }

    return next();
});
app.use('/api', csrfProtection({
    excludedPaths: config.csrf.excludedPaths
}));

app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/health/ready', async (_req, res) => {
    try {
        const db = await getDb();
        await db.query('SELECT 1');
        res.json({ status: 'ready', timestamp: new Date().toISOString() });
    } catch (err) {
        res.status(503).json({ status: 'unavailable', error: err.message });
    }
});

app.get('/api/config', (_req, res) => {
    res.json({
        auth: {
            allowedEmailDomains: config.auth.allowedEmailDomains,
            emailMaxLength: config.auth.emailMaxLength,
            nameMinLength: config.auth.nameMinLength,
            nameMaxLength: config.auth.nameMaxLength,
            passwordMinLength: config.auth.passwordMinLength,
            passwordMaxLength: config.auth.passwordMaxLength
        },
        orders: {
            maxTextLength: config.orders.maxTextLength,
            notesMaxLength: config.orders.notesMaxLength,
            roomMaxLength: config.orders.roomMaxLength,
            deliveryFeeMin: config.orders.deliveryFeeMin,
            deliveryFeeMax: config.orders.deliveryFeeMax,
            deliveryFeeDefault: config.orders.deliveryFeeDefault,
            deliveryFeeSuggestions: config.orders.deliveryFeeSuggestions,
            scheduleLeadMinutes: config.orders.scheduleLeadMinutes,
            pickupLocations: config.orders.pickupLocations,
            deliveryLocations: config.orders.deliveryLocations
        },
        profile: {
            hostelMaxLength: config.profile.hostelMaxLength,
            roomMaxLength: config.profile.roomMaxLength,
            phoneMaxLength: config.profile.phoneMaxLength
        },
        map: {
            tileUrl: config.public.mapTileUrl,
            maxZoom: config.public.mapMaxZoom,
            defaultZoom: config.public.mapDefaultZoom
        },
        geolocation: {
            timeoutMs: config.public.geolocationTimeoutMs,
            maximumAgeMs: config.public.geolocationMaximumAgeMs
        },
        csrf: {
            cookieName: config.csrf.cookieName,
            headerName: config.csrf.headerName
        }
    });
});

app.use(express.static(path.join(__dirname, 'public')));

// ---- ROUTES ----
app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/orders', apiLimiter, require('./routes/orders'));
app.use('/api/profile', apiLimiter, require('./routes/profile'));

app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found.' });
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---- ERROR HANDLER ----
app.use((err, req, res, _next) => {
    if (err instanceof SyntaxError && 'body' in err) {
        return res.status(400).json({ error: 'Invalid JSON payload.' });
    }

    if (err.message === 'Not allowed by CORS') {
        return res.status(403).json({ error: 'Origin is not allowed.' });
    }

    const reqId = req?.id || 'unknown';
    if (config.isProduction) {
        console.error(JSON.stringify({ level: 'error', reqId, message: err.message, path: req?.path }));
    } else {
        console.error(`[ERROR] [${reqId}]`, err.message);
    }
    res.status(500).json({ error: 'Internal server error.' });
});

// ---- START ----
let server;

async function startServer() {
    await getDb();

    server = app.listen(config.port, () => {
        console.log(`Parselfee running on port ${config.port}`);
        console.log(`http://localhost:${config.port}`);
    });
}

async function shutdown() {
    await closeDb();
    if (!server) {
        process.exit(0);
        return;
    }

    server.close(() => process.exit(0));
}

if (require.main === module) {
    startServer().catch(err => {
        console.error('[FATAL] Failed to initialize server:', err.message);
        process.exit(1);
    });

    process.on('SIGINT', () => {
        console.log('\nShutting down...');
        shutdown().catch(() => process.exit(1));
    });

    process.on('SIGTERM', () => {
        shutdown().catch(() => process.exit(1));
    });
}

module.exports = { app, startServer, shutdown };
