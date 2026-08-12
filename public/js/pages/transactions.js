// ── Transactions page ─────────────────────────────────────────────────────
let txPage = 1;
const TX_PAGE_SIZE = 50;
let txStatusFilter = ''; // '', 'Pending Verification', 'Verified'

async function renderTransactions() {
  const page = document.getElementById('page-transactions');
  const canCreate = APP.isOperator();
  const today = new Date().toISOString().slice(0, 10);

  page.innerHTML = `
    <div class="page-header">
      <h2>💸 Transactions</h2>
    </div>

    ${canCreate ? `
    <!-- ── Inline entry row ─────────────────────────────── -->
    <div class="card tx-entry-card">
      <div class="tx-entry-row" id="tx-entry-row">
        <div class="tx-entry-field">
          <label>Date</label>
          <input type="date" id="te-date" value="${today}" />
        </div>
        <div class="tx-entry-field">
          <label>Token</label>
          <input type="text" id="te-token" placeholder="Token / ref" />
        </div>
        <div class="tx-entry-field tx-entry-field--wide">
          <label>Debit Party <span class="req">*</span></label>
          <select id="te-debit">
            <option value="">Select...</option>
            ${APP.accountOptions()}
          </select>
        </div>
        <div class="tx-entry-field">
          <label>Amount <span class="req">*</span> <span style="font-weight:400;color:#9ca3af;font-size:0.72rem">(in '000s)</span></label>
          <input type="number" id="te-amount" placeholder="e.g. 100 = 1,00,000" min="0" step="0.001" />
        </div>
        <div class="tx-entry-field tx-entry-field--sm">
          <label>D.Comm</label>
          <input type="number" id="te-debit-comm" min="0" step="1" placeholder="0" />
        </div>
        <div class="tx-entry-field tx-entry-field--wide">
          <label>Credit Party <span class="req">*</span></label>
          <select id="te-credit">
            <option value="">Select...</option>
            ${APP.accountOptions()}
          </select>
        </div>
        <div class="tx-entry-field tx-entry-field--sm">
          <label>C.Comm</label>
          <input type="number" id="te-credit-comm" min="0" step="1" placeholder="0" />
        </div>
        <div class="tx-entry-field">
          <label>City</label>
          <input type="text" id="te-city" placeholder="City" />
        </div>
        <div class="tx-entry-field">
          <label>Remarks</label>
          <input type="text" id="te-remarks" placeholder="Remarks" />
        </div>
        <div class="tx-entry-actions">
          <button class="btn-entry-submit" onclick="submitInlineTransaction()" title="Add Transaction">＋</button>
          <button class="btn-entry-reset"  onclick="resetInlineForm()"          title="Reset">↺</button>
        </div>
      </div>
      <div id="te-error" class="alert alert-error" style="display:none;margin-top:0.5rem"></div>
    </div>
    ` : ''}

    <!-- ── Filters + Tabs ──────────────────────────────── -->
    <div class="card" style="padding:0.75rem 1.25rem">
      <div class="tx-toolbar">
        <div class="tx-toolbar-left">
          <input type="text" id="tx-f-search" placeholder="🔍  Search voucher, party, city..." style="width:220px" oninput="loadTransactions(1)" />
          <select id="tx-f-account" style="width:150px" onchange="loadTransactions(1)">
            <option value="">All Accounts</option>
            ${APP.accountOptions()}
          </select>
          <input type="date" id="tx-f-from" style="width:140px" onchange="loadTransactions(1)" />
          <span style="color:#9ca3af;font-size:0.85rem">–</span>
          <input type="date" id="tx-f-to" style="width:140px" onchange="loadTransactions(1)" />
          <button class="btn btn-outline btn-sm" onclick="clearTxFilters()">Clear</button>
          <button class="btn btn-outline btn-sm" onclick="setTxDatePreset('today')">Today</button>
          <button class="btn btn-outline btn-sm" onclick="setTxDatePreset('month')">This Month</button>
        </div>
        <div class="tx-toolbar-right">
          <button class="btn btn-outline btn-sm" onclick="exportTransactions('excel')">📊 Excel</button>
          <button class="btn btn-outline btn-sm" onclick="exportTransactions('pdf')">📄 PDF</button>
        </div>
      </div>

      <div class="tx-status-tabs">
        <button class="tx-tab active" onclick="setTxTab('', this)">All</button>
        <button class="tx-tab" onclick="setTxTab('Verified', this)">Verified</button>
        <button class="tx-tab" onclick="setTxTab('Pending Verification', this)">Pending</button>
      </div>
    </div>

    <!-- ── Table ───────────────────────────────────────── -->
    <div class="card" style="padding:0">
      <div id="tx-table-wrap">
        <div class="loading"><span class="spinner"></span> Loading...</div>
      </div>
      <div id="tx-pagination" class="pagination" style="padding:0.75rem 1.25rem"></div>
    </div>
  `;

  loadTransactions(1);
}

function setTxTab(status, btn) {
  txStatusFilter = status;
  document.querySelectorAll('.tx-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadTransactions(1);
}

function resetInlineForm() {
  const today = new Date().toISOString().slice(0, 10);
  ['te-token','te-city','te-remarks'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  ['te-debit','te-credit'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const amt = document.getElementById('te-amount'); if (amt) amt.value = '';
  const dc  = document.getElementById('te-debit-comm');  if (dc)  dc.value  = '';
  const cc  = document.getElementById('te-credit-comm'); if (cc)  cc.value  = '';
  const date = document.getElementById('te-date'); if (date) date.value = today;
  const errEl = document.getElementById('te-error'); if (errEl) errEl.style.display = 'none';
}

async function submitInlineTransaction() {
  const errEl = document.getElementById('te-error');
  errEl.style.display = 'none';

  const data = {
    transaction_date:   document.getElementById('te-date').value,
    token_details:      document.getElementById('te-token').value.trim(),
    amount:             document.getElementById('te-amount').value,
    debit_party_id:     document.getElementById('te-debit').value,
    debit_commission:   document.getElementById('te-debit-comm').value,
    credit_party_id:    document.getElementById('te-credit').value,
    credit_commission:  document.getElementById('te-credit-comm').value,
    transaction_city:   document.getElementById('te-city').value.trim(),
    remarks:            document.getElementById('te-remarks').value.trim(),
  };

  if (!data.amount || parseFloat(data.amount) <= 0) {
    errEl.textContent = 'Amount is required.'; errEl.style.display = 'block'; return;
  }
  if (!data.debit_party_id) {
    errEl.textContent = 'Debit Party is required.'; errEl.style.display = 'block'; return;
  }
  if (!data.credit_party_id) {
    errEl.textContent = 'Credit Party is required.'; errEl.style.display = 'block'; return;
  }

  const btn = document.querySelector('.btn-entry-submit');
  if (btn) { btn.disabled = true; btn.textContent = '...'; }

  try {
    const created = await API.post('/api/transactions', data);
    toast(`Saved: ${created.voucher_number}`, 'success');
    resetInlineForm();
    loadTransactions(1);
  } catch (e) {
    errEl.textContent = e.message;
    errEl.style.display = 'block';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '＋'; }
  }
}

async function loadTransactions(p = 1) {
  txPage = p;
  const wrap = document.getElementById('tx-table-wrap');
  if (!wrap) return;
  wrap.innerHTML = `<div class="loading"><span class="spinner"></span> Loading...</div>`;

  const search = document.getElementById('tx-f-search')?.value || '';
  const q = API.buildQuery({
    account:   document.getElementById('tx-f-account')?.value || '',
    date_from: document.getElementById('tx-f-from')?.value    || '',
    date_to:   document.getElementById('tx-f-to')?.value      || '',
    status:    txStatusFilter,
    search:    search,
    page: p,
    limit: TX_PAGE_SIZE
  });

  try {
    const result = await API.get('/api/transactions' + q);
    renderTxTable(result);
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
    <div style="overflow-x:auto">
      <table class="tx-list-table">
        <thead>
          <tr>
            <th>Voucher #</th>
            <th>Date</th>
            <th>City</th>
            <th>Token</th>
            <th>Debit Party</th>
            <th>Credit Party</th>
            <th style="text-align:right">Amount</th>
            <th style="text-align:right">D.Comm</th>
            <th style="text-align:right">C.Comm</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${data.map(tx => `
            <tr>
              <td><code style="font-size:0.78rem;color:#1e3a5f">${escHtml(tx.voucher_number)}</code></td>
              <td style="white-space:nowrap">${fmtDate(tx.transaction_date)}</td>
              <td>${escHtml(tx.transaction_city) || '-'}</td>
              <td style="color:#6b7280;font-size:0.82rem">${escHtml(tx.token_details) || '-'}</td>
              <td>${escHtml(tx.debit_party_name) || '-'}</td>
              <td>${escHtml(tx.credit_party_name) || '-'}</td>
              <td style="text-align:right;font-weight:700">${fmtAmt(tx.amount)}</td>
              <td style="text-align:right;color:#c62828">${fmtAmt(tx.debit_commission)}</td>
              <td style="text-align:right;color:#2e7d32">${fmtAmt(tx.credit_commission)}</td>
              <td>
                <span class="badge ${tx.status === 'Pending Verification' ? 'badge-pending' : 'badge-verified'}">
                  ${tx.status === 'Pending Verification' ? 'Pending' : 'Verified'}
                </span>
              </td>
              <td>
                <div class="btn-group">
                  <button class="btn btn-outline btn-xs" onclick="viewTransaction(${tx.id})">👁</button>
                  <a href="/api/export/transaction/pdf?id=${tx.id}" target="_blank" class="btn btn-outline btn-xs">📄</a>
                  ${APP.isOperator() ? `
                    <button class="btn btn-outline btn-xs" onclick="editTransaction(${tx.id})">✏️</button>
                  ` : ''}
                  ${APP.isOperator() && tx.status === 'Pending Verification' ? `
                    <button class="btn btn-success btn-xs" onclick="verifyTransaction(${tx.id})">✓</button>
                  ` : ''}
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <div style="padding:0.5rem 1.25rem;font-size:0.82rem;color:#6b7280">${total} transaction(s)</div>
  `;

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
  ['tx-f-account','tx-f-from','tx-f-to'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const s = document.getElementById('tx-f-search'); if (s) s.value = '';
  txStatusFilter = '';
  document.querySelectorAll('.tx-tab').forEach((b,i) => b.classList.toggle('active', i === 0));
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
          ${txDetailField('Amount', fmtAmt(tx.amount))}
          ${txDetailField('Wallet City', tx.wallet_city)}
          ${txDetailField('Debit Party', tx.debit_party_name)}
          ${txDetailField('Debit Commission', fmtAmt(tx.debit_commission))}
          ${txDetailField('Credit Party', tx.credit_party_name)}
          ${txDetailField('Credit Wallet City', tx.credit_wallet_city)}
          ${txDetailField('Credit Commission', fmtAmt(tx.credit_commission))}
          ${txDetailField('Remarks', tx.remarks)}
          ${txDetailField('Message', tx.message)}
          ${tx.created_at ? txDetailField('Recorded At', tx.created_at.slice(0,16)) : ''}
          ${tx.verified_by_name ? txDetailField('Verified By', tx.verified_by_name) : ''}
          ${tx.verified_at ? txDetailField('Verified At', tx.verified_at.slice(0,16)) : ''}
        </div>
      `,
      footer: `
        <a href="/api/export/transaction/pdf?id=${id}" target="_blank" class="btn btn-outline">📄 PDF</a>
        <button class="btn btn-outline btn-sm" onclick="Modal.close(); navigate('ledger'); setTimeout(() => { const el = document.getElementById('led-account'); if(el){ el.value='${tx.debit_party_id}'; loadLedger(); } }, 100)">
          📖 ${escHtml(tx.debit_party_name)} Ledger
        </button>
        <button class="btn btn-outline btn-sm" onclick="Modal.close(); navigate('ledger'); setTimeout(() => { const el = document.getElementById('led-account'); if(el){ el.value='${tx.credit_party_id}'; loadLedger(); } }, 100)">
          📖 ${escHtml(tx.credit_party_name)} Ledger
        </button>
        ${tx.status === 'Pending Verification' && APP.isOperator()
          ? `<button class="btn btn-success" onclick="Modal.close(); verifyTransaction(${id})">✓ Verify</button>`
          : ''}
        <button class="btn btn-primary" onclick="Modal.close()">Close</button>
      `
    });
  } catch (e) { toast(e.message, 'error'); }
}

function txDetailField(label, value) {
  return `
    <div class="field-group">
      <label style="font-size:0.78rem;color:#6b7280;font-weight:600">${escHtml(label)}</label>
      <div style="padding:0.4rem 0;font-size:0.9rem;color:#1f2937;border-bottom:1px solid #f1f5f9">${value || '-'}</div>
    </div>`;
}

async function editTransaction(txId, onSuccess = null) {
  if (!APP.isOperator()) { toast('Access denied', 'error'); return; }
  let tx;
  try { tx = await API.get('/api/transactions/' + txId); }
  catch (e) { toast(e.message, 'error'); return; }

  Modal.open({
    title: `Edit — ${tx.voucher_number}`,
    size: 'lg',
    body: buildTransactionForm(tx),
    footer: `
      <button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
      <button class="btn btn-primary" onclick="submitEditTransaction(${txId})">💾 Save Changes</button>
    `
  });
  // Store callback so submitEditTransaction can call it after save
  editTransaction._onSuccess = onSuccess;
}

async function submitEditTransaction(txId) {
  const errEl = document.getElementById('tx-form-error');
  errEl.style.display = 'none';
  const data = {
    transaction_date: document.getElementById('tx-date').value,
    transaction_city: document.getElementById('tx-city').value.trim(),
    token_details: document.getElementById('tx-token').value.trim(),
    amount: document.getElementById('tx-amount').value,
    wallet_city: document.getElementById('tx-wallet-city').value.trim(),
    debit_party_id: document.getElementById('tx-debit-party').value,
    debit_commission: document.getElementById('tx-debit-comm').value,
    remarks: document.getElementById('tx-remarks').value.trim(),
    message: document.getElementById('tx-message').value.trim(),
    credit_wallet_city: document.getElementById('tx-credit-wallet-city').value.trim(),
    credit_party_id: document.getElementById('tx-credit-party').value,
    credit_commission: document.getElementById('tx-credit-comm').value
  };
  if (!data.amount || parseFloat(data.amount) <= 0) { errEl.textContent = 'Amount required.'; errEl.style.display = 'block'; return; }
  if (!data.debit_party_id || !data.credit_party_id) { errEl.textContent = 'Both parties required.'; errEl.style.display = 'block'; return; }

  const btn = Modal.footer.querySelector('.btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
  try {
    await API.patch('/api/transactions/' + txId, data);
    toast('Transaction updated', 'success');
    Modal.close();
    // Use caller-supplied callback (e.g. from ledger/trial-balance), or default to tx list reload
    if (typeof editTransaction._onSuccess === 'function') {
      editTransaction._onSuccess();
      editTransaction._onSuccess = null;
    } else {
      loadTransactions(txPage);
    }
  } catch (e) {
    errEl.textContent = e.message; errEl.style.display = 'block';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 Save Changes'; }
  }
}

async function verifyTransaction(txId) {
  if (!confirm('Verify this transaction? Ledger entries will be posted.')) return;
  try {
    const updated = await API.patch(`/api/transactions/${txId}/verify`, {});
    toast(`${updated.voucher_number} verified`, 'success');
    loadTransactions(txPage);
  } catch (e) { toast(e.message, 'error'); }
}

function buildTransactionForm(tx = null) {
  const today = new Date().toISOString().slice(0, 10);
  const v = (f, fb = '') => tx ? (tx[f] ?? fb) : fb;
  return `
    <form id="tx-form" autocomplete="off">
      <div class="section-label">Transaction Details</div>
      <div class="form-grid-3">
        <div class="field-group"><label>Date</label><input type="date" id="tx-date" value="${v('transaction_date', today)}" /></div>
        <div class="field-group"><label>Token</label><input type="text" id="tx-token" value="${escHtml(v('token_details'))}" placeholder="Token / ref" /></div>
        <div class="field-group"><label class="required">Amount <span style="font-weight:400;color:#9ca3af;font-size:0.72rem">(in '000s)</span></label><input type="number" id="tx-amount" value="${v('amount','')}" placeholder="e.g. 100 = 1,00,000" step="0.001" min="0" /></div>
        <div class="field-group"><label>City</label><input type="text" id="tx-city" value="${escHtml(v('transaction_city'))}" placeholder="City" /></div>
        <div class="field-group"><label>Wallet City</label><input type="text" id="tx-wallet-city" value="${escHtml(v('wallet_city'))}" placeholder="Wallet city" /></div>
        <div class="field-group"><label>Remarks</label><input type="text" id="tx-remarks" value="${escHtml(v('remarks'))}" placeholder="Remarks..." /></div>
      </div>
      <div class="field-group"><label>Message</label><textarea id="tx-message" rows="2">${escHtml(v('message'))}</textarea></div>
      <hr class="divider"/>
      <div class="section-label">Debit Party</div>
      <div class="form-grid">
        <div class="field-group"><label class="required">Debit Party</label><select id="tx-debit-party"><option value="">-- Select --</option>${APP.accountOptions(v('debit_party_id'))}</select></div>
        <div class="field-group"><label>Debit Commission</label><input type="number" id="tx-debit-comm" value="${v('debit_commission') ? parseFloat(v('debit_commission',0)) * 1000 : ''}" step="1" min="0" placeholder="0" /></div>
      </div>
      <hr class="divider"/>
      <div class="section-label">Credit Party</div>
      <div class="form-grid">
        <div class="field-group"><label class="required">Credit Party</label><select id="tx-credit-party"><option value="">-- Select --</option>${APP.accountOptions(v('credit_party_id'))}</select></div>
        <div class="field-group"><label>Credit Wallet City</label><input type="text" id="tx-credit-wallet-city" value="${escHtml(v('credit_wallet_city'))}" placeholder="Credit wallet city" /></div>
        <div class="field-group"><label>Credit Commission</label><input type="number" id="tx-credit-comm" value="${v('credit_commission') ? parseFloat(v('credit_commission',0)) * 1000 : ''}" step="1" min="0" placeholder="0" /></div>
      </div>
      <div id="tx-form-error" class="alert alert-error" style="display:none"></div>
    </form>`;
}

function exportTransactions(format) {
  const q = API.buildQuery({
    account:   document.getElementById('tx-f-account')?.value || '',
    status:    txStatusFilter,
    date_from: document.getElementById('tx-f-from')?.value   || '',
    date_to:   document.getElementById('tx-f-to')?.value     || ''
  });
  window.open(`/api/export/transactions/${format}${q}`, '_blank');
}

function setTxDatePreset(preset) {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + '01';
  const fromEl = document.getElementById('tx-f-from');
  const toEl   = document.getElementById('tx-f-to');
  if (!fromEl || !toEl) return;
  if (preset === 'today') {
    fromEl.value = today; toEl.value = today;
  } else if (preset === 'month') {
    fromEl.value = monthStart; toEl.value = today;
  }
  loadTransactions(1);
}
