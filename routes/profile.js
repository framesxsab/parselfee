const express = require('express');
const { getDb } = require('../db/schema');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

// GET /api/profile
router.get('/', (req, res) => {
    const db = getDb();
    const user = db.prepare(
        'SELECT id, name, email, phone, hostel, room, total_earned, total_spent, deliveries_done, orders_placed, created_at FROM users WHERE id = ?'
    ).get(req.user.id);

    if (!user) return res.status(404).json({ error: 'User not found.' });

    res.json({ user });
});

// PATCH /api/profile
router.patch('/', (req, res) => {
    const { name, phone, hostel, room } = req.body;
    const db = getDb();

    const updates = [];
    const params = [];

    if (name !== undefined) {
        const clean = (name || '').trim().slice(0, 100);
        if (clean.length < 2) return res.status(400).json({ error: 'Name must be at least 2 characters.' });
        updates.push('name = ?');
        params.push(clean);
    }

    if (phone !== undefined) {
        const clean = (phone || '').trim().slice(0, 15).replace(/[^\d+\-\s]/g, '');
        updates.push('phone = ?');
        params.push(clean);
    }

    if (hostel !== undefined) {
        updates.push('hostel = ?');
        params.push((hostel || '').trim().slice(0, 100));
    }

    if (room !== undefined) {
        updates.push('room = ?');
        params.push((room || '').trim().slice(0, 50));
    }

    if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update.' });
    }

    updates.push("updated_at = datetime('now')");
    params.push(req.user.id);

    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const user = db.prepare(
        'SELECT id, name, email, phone, hostel, room, total_earned, total_spent, deliveries_done, orders_placed FROM users WHERE id = ?'
    ).get(req.user.id);

    res.json({ user });
});

// GET /api/profile/stats — aggregate stats for homepage
router.get('/stats', (req, res) => {
    const db = getDb();
    const stats = db.prepare(`
        SELECT
            (SELECT COUNT(*) FROM orders) as total_orders,
            (SELECT COUNT(*) FROM orders WHERE status = 'delivered') as total_delivered,
            (SELECT COALESCE(SUM(delivery_fee), 0) FROM orders WHERE status = 'delivered') as total_earned
    `).get();

    res.json({ stats });
});

module.exports = router;
