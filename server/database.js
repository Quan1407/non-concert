/**
 * SQLite database setup for NÓN CONCERT.
 * One row = one physical ticket (same purchase shares purchase_ref).
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.SQLITE_PATH || path.join(__dirname, 'data', 'nonconcert.db');

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

ensureDir(dbPath);

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_ref TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    total_price REAL NOT NULL,
    ticket_code TEXT NOT NULL UNIQUE,
    qr_code TEXT NOT NULL,
    checked_in INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_tickets_email ON tickets(email);
  CREATE INDEX IF NOT EXISTS idx_tickets_phone ON tickets(phone);
  CREATE INDEX IF NOT EXISTS idx_tickets_purchase_ref ON tickets(purchase_ref);
  CREATE INDEX IF NOT EXISTS idx_tickets_checked_in ON tickets(checked_in);
`);

// Cột thanh toán (đơn mới = pending; dữ liệu cũ trước khi có cột → coi như đã thanh toán)
const ticketColumns = db.prepare(`PRAGMA table_info(tickets)`).all();
if (!ticketColumns.some((c) => c.name === 'payment_status')) {
  db.exec(`ALTER TABLE tickets ADD COLUMN payment_status TEXT`);
  db.prepare(`UPDATE tickets SET payment_status = 'paid' WHERE payment_status IS NULL`).run();
}

/** Total number of tickets (rows) sold */
function countTicketsSold() {
  const row = db.prepare('SELECT COUNT(*) AS c FROM tickets').get();
  return row.c;
}

function insertTicket(row) {
  const stmt = db.prepare(`
    INSERT INTO tickets (purchase_ref, name, phone, email, quantity, total_price, ticket_code, qr_code, checked_in, payment_status)
    VALUES (@purchase_ref, @name, @phone, @email, @quantity, @total_price, @ticket_code, @qr_code, 0, @payment_status)
  `);
  stmt.run({ ...row, payment_status: row.payment_status || 'pending' });
}

function getTicketByCode(code) {
  return db
    .prepare('SELECT * FROM tickets WHERE ticket_code = ?')
    .get(String(code).trim().toUpperCase());
}

function markCheckedIn(id) {
  db.prepare('UPDATE tickets SET checked_in = 1 WHERE id = ?').run(id);
}

/** Sau khi admin đối soát chuyển khoản */
function markPurchasePaid(purchaseRef) {
  const info = db
    .prepare(`UPDATE tickets SET payment_status = 'paid' WHERE purchase_ref = ?`)
    .run(purchaseRef);
  return info.changes;
}

/** Admin: aggregated purchases (one row per purchase_ref) */
function listPurchases({ search = '', checkedInFilter = 'all', paymentFilter = 'all' }) {
  let sql = `
    SELECT
      purchase_ref,
      MIN(name) AS name,
      MIN(phone) AS phone,
      MIN(email) AS email,
      COUNT(*) AS quantity,
      SUM(total_price) AS total_price,
      GROUP_CONCAT(ticket_code, ', ') AS ticket_codes,
      MIN(created_at) AS created_at,
      SUM(CASE WHEN checked_in = 1 THEN 1 ELSE 0 END) AS checked_count,
      COUNT(*) AS ticket_count,
      MIN(COALESCE(payment_status, 'pending')) AS payment_status
    FROM tickets
    WHERE 1=1
  `;
  const params = [];

  if (search && String(search).trim()) {
    const q = `%${String(search).trim().replace(/%/g, '\\%')}%`;
    sql += ` AND (name LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR ticket_code LIKE ? ESCAPE '\\')`;
    params.push(q, q, q, q);
  }

  sql += ` GROUP BY purchase_ref`;

  const rows = db.prepare(sql).all(...params);

  return rows.filter((r) => {
    const pay = r.payment_status === 'paid' ? 'paid' : 'pending';
    if (paymentFilter === 'pending' && pay !== 'pending') return false;
    if (paymentFilter === 'paid' && pay !== 'paid') return false;
    if (checkedInFilter === 'true') return r.checked_count === r.ticket_count && r.ticket_count > 0;
    if (checkedInFilter === 'false') return r.checked_count < r.ticket_count;
    return true;
  });
}

/** Xóa toàn bộ vé (admin reset — không hoàn tác) */
function deleteAllTickets() {
  const info = db.prepare('DELETE FROM tickets').run();
  return info.changes;
}

/** Admin: cập nhật thông tin người đặt (theo purchase_ref, áp dụng cho toàn bộ vé trong đơn) */
function updateBuyerInfo(purchaseRef, { name, phone, email }) {
  const info = db
    .prepare(`UPDATE tickets SET name = ?, phone = ?, email = ? WHERE purchase_ref = ?`)
    .run(name, phone, email, purchaseRef);
  return info.changes;
}

function adminStats() {
  const sold = countTicketsSold();
  const revenue = db
    .prepare(
      `SELECT COALESCE(SUM(total_price), 0) AS s FROM tickets WHERE COALESCE(payment_status, 'pending') = 'paid'`
    )
    .get().s;
  const pendingAmount = db
    .prepare(
      `SELECT COALESCE(SUM(total_price), 0) AS s FROM tickets WHERE COALESCE(payment_status, 'pending') != 'paid'`
    )
    .get().s;
  const pendingOrders = db
    .prepare(
      `SELECT COUNT(DISTINCT purchase_ref) AS c FROM tickets WHERE COALESCE(payment_status, 'pending') != 'paid'`
    )
    .get().c;
  const checked = db.prepare('SELECT COUNT(*) AS c FROM tickets WHERE checked_in = 1').get().c;
  return { sold, revenue, checked, pendingAmount, pendingOrders };
}

module.exports = {
  db,
  countTicketsSold,
  insertTicket,
  getTicketByCode,
  markCheckedIn,
  markPurchasePaid,
  deleteAllTickets,
  updateBuyerInfo,
  listPurchases,
  adminStats,
};
