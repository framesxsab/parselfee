const jwt = require('jsonwebtoken');
const { config } = require('../config');

function generateToken(user) {
    return jwt.sign(
        { id: user.id, email: user.email, name: user.name },
        config.auth.jwtSecret,
        { expiresIn: config.auth.tokenExpiry }
    );
}

function authenticate(req, res, next) {
    const token = req.cookies?.[config.auth.cookieName];

    if (!token) {
        return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }

    try {
        const decoded = jwt.verify(token, config.auth.jwtSecret);
        req.user = decoded;
        next();
    } catch (err) {
        res.clearCookie(config.auth.cookieName, { path: '/' });
        return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
}

function authenticateOptional(req, res, next) {
    const token = req.cookies?.[config.auth.cookieName];

    if (!token) {
        req.user = null;
        return next();
    }

    try {
        const decoded = jwt.verify(token, config.auth.jwtSecret);
        req.user = decoded;
        return next();
    } catch (_err) {
        res.clearCookie(config.auth.cookieName, { path: '/' });
        req.user = null;
        return next();
    }
}

function isAllowedEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const lower = email.toLowerCase().trim();
    const domain = lower.split('@')[1];
    return config.auth.allowedEmailDomains.includes(domain);
}

function setTokenCookie(res, token) {
    res.cookie(config.auth.cookieName, token, {
        httpOnly: true,
        secure: config.isProduction,
        sameSite: config.auth.cookieSameSite,
        maxAge: config.auth.cookieMaxAgeMs,
        path: '/'
    });
}

function clearTokenCookie(res) {
    res.clearCookie(config.auth.cookieName, { path: '/' });
}

module.exports = {
    generateToken,
    authenticate,
    authenticateOptional,
    isAllowedEmail,
    setTokenCookie,
    clearTokenCookie
};
