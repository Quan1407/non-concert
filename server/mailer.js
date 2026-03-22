/**
 * Email xác nhận: VietQR thanh toán + danh sách mã vé (check-in nhập tay / đọc mã).
 */

const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

function createTransport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user, pass },
  });
}

function paymentQrPath() {
  const override = process.env.PAYMENT_QR_FILE;
  if (override && fs.existsSync(override)) return override;
  const def = path.join(__dirname, '..', 'public', 'images', 'vietqr-payment.png');
  return fs.existsSync(def) ? def : null;
}

/**
 * @param {{ email: string, name: string, tickets: { ticket_code: string }[], totalPrice?: number }} payload
 */
async function sendPurchaseConfirmation(payload) {
  if (process.env.SKIP_EMAIL === 'true') return { skipped: true };

  const transport = createTransport();
  if (!transport) {
    console.warn('[mail] SMTP not configured — skipping email');
    return { skipped: true };
  }

  const from = process.env.EMAIL_FROM || 'NÓN CONCERT <noreply@local>';
  const attachments = [];
  const bankName = process.env.BANK_NAME || 'BIDV';
  const bankHolder = process.env.BANK_ACCOUNT_NAME || 'DOAN MINH QUAN';
  const bankNo = process.env.BANK_ACCOUNT_NUMBER || '7880368737';
  const codes = payload.tickets.map((t) => t.ticket_code);
  const codesStr = codes.join(', ');
  const total =
    payload.totalPrice != null
      ? payload.totalPrice
      : codes.length * Number(process.env.TICKET_PRICE_VND || 350000);

  let htmlBody = `<p>Xin chào <strong>${escapeHtml(payload.name)}</strong>,</p>
    <p>Cảm ơn bạn đã đặt vé <strong>NÓN CONCERT</strong>.</p>
    <p><strong>Chuyển khoản ${escapeHtml(formatVnd(total))}</strong></p>
    <p>${escapeHtml(bankHolder)} — ${escapeHtml(bankName)} — STK <strong>${escapeHtml(bankNo)}</strong><br/>
    Nội dung CK: <code>${escapeHtml(codesStr)}</code></p>`;

  const qrFile = paymentQrPath();
  if (qrFile) {
    attachments.push({
      filename: 'vietqr-payment.png',
      path: qrFile,
      cid: 'vietqr@nonconcert',
    });
    htmlBody += `<p>Quét VietQR:</p><p><img src="cid:vietqr@nonconcert" alt="VietQR" width="260" /></p>`;
  }

  htmlBody += `<p><em>Sau khi bạn chuyển khoản, ban tổ chức sẽ xác nhận trên hệ thống — khi đó vé mới check-in được tại cổng.</em></p>`;
  htmlBody += `<p>Mã vé (dùng khi đã được xác nhận thanh toán):</p><ul>`;
  codes.forEach((c) => {
    htmlBody += `<li><code style="font-size:1.1em">${escapeHtml(c)}</code></li>`;
  });
  htmlBody += `</ul>`;

  await transport.sendMail({
    from,
    to: payload.email,
    subject: 'NÓN CONCERT — Xác nhận đặt vé & thanh toán',
    html: htmlBody,
    attachments,
  });

  return { sent: true };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatVnd(n) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
}

module.exports = { sendPurchaseConfirmation };
