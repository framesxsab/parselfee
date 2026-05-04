const express = require('express');
const crypto = require('crypto');
const { config } = require('../config');
const { getDb } = require('../db/schema');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// All order routes require authentication
router.use(authenticate);

const VALID_URGENCIES = ['asap', '30min', '1hr', 'scheduled'];
const VALID_STATUSES = ['open', 'accepted', 'picked_up', 'delivered', 'cancelled'];
const VALID_SORTS = ['newest', 'fee_desc', 'fee_asc', 'urgent'];
const DELIVERY_PIN_REGEX = /^\d{6}$/;

function sanitize(str, maxLen = config.orders.maxTextLength) {
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

function sameUserId(a, b) {
    return String(a) === String(b);
}

function parseScheduledTime(value) {
    const clean = sanitize(value, 80);
    if (!clean) return null;

    const date = new Date(clean);
    if (Number.isNaN(date.getTime())) return null;
    return date;
}

function parseListLimit(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed < 1) return config.orders.listMaxLimit;
    return Math.min(parsed, config.orders.listMaxLimit);
}

function parseOffset(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed < 0) return 0;
    return parsed;
}

async function ensureDeliveryPin(db, order) {
    if (!order) return order;

    const needsPin =
        (order.status === 'accepted' || order.status === 'picked_up') &&
        order.accepter_id &&
        !order.delivery_pin;

    if (!needsPin) return order;

    const pin = generateDeliveryPin();
    await db.query(
        'UPDATE orders SET delivery_pin = $1, updated_at = NOW() WHERE id = $2',
        [pin, order.id]
    );

    return { ...order, delivery_pin: pin };
}

function serializeOrderForViewer(order, viewerId) {
    const view = { ...order };
    const isPlacer = sameUserId(view.placer_id, viewerId);
    const isAccepter = sameUserId(view.accepter_id, viewerId);

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
router.get('/', asyncHandler(async (req, res) => {
    const db = await getDb();
    const { status = 'open', pickup, urgency, q, sort = 'newest', limit = 50, offset = 0 } = req.query;

    if (status && !VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: 'Invalid status filter.' });
    }

    if (urgency && urgency !== 'all' && !VALID_URGENCIES.includes(urgency)) {
        return res.status(400).json({ error: 'Invalid urgency filter.' });
    }

    if (sort && !VALID_SORTS.includes(sort)) {
        return res.status(400).json({ error: 'Invalid sort option.' });
    }

    let query = `
        SELECT o.*, u.name as placer_name, u.hostel as placer_hostel,
               a.name as accepter_name
        FROM orders o
        JOIN users u ON o.placer_id = u.id
        LEFT JOIN users a ON o.accepter_id = a.id
        WHERE o.status = $1
    `;
    const params = [status];

    if (pickup && pickup !== 'all') {
        params.push(sanitize(pickup));
        query += ` AND o.pickup_location = $${params.length}`;
    }

    if (urgency && urgency !== 'all') {
        params.push(sanitize(urgency, 20));
        query += ` AND o.urgency = $${params.length}`;
    }

    const search = sanitize(q, config.orders.searchMaxLength);
    if (search) {
        params.push(`%${search}%`);
        query += ` AND (
            o.item_desc ILIKE $${params.length}
            OR o.pickup_location ILIKE $${params.length}
            OR o.deliver_to ILIKE $${params.length}
            OR o.room_details ILIKE $${params.length}
        )`;
    }

    const orderBy = {
        newest: 'o.created_at DESC',
        fee_desc: 'o.delivery_fee DESC, o.created_at DESC',
        fee_asc: 'o.delivery_fee ASC, o.created_at DESC',
        urgent: `
            CASE o.urgency
                WHEN 'asap' THEN 1
                WHEN '30min' THEN 2
                WHEN '1hr' THEN 3
                WHEN 'scheduled' THEN 4
                ELSE 5
            END,
            o.created_at DESC
        `
    }[sort] || 'o.created_at DESC';

    params.push(parseListLimit(limit));
    query += ` ORDER BY ${orderBy} LIMIT $${params.length}`;
    params.push(parseOffset(offset));
    query += ` OFFSET $${params.length}`;

    const parsedLimit = parseListLimit(limit);
    const parsedOffset = parseOffset(offset);
    const result = await db.query(query, params);
    const orders = [];
    for (const order of result.rows) {
        const normalized = await ensureDeliveryPin(db, order);
        orders.push(serializeOrderForViewer(normalized, req.user.id));
    }

    res.json({
        orders,
        pagination: {
            limit: parsedLimit,
            offset: parsedOffset,
            count: orders.length,
            hasMore: orders.length === parsedLimit
        }
    });
}));

// GET /api/orders/mine — orders placed by or accepted by current user
router.get('/mine', asyncHandler(async (req, res) => {
    const db = await getDb();
    const { type = 'placed' } = req.query;

    let orders;
    if (type === 'accepted') {
        const result = await db.query(`
            SELECT o.*, u.name as placer_name, u.hostel as placer_hostel,
                   u.phone as placer_phone, a.name as accepter_name
            FROM orders o
            JOIN users u ON o.placer_id = u.id
            LEFT JOIN users a ON o.accepter_id = a.id
            WHERE o.accepter_id = $1
            ORDER BY o.updated_at DESC
            LIMIT ${config.orders.mineMaxLimit}
        `, [req.user.id]);
        orders = result.rows;
    } else {
        const result = await db.query(`
            SELECT o.*, u.name as placer_name, u.hostel as placer_hostel,
                   a.name as accepter_name, a.phone as accepter_phone
            FROM orders o
            JOIN users u ON o.placer_id = u.id
            LEFT JOIN users a ON o.accepter_id = a.id
            WHERE o.placer_id = $1
            ORDER BY o.created_at DESC
            LIMIT ${config.orders.mineMaxLimit}
        `, [req.user.id]);
        orders = result.rows;
    }

    const normalizedOrders = [];
    for (const order of orders) {
        const normalized = await ensureDeliveryPin(db, order);
        normalizedOrders.push(serializeOrderForViewer(normalized, req.user.id));
    }

    res.json({
        orders: normalizedOrders
    });
}));

// GET /api/orders/:id — single order detail
router.get('/:id', asyncHandler(async (req, res) => {
    const db = await getDb();
    const result = await db.query(`
        SELECT o.*, u.name as placer_name, u.hostel as placer_hostel,
               u.phone as placer_phone, a.name as accepter_name, a.phone as accepter_phone
        FROM orders o
        JOIN users u ON o.placer_id = u.id
        LEFT JOIN users a ON o.accepter_id = a.id
        WHERE o.id = $1
    `, [req.params.id]);
    const order = result.rows[0];

    if (!order) {
        return res.status(404).json({ error: 'Order not found.' });
    }

    const normalized = await ensureDeliveryPin(db, order);

    // Only show phone numbers to involved parties
    const isInvolved = sameUserId(order.placer_id, req.user.id) || sameUserId(order.accepter_id, req.user.id);
    if (!isInvolved) {
        delete normalized.placer_phone;
        delete normalized.accepter_phone;
    }

    res.json({ order: serializeOrderForViewer(normalized, req.user.id) });
}));

// POST /api/orders — create new order
router.post('/', asyncHandler(async (req, res) => {
    const { item_desc, pickup_location, deliver_to, room_details, delivery_fee, urgency, schedule_time, notes } = req.body;

    // Validate
    const desc = sanitize(item_desc);
    if (!desc || desc.length < 3) {
        return res.status(400).json({ error: 'Item description must be at least 3 characters.' });
    }

    const pickup = sanitize(pickup_location, config.orders.pickupMaxLength);
    if (!pickup) {
        return res.status(400).json({ error: 'Pickup location is required.' });
    }

    const deliver = sanitize(deliver_to, config.orders.deliveryMaxLength);
    if (!deliver) {
        return res.status(400).json({ error: 'Delivery location is required.' });
    }

    const room = sanitize(room_details, config.orders.roomMaxLength);
    if (!room) {
        return res.status(400).json({ error: 'Room details are required.' });
    }

    const fee = parseInt(delivery_fee);
    if (isNaN(fee) || fee < config.orders.deliveryFeeMin || fee > config.orders.deliveryFeeMax) {
        return res.status(400).json({ error: `Delivery fee must be between ₹${config.orders.deliveryFeeMin} and ₹${config.orders.deliveryFeeMax}.` });
    }

    if (!VALID_URGENCIES.includes(urgency)) {
        return res.status(400).json({ error: 'Invalid urgency value.' });
    }

    let scheduledAt = null;
    if (urgency === 'scheduled') {
        scheduledAt = parseScheduledTime(schedule_time);
        if (!scheduledAt) {
            return res.status(400).json({ error: 'Schedule date and time are required.' });
        }

        if (scheduledAt.getTime() < Date.now() + config.orders.scheduleLeadMinutes * 60 * 1000) {
            return res.status(400).json({ error: `Schedule time must be at least ${config.orders.scheduleLeadMinutes} minutes from now.` });
        }
    }

    const db = await getDb();
    let orderCode = generateOrderCode();
    const deliveryPin = generateDeliveryPin();

    // Ensure unique code (extremely unlikely collision)
    while ((await db.query('SELECT id FROM orders WHERE order_code = $1', [orderCode])).rows[0]) {
        orderCode = generateOrderCode();
    }

    const client = await db.connect();
    let order;
    try {
        await client.query('BEGIN');
        const insertResult = await client.query(
            `
            INSERT INTO orders (order_code, placer_id, item_desc, pickup_location, deliver_to, room_details, delivery_fee, urgency, schedule_time, notes, delivery_pin)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *
            `,
            [
                orderCode,
                req.user.id,
                desc,
                pickup,
                deliver,
                room,
                fee,
                urgency,
                scheduledAt,
                sanitize(notes, config.orders.notesMaxLength),
                deliveryPin
            ]
        );

        await client.query(
            'UPDATE users SET orders_placed = orders_placed + 1, total_spent = total_spent + $1 WHERE id = $2',
            [fee, req.user.id]
        );

        await client.query('COMMIT');
        order = insertResult.rows[0];
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }

    res.status(201).json({ order: { ...serializeOrderForViewer(order, req.user.id), emoji: getItemEmoji(desc) } });
}));

// PATCH /api/orders/:id/accept — accept an order for delivery
router.patch('/:id/accept', asyncHandler(async (req, res) => {
    const db = await getDb();
    const orderResult = await db.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    const order = orderResult.rows[0];

    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.status !== 'open') return res.status(400).json({ error: 'Order is no longer open.' });
    if (sameUserId(order.placer_id, req.user.id)) return res.status(400).json({ error: 'You cannot accept your own order.' });

    const acceptResult = await db.query(`
        UPDATE orders
        SET status = 'accepted',
            accepter_id = $1,
            delivery_pin = COALESCE(delivery_pin, $2),
            tracking_lat = NULL,
            tracking_lng = NULL,
            tracking_updated_at = NULL,
            updated_at = NOW()
        WHERE id = $3 AND status = 'open'
    `, [req.user.id, generateDeliveryPin(), order.id]);

    if (acceptResult.rowCount === 0) {
        return res.status(409).json({ error: 'Order was just accepted by someone else.' });
    }

    const updatedResult = await db.query(`
        SELECT o.*, u.name as placer_name, u.phone as placer_phone
        FROM orders o JOIN users u ON o.placer_id = u.id WHERE o.id = $1
    `, [order.id]);
    const updated = updatedResult.rows[0];

    res.json({ order: serializeOrderForViewer(updated, req.user.id) });
}));

// PATCH /api/orders/:id/location — update deliverer's live location
router.patch('/:id/location', asyncHandler(async (req, res) => {
    const db = await getDb();
    const orderResult = await db.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    const order = orderResult.rows[0];

    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (!sameUserId(order.accepter_id, req.user.id)) return res.status(403).json({ error: 'Only the assigned deliverer can share location.' });
    if (order.status !== 'accepted' && order.status !== 'picked_up') {
        return res.status(400).json({ error: 'Location can only be shared for accepted or picked-up orders.' });
    }

    const lat = Number(req.body?.lat);
    const lng = Number(req.body?.lng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
        return res.status(400).json({ error: 'Invalid latitude/longitude.' });
    }

    await db.query(`
        UPDATE orders
        SET tracking_lat = $1,
            tracking_lng = $2,
            tracking_updated_at = NOW(),
            updated_at = NOW()
        WHERE id = $3
    `, [lat, lng, order.id]);

    const updatedResult = await db.query('SELECT * FROM orders WHERE id = $1', [order.id]);
    const updated = updatedResult.rows[0];
    res.json({ order: serializeOrderForViewer(updated, req.user.id) });
}));

// PATCH /api/orders/:id/status — update order status (picked_up, delivered, cancelled)
router.patch('/:id/status', asyncHandler(async (req, res) => {
    const { status } = req.body;
    const db = await getDb();
    const client = await db.connect();

    try {
        await client.query('BEGIN');

        const orderResult = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [req.params.id]);
        const order = await ensureDeliveryPin(client, orderResult.rows[0]);

        if (!order) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Order not found.' });
        }

        // Permission checks
        const isPlacer = sameUserId(order.placer_id, req.user.id);
        const isAccepter = sameUserId(order.accepter_id, req.user.id);

        // State machine: valid transitions
        const allowed = {
            open:       { cancelled: isPlacer },
            accepted:   { picked_up: isAccepter, cancelled: isPlacer },
            picked_up:  { delivered: isAccepter },
            delivered:  {},
            cancelled:  {}
        };

        if (!allowed[order.status] || !allowed[order.status][status]) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'This status transition is not allowed.' });
        }

        if (status === 'delivered' && isAccepter && order.delivery_pin) {
            const suppliedPin = sanitize(req.body?.delivery_pin, 6);
            if (!DELIVERY_PIN_REGEX.test(suppliedPin) || suppliedPin !== order.delivery_pin) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Incorrect delivery PIN. Ask requester for the 6-digit handoff code.' });
            }
        }

        if (status === 'delivered' || status === 'cancelled') {
            await client.query(`
                UPDATE orders
                SET status = $1,
                    tracking_lat = NULL,
                    tracking_lng = NULL,
                    tracking_updated_at = NULL,
                    updated_at = NOW()
                WHERE id = $2
            `, [status, order.id]);
        } else {
            await client.query('UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2', [status, order.id]);
        }

        // Handle side effects
        if (status === 'delivered') {
            await client.query(
                'UPDATE users SET total_earned = total_earned + $1, deliveries_done = deliveries_done + 1 WHERE id = $2',
                [order.delivery_fee, order.accepter_id]
            );
        }

        if (status === 'cancelled' && order.status === 'open') {
            // Refund the fee to placer's spent total
            await client.query('UPDATE users SET total_spent = total_spent - $1 WHERE id = $2', [order.delivery_fee, order.placer_id]);
        }

        const updatedResult = await client.query('SELECT * FROM orders WHERE id = $1', [order.id]);
        const updated = updatedResult.rows[0];
        await client.query('COMMIT');
        res.json({ order: serializeOrderForViewer(updated, req.user.id) });
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}));

module.exports = router;
