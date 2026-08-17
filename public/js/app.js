// ── Mobile sidebar drawer ─────────────────────────────────────────────────
function toggleMobileMenu() {
  const sidebar  = document.getElementById('sidebar');
  const overlay  = document.getElementById('sidebar-overlay');
  const isOpen   = sidebar.classList.contains('open');
  if (isOpen) {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
  } else {
    sidebar.classList.add('open');
    overlay.classList.add('active');
  }
}

function closeMobileMenu() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('active');
}

// ── Utility functions ─────────────────────────────────────────────────────

function toggleLoginPw(btn) {
  const input = btn.closest('.login-field-wrap').querySelector('input');
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
}

// Close any open action dropdowns when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.action-menu-wrap')) {
    document.querySelectorAll('.action-dropdown.open').forEach(d => d.classList.remove('open'));
  }
});

function toggleActionMenu(btn) {
  const dropdown = btn.nextElementSibling;
  const isOpen = dropdown.classList.contains('open');
  document.querySelectorAll('.action-dropdown.open').forEach(d => d.classList.remove('open'));
  if (!isOpen) dropdown.classList.add('open');
}

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
    document.getElementById('loading-screen').style.display = 'none';
    showApp();
    navigate('dashboard');
  } catch (e) {
    document.getElementById('loading-screen').style.display = 'none';
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
    btn.textContent = 'Signing in…';
    try {
      const data = await API.post('/api/auth/login', { username, password });
      APP.user = data.user;
      await APP.loadAccounts();
      showApp();
      navigate('dashboard');
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'flex';
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M10 17v-3H3v-4h7V7l5 5-5 5zm9 2H12v-2h7V5h-7V3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2z"/></svg> Sign In`;
    }
  });
}

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';

  // Sidebar user info
  const u = APP.user;
  const initial = (u.username || 'U').charAt(0).toUpperCase();
  document.getElementById('sidebar-avatar').textContent = initial;
  document.getElementById('sidebar-name').textContent = u.username;
  document.getElementById('sidebar-role').textContent = u.role;

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
  if (pageName === 'transactions' && APP.isViewer()) pageName = 'dashboard';
  if (pageName === 'audit'        && !APP.isAdmin()) pageName = 'dashboard';
  if (pageName === 'users'        && !APP.isAdmin()) pageName = 'dashboard';

  // Close mobile drawer on navigation
  closeMobileMenu();

  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === pageName);
  });

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-' + pageName);
  if (target) target.classList.add('active');

  switch (pageName) {
    case 'dashboard':     await renderDashboard();    break;
    case 'accounts':      await renderAccounts();     break;
    case 'transactions':  await renderTransactions(); break;
    case 'ledger':        await renderLedger();       break;
    case 'trial-balance': await renderTrialBalance(); break;
    case 'audit':         await renderAudit();        break;
    case 'users':         await renderUsers();        break;
  }
}

// ── Change my own password (sidebar button) ───────────────────────────────
function openChangeMyPassword() {
  Modal.open({
    title: 'Change Password',
    body: `
      <div class="field-group">
        <label class="required">New Password</label>
        <input type="password" id="cmp-password" placeholder="Min. 6 characters" autocomplete="new-password" />
      </div>
      <div class="field-group">
        <label class="required">Confirm Password</label>
        <input type="password" id="cmp-confirm" placeholder="Re-enter new password" autocomplete="new-password" />
      </div>
      <div id="cmp-error" class="alert alert-error" style="display:none"></div>
    `,
    footer: `
      <button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
      <button class="btn btn-primary" onclick="submitChangeMyPassword()">Update Password</button>
    `
  });
}

async function submitChangeMyPassword() {
  const errEl   = document.getElementById('cmp-error');
  errEl.style.display = 'none';
  const password = document.getElementById('cmp-password').value;
  const confirm  = document.getElementById('cmp-confirm').value;
  if (password.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; errEl.style.display = 'flex'; return; }
  if (password !== confirm) { errEl.textContent = 'Passwords do not match.'; errEl.style.display = 'flex'; return; }
  const btn = Modal.footer.querySelector('.btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  try {
    await API.patch(`/api/users/${APP.user.id}/password`, { password });
    toast('Password updated', 'success');
    Modal.close();
  } catch (e) {
    errEl.textContent = e.message; errEl.style.display = 'flex';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Update Password'; }
  }
}
