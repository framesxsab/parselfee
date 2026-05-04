const { Pool } = require('pg');
const { config } = require('../config');

let pool;
let initialized = false;

async function initializeSchema(db) {
    await db.query(`
        CREATE TABLE IF NOT EXISTS users (
            id BIGSERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            phone TEXT DEFAULT '',
            hostel TEXT DEFAULT '',
            room TEXT DEFAULT '',
            total_earned INTEGER DEFAULT 0,
            total_spent INTEGER DEFAULT 0,
            deliveries_done INTEGER DEFAULT 0,
            orders_placed INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS orders (
            id BIGSERIAL PRIMARY KEY,
            order_code TEXT UNIQUE NOT NULL,
            placer_id BIGINT NOT NULL REFERENCES users(id),
            accepter_id BIGINT REFERENCES users(id),
            item_desc TEXT NOT NULL,
            pickup_location TEXT NOT NULL,
            deliver_to TEXT NOT NULL,
            room_details TEXT NOT NULL,
            delivery_fee INTEGER NOT NULL CHECK (
                delivery_fee >= ${config.orders.deliveryFeeMin}
                AND delivery_fee <= ${config.orders.deliveryFeeMax}
            ),
            urgency TEXT NOT NULL CHECK (urgency IN ('asap','30min','1hr','scheduled')),
            schedule_time TIMESTAMPTZ,
            notes TEXT DEFAULT '',
            delivery_pin TEXT,
            tracking_lat DOUBLE PRECISION,
            tracking_lng DOUBLE PRECISION,
            tracking_updated_at TIMESTAMPTZ,
            status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','picked_up','delivered','cancelled')),
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )
    `);

    await db.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_pin TEXT');
    await db.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_lat DOUBLE PRECISION');
    await db.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_lng DOUBLE PRECISION');
    await db.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_updated_at TIMESTAMPTZ');

    await db.query('CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_orders_placer ON orders(placer_id)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_orders_accepter ON orders(accepter_id)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
}

async function getDb() {
    if (!pool) {
        pool = new Pool({
            connectionString: config.db.url,
            ssl: config.db.sslEnabled ? { rejectUnauthorized: config.db.rejectUnauthorized } : false,
            max: config.db.poolMax,
            idleTimeoutMillis: config.db.idleTimeoutMillis,
            connectionTimeoutMillis: config.db.connectionTimeoutMillis
        });
    }

    if (!initialized) {
        await initializeSchema(pool);
        initialized = true;
    }

    return pool;
}

async function closeDb() {
    if (pool) {
        await pool.end();
        pool = null;
        initialized = false;
    }
}

module.exports = { getDb, closeDb };
