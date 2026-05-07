function requireEnv(name) {
    const value = process.env[name];
    if (value === undefined || value === '') {
        throw new Error(`${name} environment variable is required.`);
    }
    return value;
}

function optionalEnv(name, fallback = '') {
    return process.env[name] === undefined ? fallback : process.env[name];
}

const isProduction = requireEnv('NODE_ENV') === 'production';

function configuredEnv(name, fallback) {
    return isProduction ? requireEnv(name) : optionalEnv(name, fallback);
}

function parseInteger(name, fallback) {
    const raw = fallback === undefined ? requireEnv(name) : configuredEnv(name, String(fallback));
    const value = Number.parseInt(raw, 10);
    if (!Number.isInteger(value)) {
        throw new Error(`${name} must be an integer.`);
    }
    return value;
}

function parseBoolean(name, fallback) {
    const raw = fallback === undefined ? requireEnv(name) : configuredEnv(name, String(fallback));
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    throw new Error(`${name} must be true or false.`);
}

function parseList(name, fallback = '') {
    return configuredEnv(name, fallback)
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);
}

function parseOptionalList(name, fallback = '') {
    return optionalEnv(name, fallback)
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);
}

function parseCspDirective(name, fallback) {
    const values = parseList(name, fallback);
    if (values.length === 0) {
        throw new Error(`${name} must contain at least one source.`);
    }
    return values;
}

const config = {
    nodeEnv: requireEnv('NODE_ENV'),
    isProduction,
    port: parseInteger('PORT', 3000),
    trustProxy: parseInteger('TRUST_PROXY_HOPS', 1),
    requestBodyLimit: configuredEnv('REQUEST_BODY_LIMIT', '10kb'),
    allowedOrigins: parseList('ALLOWED_ORIGIN', ''),
    auth: {
        allowedEmailDomains: parseList('ALLOWED_EMAIL_DOMAINS', 'rknec.in,rbunagpur.in'),
        saltRounds: parseInteger('BCRYPT_SALT_ROUNDS', 12),
        emailMaxLength: parseInteger('EMAIL_MAX_LENGTH', 254),
        nameMinLength: parseInteger('NAME_MIN_LENGTH', 2),
        nameMaxLength: parseInteger('NAME_MAX_LENGTH', 100),
        passwordMinLength: parseInteger('PASSWORD_MIN_LENGTH', 8),
        passwordMaxLength: parseInteger('PASSWORD_MAX_LENGTH', 128),
        jwtSecret: requireEnv('JWT_SECRET'),
        jwtSecretMinLength: parseInteger('JWT_SECRET_MIN_LENGTH', 32),
        tokenExpiry: configuredEnv('JWT_TOKEN_EXPIRY', '7d'),
        cookieName: configuredEnv('AUTH_COOKIE_NAME', 'token'),
        cookieMaxAgeMs: parseInteger('AUTH_COOKIE_MAX_AGE_MS', 604800000),
        cookieSameSite: configuredEnv('AUTH_COOKIE_SAME_SITE', 'lax')
    },
    csrf: {
        cookieName: configuredEnv('CSRF_COOKIE_NAME', 'csrf_token'),
        headerName: configuredEnv('CSRF_HEADER_NAME', 'x-csrf-token'),
        tokenBytes: parseInteger('CSRF_TOKEN_BYTES', 32),
        cookieMaxAgeMs: parseInteger('CSRF_COOKIE_MAX_AGE_MS', 604800000),
        excludedPaths: parseOptionalList('CSRF_EXCLUDED_PATHS')
    },
    rateLimit: {
        authWindowMs: parseInteger('AUTH_RATE_LIMIT_WINDOW_MS', 900000),
        authMax: parseInteger('AUTH_RATE_LIMIT_MAX', 20),
        apiWindowMs: parseInteger('API_RATE_LIMIT_WINDOW_MS', 60000),
        apiMax: parseInteger('API_RATE_LIMIT_MAX', 60)
    },
    db: {
        url: requireEnv('DATABASE_URL'),
        sslEnabled: parseBoolean('DB_SSL_ENABLED', true),
        rejectUnauthorized: parseBoolean('DB_SSL_REJECT_UNAUTHORIZED', false),
        poolMax: parseInteger('DB_POOL_MAX', 10),
        idleTimeoutMillis: parseInteger('DB_IDLE_TIMEOUT_MS', 30000),
        connectionTimeoutMillis: parseInteger('DB_CONNECTION_TIMEOUT_MS', 10000)
    },
    orders: {
        maxTextLength: parseInteger('ORDER_TEXT_MAX_LENGTH', 500),
        pickupMaxLength: parseInteger('PICKUP_LOCATION_MAX_LENGTH', 100),
        deliveryMaxLength: parseInteger('DELIVERY_LOCATION_MAX_LENGTH', 100),
        roomMaxLength: parseInteger('ROOM_DETAILS_MAX_LENGTH', 200),
        notesMaxLength: parseInteger('ORDER_NOTES_MAX_LENGTH', 500),
        searchMaxLength: parseInteger('ORDER_SEARCH_MAX_LENGTH', 100),
        listMaxLimit: parseInteger('ORDER_LIST_MAX_LIMIT', 100),
        mineMaxLimit: parseInteger('MY_ORDER_LIST_MAX_LIMIT', 100),
        deliveryFeeMin: parseInteger('DELIVERY_FEE_MIN', 5),
        deliveryFeeMax: parseInteger('DELIVERY_FEE_MAX', 500),
        deliveryFeeDefault: parseInteger('DELIVERY_FEE_DEFAULT', 20),
        deliveryFeeSuggestions: parseList('DELIVERY_FEE_SUGGESTIONS', '10,20,30,50').map(Number),
        scheduleLeadMinutes: parseInteger('SCHEDULE_LEAD_MINUTES', 5),
        pickupLocations: parseList('PICKUP_LOCATIONS', 'Main Gate,Back Gate,Canteen,Mess,Library,Academic Block,Other'),
        deliveryLocations: parseList('DELIVERY_LOCATIONS', 'Room,Hostel Gate,Common Room,Study Hall')
    },
    profile: {
        hostelMaxLength: parseInteger('HOSTEL_MAX_LENGTH', 100),
        roomMaxLength: parseInteger('PROFILE_ROOM_MAX_LENGTH', 50),
        phoneMaxLength: parseInteger('PHONE_MAX_LENGTH', 15),
        phonePattern: configuredEnv('PHONE_PATTERN', '^[+\\d][+\\d\\s-]{6,14}$')
    },
    public: {
        mapTileUrl: configuredEnv('MAP_TILE_URL', 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'),
        mapMaxZoom: parseInteger('MAP_MAX_ZOOM', 19),
        mapDefaultZoom: parseInteger('MAP_DEFAULT_ZOOM', 16),
        geolocationTimeoutMs: parseInteger('GEOLOCATION_TIMEOUT_MS', 10000),
        geolocationMaximumAgeMs: parseInteger('GEOLOCATION_MAXIMUM_AGE_MS', 5000)
    },
    csp: {
        defaultSrc: parseCspDirective('CSP_DEFAULT_SRC', "'self'"),
        styleSrc: parseCspDirective('CSP_STYLE_SRC', "'self',https://fonts.googleapis.com,https://unpkg.com"),
        fontSrc: parseCspDirective('CSP_FONT_SRC', "'self',https://fonts.gstatic.com"),
        scriptSrc: parseCspDirective('CSP_SCRIPT_SRC', "'self',https://unpkg.com"),
        scriptSrcAttr: parseCspDirective('CSP_SCRIPT_SRC_ATTR', "'none'"),
        imgSrc: parseCspDirective('CSP_IMG_SRC', "'self',data:,https://tile.openstreetmap.org,https://*.tile.openstreetmap.org,https://unpkg.com"),
        frameSrc: parseCspDirective('CSP_FRAME_SRC', "'self',https://www.openstreetmap.org"),
        connectSrc: parseCspDirective('CSP_CONNECT_SRC', "'self'")
    }
};

if (config.auth.allowedEmailDomains.length === 0) {
    throw new Error('ALLOWED_EMAIL_DOMAINS must contain at least one domain.');
}

if (config.orders.pickupLocations.length === 0) {
    throw new Error('PICKUP_LOCATIONS must contain at least one location.');
}

if (config.orders.deliveryLocations.length === 0) {
    throw new Error('DELIVERY_LOCATIONS must contain at least one location.');
}

if (config.orders.deliveryFeeMin > config.orders.deliveryFeeMax) {
    throw new Error('DELIVERY_FEE_MIN cannot be greater than DELIVERY_FEE_MAX.');
}

if (
    config.orders.deliveryFeeDefault < config.orders.deliveryFeeMin ||
    config.orders.deliveryFeeDefault > config.orders.deliveryFeeMax
) {
    throw new Error('DELIVERY_FEE_DEFAULT must be inside DELIVERY_FEE_MIN and DELIVERY_FEE_MAX.');
}

if (config.orders.deliveryFeeSuggestions.some(amount => !Number.isFinite(amount))) {
    throw new Error('DELIVERY_FEE_SUGGESTIONS must contain only numbers.');
}

if (config.isProduction && config.auth.jwtSecret.length < config.auth.jwtSecretMinLength) {
    throw new Error(`JWT_SECRET must be at least ${config.auth.jwtSecretMinLength} characters in production.`);
}

module.exports = { config };
