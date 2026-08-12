// ── API wrapper ─────────────────────────────────────────────────────────
const API = {
  async request(method, url, data = null) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin'
    };
    if (data && method !== 'GET') opts.body = JSON.stringify(data);
    const res = await fetch(url, opts);
    const ct = res.headers.get('Content-Type') || '';
    if (ct.includes('application/json')) {
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Request failed');
      return json;
    }
    if (!res.ok) throw new Error('Request failed: ' + res.status);
    return res;
  },
  get: (url) => API.request('GET', url),
  post: (url, data) => API.request('POST', url, data),
  put: (url, data) => API.request('PUT', url, data),
  patch: (url, data) => API.request('PATCH', url, data),
  delete: (url) => API.request('DELETE', url),

  buildQuery(params) {
    const p = Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined);
    return p.length ? '?' + new URLSearchParams(p).toString() : '';
  }
};

// ── Toast ─────────────────────────────────────────────────────────────────
function toast(msg, type = 'info', duration = 3500) {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'space-between';
  el.style.gap = '0.5rem';

  const text = document.createElement('span');
  text.textContent = msg;

  const close = document.createElement('button');
  close.textContent = '×';
  close.style.cssText = 'background:none;border:none;color:inherit;font-size:1.1rem;cursor:pointer;padding:0;line-height:1;opacity:0.8;flex-shrink:0';
  close.addEventListener('click', () => el.remove());

  el.appendChild(text);
  el.appendChild(close);
  document.getElementById('toast-container').appendChild(el);

  const timer = setTimeout(() => el.remove(), duration);
  el.addEventListener('mouseenter', () => clearTimeout(timer));
  el.addEventListener('mouseleave', () => setTimeout(() => el.remove(), 1500));
}

// ── App state ─────────────────────────────────────────────────────────────
window.APP = {
  user: null,
  accounts: [],

  isAdmin() { return this.user && this.user.role === 'administrator'; },
  isOperator() { return this.user && (this.user.role === 'operator' || this.user.role === 'administrator'); },
  isViewer() { return this.user && this.user.role === 'viewer'; },

  async loadAccounts() {
    try {
      this.accounts = await API.get('/api/accounts?active=true');
    } catch (e) {
      this.accounts = [];
    }
  },

  accountOptions(selectedId = '') {
    return this.accounts.map(a =>
      `<option value="${a.id}" ${String(a.id) === String(selectedId) ? 'selected' : ''}>${escHtml(a.account_name)}</option>`
    ).join('');
  }
};

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtNum(n) {
  if (n === null || n === undefined) return '-';
  return parseFloat(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Amounts are stored as shortened values (÷1000 at input).
// Use fmtAmt wherever the full rupee value should be displayed.
function fmtAmt(n) {
  if (n === null || n === undefined) return '-';
  return (parseFloat(n) * 1000).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d) {
  if (!d) return '-';
  return d.slice(0, 10);
}
