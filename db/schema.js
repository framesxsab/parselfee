const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'parselfee.db');

let db;

function ensureColumn(table, columnName, definition) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!columns.some(col => col.name === columnName)) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
    }
}

function getDb() {
    if (db) return db;

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
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
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_code TEXT UNIQUE NOT NULL,
            placer_id INTEGER NOT NULL,
            accepter_id INTEGER,
            item_desc TEXT NOT NULL,
            pickup_location TEXT NOT NULL,
            deliver_to TEXT NOT NULL,
            room_details TEXT NOT NULL,
            delivery_fee INTEGER NOT NULL CHECK(delivery_fee >= 5 AND delivery_fee <= 500),
            urgency TEXT NOT NULL CHECK(urgency IN ('asap','30min','1hr','scheduled')),
            schedule_time TEXT,
            notes TEXT DEFAULT '',
            delivery_pin TEXT,
            tracking_lat REAL,
            tracking_lng REAL,
            tracking_updated_at TEXT,
            status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','accepted','picked_up','delivered','cancelled')),
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (placer_id) REFERENCES users(id),
            FOREIGN KEY (accepter_id) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
        CREATE INDEX IF NOT EXISTS idx_orders_placer ON orders(placer_id);
        CREATE INDEX IF NOT EXISTS idx_orders_accepter ON orders(accepter_id);
        CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `);

    // Handle existing databases created before tracking and PIN features.
    ensureColumn('orders', 'delivery_pin', 'delivery_pin TEXT');
    ensureColumn('orders', 'tracking_lat', 'tracking_lat REAL');
    ensureColumn('orders', 'tracking_lng', 'tracking_lng REAL');
    ensureColumn('orders', 'tracking_updated_at', 'tracking_updated_at TEXT');

    return db;
}

function closeDb() {
    if (db) {
        db.close();
        db = null;
    }
}

module.exports = { getDb, closeDb };
