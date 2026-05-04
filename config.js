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
    port: parseInteger('PORT'),
    trustProxy: parseInteger('TRUST_PROXY_HOPS'),
    requestBodyLimit: requireEnv('REQUEST_BODY_LIMIT'),
    allowedOrigins: parseList('ALLOWED_ORIGIN'),
    auth: {
        allowedEmailDomains: parseList('ALLOWED_EMAIL_DOMAINS'),
        saltRounds: parseInteger('BCRYPT_SALT_ROUNDS'),
        emailMaxLength: parseInteger('EMAIL_MAX_LENGTH'),
        nameMinLength: parseInteger('NAME_MIN_LENGTH'),
        nameMaxLength: parseInteger('NAME_MAX_LENGTH'),
        passwordMinLength: parseInteger('PASSWORD_MIN_LENGTH'),
        passwordMaxLength: parseInteger('PASSWORD_MAX_LENGTH'),
        jwtSecret: requireEnv('JWT_SECRET'),
        jwtSecretMinLength: parseInteger('JWT_SECRET_MIN_LENGTH'),
        tokenExpiry: requireEnv('JWT_TOKEN_EXPIRY'),
        cookieName: requireEnv('AUTH_COOKIE_NAME'),
        cookieMaxAgeMs: parseInteger('AUTH_COOKIE_MAX_AGE_MS'),
        cookieSameSite: requireEnv('AUTH_COOKIE_SAME_SITE')
    },
    csrf: {
        cookieName: requireEnv('CSRF_COOKIE_NAME'),
        headerName: requireEnv('CSRF_HEADER_NAME'),
        tokenBytes: parseInteger('CSRF_TOKEN_BYTES'),
        cookieMaxAgeMs: parseInteger('CSRF_COOKIE_MAX_AGE_MS'),
        excludedPaths: parseOptionalList('CSRF_EXCLUDED_PATHS')
    },
    rateLimit: {
        authWindowMs: parseInteger('AUTH_RATE_LIMIT_WINDOW_MS'),
        authMax: parseInteger('AUTH_RATE_LIMIT_MAX'),
        apiWindowMs: parseInteger('API_RATE_LIMIT_WINDOW_MS'),
        apiMax: parseInteger('API_RATE_LIMIT_MAX')
    },
    db: {
        url: requireEnv('DATABASE_URL'),
        sslEnabled: parseBoolean('DB_SSL_ENABLED'),
        rejectUnauthorized: parseBoolean('DB_SSL_REJECT_UNAUTHORIZED'),
        poolMax: parseInteger('DB_POOL_MAX'),
        idleTimeoutMillis: parseInteger('DB_IDLE_TIMEOUT_MS'),
        connectionTimeoutMillis: parseInteger('DB_CONNECTION_TIMEOUT_MS')
    },
    orders: {
        maxTextLength: parseInteger('ORDER_TEXT_MAX_LENGTH'),
        pickupMaxLength: parseInteger('PICKUP_LOCATION_MAX_LENGTH'),
        deliveryMaxLength: parseInteger('DELIVERY_LOCATION_MAX_LENGTH'),
        roomMaxLength: parseInteger('ROOM_DETAILS_MAX_LENGTH'),
        notesMaxLength: parseInteger('ORDER_NOTES_MAX_LENGTH'),
        searchMaxLength: parseInteger('ORDER_SEARCH_MAX_LENGTH'),
        listMaxLimit: parseInteger('ORDER_LIST_MAX_LIMIT'),
        mineMaxLimit: parseInteger('MY_ORDER_LIST_MAX_LIMIT'),
        deliveryFeeMin: parseInteger('DELIVERY_FEE_MIN'),
        deliveryFeeMax: parseInteger('DELIVERY_FEE_MAX'),
        deliveryFeeDefault: parseInteger('DELIVERY_FEE_DEFAULT'),
        deliveryFeeSuggestions: parseList('DELIVERY_FEE_SUGGESTIONS').map(Number),
        scheduleLeadMinutes: parseInteger('SCHEDULE_LEAD_MINUTES'),
        pickupLocations: parseList('PICKUP_LOCATIONS'),
        deliveryLocations: parseList('DELIVERY_LOCATIONS')
    },
    profile: {
        hostelMaxLength: parseInteger('HOSTEL_MAX_LENGTH'),
        roomMaxLength: parseInteger('PROFILE_ROOM_MAX_LENGTH'),
        phoneMaxLength: parseInteger('PHONE_MAX_LENGTH'),
        phonePattern: requireEnv('PHONE_PATTERN')
    },
    public: {
        mapTileUrl: requireEnv('MAP_TILE_URL'),
        mapMaxZoom: parseInteger('MAP_MAX_ZOOM'),
        mapDefaultZoom: parseInteger('MAP_DEFAULT_ZOOM'),
        geolocationTimeoutMs: parseInteger('GEOLOCATION_TIMEOUT_MS'),
        geolocationMaximumAgeMs: parseInteger('GEOLOCATION_MAXIMUM_AGE_MS')
    },
    csp: {
        defaultSrc: parseCspDirective('CSP_DEFAULT_SRC'),
        styleSrc: parseCspDirective('CSP_STYLE_SRC'),
        fontSrc: parseCspDirective('CSP_FONT_SRC'),
        scriptSrc: parseCspDirective('CSP_SCRIPT_SRC'),
        scriptSrcAttr: parseCspDirective('CSP_SCRIPT_SRC_ATTR'),
        imgSrc: parseCspDirective('CSP_IMG_SRC'),
        frameSrc: parseCspDirective('CSP_FRAME_SRC'),
        connectSrc: parseCspDirective('CSP_CONNECT_SRC')
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
