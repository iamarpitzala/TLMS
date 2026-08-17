// ── Accounts page ─────────────────────────────────────────────────────────
let accountsData = [];

async function renderAccounts() {
  const page = document.getElementById('page-accounts');
  page.innerHTML = `
    <div class="page-header">
      <h2>Accounts</h2>
      ${APP.isOperator() ? `<button class="btn btn-primary" onclick="openAccountModal()">+ New Account</button>` : ''}
    </div>

    <div class="filters-bar">
      <div class="filter-field">
        <label>Search</label>
        <input type="text" id="acc-search" placeholder="Name, mobile, group…" style="width:220px" />
      </div>
      <div class="filter-field">
        <label>Status</label>
        <select id="acc-status" style="width:130px">
          <option value="">All</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>
      <button class="btn btn-primary" onclick="loadAccounts()">Search</button>
      <button class="btn btn-outline" onclick="clearAccountFilters()">Clear</button>
    </div>

    <div class="card" style="padding:0">
      <div id="accounts-table-wrap">
        <div class="loading"><span class="spinner"></span> Loading…</div>
      </div>
    </div>
  `;

  loadAccounts();
}

async function loadAccounts() {
  const search = document.getElementById('acc-search')?.value || '';
  const active = document.getElementById('acc-status')?.value || '';
  const wrap = document.getElementById('accounts-table-wrap');
  if (!wrap) return;

  wrap.innerHTML = `<div class="loading"><span class="spinner"></span> Loading…</div>`;

  try {
    const q = API.buildQuery({ search, active });
    accountsData = await API.get('/api/accounts' + q);
    renderAccountsTable(accountsData);
  } catch (e) {
    wrap.innerHTML = `<div class="alert alert-error" style="margin:1rem">${escHtml(e.message)}</div>`;
  }
}

function renderAccountsTable(data) {
  const wrap = document.getElementById('accounts-table-wrap');
  if (!wrap) return;

  if (data.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">👥</div><p>No accounts found.</p></div>`;
    return;
  }

  const canEdit = APP.isOperator();

  wrap.innerHTML = `
    <div class="table-wrap">
      <table class="rwd-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Account Name</th>
            <th>Mobile</th>
            <th style="text-align:right">Opening Amt</th>
            <th>Balance Date</th>
            <th>Group</th>
            <th>Parent</th>
            <th style="text-align:center">Status</th>
            ${canEdit ? '<th style="text-align:center">Actions</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${data.map(a => `
            <tr>
              <td data-label="#" style="color:#9ca3af;font-size:0.8rem">${a.id}</td>
              <td data-label="Name"><strong>${escHtml(a.account_name)}</strong></td>
              <td data-label="Mobile" style="color:#6b7280">${escHtml(a.mobile_number) || '—'}</td>
              <td data-label="Opening Amt" style="text-align:right">${fmtAmt(a.opening_amount)}</td>
              <td data-label="Balance Date" style="color:#6b7280">${fmtDate(a.balance_date)}</td>
              <td data-label="Group" style="color:#6b7280">${escHtml(a.group_name) || '—'}</td>
              <td data-label="Parent" style="color:#6b7280">${escHtml(a.parent_name) || escHtml(a.parent_account) || '—'}</td>
              <td data-label="Status" style="text-align:center">
                ${a.is_active
                  ? '<span class="badge badge-active">Active</span>'
                  : '<span class="badge badge-inactive">Inactive</span>'}
              </td>
              ${canEdit ? `
              <td class="td-actions" style="text-align:center">
                <div class="action-menu-wrap">
                  <button class="btn-action-menu" onclick="toggleActionMenu(this)" title="Actions">···</button>
                  <div class="action-dropdown">
                    <button class="action-menu-item" onclick="openAccountModal(${a.id})">
                      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                      Edit
                    </button>
                    <button class="action-menu-item ${a.is_active ? 'danger' : ''}" onclick="toggleAccountStatus(${a.id}, ${a.is_active})">
                      ${a.is_active
                        ? `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11H7v-2h10v2z"/></svg> Disable`
                        : `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg> Enable`}
                    </button>
                  </div>
                </div>
              </td>` : ''}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <div style="padding:0.6rem 1rem;font-size:0.8rem;color:#9ca3af;border-top:1px solid #f5f6fa">${data.length} account(s)</div>
  `;
}

function clearAccountFilters() {
  const s = document.getElementById('acc-search');
  const t = document.getElementById('acc-status');
  if (s) s.value = '';
  if (t) t.value = '';
  loadAccounts();
}

async function openAccountModal(id = null) {
  let account = null;
  if (id) {
    try { account = await API.get('/api/accounts/' + id); } catch (e) { toast(e.message, 'error'); return; }
  }

  const allAccounts = accountsData.filter(a => !id || a.id !== id);

  Modal.open({
    title: id ? 'Edit Account' : 'New Account',
    body: `
      <form id="account-form">
        <div class="form-grid">
          <div class="field-group">
            <label class="required">Account Name</label>
            <input type="text" id="af-name" value="${escHtml(account?.account_name || '')}" placeholder="Enter account name" required />
          </div>
          <div class="field-group">
            <label>Mobile Number</label>
            <input type="text" id="af-mobile" value="${escHtml(account?.mobile_number || '')}" placeholder="e.g. 9876543210" />
          </div>
          <div class="field-group">
            <label>Opening Amount <span style="font-weight:400;color:#9ca3af;font-size:0.72rem">(in '000s)</span></label>
            <input type="number" id="af-opening" value="${account?.opening_amount || 0}" step="0.001" />
          </div>
          <div class="field-group">
            <label>Balance Date</label>
            <input type="date" id="af-baldate" value="${account?.balance_date || ''}" />
          </div>
          <div class="field-group">
            <label>Group</label>
            <input type="text" id="af-group" value="${escHtml(account?.group_name || '')}" placeholder="e.g. Clients, Suppliers" />
          </div>
          <div class="field-group">
            <label>Parent Account</label>
            <select id="af-parent">
              <option value="">— None —</option>
              ${allAccounts.map(a =>
                `<option value="${a.id}" ${String(account?.parent_account) === String(a.id) ? 'selected' : ''}>${escHtml(a.account_name)}</option>`
              ).join('')}
            </select>
          </div>
        </div>
        <div id="acc-form-error" class="alert alert-error" style="display:none"></div>
      </form>
    `,
    footer: `
      <button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
      <button class="btn btn-primary" onclick="submitAccountForm(${id || 'null'})">
        ${id ? 'Save Changes' : 'Create Account'}
      </button>
    `
  });
}

async function submitAccountForm(id) {
  const errEl = document.getElementById('acc-form-error');
  const data = {
    account_name:  document.getElementById('af-name').value.trim(),
    mobile_number: document.getElementById('af-mobile').value.trim(),
    opening_amount: document.getElementById('af-opening').value,
    balance_date:  document.getElementById('af-baldate').value,
    group_name:    document.getElementById('af-group').value.trim(),
    parent_account: document.getElementById('af-parent').value || null
  };

  if (!data.account_name) {
    errEl.textContent = 'Account Name is mandatory.';
    errEl.style.display = 'flex';
    return;
  }

  try {
    if (id) {
      await API.put('/api/accounts/' + id, data);
      toast('Account updated', 'success');
    } else {
      await API.post('/api/accounts', data);
      toast('Account created', 'success');
    }
    Modal.close();
    await APP.loadAccounts();
    loadAccounts();
  } catch (e) {
    errEl.textContent = e.message;
    errEl.style.display = 'flex';
  }
}

async function toggleAccountStatus(id, currentActive) {
  const action = currentActive ? 'disable' : 'enable';
  if (!confirm(`Are you sure you want to ${action} this account?`)) return;
  try {
    await API.patch('/api/accounts/' + id + '/disable');
    toast(`Account ${action}d`, 'success');
    await APP.loadAccounts();
    loadAccounts();
  } catch (e) {
    toast(e.message, 'error');
  }
}
