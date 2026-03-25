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

  // Modal sửa thông tin người đặt
  const editModal = document.getElementById('edit-modal');
  const editNameEl = document.getElementById('edit-name');
  const editPhoneEl = document.getElementById('edit-phone');
  const editEmailEl = document.getElementById('edit-email');
  const editErrorEl = document.getElementById('edit-error');
  const editSaveBtn = document.getElementById('edit-save');
  const editCancelBtn = document.getElementById('edit-cancel');
  const editCloseBtn = document.getElementById('edit-close');

  let editPurchaseRef = null;

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
        paid
          ? '<span class="badge badge--ok">Đã CK</span>'
          : `<button type="button" class="btn btn--primary btn--table" data-ref="${escapeHtml(row.purchase_ref)}">Xác nhận đã CK</button>`;

      const editBtn = `<button type="button" class="btn btn--ghost btn--table" data-edit-ref="${escapeHtml(
        row.purchase_ref
      )}" data-edit-name="${escapeHtml(encodeURIComponent(row.name))}" data-edit-phone="${escapeHtml(
        encodeURIComponent(row.phone)
      )}" data-edit-email="${escapeHtml(encodeURIComponent(row.email))}">
        Sửa
      </button>`;
      tr.innerHTML = `
        <td>${escapeHtml(row.name)}</td>
        <td>${escapeHtml(row.phone)}</td>
        <td>${escapeHtml(row.email)}</td>
        <td>${row.quantity}</td>
        <td>${formatVnd(row.total_price)}</td>
        <td style="max-width:220px;word-break:break-all"><code>${escapeHtml(row.ticket_codes)}</code></td>
        <td>${paid ? '<span class="badge badge--ok">Đã thanh toán</span>' : '<span class="badge badge--sold">Chờ CK</span>'}</td>
        <td><span class="badge ${row.checked_in_summary === 'all' ? 'badge--ok' : row.checked_in_summary === 'none' ? 'badge--sold' : 'badge--warn'}">${statusLabel(row.checked_in_summary)}</span><br/><small style="color:var(--muted)">${row.checked_in_count}/${row.quantity}</small></td>
        <td style="white-space: nowrap">
          <div style="display:flex; gap:0.45rem; align-items:center; flex-wrap:wrap">
            ${btn}
            ${editBtn}
          </div>
        </td>
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

  function openEditModal({ purchaseRef, name, phone, email }) {
    if (!editModal) return;
    editPurchaseRef = purchaseRef;
    editNameEl.value = name || '';
    editPhoneEl.value = phone || '';
    editEmailEl.value = email || '';
    editErrorEl.style.display = 'none';
    editErrorEl.textContent = '';
    editModal.style.display = 'flex';
  }

  function closeEditModal() {
    editPurchaseRef = null;
    if (!editModal) return;
    editModal.style.display = 'none';
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
    const bEdit = e.target.closest('[data-edit-ref]');
    if (bEdit && bEdit.dataset.editRef) {
      openEditModal({
        purchaseRef: bEdit.dataset.editRef,
        name: decodeURIComponent(bEdit.dataset.editName || ''),
        phone: decodeURIComponent(bEdit.dataset.editPhone || ''),
        email: decodeURIComponent(bEdit.dataset.editEmail || ''),
      });
      return;
    }

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

  if (editModal) {
    editModal.addEventListener('click', (e) => {
      if (e.target === editModal) closeEditModal();
    });
  }

  if (editCloseBtn) editCloseBtn.addEventListener('click', closeEditModal);
  if (editCancelBtn) editCancelBtn.addEventListener('click', closeEditModal);

  if (editSaveBtn) {
    editSaveBtn.addEventListener('click', async () => {
      if (!editPurchaseRef) return;

      const name = (editNameEl?.value || '').trim();
      const phone = (editPhoneEl?.value || '').trim();
      const email = (editEmailEl?.value || '').trim();

      if (!name || !phone || !email) {
        editErrorEl.textContent = 'Vui lòng điền đủ Họ tên, SĐT và Email.';
        editErrorEl.style.display = 'block';
        return;
      }

      setLoading(true, 'Đang cập nhật thông tin…');
      try {
        await apiPost('/api/admin/update-buyer', {
          purchase_ref: editPurchaseRef,
          name,
          phone,
          email,
        });
        toast('Đã cập nhật thông tin người đặt', 'success');
        closeEditModal();
        await refreshAll({ overlay: false });
      } catch (err) {
        editErrorEl.textContent = err.message || 'Không cập nhật được';
        editErrorEl.style.display = 'block';
      } finally {
        setLoading(false);
      }
    });
  }

  refreshAll({ overlay: true });
})();
