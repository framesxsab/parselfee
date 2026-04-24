const express = require('express');
const bcrypt = require('bcrypt');
const { getDb } = require('../db/schema');
const { generateToken, isAllowedEmail, setTokenCookie, authenticate, authenticateOptional } = require('../middleware/auth');

const router = express.Router();

const SALT_ROUNDS = 12;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_MAX = 100;
const PASSWORD_MIN = 8;

// POST /api/auth/signup
router.post('/signup', (req, res) => {
    const { name, email, password } = req.body;

    // Validate inputs
    if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > NAME_MAX) {
        return res.status(400).json({ error: 'Name must be 2-100 characters.' });
    }

    if (!email || !EMAIL_REGEX.test(email)) {
        return res.status(400).json({ error: 'Invalid email format.' });
    }

    if (!isAllowedEmail(email)) {
        return res.status(403).json({ error: 'Only @rknec.in and @rbunagpur.in email addresses are allowed.' });
    }

    if (!password || password.length < PASSWORD_MIN) {
        return res.status(400).json({ error: `Password must be at least ${PASSWORD_MIN} characters.` });
    }

    const db = getDb();
    const cleanEmail = email.toLowerCase().trim();
    const cleanName = name.trim();

    // Check if email already exists
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
    if (existing) {
        return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const hash = bcrypt.hashSync(password, SALT_ROUNDS);

    const result = db.prepare(
        'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)'
    ).run(cleanName, cleanEmail, hash);

    const user = { id: result.lastInsertRowid, email: cleanEmail, name: cleanName };
    const token = generateToken(user);
    setTokenCookie(res, token);

    res.status(201).json({
        user: { id: user.id, name: cleanName, email: cleanEmail }
    });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    if (!isAllowedEmail(email)) {
        return res.status(403).json({ error: 'Only @rknec.in and @rbunagpur.in email addresses are allowed.' });
    }

    const db = getDb();
    const cleanEmail = email.toLowerCase().trim();

    const user = db.prepare('SELECT id, name, email, password_hash FROM users WHERE email = ?').get(cleanEmail);

    if (!user) {
        return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) {
        return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = generateToken({ id: user.id, email: user.email, name: user.name });
    setTokenCookie(res, token);

    res.json({
        user: { id: user.id, name: user.name, email: user.email }
    });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
    res.clearCookie('token', { path: '/' });
    res.json({ message: 'Logged out.' });
});

// GET /api/auth/me — check current session
router.get('/me', authenticateOptional, (req, res) => {
    if (!req.user) {
        return res.json({ user: null });
    }

    const db = getDb();
    const user = db.prepare(
        'SELECT id, name, email, phone, hostel, room, total_earned, total_spent, deliveries_done, orders_placed, created_at FROM users WHERE id = ?'
    ).get(req.user.id);

    if (!user) {
        res.clearCookie('token', { path: '/' });
        return res.json({ user: null });
    }

    res.json({ user });
});

module.exports = router;
