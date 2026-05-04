/**
 * Shared test setup — env vars + mock DB patching.
 * Must be required BEFORE any application modules.
 */

'use strict';

// ---- Set all required env vars for test environment ----
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
    AUTH_RATE_LIMIT_MAX: '10000',
    API_RATE_LIMIT_WINDOW_MS: '60000',
    API_RATE_LIMIT_MAX: '10000',
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

// ---- Patch db/schema to use mock DB ----
const mockDb = require('./mock-db');
const Module = require('module');
const path = require('path');

const dbSchemaPath = path.resolve(__dirname, '../../db/schema.js');
require.cache[dbSchemaPath] = {
    id: dbSchemaPath,
    filename: dbSchemaPath,
    loaded: true,
    exports: { getDb: mockDb.getDb, closeDb: mockDb.closeDb }
};

// Now load the app
const { app } = require('../../server');
const request = require('supertest');

/**
 * Create a test user via signup and return the auth cookie.
 */
async function createUser(overrides = {}) {
    const userData = {
        name: overrides.name || 'Test User',
        email: overrides.email || `user${Date.now()}@example.edu`,
        password: overrides.password || 'securepass123'
    };

    const res = await request(app)
        .post('/api/auth/signup')
        .send(userData)
        .expect(201);

    const cookies = res.headers['set-cookie'] || [];
    const authCookie = cookies.find(c => c.startsWith('token='));

    return {
        user: res.body.user,
        authCookie,
        cookies,
        credentials: userData
    };
}

/**
 * Get CSRF cookie + token for making mutating requests.
 */
async function getCsrf() {
    const res = await request(app)
        .get('/api/config')
        .expect(200);

    const cookies = res.headers['set-cookie'] || [];
    const csrfCookie = cookies.find(c => c.startsWith('csrf_token='));
    const csrfToken = csrfCookie ? decodeURIComponent(csrfCookie.split('=')[1].split(';')[0]) : '';

    return { csrfCookie, csrfToken };
}

/**
 * Create an authenticated supertest agent with CSRF ready.
 * Returns { agent, user, csrfToken } for making authenticated requests.
 */
async function authAgent(overrides = {}) {
    const { user, authCookie } = await createUser(overrides);
    const { csrfCookie, csrfToken } = await getCsrf();

    const cookieStr = [authCookie, csrfCookie].filter(Boolean).join('; ');

    return {
        user,
        csrfToken,
        cookieStr,
        /** Make authenticated GET request */
        get: (url) => request(app).get(url).set('Cookie', cookieStr),
        /** Make authenticated POST request with CSRF */
        post: (url) => request(app).post(url)
            .set('Cookie', cookieStr)
            .set('x-csrf-token', csrfToken)
            .type('json'),
        /** Make authenticated PATCH request with CSRF */
        patch: (url) => request(app).patch(url)
            .set('Cookie', cookieStr)
            .set('x-csrf-token', csrfToken)
            .type('json'),
        /** Make authenticated DELETE request with CSRF */
        delete: (url) => request(app).delete(url)
            .set('Cookie', cookieStr)
            .set('x-csrf-token', csrfToken)
            .type('json')
    };
}

function resetDb() {
    mockDb.resetMockDb();
}

module.exports = { app, request, createUser, getCsrf, authAgent, resetDb };
