/**
 * Admin dashboard: stats + filterable ticket list (cần cookie session)
 */
(function () {
  const { apiGet, apiPost } = window.NonConcertAPI;
  const { toast, setLoading } = window.NonConcertUI;

  const statsEl = document.getElementById('stats');
  const tbody = document.getElementById('tbody');
  const search = document.getElementById('search');
  const filterIn = document.getElementById('filter-in');
  const filterPay = document.getElementById('filter-pay');
  const btnRefresh = document.getElementById('btn-refresh');
  const btnResetAll = document.getElementById('btn-reset-all');
  const btnLogout = document.getElementById('btn-logout');

  function formatVnd(n) {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
  }

  function statusLabel(s) {
    if (s === 'all') return 'Đã check-in đủ';
    if (s === 'none') return 'Chưa check-in';
    return 'Một phần';
  }

  async function loadStats() {
    const s = await apiGet('/api/admin/stats');
    statsEl.innerHTML = `
      <div class="stat">Vé đã giữ<strong>${s.totalTicketsSold} / ${s.maxTickets}</strong></div>
      <div class="stat">Doanh thu (đã CK)<strong>${formatVnd(s.totalRevenue)}</strong></div>
      <div class="stat">Chờ xác nhận CK<strong>${s.pendingOrders ?? 0} đơn · ${formatVnd(s.pendingAmount ?? 0)}</strong></div>
      <div class="stat">Đã check-in<strong>${s.checkedInCount}</strong></div>
    `;
  }

  async function loadTable() {
    const q = new URLSearchParams();
    const t = search.value.trim();
    if (t) q.set('search', t);
    q.set('checkedIn', filterIn.value);
    q.set('payment', filterPay.value);
    const data = await apiGet('/api/admin/tickets?' + q.toString());
    tbody.innerHTML = '';
    data.items.forEach((row) => {
      const tr = document.createElement('tr');
      const paid = row.payment_status === 'paid';
      const btn =
        paid ?
          '<span class="badge badge--ok">Đã CK</span>'
        : `<button type="button" class="btn btn--primary btn--table" data-ref="${escapeHtml(row.purchase_ref)}">Xác nhận đã CK</button>`;
      tr.innerHTML = `
        <td>${escapeHtml(row.name)}</td>
        <td>${escapeHtml(row.phone)}</td>
        <td>${escapeHtml(row.email)}</td>
        <td>${row.quantity}</td>
        <td>${formatVnd(row.total_price)}</td>
        <td style="max-width:220px;word-break:break-all"><code>${escapeHtml(row.ticket_codes)}</code></td>
        <td>${paid ? '<span class="badge badge--ok">Đã thanh toán</span>' : '<span class="badge badge--sold">Chờ CK</span>'}</td>
        <td><span class="badge ${row.checked_in_summary === 'all' ? 'badge--ok' : row.checked_in_summary === 'none' ? 'badge--sold' : 'badge--warn'}">${statusLabel(row.checked_in_summary)}</span><br/><small style="color:var(--muted)">${row.checked_in_count}/${row.quantity}</small></td>
        <td>${btn}</td>
      `;
      tbody.appendChild(tr);
    });
    if (!data.items.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="9" style="text-align:center;color:var(--muted)">Không có dữ liệu</td>';
      tbody.appendChild(tr);
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  let debounce;
  const refreshLabel = 'Làm mới';

  /**
   * @param {{ overlay?: boolean, resetFilters?: boolean }} [opts]
   */
  async function refreshAll(opts = {}) {
    if (!btnRefresh) return;
    const useOverlay = opts.overlay === true;
    const resetFilters = opts.resetFilters === true;

    btnRefresh.textContent = 'Đang tải…';
    btnRefresh.setAttribute('aria-busy', 'true');
    if (useOverlay) setLoading(true, 'Đang tải…');
    try {
      if (resetFilters) {
        search.value = '';
        filterIn.value = 'all';
        filterPay.value = 'all';
      }
      await Promise.all([loadStats(), loadTable()]);
      if (!useOverlay) toast('Đã tải lại danh sách', 'info', 2200);
    } catch (e) {
      toast(e.message || 'Lỗi tải admin', 'error');
    } finally {
      btnRefresh.textContent = refreshLabel;
      btnRefresh.removeAttribute('aria-busy');
      if (useOverlay) setLoading(false);
    }
  }

  search.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => loadTable().catch((e) => toast(e.message, 'error')), 320);
  });
  filterIn.addEventListener('change', () => loadTable().catch((e) => toast(e.message, 'error')));
  filterPay.addEventListener('change', () => loadTable().catch((e) => toast(e.message, 'error')));

  if (btnRefresh) {
    btnRefresh.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        refreshAll({ overlay: false, resetFilters: true });
      },
      true
    );
  }

  if (btnResetAll) {
    btnResetAll.addEventListener(
      'click',
      async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ok1 = window.confirm(
          'CẢNH BÁO: Toàn bộ vé trong hệ thống sẽ bị XÓA VĨNH VIỄN (database).\nSố liệu admin về 0 — không hoàn tác.\n\nBấm OK nếu vẫn muốn tiếp tục.'
        );
        if (!ok1) return;
        const ok2 = window.confirm('Xác nhận lần 2: Chắc chắn xóa hết vé?');
        if (!ok2) return;
        setLoading(true, 'Đang xóa toàn bộ vé…');
        try {
          const res = await apiPost('/api/admin/reset-tickets', { confirm: 'yes' });
          toast(res.message || 'Đã reset', 'success');
          await refreshAll({ overlay: false, resetFilters: true });
        } catch (err) {
          toast(err.message || 'Không xóa được', 'error');
        } finally {
          setLoading(false);
        }
      },
      true
    );
  }

  btnLogout.addEventListener('click', async () => {
    setLoading(true, 'Đang đăng xuất…');
    try {
      await apiPost('/api/admin/logout', {});
      window.location.replace('/admin-login.html');
    } catch (err) {
      toast(err.message || 'Lỗi', 'error');
      setLoading(false);
    }
  });

  tbody.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-ref]');
    if (!b || !b.dataset.ref) return;
    setLoading(true, 'Đang cập nhật…');
    try {
      await apiPost('/api/admin/mark-paid', { purchase_ref: b.dataset.ref });
      toast('Đã xác nhận thanh toán', 'success');
      await refreshAll({ overlay: false });
    } catch (err) {
      toast(err.message || 'Lỗi', 'error');
    } finally {
      setLoading(false);
    }
  });

  refreshAll({ overlay: true });
})();
