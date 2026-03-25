/**
 * Homepage: countdown, stock, purchase form, ticket + QR display
 */
(function () {
  const { apiGet, apiPost } = window.NonConcertAPI;
  const { toast, setLoading } = window.NonConcertUI;

  const els = {
    countdown: document.getElementById('countdown'),
    soldOutLine: document.getElementById('sold-out-line'),
    form: document.getElementById('purchase-form'),
    quantity: document.getElementById('quantity'),
    pricePreview: document.getElementById('price-preview'),
    ticketList: document.getElementById('ticket-list'),
    resultHint: document.getElementById('result-hint'),
    submitBtn: document.getElementById('submit-btn'),
  };

  let countdownIntervalId = null;

  let config = {
    concertDate: new Date().toISOString(),
    ticketPrice: 350000,
    maxTickets: 200,
    sold: 0,
    available: 200,
    soldOut: false,
    paymentQrUrl: '/images/vietqr-payment.png',
    bankAccountName: 'NGUYEN THI NGOC TRAM',
    bankAccountNumber: 'PSG26082161000000048',
    bankName: 'MoMo',
  };

  function formatVnd(n) {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function renderCountdown(target) {
    if (countdownIntervalId != null) {
      clearInterval(countdownIntervalId);
      countdownIntervalId = null;
    }
    const t = new Date(target).getTime();
    const tick = () => {
      const now = Date.now();
      let diff = Math.max(0, t - now);
      if (diff === 0) {
        els.countdown.innerHTML =
          '<div class="cd-unit"><span>00</span><small>Đang diễn ra</small></div>';
        return;
      }
      const s = Math.floor(diff / 1000);
      const days = Math.floor(s / 86400);
      const h = Math.floor((s % 86400) / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      els.countdown.innerHTML = [
        ['Ngày', days],
        ['Giờ', h],
        ['Phút', m],
        ['Giây', sec],
      ]
        .map(
          ([label, v]) =>
            `<div class="cd-unit"><span>${pad(v)}</span><small>${label}</small></div>`
        )
        .join('');
    };
    tick();
    countdownIntervalId = setInterval(tick, 1000);
  }

  function fillQuantityOptions(maxBuy) {
    els.quantity.innerHTML = '';
    const cap = Math.min(10, Math.max(1, maxBuy));
    for (let i = 1; i <= cap; i++) {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = `${i} vé`;
      els.quantity.appendChild(o);
    }
    if (cap < 1) {
      const o = document.createElement('option');
      o.value = '0';
      o.textContent = '—';
      els.quantity.appendChild(o);
    }
  }

  function updatePricePreview() {
    const q = Number(els.quantity.value) || 0;
    const total = q * config.ticketPrice;
    els.pricePreview.textContent = `Tạm tính: ${formatVnd(total)} (${formatVnd(config.ticketPrice)} / vé)`;
  }

  function setSoldOutUi(on) {
    els.submitBtn.disabled = on;
    els.quantity.disabled = on;
    if (els.soldOutLine) {
      if (on) {
        els.soldOutLine.style.display = 'block';
        els.soldOutLine.innerHTML =
          '<span class="badge badge--sold">SOLD OUT</span> Hết vé. Cảm ơn bạn đã quan tâm!';
      } else {
        els.soldOutLine.style.display = 'none';
        els.soldOutLine.textContent = '';
      }
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** QR trên web = VietQR ngân hàng; mã vé dùng nhập tay / đọc cho nhân viên khi check-in */
  function renderTickets(tickets, totalPrice, buyer) {
    const codes = tickets.map((t) => t.ticket_code).join(', ');
    els.resultHint.textContent = `Vui lòng chuyển khoản đúng ${formatVnd(totalPrice)}. Nội dung CK ghi mã vé hoặc SĐT. Sau khi nhận tiền, admin xác nhận trên /admin — khi đó vé mới check-in được. Email sẽ gửi kèm (nếu đã cấu hình SMTP).`;
    els.ticketList.innerHTML = '';

    if (buyer) {
      const sum = document.createElement('div');
      sum.className = 'ticket-card buyer-summary-card';
      sum.innerHTML = `
        <div><strong>Thông tin bạn đã đặt</strong></div>
        <p class="price-line buyer-summary-lines" style="margin-bottom:0">
          <strong>Họ tên:</strong> ${escapeHtml(buyer.name)}<br/>
          <strong>SĐT:</strong> ${escapeHtml(buyer.phone)}<br/>
          <strong>Email:</strong> ${escapeHtml(buyer.email)}<br/>
          <strong>Số vé:</strong> ${Number(buyer.quantity) || tickets.length}
        </p>
        <p class="price-line" style="font-size:0.78rem;margin-top:0.5rem">Kiểm tra lại; nếu sai, liên hệ ban tổ chức trước khi thanh toán.</p>
      `;
      els.ticketList.appendChild(sum);
    }

    const pay = document.createElement('div');
    pay.className = 'ticket-card payment-qr-card';
    pay.innerHTML = `
      <div><strong>Quét VietQR để thanh toán</strong></div>
      <p class="price-line payment-bank-lines">
        ${escapeHtml(config.bankAccountName)}<br/>
        ${escapeHtml(config.bankName)} · STK <strong>${escapeHtml(config.bankAccountNumber)}</strong><br/>
        Số tiền: <strong>${formatVnd(totalPrice)}</strong>
      </p>
      <p class="price-line" style="font-size:0.82rem;margin-top:-0.35rem">Nội dung CK: <code>${escapeHtml(codes)}</code></p>
      <img class="payment-qr-img" src="${escapeHtml(config.paymentQrUrl)}" alt="VietQR chuyển khoản" width="260" height="260" />
    `;
    els.ticketList.appendChild(pay);

    tickets.forEach((t, i) => {
      const div = document.createElement('div');
      div.className = 'ticket-card ticket-code-card';
      div.style.animationDelay = `${0.12 + i * 0.06}s`;
      div.innerHTML = `
        <div><strong>Vé #${i + 1} — check-in</strong></div>
        <code class="ticket-code-big">${escapeHtml(t.ticket_code)}</code>
        <p class="price-line" style="font-size:0.8rem;margin:0">Sau khi admin xác nhận thanh toán: đưa mã này cho nhân viên hoặc nhập tại trang Check-in.</p>
      `;
      els.ticketList.appendChild(div);
    });
  }

  async function loadConfig() {
    try {
      config = await apiGet('/api/config');
      renderCountdown(config.concertDate);
      const avail = Math.max(0, config.available);
      fillQuantityOptions(config.soldOut ? 0 : Math.min(10, avail));
      if (config.soldOut || avail === 0) setSoldOutUi(true);
      else setSoldOutUi(false);
      updatePricePreview();
      return true;
    } catch (e) {
      toast('Không tải được cấu hình. Kiểm tra API / CORS.', 'error');
      renderCountdown(config.concertDate);
      return false;
    }
  }

  els.quantity.addEventListener('change', updatePricePreview);

  els.form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (config.soldOut) return;

    const body = {
      name: document.getElementById('name').value,
      phone: document.getElementById('phone').value,
      email: document.getElementById('email').value,
      quantity: Number(els.quantity.value),
    };

    setLoading(true, 'Đang tạo vé & QR…');
    try {
      const res = await apiPost('/api/purchase', body);
      toast(res.message || 'Thành công', 'success');
      renderTickets(res.tickets, res.total_price, {
        name: body.name,
        phone: body.phone,
        email: body.email,
        quantity: body.quantity,
      });
      await loadConfig();
    } catch (err) {
      const msg = err.message || 'Có lỗi xảy ra';
      toast(msg, 'error');
      if (err.data?.code === 'SOLD_OUT') setSoldOutUi(true);
    } finally {
      setLoading(false);
    }
  });

  loadConfig();
})();

