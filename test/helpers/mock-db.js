/**
 * In-memory mock database for testing.
 * Simulates PostgreSQL Pool behavior with JS arrays.
 * Allows tests to run without a real database server.
 */

'use strict';

let users = [];
let orders = [];
let userIdSeq = 1;
let orderIdSeq = 1;

function resetMockDb() {
    users = [];
    orders = [];
    userIdSeq = 1;
    orderIdSeq = 1;
}

function matchParam(sql, params, pattern) {
    return sql.replace(/\s+/g, ' ').trim().toLowerCase().includes(pattern.toLowerCase());
}

function findParamIndex(sql, name) {
    const match = sql.match(new RegExp(`\\$\\d+`, 'g'));
    return match ? match.length : 0;
}

function resolveParams(sql, params) {
    // Map $1, $2, etc. to actual values for WHERE clause evaluation
    const mapping = {};
    const matches = [...sql.matchAll(/\$(\d+)/g)];
    for (const m of matches) {
        const idx = parseInt(m[1], 10) - 1;
        if (idx < params.length) mapping[m[1]] = params[idx];
    }
    return mapping;
}

function mockQuery(sql, params = []) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    const lower = normalized.toLowerCase();

    // -- CREATE TABLE / ALTER TABLE / CREATE INDEX — silently succeed
    if (lower.startsWith('create table') || lower.startsWith('alter table') || lower.startsWith('create index')) {
        return { rows: [], rowCount: 0 };
    }

    // -- INSERT INTO users
    if (lower.includes('insert into users')) {
        const id = BigInt(userIdSeq++).toString();
        const user = {
            id,
            name: params[0],
            email: params[1],
            password_hash: params[2],
            phone: '',
            hostel: '',
            room: '',
            total_earned: 0,
            total_spent: 0,
            deliveries_done: 0,
            orders_placed: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        users.push(user);
        return { rows: [{ id }], rowCount: 1 };
    }

    // -- SELECT id FROM users WHERE email = $1
    if (lower.includes('select id from users where email')) {
        const email = params[0];
        const found = users.find(u => u.email === email);
        return { rows: found ? [{ id: found.id }] : [], rowCount: found ? 1 : 0 };
    }

    // -- SELECT ... FROM users WHERE email = $1 (login query)
    if (lower.includes('from users where email') && lower.includes('password_hash')) {
        const email = params[0];
        const found = users.find(u => u.email === email);
        return { rows: found ? [found] : [], rowCount: found ? 1 : 0 };
    }

    // -- SELECT ... FROM users WHERE id = $1
    if (lower.includes('from users where id')) {
        const id = String(params[0]);
        const found = users.find(u => String(u.id) === id);
        return { rows: found ? [{ ...found }] : [], rowCount: found ? 1 : 0 };
    }

    // -- UPDATE users SET ... WHERE id = $N
    if (lower.includes('update users set') && !lower.includes('total_earned') && !lower.includes('total_spent') && !lower.includes('orders_placed')) {
        // Profile update — find user by last param
        const userId = String(params[params.length - 1]);
        const user = users.find(u => String(u.id) === userId);
        if (user) {
            // Parse SET clauses from params
            const setClause = normalized.match(/SET (.+?) WHERE/i)?.[1] || '';
            const assignments = setClause.split(',').map(a => a.trim());
            let paramIdx = 0;
            for (const assignment of assignments) {
                const match = assignment.match(/(\w+)\s*=\s*\$(\d+)/);
                if (match) {
                    const field = match[1];
                    const pIdx = parseInt(match[2], 10) - 1;
                    if (field !== 'updated_at' && pIdx < params.length - 1) {
                        user[field] = params[pIdx];
                    }
                }
            }
            user.updated_at = new Date().toISOString();
        }
        return { rows: [], rowCount: user ? 1 : 0 };
    }

    // -- UPDATE users SET total_earned / total_spent / orders_placed / deliveries_done
    if (lower.includes('update users set') && (lower.includes('total_earned') || lower.includes('total_spent') || lower.includes('orders_placed') || lower.includes('deliveries_done'))) {
        const userId = String(params[params.length - 1]);
        const user = users.find(u => String(u.id) === userId);
        if (user) {
            if (lower.includes('orders_placed = orders_placed + 1')) {
                user.orders_placed = (user.orders_placed || 0) + 1;
            }
            if (lower.includes('total_spent = total_spent +')) {
                user.total_spent = (user.total_spent || 0) + (params[0] || 0);
            }
            if (lower.includes('total_spent = total_spent -')) {
                user.total_spent = (user.total_spent || 0) - (params[0] || 0);
            }
            if (lower.includes('total_earned = total_earned +')) {
                user.total_earned = (user.total_earned || 0) + (params[0] || 0);
            }
            if (lower.includes('deliveries_done = deliveries_done + 1')) {
                user.deliveries_done = (user.deliveries_done || 0) + 1;
            }
        }
        return { rows: [], rowCount: user ? 1 : 0 };
    }

    // -- INSERT INTO orders
    if (lower.includes('insert into orders')) {
        const id = BigInt(orderIdSeq++).toString();
        const order = {
            id,
            order_code: params[0],
            placer_id: String(params[1]),
            item_desc: params[2],
            pickup_location: params[3],
            deliver_to: params[4],
            room_details: params[5],
            delivery_fee: params[6],
            urgency: params[7],
            schedule_time: params[8],
            notes: params[9] || '',
            delivery_pin: params[10] || null,
            accepter_id: null,
            tracking_lat: null,
            tracking_lng: null,
            tracking_updated_at: null,
            status: 'open',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        orders.push(order);
        return { rows: [{ ...order }], rowCount: 1 };
    }

    // -- SELECT id FROM orders WHERE order_code = $1
    if (lower.includes('select id from orders where order_code')) {
        const code = params[0];
        const found = orders.find(o => o.order_code === code);
        return { rows: found ? [{ id: found.id }] : [], rowCount: found ? 1 : 0 };
    }

    // -- SELECT * FROM orders WHERE id = $1 (with or without FOR UPDATE)
    if ((lower.includes('select * from orders where id') || lower.includes('select o.*')) && lower.includes('where o.id')) {
        const id = String(params[0]);
        const order = orders.find(o => String(o.id) === id);
        if (order) {
            const placer = users.find(u => String(u.id) === String(order.placer_id));
            const accepter = order.accepter_id ? users.find(u => String(u.id) === String(order.accepter_id)) : null;
            const row = {
                ...order,
                placer_name: placer?.name || '',
                placer_hostel: placer?.hostel || '',
                placer_phone: placer?.phone || '',
                accepter_name: accepter?.name || '',
                accepter_phone: accepter?.phone || ''
            };
            return { rows: [row], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
    }

    // -- SELECT * FROM orders WHERE id = $1 (simple)
    if (lower.includes('from orders where id') && !lower.includes('join')) {
        const id = String(params[0]);
        const order = orders.find(o => String(o.id) === id);
        return { rows: order ? [{ ...order }] : [], rowCount: order ? 1 : 0 };
    }

    // -- UPDATE orders SET accepter_id (accept order) — MUST come before status handler
    if (lower.includes('update orders') && lower.includes('accepter_id')) {
        const userId = params[0];
        const orderId = String(params[params.length - 1]);
        const order = orders.find(o => String(o.id) === orderId);
        if (order && order.status === 'open') {
            order.status = 'accepted';
            order.accepter_id = String(userId);
            if (!order.delivery_pin) order.delivery_pin = params[1] || null;
            order.updated_at = new Date().toISOString();
            return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
    }

    // -- UPDATE orders (status change) — excludes accept queries
    if (lower.includes('update orders') && lower.includes('set status') && !lower.includes('accepter_id')) {
        const statusParamIdx = 0;
        const idParamIdx = params.length - 1;
        const orderId = String(params[idParamIdx]);
        const order = orders.find(o => String(o.id) === orderId);
        if (order) {
            const newStatus = params[statusParamIdx];
            // Check WHERE condition if includes AND status = ...
            if (lower.includes("and status = 'open'") && order.status !== 'open') {
                return { rows: [], rowCount: 0 };
            }
            order.status = newStatus;
            order.updated_at = new Date().toISOString();
            if (lower.includes('tracking_lat = null')) {
                order.tracking_lat = null;
                order.tracking_lng = null;
                order.tracking_updated_at = null;
            }
            return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
    }

    // -- UPDATE orders SET tracking
    if (lower.includes('update orders') && lower.includes('tracking_lat') && !lower.includes('set status')) {
        const orderId = String(params[params.length - 1]);
        const order = orders.find(o => String(o.id) === orderId);
        if (order) {
            order.tracking_lat = params[0];
            order.tracking_lng = params[1];
            order.tracking_updated_at = new Date().toISOString();
            order.updated_at = new Date().toISOString();
        }
        return { rows: [], rowCount: order ? 1 : 0 };
    }

    // -- UPDATE orders SET delivery_pin
    if (lower.includes('update orders set delivery_pin')) {
        const pin = params[0];
        const orderId = String(params[1]);
        const order = orders.find(o => String(o.id) === orderId);
        if (order) {
            order.delivery_pin = pin;
            order.updated_at = new Date().toISOString();
        }
        return { rows: [], rowCount: order ? 1 : 0 };
    }

    // -- SELECT orders with JOINs (list queries)
    if (lower.includes('from orders o') && lower.includes('join users')) {
        let filtered = [...orders];

        // Status filter (always $1 for main list query)
        if (lower.includes('where o.status =')) {
            filtered = filtered.filter(o => o.status === params[0]);
        }

        // Placer filter
        if (lower.includes('where o.placer_id =')) {
            const placerId = String(params[0]);
            filtered = filtered.filter(o => String(o.placer_id) === placerId);
        }

        // Accepter filter
        if (lower.includes('where o.accepter_id =')) {
            const accepterId = String(params[0]);
            filtered = filtered.filter(o => String(o.accepter_id) === accepterId);
        }

        // Enrich with user data
        const rows = filtered.map(order => {
            const placer = users.find(u => String(u.id) === String(order.placer_id));
            const accepter = order.accepter_id ? users.find(u => String(u.id) === String(order.accepter_id)) : null;
            return {
                ...order,
                placer_name: placer?.name || '',
                placer_hostel: placer?.hostel || '',
                placer_phone: placer?.phone || '',
                accepter_name: accepter?.name || '',
                accepter_phone: accepter?.phone || ''
            };
        });

        return { rows, rowCount: rows.length };
    }

    // -- Aggregate stats query
    if (lower.includes('select') && lower.includes('count(*)') && lower.includes('from orders')) {
        const totalOrders = orders.length;
        const totalDelivered = orders.filter(o => o.status === 'delivered').length;
        const totalEarned = orders.filter(o => o.status === 'delivered').reduce((sum, o) => sum + (o.delivery_fee || 0), 0);
        return {
            rows: [{ total_orders: totalOrders, total_delivered: totalDelivered, total_earned: totalEarned }],
            rowCount: 1
        };
    }

    // Default: return empty
    return { rows: [], rowCount: 0 };
}

function createMockClient() {
    return {
        query: (sql, params) => Promise.resolve(mockQuery(sql, params)),
        release: () => {}
    };
}

const mockPool = {
    query: (sql, params) => Promise.resolve(mockQuery(sql, params)),
    connect: () => Promise.resolve(createMockClient()),
    end: () => Promise.resolve()
};

let initialized = false;

async function getDb() {
    initialized = true;
    return mockPool;
}

async function closeDb() {
    initialized = false;
}

module.exports = { getDb, closeDb, resetMockDb, mockPool };
