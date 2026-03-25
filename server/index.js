/**
 * NÓN CONCERT — Express API
 * QR tickets, check-in, admin stats, email confirmation
 */

require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const session = require('express-session');

const {
  countTicketsSold,
  insertTicket,
  getTicketByCode,
  markCheckedIn,
  markPurchasePaid,
  deleteAllTickets,
  listPurchases,
  adminStats,
} = require('./database');
const { sendPurchaseConfirmation } = require('./mailer');

const app = express();
const PORT = (() => {
  const raw = process.env.PORT;
  // Render cung cấp PORT (string). Nếu rỗng/không parse được -> fallback.
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) ? n : 3000;
})();
const HOST = process.env.HOST || '0.0.0.0';

const MAX_TICKETS = Number(process.env.MAX_TICKETS || 200);
const TICKET_PRICE = Number(process.env.TICKET_PRICE_VND || 350000);
const CONCERT_DATE = process.env.CONCERT_DATE || '2025-12-31T20:00:00+07:00';

/** VietQR / thông tin CK (hiển thị sau khi đặt vé) */
const PAYMENT_QR_URL = process.env.PAYMENT_QR_URL || '/images/vietqr-payment.png';
const BANK_ACCOUNT_NAME = process.env.BANK_ACCOUNT_NAME || 'NGUYEN THI NGOC TRAM';
const BANK_ACCOUNT_NUMBER = process.env.BANK_ACCOUNT_NUMBER || 'PSG26082161000000048';
const BANK_NAME = process.env.BANK_NAME || 'MoMo';

const ADMIN_USERNAME = (process.env.ADMIN_USERNAME || 'admin').trim();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-only-change-in-production';
/** Đặt ADMIN_ALLOW_RESET=false trên production nếu không muốn ai xóa hết vé */
const ADMIN_ALLOW_RESET = process.env.ADMIN_ALLOW_RESET !== 'false';

/**
 * CORS: if FRONTEND_URL is set (comma-separated), only those origins are allowed.
 * Otherwise reflect request origin (works for Vercel + Render without extra config).
 */
function corsMiddleware() {
  const raw = process.env.FRONTEND_URL || '';
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length === 0) {
    return cors({ origin: true, credentials: true });
  }
  return cors({ origin: list, credentials: true });
}

app.use(corsMiddleware());
app.use(express.json({ limit: '1mb' }));

app.set('trust proxy', 1);
app.use(
  session({
    name: 'nonconcert.sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

function requireAdmin(req, res, next) {
  if (req.session && req.session.admin === true) return next();
  res.status(401).json({ message: 'Cần đăng nhập admin' });
}

/** Sanitize string fields */
function clean(str) {
  return String(str ?? '')
    .trim()
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

/** Unique ticket code (collision-checked against DB) */
function randomTicketCode() {
  const hex = uuidv4().replace(/-/g, '').slice(0, 8).toUpperCase();
  return `NON-${hex}`;
}

function uniqueTicketCodeSync() {
  for (let i = 0; i < 20; i++) {
    const code = randomTicketCode();
    if (!getTicketByCode(code)) return code;
  }
  return `NON-${uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'non-concert-api' });
});

// ---------- Public config (homepage countdown, pricing) ----------
app.get('/api/config', (req, res) => {
  const sold = countTicketsSold();
  res.json({
    concertDate: CONCERT_DATE,
    ticketPrice: TICKET_PRICE,
    maxTickets: MAX_TICKETS,
    sold,
    available: Math.max(0, MAX_TICKETS - sold),
    soldOut: sold >= MAX_TICKETS,
    paymentQrUrl: PAYMENT_QR_URL,
    bankAccountName: BANK_ACCOUNT_NAME,
    bankAccountNumber: BANK_ACCOUNT_NUMBER,
    bankName: BANK_NAME,
  });
});

const purchaseValidators = [
  body('name').isLength({ min: 2, max: 120 }).withMessage('Tên không hợp lệ'),
  body('phone')
    .matches(/^[0-9+\s().-]{8,20}$/)
    .withMessage('Số điện thoại không hợp lệ'),
  body('email').isEmail().normalizeEmail().isLength({ max: 254 }).withMessage('Email không hợp lệ'),
  body('quantity')
    .isInt({ min: 1, max: 10 })
    .toInt()
    .withMessage('Số lượng từ 1 đến 10'),
];

app.post('/api/purchase', purchaseValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: errors.array()[0].msg });
  }

  const name = clean(req.body.name);
  const phone = clean(req.body.phone);
  const email = clean(req.body.email);
  const quantity = req.body.quantity;

  const sold = countTicketsSold();
  if (sold >= MAX_TICKETS) {
    return res.status(400).json({ success: false, message: 'SOLD OUT', code: 'SOLD_OUT' });
  }
  if (sold + quantity > MAX_TICKETS) {
    return res.status(400).json({
      success: false,
      message: `Chỉ còn ${MAX_TICKETS - sold} vé.`,
      code: 'INSUFFICIENT',
    });
  }

  const purchaseRef = uuidv4();
  const unitPrice = TICKET_PRICE;
  const orderTotal = unitPrice * quantity;
  const tickets = [];

  try {
    for (let i = 0; i < quantity; i++) {
      const ticketCode = uniqueTicketCodeSync();
      const qrDataUrl = await QRCode.toDataURL(ticketCode, {
        errorCorrectionLevel: 'M',
        width: 320,
        margin: 2,
        color: { dark: '#0a0a12', light: '#f8f5ff' },
      });
      insertTicket({
        purchase_ref: purchaseRef,
        name,
        phone,
        email,
        quantity: 1,
        total_price: unitPrice,
        ticket_code: ticketCode,
        qr_code: qrDataUrl,
        payment_status: 'pending',
      });
      tickets.push({ ticket_code: ticketCode, qr_code: qrDataUrl });
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, message: 'Không thể tạo vé. Thử lại sau.' });
  }

  // Gửi email xác nhận ở chế độ "background" để không làm chặn request /api/purchase
  // (SMTP timeout có thể khiến frontend xoay vòng mãi nếu await).
  sendPurchaseConfirmation({
    email,
    name,
    totalPrice: orderTotal,
    tickets: tickets.map((t) => ({ ticket_code: t.ticket_code })),
  }).catch((e) => console.error('[mail]', e));

  res.json({
    success: true,
    message: 'Đặt vé thành công! Vui lòng chuyển khoản; sau khi nhận tiền ban tổ chức sẽ xác nhận — lúc đó mới check-in được.',
    purchase_ref: purchaseRef,
    payment_status: 'pending',
    tickets,
    total_price: orderTotal,
  });
});

// ---------- Check-in ----------
app.post('/api/checkin', body('ticket_code').isString().notEmpty(), (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Invalid ticket' });
  }

  const ticketCode = clean(req.body.ticket_code).toUpperCase();
  const row = getTicketByCode(ticketCode);

  if (!row) {
    return res.status(400).json({ success: false, message: 'Invalid ticket' });
  }
  if (row.checked_in === 1) {
    return res.status(400).json({ success: false, message: 'Already used' });
  }
  if (row.payment_status !== 'paid') {
    return res.status(400).json({
      success: false,
      message: 'Chưa thanh toán',
      code: 'UNPAID',
    });
  }

  markCheckedIn(row.id);
  res.json({
    success: true,
    message: 'Check-in successful',
    ticket: {
      ticket_code: row.ticket_code,
      name: row.name,
      email: row.email,
    },
  });
});

// ---------- Admin auth (không cần đăng nhập) ----------
app.get('/api/admin/me', (req, res) => {
  res.json({ ok: !!(req.session && req.session.admin) });
});

app.post(
  '/api/admin/login',
  body('username').trim().notEmpty().withMessage('Nhập tên đăng nhập'),
  body('password').notEmpty().withMessage('Nhập mật khẩu'),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg });
    }
    if (!ADMIN_PASSWORD) {
      console.warn('[admin] Chưa đặt ADMIN_PASSWORD trong .env');
      return res.status(503).json({ message: 'Server chưa cấu hình đăng nhập admin' });
    }
    const u = clean(req.body.username);
    const p = String(req.body.password);
    if (u !== ADMIN_USERNAME || p !== ADMIN_PASSWORD) {
      return res.status(401).json({ message: 'Sai tài khoản hoặc mật khẩu' });
    }
    req.session.admin = true;
    res.json({ success: true });
  }
);

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ message: 'Không thể đăng xuất' });
    res.clearCookie('nonconcert.sid', { path: '/' });
    res.json({ success: true });
  });
});

// ---------- Admin API (cần đăng nhập) ----------
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const s = adminStats();
  res.json({
    totalTicketsSold: s.sold,
    totalRevenue: s.revenue,
    pendingAmount: s.pendingAmount,
    pendingOrders: s.pendingOrders,
    checkedInCount: s.checked,
    maxTickets: MAX_TICKETS,
  });
});

app.get('/api/admin/tickets', requireAdmin, (req, res) => {
  const search = clean(req.query.search || '');
  let checkedInFilter = String(req.query.checkedIn || 'all').toLowerCase();
  if (!['all', 'true', 'false'].includes(checkedInFilter)) checkedInFilter = 'all';
  let paymentFilter = String(req.query.payment || 'all').toLowerCase();
  if (!['all', 'pending', 'paid'].includes(paymentFilter)) paymentFilter = 'all';

  const rows = listPurchases({ search, checkedInFilter, paymentFilter });
  const enriched = rows.map((r) => {
    const pay = r.payment_status === 'paid' ? 'paid' : 'pending';
    return {
      purchase_ref: r.purchase_ref,
      name: r.name,
      phone: r.phone,
      email: r.email,
      quantity: r.quantity,
      total_price: r.total_price,
      ticket_codes: r.ticket_codes,
      payment_status: pay,
      checked_in_summary:
        r.checked_count === r.ticket_count ? 'all' : r.checked_count === 0 ? 'none' : 'partial',
      checked_in_count: r.checked_count,
      created_at: r.created_at,
    };
  });

  res.json({ items: enriched });
});

app.post(
  '/api/admin/mark-paid',
  requireAdmin,
  body('purchase_ref').isUUID().withMessage('purchase_ref không hợp lệ'),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }
    const n = markPurchasePaid(clean(req.body.purchase_ref));
    if (!n) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn' });
    }
    res.json({ success: true, message: 'Đã xác nhận thanh toán', ticketsUpdated: n });
  }
);

/** Xóa toàn bộ vé trong DB — về 0 vé (chỉ admin, có thể tắt bằng ADMIN_ALLOW_RESET=false) */
app.post(
  '/api/admin/reset-tickets',
  requireAdmin,
  body('confirm').equals('yes').withMessage('Thiếu xác nhận'),
  (req, res) => {
    if (!ADMIN_ALLOW_RESET) {
      return res.status(403).json({ success: false, message: 'Chức năng reset đã tắt trên server' });
    }
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }
    const n = deleteAllTickets();
    console.warn(`[admin] Đã xóa toàn bộ vé (${n} dòng)`);
    res.json({
      success: true,
      message: `Đã xóa ${n} vé. Hệ thống về 0 vé đã bán.`,
      deleted: n,
    });
  }
);

// ---------- Static frontend (same server on Render or local) ----------
const publicDir = path.join(__dirname, '..', 'public');

app.get('/admin.html', (req, res) => {
  if (!req.session || !req.session.admin) {
    return res.redirect(302, '/admin-login.html');
  }
  res.sendFile(path.join(publicDir, 'admin.html'));
});

app.use(express.static(publicDir));

app.listen(PORT, HOST, () => {
  console.log(
    `Vietnamese Excellence API listening on http://${HOST}:${PORT} (PORT env=${process.env.PORT || 'undefined'})`
  );
  if (process.env.NODE_ENV === 'production') {
    if (!ADMIN_PASSWORD) console.warn('[admin] Thiếu ADMIN_PASSWORD — không đăng nhập được.');
    if (SESSION_SECRET === 'dev-only-change-in-production') {
      console.warn('[admin] Đặt SESSION_SECRET ngẫu nhiên trên production.');
    }
  }
});

