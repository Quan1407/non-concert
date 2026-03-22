/**
 * Check-in page: manual code + optional html5-qrcode camera
 */
(function () {
  const { apiPost } = window.NonConcertAPI;
  const { toast, setLoading } = window.NonConcertUI;

  const input = document.getElementById('ticket_code');
  const btn = document.getElementById('btn-checkin');
  const btnCam = document.getElementById('btn-camera');
  const result = document.getElementById('result');
  const readerEl = document.getElementById('reader');

  let html5Qr = null;
  let scanning = false;

  function showResult(kind, text) {
    result.className = 'checkin-result checkin-result--show checkin-result--' + kind;
    result.textContent = text;
  }

  function hideResult() {
    result.className = 'checkin-result';
    result.textContent = '';
  }

  async function doCheckin(code) {
    const ticket_code = String(code || '').trim();
    if (!ticket_code) {
      toast('Nhập mã vé', 'error');
      return;
    }
    hideResult();
    setLoading(true, 'Đang check-in…');
    try {
      const res = await apiPost('/api/checkin', { ticket_code });
      showResult('ok', '✅ Valid ticket — ' + (res.message || 'Check-in successful'));
      toast('Check-in thành công', 'success');
      input.value = '';
    } catch (err) {
      const msg = err.message || '';
      if (msg === 'Already used') {
        showResult('warn', '⚠️ Already used — vé đã được quét.');
        toast('Vé đã sử dụng', 'error');
      } else if (msg === 'Chưa thanh toán' || err.data?.code === 'UNPAID') {
        showResult('warn', '⚠️ Chưa thanh toán — đơn chưa được xác nhận chuyển khoản.');
        toast('Chưa xác nhận thanh toán', 'error');
      } else if (msg === 'Invalid ticket') {
        showResult('bad', '❌ Invalid — không tìm thấy mã vé.');
        toast('Mã vé không hợp lệ', 'error');
      } else {
        showResult('bad', '❌ ' + msg);
        toast(msg, 'error');
      }
    } finally {
      setLoading(false);
    }
  }

  btn.addEventListener('click', () => doCheckin(input.value));

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      doCheckin(input.value);
    }
  });

  btnCam.addEventListener('click', async () => {
    if (typeof Html5Qrcode === 'undefined') {
      toast('Thư viện quét QR chưa tải (kiểm tra mạng).', 'error');
      return;
    }
    if (scanning) {
      try {
        await html5Qr.stop();
        await html5Qr.clear();
      } catch (_) {}
      readerEl.style.display = 'none';
      scanning = false;
      btnCam.textContent = 'Bật camera quét';
      return;
    }

    readerEl.style.display = 'block';
    html5Qr = new Html5Qrcode('reader');
    scanning = true;
    btnCam.textContent = 'Tắt camera';

    const config = { fps: 8, qrbox: { width: 260, height: 260 } };
    try {
      await html5Qr.start(
        { facingMode: 'environment' },
        config,
        (decodedText) => {
          input.value = decodedText;
          doCheckin(decodedText);
        },
        () => {}
      );
    } catch (e) {
      scanning = false;
      btnCam.textContent = 'Bật camera quét';
      readerEl.style.display = 'none';
      toast('Không mở được camera: ' + (e.message || e), 'error');
    }
  });
})();
