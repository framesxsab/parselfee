const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

Object.assign(process.env, {
    NODE_ENV: 'production',
    PORT: '3000',
    TRUST_PROXY_HOPS: '1',
    REQUEST_BODY_LIMIT: '10kb',
    ALLOWED_ORIGIN: 'https://parselfee.example.test',
    JWT_SECRET: 'test-secret-that-is-long-enough-for-production',
    JWT_SECRET_MIN_LENGTH: '32',
    JWT_TOKEN_EXPIRY: '7d',
    AUTH_COOKIE_NAME: 'token',
    AUTH_COOKIE_MAX_AGE_MS: '604800000',
    AUTH_COOKIE_SAME_SITE: 'lax',
    BCRYPT_SALT_ROUNDS: '4',
    ALLOWED_EMAIL_DOMAINS: 'example.edu,students.example.edu',
    EMAIL_MAX_LENGTH: '254',
    NAME_MIN_LENGTH: '2',
    NAME_MAX_LENGTH: '100',
    PASSWORD_MIN_LENGTH: '8',
    PASSWORD_MAX_LENGTH: '128',
    CSRF_COOKIE_NAME: 'csrf_token',
    CSRF_HEADER_NAME: 'x-csrf-token',
    CSRF_TOKEN_BYTES: '16',
    CSRF_COOKIE_MAX_AGE_MS: '604800000',
    CSRF_EXCLUDED_PATHS: '/auth/login,/auth/signup',
    AUTH_RATE_LIMIT_WINDOW_MS: '900000',
    AUTH_RATE_LIMIT_MAX: '20',
    API_RATE_LIMIT_WINDOW_MS: '60000',
    API_RATE_LIMIT_MAX: '60',
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/parselfee_test',
    DB_SSL_ENABLED: 'false',
    DB_SSL_REJECT_UNAUTHORIZED: 'false',
    DB_POOL_MAX: '2',
    DB_IDLE_TIMEOUT_MS: '30000',
    DB_CONNECTION_TIMEOUT_MS: '1000',
    ORDER_TEXT_MAX_LENGTH: '500',
    PICKUP_LOCATION_MAX_LENGTH: '100',
    DELIVERY_LOCATION_MAX_LENGTH: '100',
    ROOM_DETAILS_MAX_LENGTH: '200',
    ORDER_NOTES_MAX_LENGTH: '500',
    ORDER_SEARCH_MAX_LENGTH: '100',
    ORDER_LIST_MAX_LIMIT: '100',
    MY_ORDER_LIST_MAX_LIMIT: '100',
    DELIVERY_FEE_MIN: '5',
    DELIVERY_FEE_MAX: '500',
    DELIVERY_FEE_DEFAULT: '20',
    DELIVERY_FEE_SUGGESTIONS: '10,20,30,50',
    SCHEDULE_LEAD_MINUTES: '5',
    PICKUP_LOCATIONS: 'Gate,Canteen',
    DELIVERY_LOCATIONS: 'Room,Hostel Gate',
    HOSTEL_MAX_LENGTH: '100',
    PROFILE_ROOM_MAX_LENGTH: '50',
    PHONE_MAX_LENGTH: '15',
    PHONE_PATTERN: '^[+\\d][+\\d\\s-]{6,14}$',
    MAP_TILE_URL: 'https://tiles.example.test/{z}/{x}/{y}.png',
    MAP_MAX_ZOOM: '19',
    MAP_DEFAULT_ZOOM: '16',
    GEOLOCATION_TIMEOUT_MS: '10000',
    GEOLOCATION_MAXIMUM_AGE_MS: '5000',
    CSP_DEFAULT_SRC: "'self'",
    CSP_STYLE_SRC: "'self'",
    CSP_FONT_SRC: "'self'",
    CSP_SCRIPT_SRC: "'self'",
    CSP_SCRIPT_SRC_ATTR: "'none'",
    CSP_IMG_SRC: "'self',data:",
    CSP_FRAME_SRC: "'self'",
    CSP_CONNECT_SRC: "'self'"
});

const { app } = require('../server');

test('GET /api/config exposes public runtime configuration and sets CSRF cookie', async () => {
    const res = await request(app)
        .get('/api/config')
        .expect(200);

    assert.deepEqual(res.body.auth.allowedEmailDomains, ['example.edu', 'students.example.edu']);
    assert.deepEqual(res.body.orders.pickupLocations, ['Gate', 'Canteen']);
    assert.equal(res.body.orders.deliveryFeeDefault, 20);
    assert.equal(res.body.csrf.cookieName, 'csrf_token');
    assert.equal(res.body.csrf.headerName, 'x-csrf-token');

    const cookies = res.headers['set-cookie'] || [];
    assert.ok(cookies.some(cookie => cookie.startsWith('csrf_token=')));
});

test('production CORS rejects unapproved browser origins', async () => {
    const res = await request(app)
        .get('/api/config')
        .set('Origin', 'https://evil.example.test')
        .expect(403);

    assert.equal(res.body.error, 'Origin is not allowed.');
});

test('mutating API routes reject non-JSON content types', async () => {
    const res = await request(app)
        .post('/api/profile')
        .type('form')
        .send('name=Student')
        .expect(415);

    assert.equal(res.body.error, 'Content-Type must be application/json.');
});

test('mutating protected routes require matching CSRF header', async () => {
    const configRes = await request(app).get('/api/config').expect(200);
    const csrfCookie = (configRes.headers['set-cookie'] || [])
        .find(cookie => cookie.startsWith('csrf_token='));

    assert.ok(csrfCookie);

    const res = await request(app)
        .post('/api/profile')
        .set('Cookie', csrfCookie)
        .send({ name: 'Student' })
        .expect(403);

    assert.equal(res.body.error, 'Invalid security token. Refresh and try again.');
});

test('CSRF-excluded auth validation can fail before touching the database', async () => {
    const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'student@not-allowed.test', password: 'password123' })
        .expect(403);

    assert.match(res.body.error, /example\.edu/);
});
