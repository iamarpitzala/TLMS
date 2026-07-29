// ── Main app controller ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  Modal.init();
  await checkAuth();
});

async function checkAuth() {
  try {
    const data = await API.get('/api/auth/me');
    APP.user = data.user;
    await APP.loadAccounts();
    showApp();
    navigate('dashboard');
  } catch (e) {
    showLogin();
  }
}

function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  setupLoginForm();
}

function setupLoginForm() {
  const form = document.getElementById('login-form');
  if (form._bound) return;
  form._bound = true;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('login-error');
    errEl.style.display = 'none';
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Signing in...';
    try {
      const data = await API.post('/api/auth/login', { username, password });
      APP.user = data.user;
      await APP.loadAccounts();
      showApp();
      navigate('dashboard');
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  });
}

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';

  // User info in sidebar
  const roleClass = { administrator: 'badge-admin', operator: 'badge-operator', viewer: 'badge-viewer' };
  document.getElementById('user-info').innerHTML = `
    <strong>${escHtml(APP.user.username)}</strong>
    <span class="badge ${roleClass[APP.user.role] || ''}">${APP.user.role}</span>
  `;

  // Show/hide role-restricted nav items
  if (APP.isAdmin()) {
    document.querySelectorAll('.nav-admin').forEach(el => el.style.display = '');
  }
  if (!APP.isOperator()) {
    document.querySelectorAll('.nav-operator').forEach(el => el.style.display = 'none');
  }

  // Nav click handler
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      navigate(item.dataset.page);
    });
  });

  // Logout
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await API.post('/api/auth/logout');
    APP.user = null;
    APP.accounts = [];
    showLogin();
  });
}

async function navigate(pageName) {
  // Permission gate: transactions require operator+
  if (pageName === 'transactions' && APP.isViewer()) {
    pageName = 'dashboard';
  }
  if (pageName === 'audit' && !APP.isAdmin()) {
    pageName = 'dashboard';
  }

  // Update nav highlight
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === pageName);
  });

  // Show page
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-' + pageName);
  if (target) target.classList.add('active');

  // Render page content
  switch (pageName) {
    case 'dashboard':      await renderDashboard(); break;
    case 'accounts':       await renderAccounts(); break;
    case 'transactions':   await renderTransactions(); break;
    case 'ledger':         await renderLedger(); break;
    case 'trial-balance':  await renderTrialBalance(); break;
    case 'audit':          await renderAudit(); break;
  }
}
