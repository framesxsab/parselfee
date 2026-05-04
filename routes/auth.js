const express = require('express');
const bcrypt = require('bcrypt');
const { config } = require('../config');
const { getDb } = require('../db/schema');
const { generateToken, isAllowedEmail, setTokenCookie, clearTokenCookie, authenticateOptional } = require('../middleware/auth');

const router = express.Router();
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function allowedEmailMessage() {
    return `Only ${config.auth.allowedEmailDomains.map(domain => '@' + domain).join(', ')} email addresses are allowed.`;
}

// POST /api/auth/signup
router.post('/signup', asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;

    // Validate inputs
    if (!name || typeof name !== 'string' || name.trim().length < config.auth.nameMinLength || name.trim().length > config.auth.nameMaxLength) {
        return res.status(400).json({ error: `Name must be ${config.auth.nameMinLength}-${config.auth.nameMaxLength} characters.` });
    }

    if (!email || typeof email !== 'string' || email.length > config.auth.emailMaxLength || !EMAIL_REGEX.test(email)) {
        return res.status(400).json({ error: 'Invalid email format.' });
    }

    if (!isAllowedEmail(email)) {
        return res.status(403).json({ error: allowedEmailMessage() });
    }

    if (!password || typeof password !== 'string' || password.length < config.auth.passwordMinLength || password.length > config.auth.passwordMaxLength) {
        return res.status(400).json({ error: `Password must be ${config.auth.passwordMinLength}-${config.auth.passwordMaxLength} characters.` });
    }

    const db = await getDb();
    const cleanEmail = email.toLowerCase().trim();
    const cleanName = name.trim();

    // Check if email already exists
    const existingResult = await db.query('SELECT id FROM users WHERE email = $1', [cleanEmail]);
    const existing = existingResult.rows[0];
    if (existing) {
        return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const hash = await bcrypt.hash(password, config.auth.saltRounds);

    const result = await db.query(
        'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
        [cleanName, cleanEmail, hash]
    );

    const user = { id: result.rows[0].id, email: cleanEmail, name: cleanName };
    const token = generateToken(user);
    setTokenCookie(res, token);

    res.status(201).json({
        user: { id: user.id, name: cleanName, email: cleanEmail }
    });
}));

// POST /api/auth/login
router.post('/login', asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password || typeof email !== 'string' || typeof password !== 'string' || password.length > config.auth.passwordMaxLength) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    if (!isAllowedEmail(email)) {
        return res.status(403).json({ error: allowedEmailMessage() });
    }

    const db = await getDb();
    const cleanEmail = email.toLowerCase().trim();

    const userResult = await db.query(
        'SELECT id, name, email, password_hash FROM users WHERE email = $1',
        [cleanEmail]
    );
    const user = userResult.rows[0];

    if (!user) {
        return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
        return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = generateToken({ id: user.id, email: user.email, name: user.name });
    setTokenCookie(res, token);

    res.json({
        user: { id: user.id, name: user.name, email: user.email }
    });
}));

// POST /api/auth/logout
router.post('/logout', (req, res) => {
    clearTokenCookie(res);
    res.json({ message: 'Logged out.' });
});

// GET /api/auth/me — check current session
router.get('/me', authenticateOptional, asyncHandler(async (req, res) => {
    if (!req.user) {
        return res.json({ user: null });
    }

    const db = await getDb();
    const result = await db.query(
        'SELECT id, name, email, phone, hostel, room, total_earned, total_spent, deliveries_done, orders_placed, created_at FROM users WHERE id = $1',
        [req.user.id]
    );
    const user = result.rows[0];

    if (!user) {
        clearTokenCookie(res);
        return res.json({ user: null });
    }

    res.json({ user });
}));

module.exports = router;
