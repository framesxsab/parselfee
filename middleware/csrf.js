const crypto = require('crypto');
const { config } = require('../config');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function getCookieOptions() {
    return {
        httpOnly: false,
        secure: config.isProduction,
        sameSite: 'lax',
        path: '/',
        maxAge: config.csrf.cookieMaxAgeMs
    };
}

function signNonce(nonce) {
    return crypto
        .createHmac('sha256', config.auth.jwtSecret)
        .update(nonce)
        .digest('base64url');
}

function createCsrfToken() {
    const nonce = crypto.randomBytes(config.csrf.tokenBytes).toString('base64url');
    return `${nonce}.${signNonce(nonce)}`;
}

function isValidToken(token) {
    if (!token || typeof token !== 'string') return false;

    const [nonce, signature, extra] = token.split('.');
    if (!nonce || !signature || extra) return false;

    const expected = signNonce(nonce);
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);

    return actualBuffer.length === expectedBuffer.length &&
        crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function ensureCsrfCookie(req, res) {
    const existing = req.cookies?.[config.csrf.cookieName];
    if (isValidToken(existing)) return existing;

    const token = createCsrfToken();
    res.cookie(config.csrf.cookieName, token, getCookieOptions());
    return token;
}

function csrfProtection(options = {}) {
    const excludedPaths = new Set(options.excludedPaths || []);

    return (req, res, next) => {
        ensureCsrfCookie(req, res);

        if (SAFE_METHODS.has(req.method) || excludedPaths.has(req.path) || excludedPaths.has(req.originalUrl)) {
            return next();
        }

        const cookieToken = req.cookies?.[config.csrf.cookieName];
        const headerToken = req.get(config.csrf.headerName);

        if (!isValidToken(cookieToken) || !headerToken || headerToken !== cookieToken) {
            return res.status(403).json({ error: 'Invalid security token. Refresh and try again.' });
        }

        return next();
    };
}

module.exports = {
    csrfProtection,
    ensureCsrfCookie
};
