const express = require('express');
const crypto = require('crypto');
const { getDb } = require('../db/schema');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// All order routes require authentication
router.use(authenticate);

const VALID_URGENCIES = ['asap', '30min', '1hr', 'scheduled'];
const VALID_STATUSES = ['open', 'accepted', 'picked_up', 'delivered', 'cancelled'];
const MAX_TEXT = 500;
const DELIVERY_PIN_REGEX = /^\d{6}$/;

function sanitize(str, maxLen = MAX_TEXT) {
    if (!str || typeof str !== 'string') return '';
    return str.trim().slice(0, maxLen);
}

function generateOrderCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'PF-';
    for (let i = 0; i < 6; i++) {
        code += chars[crypto.randomInt(chars.length)];
    }
    return code;
}

function generateDeliveryPin() {
    return String(crypto.randomInt(100000, 999999 + 1));
}

function ensureDeliveryPin(db, order) {
    if (!order) return order;

    const needsPin =
        (order.status === 'accepted' || order.status === 'picked_up') &&
        order.accepter_id &&
        !order.delivery_pin;

    if (!needsPin) return order;

    const pin = generateDeliveryPin();
    db.prepare('UPDATE orders SET delivery_pin = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(pin, order.id);

    return { ...order, delivery_pin: pin };
}

function serializeOrderForViewer(order, viewerId) {
    const view = { ...order };
    const isPlacer = view.placer_id === viewerId;
    const isAccepter = view.accepter_id === viewerId;

    if (!isPlacer) {
        delete view.delivery_pin;
    }

    if (!(isPlacer || isAccepter)) {
        delete view.placer_phone;
        delete view.accepter_phone;
        delete view.tracking_lat;
        delete view.tracking_lng;
        delete view.tracking_updated_at;
    }

    return view;
}

function getItemEmoji(desc) {
    const lower = desc.toLowerCase();
    if (/food|biryani|rice|meal|thali|dosa/i.test(lower)) return '🍛';
    if (/pizza/i.test(lower)) return '🍕';
    if (/burger/i.test(lower)) return '🍔';
    if (/ramen|noodle|maggi/i.test(lower)) return '🍜';
    if (/coffee|chai|tea/i.test(lower)) return '☕';
    if (/juice|drink|water|cola|pepsi/i.test(lower)) return '🥤';
    if (/parcel|package|amazon|flipkart|myntra/i.test(lower)) return '📦';
    if (/book|notes|xerox|photocopy/i.test(lower)) return '📚';
    if (/medicine|med|tablet/i.test(lower)) return '💊';
    if (/laundry|clothes/i.test(lower)) return '👕';
    return '📦';
}

// GET /api/orders — list open orders (for browse page)
router.get('/', (req, res) => {
    const db = getDb();
    const { status = 'open', pickup, limit = 50, offset = 0 } = req.query;

    if (status && !VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: 'Invalid status filter.' });
    }

    let query = `
        SELECT o.*, u.name as placer_name, u.hostel as placer_hostel,
               a.name as accepter_name
        FROM orders o
        JOIN users u ON o.placer_id = u.id
        LEFT JOIN users a ON o.accepter_id = a.id
        WHERE o.status = ?
    `;
    const params = [status];

    if (pickup && pickup !== 'all') {
        query += ' AND o.pickup_location = ?';
        params.push(sanitize(pickup));
    }

    query += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
    params.push(Math.min(parseInt(limit) || 50, 100), parseInt(offset) || 0);

    const orders = db.prepare(query)
        .all(...params)
        .map(order => ensureDeliveryPin(db, order))
        .map(order => serializeOrderForViewer(order, req.user.id));
    res.json({ orders });
});

// GET /api/orders/mine — orders placed by or accepted by current user
router.get('/mine', (req, res) => {
    const db = getDb();
    const { type = 'placed' } = req.query;

    let orders;
    if (type === 'accepted') {
        orders = db.prepare(`
            SELECT o.*, u.name as placer_name, u.hostel as placer_hostel,
                   u.phone as placer_phone, a.name as accepter_name
            FROM orders o
            JOIN users u ON o.placer_id = u.id
            LEFT JOIN users a ON o.accepter_id = a.id
            WHERE o.accepter_id = ?
            ORDER BY o.updated_at DESC
            LIMIT 100
        `).all(req.user.id);
    } else {
        orders = db.prepare(`
            SELECT o.*, u.name as placer_name, u.hostel as placer_hostel,
                   a.name as accepter_name, a.phone as accepter_phone
            FROM orders o
            JOIN users u ON o.placer_id = u.id
            LEFT JOIN users a ON o.accepter_id = a.id
            WHERE o.placer_id = ?
            ORDER BY o.created_at DESC
            LIMIT 100
        `).all(req.user.id);
    }

    res.json({
        orders: orders
            .map(order => ensureDeliveryPin(db, order))
            .map(order => serializeOrderForViewer(order, req.user.id))
    });
});

// GET /api/orders/:id — single order detail
router.get('/:id', (req, res) => {
    const db = getDb();
    const order = db.prepare(`
        SELECT o.*, u.name as placer_name, u.hostel as placer_hostel,
               u.phone as placer_phone, a.name as accepter_name, a.phone as accepter_phone
        FROM orders o
        JOIN users u ON o.placer_id = u.id
        LEFT JOIN users a ON o.accepter_id = a.id
        WHERE o.id = ?
    `).get(req.params.id);

    if (!order) {
        return res.status(404).json({ error: 'Order not found.' });
    }

    const normalized = ensureDeliveryPin(db, order);

    // Only show phone numbers to involved parties
    const isInvolved = order.placer_id === req.user.id || order.accepter_id === req.user.id;
    if (!isInvolved) {
        delete normalized.placer_phone;
        delete normalized.accepter_phone;
    }

    res.json({ order: serializeOrderForViewer(normalized, req.user.id) });
});

// POST /api/orders — create new order
router.post('/', (req, res) => {
    const { item_desc, pickup_location, deliver_to, room_details, delivery_fee, urgency, schedule_time, notes } = req.body;

    // Validate
    const desc = sanitize(item_desc);
    if (!desc || desc.length < 3) {
        return res.status(400).json({ error: 'Item description must be at least 3 characters.' });
    }

    const pickup = sanitize(pickup_location, 100);
    if (!pickup) {
        return res.status(400).json({ error: 'Pickup location is required.' });
    }

    const deliver = sanitize(deliver_to, 100);
    if (!deliver) {
        return res.status(400).json({ error: 'Delivery location is required.' });
    }

    const room = sanitize(room_details, 200);
    if (!room) {
        return res.status(400).json({ error: 'Room details are required.' });
    }

    const fee = parseInt(delivery_fee);
    if (isNaN(fee) || fee < 5 || fee > 500) {
        return res.status(400).json({ error: 'Delivery fee must be between ₹5 and ₹500.' });
    }

    if (!VALID_URGENCIES.includes(urgency)) {
        return res.status(400).json({ error: 'Invalid urgency value.' });
    }

    const db = getDb();
    let orderCode = generateOrderCode();
    const deliveryPin = generateDeliveryPin();

    // Ensure unique code (extremely unlikely collision)
    while (db.prepare('SELECT id FROM orders WHERE order_code = ?').get(orderCode)) {
        orderCode = generateOrderCode();
    }

    const result = db.prepare(`
        INSERT INTO orders (order_code, placer_id, item_desc, pickup_location, deliver_to, room_details, delivery_fee, urgency, schedule_time, notes, delivery_pin)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(orderCode, req.user.id, desc, pickup, deliver, room, fee, urgency,
           urgency === 'scheduled' ? sanitize(schedule_time) : null,
           sanitize(notes), deliveryPin);

    // Update user stats
    db.prepare('UPDATE users SET orders_placed = orders_placed + 1, total_spent = total_spent + ? WHERE id = ?')
      .run(fee, req.user.id);

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json({ order: { ...serializeOrderForViewer(order, req.user.id), emoji: getItemEmoji(desc) } });
});

// PATCH /api/orders/:id/accept — accept an order for delivery
router.patch('/:id/accept', (req, res) => {
    const db = getDb();
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);

    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.status !== 'open') return res.status(400).json({ error: 'Order is no longer open.' });
    if (order.placer_id === req.user.id) return res.status(400).json({ error: 'You cannot accept your own order.' });

    db.prepare(`
        UPDATE orders
        SET status = 'accepted',
            accepter_id = ?,
            delivery_pin = COALESCE(delivery_pin, ?),
            tracking_lat = NULL,
            tracking_lng = NULL,
            tracking_updated_at = NULL,
            updated_at = datetime('now')
        WHERE id = ?
    `).run(req.user.id, generateDeliveryPin(), order.id);

    const updated = db.prepare(`
        SELECT o.*, u.name as placer_name, u.phone as placer_phone
        FROM orders o JOIN users u ON o.placer_id = u.id WHERE o.id = ?
    `).get(order.id);

    res.json({ order: serializeOrderForViewer(updated, req.user.id) });
});

// PATCH /api/orders/:id/location — update deliverer's live location
router.patch('/:id/location', (req, res) => {
    const db = getDb();
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);

    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.accepter_id !== req.user.id) return res.status(403).json({ error: 'Only the assigned deliverer can share location.' });
    if (order.status !== 'accepted' && order.status !== 'picked_up') {
        return res.status(400).json({ error: 'Location can only be shared for accepted or picked-up orders.' });
    }

    const lat = Number(req.body?.lat);
    const lng = Number(req.body?.lng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
        return res.status(400).json({ error: 'Invalid latitude/longitude.' });
    }

    db.prepare(`
        UPDATE orders
        SET tracking_lat = ?,
            tracking_lng = ?,
            tracking_updated_at = datetime('now'),
            updated_at = datetime('now')
        WHERE id = ?
    `).run(lat, lng, order.id);

    const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
    res.json({ order: serializeOrderForViewer(updated, req.user.id) });
});

// PATCH /api/orders/:id/status — update order status (picked_up, delivered, cancelled)
router.patch('/:id/status', (req, res) => {
    const { status } = req.body;
    const db = getDb();
    const order = ensureDeliveryPin(db, db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id));

    if (!order) return res.status(404).json({ error: 'Order not found.' });

    // Permission checks
    const isPlacer = order.placer_id === req.user.id;
    const isAccepter = order.accepter_id === req.user.id;

    // State machine: valid transitions
    const allowed = {
        open:       { cancelled: isPlacer },
        accepted:   { picked_up: isAccepter, cancelled: isPlacer },
        picked_up:  { delivered: isAccepter },
        delivered:  {},
        cancelled:  {}
    };

    if (!allowed[order.status] || !allowed[order.status][status]) {
        return res.status(403).json({ error: 'This status transition is not allowed.' });
    }

    if (status === 'delivered' && isAccepter && order.delivery_pin) {
        const suppliedPin = sanitize(req.body?.delivery_pin, 6);
        if (!DELIVERY_PIN_REGEX.test(suppliedPin) || suppliedPin !== order.delivery_pin) {
            return res.status(400).json({ error: 'Incorrect delivery PIN. Ask requester for the 6-digit handoff code.' });
        }
    }

    if (status === 'delivered' || status === 'cancelled') {
        db.prepare(`
            UPDATE orders
            SET status = ?,
                tracking_lat = NULL,
                tracking_lng = NULL,
                tracking_updated_at = NULL,
                updated_at = datetime('now')
            WHERE id = ?
        `).run(status, order.id);
    } else {
        db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?")
          .run(status, order.id);
    }

    // Handle side effects
    if (status === 'delivered') {
        db.prepare('UPDATE users SET total_earned = total_earned + ?, deliveries_done = deliveries_done + 1 WHERE id = ?')
          .run(order.delivery_fee, order.accepter_id);
    }

    if (status === 'cancelled' && order.status === 'open') {
        // Refund the fee to placer's spent total
        db.prepare('UPDATE users SET total_spent = total_spent - ? WHERE id = ?')
          .run(order.delivery_fee, order.placer_id);
    }

    const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
    res.json({ order: serializeOrderForViewer(updated, req.user.id) });
});

module.exports = router;
