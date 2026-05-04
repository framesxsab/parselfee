const express = require('express');
const { config } = require('../config');
const { getDb } = require('../db/schema');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const PHONE_REGEX = new RegExp(config.profile.phonePattern);

router.use(authenticate);

// GET /api/profile
router.get('/', asyncHandler(async (req, res) => {
    const db = await getDb();
    const result = await db.query(
        'SELECT id, name, email, phone, hostel, room, total_earned, total_spent, deliveries_done, orders_placed, created_at FROM users WHERE id = $1',
        [req.user.id]
    );
    const user = result.rows[0];

    if (!user) return res.status(404).json({ error: 'User not found.' });

    res.json({ user });
}));

// PATCH /api/profile
router.patch('/', asyncHandler(async (req, res) => {
    const { name, phone, hostel, room } = req.body;
    const db = await getDb();

    const updates = [];
    const params = [];
    let idx = 1;

    if (name !== undefined) {
        const clean = (name || '').trim().slice(0, config.auth.nameMaxLength);
        if (clean.length < config.auth.nameMinLength) return res.status(400).json({ error: `Name must be at least ${config.auth.nameMinLength} characters.` });
        updates.push(`name = $${idx++}`);
        params.push(clean);
    }

    if (phone !== undefined) {
        const clean = (phone || '').trim().slice(0, config.profile.phoneMaxLength).replace(/[^\d+\-\s]/g, '');
        if (clean && !PHONE_REGEX.test(clean)) {
            return res.status(400).json({ error: 'Enter a valid phone number.' });
        }
        updates.push(`phone = $${idx++}`);
        params.push(clean);
    }

    if (hostel !== undefined) {
        updates.push(`hostel = $${idx++}`);
        params.push((hostel || '').trim().slice(0, config.profile.hostelMaxLength));
    }

    if (room !== undefined) {
        updates.push(`room = $${idx++}`);
        params.push((room || '').trim().slice(0, config.profile.roomMaxLength));
    }

    if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update.' });
    }

    updates.push('updated_at = NOW()');
    params.push(req.user.id);

    await db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`, params);

    const userResult = await db.query(
        'SELECT id, name, email, phone, hostel, room, total_earned, total_spent, deliveries_done, orders_placed FROM users WHERE id = $1',
        [req.user.id]
    );
    const user = userResult.rows[0];

    res.json({ user });
}));

// GET /api/profile/stats — aggregate stats for homepage
router.get('/stats', asyncHandler(async (_req, res) => {
    const db = await getDb();
    const result = await db.query(`
        SELECT
            (SELECT COUNT(*) FROM orders) as total_orders,
            (SELECT COUNT(*) FROM orders WHERE status = 'delivered') as total_delivered,
            (SELECT COALESCE(SUM(delivery_fee), 0) FROM orders WHERE status = 'delivered') as total_earned
    `);
    const stats = result.rows[0];

    res.json({ stats });
}));

module.exports = router;
