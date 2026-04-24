const jwt = require('jsonwebtoken');

if (!process.env.JWT_SECRET) {
    console.error('\n  ❌  FATAL: JWT_SECRET environment variable is not set.');
    console.error('     Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n');
    process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_EXPIRY = '7d';
const ALLOWED_DOMAINS = ['rknec.in', 'rbunagpur.in'];

function generateToken(user) {
    return jwt.sign(
        { id: user.id, email: user.email, name: user.name },
        JWT_SECRET,
        { expiresIn: TOKEN_EXPIRY }
    );
}

function authenticate(req, res, next) {
    const token = req.cookies?.token;

    if (!token) {
        return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.clearCookie('token');
        return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
}

function authenticateOptional(req, res, next) {
    const token = req.cookies?.token;

    if (!token) {
        req.user = null;
        return next();
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        return next();
    } catch (_err) {
        res.clearCookie('token', { path: '/' });
        req.user = null;
        return next();
    }
}

function isAllowedEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const lower = email.toLowerCase().trim();
    const domain = lower.split('@')[1];
    return ALLOWED_DOMAINS.includes(domain);
}

function setTokenCookie(res, token) {
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('token', token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/'
    });
}

module.exports = { generateToken, authenticate, authenticateOptional, isAllowedEmail, setTokenCookie };
