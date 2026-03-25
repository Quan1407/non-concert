/**
 * API client. Gọi /api/admin/* gửi kèm cookie session (credentials: include).
 */
function apiBase() {
  const b = typeof window !== 'undefined' && window.__API_BASE__;
  if (b) return String(b).replace(/\/$/, '');
  return '';
}

function adminPath(path) {
  return String(path).startsWith('/api/admin');
}

async function readErrorMessage(r) {
  const t = await r.text();
  if (!t) return r.statusText || 'Lỗi mạng';
  try {
    const j = JSON.parse(t);
    return j.message || j.error || t;
  } catch {
    return t;
  }
}

/**
 * @param {string} path
 * @param {{ skipAuthRedirect?: boolean, withCredentials?: boolean }} [options]
 */
async function apiGet(path, options = {}) {
  const withCookie = options.withCredentials ?? adminPath(path);
  const skipAuthRedirect = options.skipAuthRedirect === true;
  const timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : 30000;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  const r = await fetch(`${apiBase()}${path}`, {
    credentials: withCookie ? 'include' : 'omit',
    signal: controller.signal,
  }).finally(() => clearTimeout(t));
  if (r.status === 401 && withCookie && !skipAuthRedirect) {
    window.location.assign('/admin-login.html');
    throw new Error('Cần đăng nhập');
  }
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

/**
 * @param {string} path
 * @param {object} body
 * @param {{ skipAuthRedirect?: boolean, withCredentials?: boolean }} [options]
 */
async function apiPost(path, body, options = {}) {
  const withCookie = options.withCredentials ?? adminPath(path);
  const skipAuthRedirect = options.skipAuthRedirect === true;
  const timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : 45000;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  const r = await fetch(`${apiBase()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: withCookie ? 'include' : 'omit',
    signal: controller.signal,
  });
  clearTimeout(t);
  const text = await r.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (_) {}
  if (r.status === 401 && withCookie && !skipAuthRedirect) {
    window.location.assign('/admin-login.html');
    throw new Error('Cần đăng nhập');
  }
  if (!r.ok) {
    throw Object.assign(new Error(data.message || text || r.statusText), { data, status: r.status });
  }
  return data;
}

window.NonConcertAPI = { apiBase, apiGet, apiPost };
