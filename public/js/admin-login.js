(function () {
  const form = document.getElementById('login-form');
  const errEl = document.getElementById('login-error');
  const { apiPost, apiGet } = window.NonConcertAPI;
  const { toast, setLoading } = window.NonConcertUI;

  async function checkAlreadyIn() {
    try {
      const j = await apiGet('/api/admin/me', { skipAuthRedirect: true });
      if (j.ok) window.location.replace('/admin.html');
    } catch (_) {}
  }

  checkAlreadyIn();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.textContent = '';
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    setLoading(true, 'Đang đăng nhập…');
    try {
      await apiPost(
        '/api/admin/login',
        { username, password },
        { skipAuthRedirect: true }
      );
      toast('Đăng nhập thành công', 'success');
      window.location.replace('/admin.html');
    } catch (err) {
      errEl.textContent = err.message || 'Đăng nhập thất bại';
      toast(err.message || 'Sai tài khoản', 'error');
    } finally {
      setLoading(false);
    }
  });
})();
