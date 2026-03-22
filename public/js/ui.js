/**
 * Toast + loading overlay (shared UI helpers)
 */
(function () {
  const toastRoot = () => {
    let el = document.getElementById('toast-root');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast-root';
      el.className = 'toast-root';
      document.body.appendChild(el);
    }
    return el;
  };

  function toast(message, type = 'info', ms = 4200) {
    const root = toastRoot();
    const t = document.createElement('div');
    t.className = `toast toast--${type} animate-in`;
    t.textContent = message;
    root.appendChild(t);
    setTimeout(() => {
      t.classList.add('toast--out');
      setTimeout(() => t.remove(), 380);
    }, ms);
  }

  function setLoading(on, text = 'Đang xử lý…') {
    let el = document.getElementById('global-loading');
    if (on) {
      if (!el) {
        el = document.createElement('div');
        el.id = 'global-loading';
        el.className = 'loading-overlay';
        el.innerHTML = `<div class="loading-card"><div class="spinner"></div><p class="loading-text"></p></div>`;
        document.body.appendChild(el);
      }
      el.querySelector('.loading-text').textContent = text;
      el.classList.add('loading-overlay--show');
    } else if (el) {
      el.classList.remove('loading-overlay--show');
    }
  }

  window.NonConcertUI = { toast, setLoading };
})();
