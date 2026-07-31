// ── Transactions page ─────────────────────────────────────────────────────
let txPage = 1;
const TX_PAGE_SIZE = 50;

async function renderTransactions() {
  const page = document.getElementById('page-transactions');
  const canCreate = APP.isOperator();

  page.innerHTML = `
    <div class="page-header">
      <h2>💸 Transactions</h2>
      ${canCreate ? `<button class="btn btn-primary" onclick="openTransactionModal()">＋ New Transaction</button>` : ''}
    </div>

    <div class="filters-bar">
      <div class="filter-field">
        <label>Account</label>
        <select id="tx-f-account" style="width:160px">
          <option value="">All Accounts</option>
          ${APP.accountOptions()}
        </select>
      </div>
      <div class="filter-field">
        <label>Debit Party</label>
        <select id="tx-f-debit" style="width:150px">
          <option value="">Any</option>
          ${APP.accountOptions()}
        </select>
      </div>
      <div class="filter-field">
        <label>Credit Party</label>
        <select id="tx-f-credit" style="width:150px">
          <option value="">Any</option>
          ${APP.accountOptions()}
        </select>
      </div>
      <div class="filter-field">
        <label>Amount</label>
        <input type="number" id="tx-f-amount" placeholder="Exact amount" style="width:120px" step="0.01" />
      </div>
      <div class="filter-field">
        <label>City</label>
        <input type="text" id="tx-f-city" placeholder="City..." style="width:110px" />
      </div>
      <div class="filter-field">
        <label>Status</label>
        <select id="tx-f-status" style="width:170px">
          <option value="">All</option>
          <option value="Pending Verification">Pending Verification</option>
          <option value="Verified">Verified</option>
        </select>
      </div>
      <div class="filter-field">
        <label>From Date</label>
        <input type="date" id="tx-f-from" />
      </div>
      <div class="filter-field">
        <label>To Date</label>
        <input type="date" id="tx-f-to" />
      </div>
      <button class="btn btn-primary" onclick="loadTransactions(1)">🔍 Search</button>
      <button class="btn btn-outline" onclick="clearTxFilters()">Clear</button>
    </div>

    <div class="card">
      <div id="tx-export-bar" style="display:none;margin-bottom:1rem">
        <div class="btn-group">
          <button class="btn btn-outline btn-sm" onclick="exportTransactions('pdf')">📄 Export PDF</button>
          <button class="btn btn-outline btn-sm" onclick="exportTransactions('excel')">📊 Export Excel</button>
        </div>
      </div>
      <div id="tx-table-wrap">
        <div class="loading"><span class="spinner"></span> Loading...</div>
      </div>
      <div id="tx-pagination" class="pagination"></div>
    </div>
  `;

  loadTransactions(1);
}

async function loadTransactions(p = 1) {
  txPage = p;
  const wrap = document.getElementById('tx-table-wrap');
  if (!wrap) return;
  wrap.innerHTML = `<div class="loading"><span class="spinner"></span> Loading...</div>`;
  const exportBar = document.getElementById('tx-export-bar');
  if (exportBar) exportBar.style.display = 'none';

  const q = API.buildQuery({
    account:   document.getElementById('tx-f-account')?.value || '',
    debit:     document.getElementById('tx-f-debit')?.value   || '',
    credit:    document.getElementById('tx-f-credit')?.value  || '',
    amount:    document.getElementById('tx-f-amount')?.value  || '',
    city:      document.getElementById('tx-f-city')?.value    || '',
    status:    document.getElementById('tx-f-status')?.value  || '',
    date_from: document.getElementById('tx-f-from')?.value    || '',
    date_to:   document.getElementById('tx-f-to')?.value      || '',
    page: p,
    limit: TX_PAGE_SIZE
  });

  try {
    const result = await API.get('/api/transactions' + q);
    renderTxTable(result);
    const exportBar = document.getElementById('tx-export-bar');
    if (exportBar) exportBar.style.display = result.data.length > 0 ? 'block' : 'none';
  } catch (e) {
    wrap.innerHTML = `<div class="alert alert-error">${escHtml(e.message)}</div>`;
  }
}

function renderTxTable({ data, total, page, limit }) {
  const wrap = document.getElementById('tx-table-wrap');
  const pgEl = document.getElementById('tx-pagination');
  if (!wrap) return;

  if (data.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">💸</div><p>No transactions found.</p></div>`;
    if (pgEl) pgEl.innerHTML = '';
    return;
  }

  wrap.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Voucher #</th>
            <th>Date</th>
            <th>City</th>
            <th>Debit Party</th>
            <th>Credit Party</th>
            <th>Amount</th>
            <th>Debit Comm</th>
            <th>Credit Comm</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${data.map(tx => `
            <tr>
              <td><code style="font-size:0.8rem">${escHtml(tx.voucher_number)}</code></td>
              <td>${fmtDate(tx.transaction_date)}</td>
              <td>${escHtml(tx.transaction_city) || '-'}</td>
              <td>${escHtml(tx.debit_party_name) || '-'}</td>
              <td>${escHtml(tx.credit_party_name) || '-'}</td>
              <td><strong>${fmtNum(tx.amount)}</strong></td>
              <td>${fmtNum(tx.debit_commission)}</td>
              <td>${fmtNum(tx.credit_commission)}</td>
              <td><span class="badge ${tx.status === 'Pending Verification' ? 'badge-pending' : 'badge-verified'}">${escHtml(tx.status)}</span></td>
              <td>
                <div class="btn-group">
                  <button class="btn btn-outline btn-xs" onclick="viewTransaction(${tx.id})">👁 View</button>
                  <a href="/api/export/transaction/pdf?id=${tx.id}" target="_blank" class="btn btn-outline btn-xs">📄 PDF</a>
                  ${APP.isOperator() && tx.status === 'Pending Verification' ? `
                    <button class="btn btn-outline btn-xs" onclick="editTransaction(${tx.id})">✏️ Edit</button>
                    <button class="btn btn-success btn-xs" onclick="verifyTransaction(${tx.id})">✓ Verify</button>
                  ` : ''}
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <div style="margin-top:0.5rem;font-size:0.82rem;color:#6b7280">${total} transaction(s) total</div>
  `;

  // Pagination
  const totalPages = Math.ceil(total / limit);
  if (pgEl && totalPages > 1) {
    pgEl.innerHTML = `
      <button class="btn btn-outline btn-sm" ${page <= 1 ? 'disabled' : ''} onclick="loadTransactions(${page - 1})">‹ Prev</button>
      <span class="page-info">Page ${page} of ${totalPages}</span>
      <button class="btn btn-outline btn-sm" ${page >= totalPages ? 'disabled' : ''} onclick="loadTransactions(${page + 1})">Next ›</button>
    `;
  } else if (pgEl) {
    pgEl.innerHTML = '';
  }
}

function clearTxFilters() {
  ['tx-f-account','tx-f-debit','tx-f-credit','tx-f-amount','tx-f-city','tx-f-status','tx-f-from','tx-f-to']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  loadTransactions(1);
}

async function viewTransaction(id) {
  try {
    const tx = await API.get('/api/transactions/' + id);
    Modal.open({
      title: `Voucher: ${tx.voucher_number}`,
      size: 'lg',
      body: `
        <div class="form-grid">
          ${txDetailField('Voucher #', tx.voucher_number)}
          ${txDetailField('Date', fmtDate(tx.transaction_date))}
          ${txDetailField('Status', `<span class="badge ${tx.status === 'Pending Verification' ? 'badge-pending' : 'badge-verified'}">${escHtml(tx.status)}</span>`)}
          ${txDetailField('Transaction City', tx.transaction_city)}
          ${txDetailField('Token Details', tx.token_details)}
          ${txDetailField('Amount', fmtNum(tx.amount))}
          ${txDetailField('Wallet City', tx.wallet_city)}
          ${txDetailField('Debit Party', tx.debit_party_name)}
          ${txDetailField('Debit Rate', (tx.debit_rate || 0) + '%')}
          ${txDetailField('Debit Commission', fmtNum(tx.debit_commission))}
          ${txDetailField('Credit Party', tx.credit_party_name)}
          ${txDetailField('Credit Wallet City', tx.credit_wallet_city)}
          ${txDetailField('Credit Rate', (tx.credit_rate || 0) + '%')}
          ${txDetailField('Credit Commission', fmtNum(tx.credit_commission))}
          ${txDetailField('Remarks', tx.remarks)}
          ${txDetailField('Message', tx.message)}
          ${tx.verified_by_name ? txDetailField('Verified By', tx.verified_by_name) : ''}
          ${tx.verified_at     ? txDetailField('Verified At', tx.verified_at.slice(0,16)) : ''}
        </div>
      `,
      footer: `
        <a href="/api/export/transaction/pdf?id=${id}" target="_blank" class="btn btn-outline">📄 Export PDF</a>
        ${tx.status === 'Pending Verification' && APP.isOperator()
          ? `<button class="btn btn-success" onclick="Modal.close(); verifyTransaction(${id})">✓ Verify</button>`
          : ''}
        <button class="btn btn-primary" onclick="Modal.close()">Close</button>
      `
    });
  } catch (e) {
    toast(e.message, 'error');
  }
}

function txDetailField(label, value) {
  return `
    <div class="field-group">
      <label style="font-size:0.78rem;color:#6b7280;font-weight:600">${escHtml(label)}</label>
      <div style="padding:0.4rem 0;font-size:0.9rem;color:#1f2937;border-bottom:1px solid #f1f5f9">${value || '-'}</div>
    </div>
  `;
}

function openTransactionModal() {
  if (!APP.isOperator()) { toast('Access denied', 'error'); return; }

  Modal.open({
    title: 'New Transaction',
    size: 'lg',
    body: buildTransactionForm(),
    footer: `
      <button class="btn btn-outline" onclick="resetTransactionForm()">↺ Reset</button>
      <button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
      <button class="btn btn-primary" onclick="submitTransaction()">✓ Submit Transaction</button>
    `
  });

  // Wire up commission auto-calculation
  ['tx-amount', 'tx-debit-rate', 'tx-credit-rate'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateCommissionDisplays);
  });
}

function buildTransactionForm(tx = null) {
  const today = new Date().toISOString().slice(0, 10);
  const v = (field, fallback = '') => tx ? (tx[field] ?? fallback) : fallback;
  return `
    <form id="tx-form" autocomplete="off">
      <div class="section-label">Transaction Details</div>
      <div class="form-grid-3">
        <div class="field-group">
          <label>Date</label>
          <input type="date" id="tx-date" value="${v('transaction_date', today)}" />
        </div>
        <div class="field-group">
          <label>Transaction City</label>
          <input type="text" id="tx-city" value="${escHtml(v('transaction_city'))}" placeholder="City name" />
        </div>
        <div class="field-group">
          <label>Token Details</label>
          <input type="text" id="tx-token" value="${escHtml(v('token_details'))}" placeholder="Token / reference" />
        </div>
        <div class="field-group">
          <label class="required">Amount</label>
          <input type="number" id="tx-amount" value="${v('amount', '')}" placeholder="0.00" step="0.01" min="0" required />
        </div>
        <div class="field-group">
          <label>Wallet City</label>
          <input type="text" id="tx-wallet-city" value="${escHtml(v('wallet_city'))}" placeholder="Wallet city" />
        </div>
        <div class="field-group col-span-1">
          <label>Remarks</label>
          <input type="text" id="tx-remarks" value="${escHtml(v('remarks'))}" placeholder="Remarks..." />
        </div>
      </div>
      <div class="field-group">
        <label>Message</label>
        <textarea id="tx-message" rows="2" placeholder="Transaction message...">${escHtml(v('message'))}</textarea>
      </div>

      <hr class="divider" />
      <div class="section-label">Debit Party</div>
      <div class="form-grid">
        <div class="field-group">
          <label class="required">Debit Party</label>
          <select id="tx-debit-party">
            <option value="">-- Select Account --</option>
            ${APP.accountOptions(v('debit_party_id'))}
          </select>
        </div>
        <div class="field-group">
          <label>Debit Rate (%)</label>
          <input type="number" id="tx-debit-rate" value="${v('debit_rate', 0)}" step="0.01" min="0" max="100" placeholder="0.00" />
          <div id="debit-comm-display" class="commission-display" style="display:none"></div>
        </div>
      </div>

      <hr class="divider" />
      <div class="section-label">Credit Party</div>
      <div class="form-grid">
        <div class="field-group">
          <label class="required">Credit Party</label>
          <select id="tx-credit-party">
            <option value="">-- Select Account --</option>
            ${APP.accountOptions(v('credit_party_id'))}
          </select>
        </div>
        <div class="field-group">
          <label>Credit Wallet City</label>
          <input type="text" id="tx-credit-wallet-city" value="${escHtml(v('credit_wallet_city'))}" placeholder="Credit wallet city" />
        </div>
        <div class="field-group">
          <label>Credit Rate (%)</label>
          <input type="number" id="tx-credit-rate" value="${v('credit_rate', 0)}" step="0.01" min="0" max="100" placeholder="0.00" />
          <div id="credit-comm-display" class="commission-display" style="display:none"></div>
        </div>
      </div>

      <div id="tx-form-error" class="alert alert-error" style="display:none"></div>
    </form>
  `;
}

function updateCommissionDisplays() {
  const amount = parseFloat(document.getElementById('tx-amount')?.value) || 0;
  const dRate = parseFloat(document.getElementById('tx-debit-rate')?.value) || 0;
  const cRate = parseFloat(document.getElementById('tx-credit-rate')?.value) || 0;

  const dComm = (amount * dRate / 100).toFixed(2);
  const cComm = (amount * cRate / 100).toFixed(2);

  const dEl = document.getElementById('debit-comm-display');
  const cEl = document.getElementById('credit-comm-display');

  if (dEl) {
    dEl.style.display = dRate > 0 ? 'inline-block' : 'none';
    dEl.textContent = `Debit Commission: ${dComm}`;
  }
  if (cEl) {
    cEl.style.display = cRate > 0 ? 'inline-block' : 'none';
    cEl.textContent = `Credit Commission: ${cComm}`;
  }
}

function resetTransactionForm() {
  const form = document.getElementById('tx-form');
  if (form) form.reset();
  const errEl = document.getElementById('tx-form-error');
  if (errEl) errEl.style.display = 'none';
  const today = new Date().toISOString().slice(0, 10);
  const dateEl = document.getElementById('tx-date');
  if (dateEl) dateEl.value = today;
  updateCommissionDisplays();
}

async function submitTransaction() {
  const errEl = document.getElementById('tx-form-error');
  errEl.style.display = 'none';

  const data = {
    transaction_date: document.getElementById('tx-date').value,
    transaction_city: document.getElementById('tx-city').value.trim(),
    token_details: document.getElementById('tx-token').value.trim(),
    amount: document.getElementById('tx-amount').value,
    wallet_city: document.getElementById('tx-wallet-city').value.trim(),
    debit_party_id: document.getElementById('tx-debit-party').value,
    debit_rate: document.getElementById('tx-debit-rate').value,
    remarks: document.getElementById('tx-remarks').value.trim(),
    message: document.getElementById('tx-message').value.trim(),
    credit_wallet_city: document.getElementById('tx-credit-wallet-city').value.trim(),
    credit_party_id: document.getElementById('tx-credit-party').value,
    credit_rate: document.getElementById('tx-credit-rate').value
  };

  if (!data.amount || parseFloat(data.amount) <= 0) {
    errEl.textContent = 'Amount is required and must be greater than 0.';
    errEl.style.display = 'block';
    return;
  }
  if (!data.debit_party_id) {
    errEl.textContent = 'Debit Party is required.';
    errEl.style.display = 'block';
    return;
  }
  if (!data.credit_party_id) {
    errEl.textContent = 'Credit Party is required.';
    errEl.style.display = 'block';
    return;
  }

  const btn = Modal.footer.querySelector('.btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

  try {
    const created = await API.post('/api/transactions', data);
    toast(`Transaction saved: ${created.voucher_number}`, 'success');
    Modal.close();
    loadTransactions(1);
  } catch (e) {
    errEl.textContent = e.message;
    errEl.style.display = 'block';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✓ Submit Transaction'; }
  }
}

async function editTransaction(txId) {
  if (!APP.isOperator()) { toast('Access denied', 'error'); return; }

  let tx;
  try {
    tx = await API.get('/api/transactions/' + txId);
  } catch (e) {
    toast(e.message, 'error');
    return;
  }

  if (tx.status === 'Verified') {
    toast('Cannot edit a verified transaction.', 'error');
    return;
  }

  Modal.open({
    title: `Edit Transaction — ${tx.voucher_number}`,
    size: 'lg',
    body: buildTransactionForm(tx),
    footer: `
      <button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
      <button class="btn btn-primary" onclick="submitEditTransaction(${txId})">💾 Save Changes</button>
    `
  });

  ['tx-amount', 'tx-debit-rate', 'tx-credit-rate'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateCommissionDisplays);
  });
  // Trigger once to show existing commission values
  updateCommissionDisplays();
}

async function submitEditTransaction(txId) {
  const errEl = document.getElementById('tx-form-error');
  errEl.style.display = 'none';

  const data = {
    transaction_date:   document.getElementById('tx-date').value,
    transaction_city:   document.getElementById('tx-city').value.trim(),
    token_details:      document.getElementById('tx-token').value.trim(),
    amount:             document.getElementById('tx-amount').value,
    wallet_city:        document.getElementById('tx-wallet-city').value.trim(),
    debit_party_id:     document.getElementById('tx-debit-party').value,
    debit_rate:         document.getElementById('tx-debit-rate').value,
    remarks:            document.getElementById('tx-remarks').value.trim(),
    message:            document.getElementById('tx-message').value.trim(),
    credit_wallet_city: document.getElementById('tx-credit-wallet-city').value.trim(),
    credit_party_id:    document.getElementById('tx-credit-party').value,
    credit_rate:        document.getElementById('tx-credit-rate').value
  };

  if (!data.amount || parseFloat(data.amount) <= 0) {
    errEl.textContent = 'Amount is required and must be greater than 0.';
    errEl.style.display = 'block';
    return;
  }
  if (!data.debit_party_id || !data.credit_party_id) {
    errEl.textContent = 'Debit Party and Credit Party are required.';
    errEl.style.display = 'block';
    return;
  }

  const btn = Modal.footer.querySelector('.btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

  try {
    await API.patch('/api/transactions/' + txId, data);
    toast('Transaction updated successfully', 'success');
    Modal.close();
    loadTransactions(txPage);
  } catch (e) {
    errEl.textContent = e.message;
    errEl.style.display = 'block';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 Save Changes'; }
  }
}

async function verifyTransaction(txId) {
  if (!confirm('Verify this transaction?\n\nThis will post ledger entries for both parties.\nThe transaction will then appear in Trial Balance for final verification.')) return;
  try {
    const updated = await API.patch(`/api/transactions/${txId}/verify`, {});
    toast(`Transaction ${updated.voucher_number} verified — now visible in Trial Balance`, 'success');
    loadTransactions(txPage);
  } catch (e) {
    toast(e.message, 'error');
  }
}

function exportTransactions(format) {
  const q = API.buildQuery({
    account:   document.getElementById('tx-f-account')?.value  || '',
    debit:     document.getElementById('tx-f-debit')?.value    || '',
    credit:    document.getElementById('tx-f-credit')?.value   || '',
    status:    document.getElementById('tx-f-status')?.value   || '',
    date_from: document.getElementById('tx-f-from')?.value     || '',
    date_to:   document.getElementById('tx-f-to')?.value       || ''
  });
  window.open(`/api/export/transactions/${format}${q}`, '_blank');
}
