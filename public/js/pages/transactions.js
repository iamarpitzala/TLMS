// ── Transactions page ─────────────────────────────────────────────────────
let txPage = 1;
const TX_PAGE_SIZE = 50;
let txStatusFilter = '';

// ── Rate ↔ Commission helpers ─────────────────────────────────────────────
// commission = amount × rate / 100
// rate       = commission / amount × 100
// Amounts are stored in '000s units (same as the amount field)

function calcCommFromRate(amtRaw, rateRaw) {
  const amt  = parseFloat(amtRaw)  || 0;
  const rate = parseFloat(rateRaw) || 0;
  if (amt <= 0 || rate <= 0) return '';
  return parseFloat((amt * rate / 100).toFixed(4));
}

function calcRateFromComm(amtRaw, commRaw) {
  const amt  = parseFloat(amtRaw)  || 0;
  const comm = parseFloat(commRaw) || 0;
  if (amt <= 0 || comm <= 0) return '';
  return parseFloat((comm / amt * 100).toFixed(6));
}

// Inline entry: when Rate changes → recalculate Commission
function onInlineRateChange(side) {
  const amt  = document.getElementById('te-amount')?.value;
  const rate = document.getElementById(`te-${side}-rate`)?.value;
  const comm = calcCommFromRate(amt, rate);
  const el   = document.getElementById(`te-${side}-comm`);
  if (el) el.value = comm;
}

// Inline entry: when Commission changes → recalculate Rate
function onInlineCommChange(side) {
  const amt  = document.getElementById('te-amount')?.value;
  const comm = document.getElementById(`te-${side}-comm`)?.value;
  const rate = calcRateFromComm(amt, comm);
  const el   = document.getElementById(`te-${side}-rate`);
  if (el) el.value = rate;
}

// Inline entry: when Amount changes → recalculate both commissions from their rates
function onInlineAmountChange() {
  const amt = document.getElementById('te-amount')?.value;
  for (const side of ['debit', 'credit']) {
    const rateEl = document.getElementById(`te-${side}-rate`);
    const commEl = document.getElementById(`te-${side}-comm`);
    if (!rateEl || !commEl) continue;
    if (rateEl.value) {
      // rate is set → update commission
      commEl.value = calcCommFromRate(amt, rateEl.value);
    } else if (commEl.value) {
      // commission is set → update rate
      rateEl.value = calcRateFromComm(amt, commEl.value);
    }
  }
}

// Edit modal: when Rate changes → recalculate Commission
function onEditRateChange(side) {
  const amt  = document.getElementById('tx-amount')?.value;
  const rate = document.getElementById(`tx-${side}-rate`)?.value;
  const comm = calcCommFromRate(amt, rate);
  const el   = document.getElementById(`tx-${side}-comm`);
  if (el) el.value = comm;
}

// Edit modal: when Commission changes → recalculate Rate
function onEditCommChange(side) {
  const amt  = document.getElementById('tx-amount')?.value;
  const comm = document.getElementById(`tx-${side}-comm`)?.value;
  const rate = calcRateFromComm(amt, comm);
  const el   = document.getElementById(`tx-${side}-rate`);
  if (el) el.value = rate;
}

// Edit modal: when Amount changes → recalculate commissions from rates
function onEditAmountChange() {
  const amt = document.getElementById('tx-amount')?.value;
  for (const side of ['debit', 'credit']) {
    const rateEl = document.getElementById(`tx-${side}-rate`);
    const commEl = document.getElementById(`tx-${side}-comm`);
    if (!rateEl || !commEl) continue;
    if (rateEl.value) {
      commEl.value = calcCommFromRate(amt, rateEl.value);
    } else if (commEl.value) {
      rateEl.value = calcRateFromComm(amt, commEl.value);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────

async function renderTransactions() {
  const page = document.getElementById('page-transactions');
  const canCreate = APP.isOperator();
  const today = new Date().toISOString().slice(0, 10);

  page.innerHTML = `
    <div class="page-header">
      <h2>Transactions</h2>
    </div>

    ${canCreate ? `
    <!-- ── Inline entry row ─────────────────────────────── -->
    <div class="card tx-entry-card">
      <div class="tx-entry-row" id="tx-entry-row">

        <div class="tx-entry-field tx-entry-field--sm">
          <label>Date</label>
          <input type="date" id="te-date" value="${today}" />
        </div>

        <div class="tx-entry-field tx-entry-field--sm">
          <label>Token</label>
          <input type="text" id="te-token" placeholder="Token / ref" />
        </div>

        <div class="tx-entry-field">
          <label>Amount <span class="req">*</span></label>
          <input type="number" id="te-amount" placeholder="0" min="0" step="0.001"
            oninput="onInlineAmountChange()" />
        </div>

        <!-- ── Debit side ── -->
        <div class="tx-entry-field tx-entry-field--wide">
          <label>Debit Party <span class="req">*</span></label>
          <select id="te-debit">
            <option value="">Select…</option>
            ${APP.accountOptions()}
          </select>
        </div>

        <div class="tx-entry-field tx-entry-field--xs">
          <label>Rate %</label>
          <input type="number" id="te-debit-rate" min="0" step="0.0001" placeholder="0.00"
            oninput="onInlineRateChange('debit')" />
        </div>

        <div class="tx-entry-field tx-entry-field--xs">
          <label>Commission</label>
          <input type="number" id="te-debit-comm" min="0" step="0.001" placeholder="0"
            oninput="onInlineCommChange('debit')" />
        </div>

        <!-- ── Credit side ── -->
        <div class="tx-entry-field tx-entry-field--wide">
          <label>Credit Party <span class="req">*</span></label>
          <select id="te-credit">
            <option value="">Select…</option>
            ${APP.accountOptions()}
          </select>
        </div>

        <div class="tx-entry-field tx-entry-field--xs">
          <label>Rate %</label>
          <input type="number" id="te-credit-rate" min="0" step="0.0001" placeholder="0.00"
            oninput="onInlineRateChange('credit')" />
        </div>

        <div class="tx-entry-field tx-entry-field--xs">
          <label>Commission</label>
          <input type="number" id="te-credit-comm" min="0" step="0.001" placeholder="0"
            oninput="onInlineCommChange('credit')" />
        </div>

        <div class="tx-entry-field tx-entry-field--sm">
          <label>City</label>
          <input type="text" id="te-city" placeholder="City" />
        </div>

        <div class="tx-entry-field">
          <label>Remarks</label>
          <input type="text" id="te-remarks" placeholder="Remarks" />
        </div>

        <div class="tx-entry-actions">
          <button class="btn-entry-submit" onclick="submitInlineTransaction()" title="Add Transaction">+</button>
          <button class="btn-entry-reset" onclick="resetInlineForm()" title="Reset">↺</button>
        </div>
      </div>
      <div id="te-error" class="alert alert-error" style="display:none;margin-top:0.5rem"></div>
    </div>
    ` : ''}

    <!-- ── Filters + Tabs ──────────────────────────────── -->
    <div class="card" style="padding:0.75rem 1.1rem">
      <div class="tx-toolbar">
        <div class="tx-toolbar-left">
          <input type="text" id="tx-f-search" placeholder="Search token, party, city…" style="width:210px" oninput="loadTransactions(1)" />
          <select id="tx-f-account" style="width:150px" onchange="loadTransactions(1)">
            <option value="">All Accounts</option>
            ${APP.accountOptions()}
          </select>
          <input type="date" id="tx-f-from" style="width:135px" onchange="loadTransactions(1)" />
          <span style="color:#d1d5db;font-size:0.85rem">–</span>
          <input type="date" id="tx-f-to" style="width:135px" onchange="loadTransactions(1)" />
          <button class="btn btn-outline btn-sm" onclick="clearTxFilters()">Clear</button>
          <button class="btn btn-outline btn-sm" onclick="setTxDatePreset('today')">Today</button>
          <button class="btn btn-outline btn-sm" onclick="setTxDatePreset('month')">Month</button>
        </div>
        <div class="tx-toolbar-right">
          <button class="btn btn-outline btn-sm" onclick="exportTransactions('excel')">CSV</button>
          <button class="btn btn-outline btn-sm" onclick="exportTransactions('pdf')">PDF</button>
        </div>
      </div>
      <div class="tx-status-tabs">
        <button class="tx-tab active" onclick="setTxTab('', this)">All</button>
        <button class="tx-tab" onclick="setTxTab('Verified', this)">Approved</button>
        <button class="tx-tab" onclick="setTxTab('Pending Verification', this)">Pending</button>
      </div>
    </div>

    <!-- ── Table ───────────────────────────────────────── -->
    <div class="card" style="padding:0">
      <div id="tx-table-wrap">
        <div class="loading"><span class="spinner"></span> Loading…</div>
      </div>
      <div id="tx-pagination" class="pagination" style="padding:0.75rem 1.1rem"></div>
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
  ['te-amount','te-debit-rate','te-debit-comm','te-credit-rate','te-credit-comm'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const date = document.getElementById('te-date'); if (date) date.value = today;
  const errEl = document.getElementById('te-error'); if (errEl) errEl.style.display = 'none';
}

async function submitInlineTransaction() {
  const errEl = document.getElementById('te-error');
  errEl.style.display = 'none';

  const amt   = document.getElementById('te-amount').value;
  const dComm = document.getElementById('te-debit-comm').value  || '0';
  const cComm = document.getElementById('te-credit-comm').value || '0';
  const dRate = document.getElementById('te-debit-rate').value  || '0';
  const cRate = document.getElementById('te-credit-rate').value || '0';

  const data = {
    transaction_date:  document.getElementById('te-date').value,
    token_details:     document.getElementById('te-token').value.trim(),
    amount:            amt,
    debit_party_id:    document.getElementById('te-debit').value,
    debit_rate:        dRate,
    debit_commission:  dComm,
    credit_party_id:   document.getElementById('te-credit').value,
    credit_rate:       cRate,
    credit_commission: cComm,
    transaction_city:  document.getElementById('te-city').value.trim(),
    remarks:           document.getElementById('te-remarks').value.trim(),
  };

  if (!data.amount || parseFloat(data.amount) <= 0) {
    errEl.textContent = 'Amount is required.'; errEl.style.display = 'flex'; return;
  }
  if (!data.debit_party_id) {
    errEl.textContent = 'Debit Party is required.'; errEl.style.display = 'flex'; return;
  }
  if (!data.credit_party_id) {
    errEl.textContent = 'Credit Party is required.'; errEl.style.display = 'flex'; return;
  }

  const btn = document.querySelector('.btn-entry-submit');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }

  try {
    const created = await API.post('/api/transactions', data);
    toast(`Saved: ${created.voucher_number}`, 'success');
    resetInlineForm();
    loadTransactions(1);
  } catch (e) {
    errEl.textContent = e.message;
    errEl.style.display = 'flex';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '+'; }
  }
}

async function loadTransactions(p = 1) {
  txPage = p;
  const wrap = document.getElementById('tx-table-wrap');
  if (!wrap) return;
  wrap.innerHTML = `<div class="loading"><span class="spinner"></span> Loading…</div>`;

  const q = API.buildQuery({
    account:   document.getElementById('tx-f-account')?.value || '',
    date_from: document.getElementById('tx-f-from')?.value    || '',
    date_to:   document.getElementById('tx-f-to')?.value      || '',
    status:    txStatusFilter,
    search:    document.getElementById('tx-f-search')?.value  || '',
    page: p, limit: TX_PAGE_SIZE
  });

  try {
    const result = await API.get('/api/transactions' + q);
    renderTxTable(result);
  } catch (e) {
    wrap.innerHTML = `<div class="alert alert-error" style="margin:1rem">${escHtml(e.message)}</div>`;
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

  const canAct = APP.isOperator();

  // Format rate as percentage string
  const fmtRate = (r) => {
    const n = parseFloat(r);
    if (!n || n === 0) return '—';
    return n.toFixed(4).replace(/\.?0+$/, '') + '%';
  };

  wrap.innerHTML = `
    <div style="overflow-x:auto">
      <table class="tx-list-table">
        <thead>
          <tr>
            <th style="width:32px"></th>
            <th>Date</th>
            <th>Token</th>
            <th style="text-align:right">Amount</th>
            <th>Debit</th>
            <th style="text-align:right">Rate</th>
            <th style="text-align:right">Commission</th>
            <th>Credit</th>
            <th style="text-align:right">Rate</th>
            <th style="text-align:right">Commission</th>
            <th>Remarks</th>
            <th style="text-align:center">Status</th>
            <th style="text-align:center">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${data.map(tx => {
            const isPending = tx.status === 'Pending Verification';
            return `
            <tr>
              <td><input type="checkbox" style="width:14px;height:14px;accent-color:#4b9ef5" /></td>
              <td style="white-space:nowrap;color:#374151;cursor:${canAct ? 'pointer' : 'default'}" ${canAct ? `onclick="inlineDateClick(this,${tx.id},'${tx.transaction_date}')" title="Click to edit date"` : ''}>${fmtDate(tx.transaction_date)}</td>
              <td style="color:#6b7280;font-size:0.82rem">${escHtml(tx.token_details) || '—'}</td>
              <td style="text-align:right;font-weight:600">${fmtAmt(tx.amount)}</td>
              <td>
                ${tx.debit_party_name
                  ? `<span class="party-chip"><span class="party-chip-badge">D</span>${escHtml(tx.debit_party_name)}</span>`
                  : '—'}
              </td>
              <td style="text-align:right;color:#6b7280">${fmtRate(tx.debit_rate)}</td>
              <td style="text-align:right;color:#c62828">${fmtAmt(tx.debit_commission)}</td>
              <td>
                ${tx.credit_party_name
                  ? `<span class="party-chip credit"><span class="party-chip-badge">C</span>${escHtml(tx.credit_party_name)}</span>`
                  : '—'}
              </td>
              <td style="text-align:right;color:#6b7280">${fmtRate(tx.credit_rate)}</td>
              <td style="text-align:right;color:#2e7d32">${fmtAmt(tx.credit_commission)}</td>
              <td style="color:#6b7280;font-size:0.82rem">${escHtml(tx.remarks) || '—'}</td>
              <td style="text-align:center">
                <span class="badge ${isPending ? 'badge-pending' : 'badge-verified'}">
                  ${isPending ? 'pending' : 'approved'}
                </span>
              </td>
              <td style="text-align:center">
                <div class="action-menu-wrap">
                  <button class="btn-action-menu" onclick="toggleActionMenu(this)" title="Actions">···</button>
                  <div class="action-dropdown">
                    <button class="action-menu-item" onclick="viewTransaction(${tx.id})">
                      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
                      View
                    </button>
                    ${canAct ? `
                    <button class="action-menu-item" onclick="editTransaction(${tx.id})">
                      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                      Edit
                    </button>
                    ${isPending ? `
                    <button class="action-menu-item" onclick="verifyTransaction(${tx.id})">
                      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>
                      Approve
                    </button>` : ''}
                    <hr class="action-menu-sep"/>
                    <a href="/api/export/transaction/pdf?id=${tx.id}" target="_blank" class="action-menu-item">
                      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
                      PDF
                    </a>
                    ` : ''}
                  </div>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div style="padding:0.4rem 1rem;font-size:0.8rem;color:#9ca3af;border-top:1px solid #f5f6fa">${total} transaction(s)</div>
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
  document.querySelectorAll('.tx-tab').forEach((b, i) => b.classList.toggle('active', i === 0));
  loadTransactions(1);
}

async function viewTransaction(id) {
  try {
    const tx = await API.get('/api/transactions/' + id);
    const fmtRate = (r) => {
      const n = parseFloat(r);
      return (!n || n === 0) ? '—' : n.toFixed(4).replace(/\.?0+$/, '') + '%';
    };
    Modal.open({
      title: `Voucher: ${tx.voucher_number}`,
      size: 'lg',
      body: `
        <div class="form-grid">
          ${txDetailField('Voucher #', tx.voucher_number)}
          ${txDetailField('Date', fmtDate(tx.transaction_date))}
          ${txDetailField('Status', `<span class="badge ${tx.status === 'Pending Verification' ? 'badge-pending' : 'badge-verified'}">${escHtml(tx.status)}</span>`)}
          ${txDetailField('City', tx.transaction_city)}
          ${txDetailField('Token', tx.token_details)}
          ${txDetailField('Amount', fmtAmt(tx.amount))}
          ${txDetailField('Debit Party', tx.debit_party_name)}
          ${txDetailField('Debit Rate', fmtRate(tx.debit_rate))}
          ${txDetailField('Debit Commission', fmtAmt(tx.debit_commission))}
          ${txDetailField('Credit Party', tx.credit_party_name)}
          ${txDetailField('Credit Rate', fmtRate(tx.credit_rate))}
          ${txDetailField('Credit Commission', fmtAmt(tx.credit_commission))}
          ${txDetailField('Remarks', tx.remarks)}
          ${txDetailField('Message', tx.message)}
          ${tx.created_at ? txDetailField('Recorded At', tx.created_at.slice(0,16)) : ''}
          ${tx.verified_by_name ? txDetailField('Verified By', tx.verified_by_name) : ''}
          ${tx.verified_at ? txDetailField('Verified At', tx.verified_at.slice(0,16)) : ''}
        </div>
      `,
      footer: `
        <a href="/api/export/transaction/pdf?id=${id}" target="_blank" class="btn btn-outline">PDF</a>
        <button class="btn btn-outline btn-sm" onclick="Modal.close(); navigate('ledger'); setTimeout(() => { const el = document.getElementById('led-account'); if(el){ el.value='${tx.debit_party_id}'; loadLedger(); } }, 100)">
          ${escHtml(tx.debit_party_name)} Ledger
        </button>
        <button class="btn btn-outline btn-sm" onclick="Modal.close(); navigate('ledger'); setTimeout(() => { const el = document.getElementById('led-account'); if(el){ el.value='${tx.credit_party_id}'; loadLedger(); } }, 100)">
          ${escHtml(tx.credit_party_name)} Ledger
        </button>
        ${tx.status === 'Pending Verification' && APP.isOperator()
          ? `<button class="btn btn-success" onclick="Modal.close(); verifyTransaction(${id})">Approve</button>`
          : ''}
        <button class="btn btn-primary" onclick="Modal.close()">Close</button>
      `
    });
  } catch (e) { toast(e.message, 'error'); }
}

function txDetailField(label, value) {
  return `
    <div class="field-group">
      <label style="font-size:0.78rem;color:#9ca3af;font-weight:600">${escHtml(label)}</label>
      <div style="padding:0.4rem 0;font-size:0.875rem;color:#1f2937;border-bottom:1px solid #f1f5f9">${value || '—'}</div>
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
      <button class="btn btn-primary" onclick="submitEditTransaction(${txId})">Save Changes</button>
    `
  });
  editTransaction._onSuccess = onSuccess;
}

async function submitEditTransaction(txId) {
  const errEl = document.getElementById('tx-form-error');
  errEl.style.display = 'none';

  const amt   = document.getElementById('tx-amount').value;
  const dComm = document.getElementById('tx-debit-comm').value  || '0';
  const cComm = document.getElementById('tx-credit-comm').value || '0';
  const dRate = document.getElementById('tx-debit-rate').value  || '0';
  const cRate = document.getElementById('tx-credit-rate').value || '0';

  const data = {
    transaction_date:   document.getElementById('tx-date').value,
    transaction_city:   document.getElementById('tx-city').value.trim(),
    token_details:      document.getElementById('tx-token').value.trim(),
    amount:             amt,
    wallet_city:        document.getElementById('tx-wallet-city').value.trim(),
    debit_party_id:     document.getElementById('tx-debit-party').value,
    debit_rate:         dRate,
    debit_commission:   dComm,
    remarks:            document.getElementById('tx-remarks').value.trim(),
    message:            document.getElementById('tx-message').value.trim(),
    credit_wallet_city: document.getElementById('tx-credit-wallet-city').value.trim(),
    credit_party_id:    document.getElementById('tx-credit-party').value,
    credit_rate:        cRate,
    credit_commission:  cComm,
  };

  if (!data.amount || parseFloat(data.amount) <= 0) { errEl.textContent = 'Amount required.'; errEl.style.display = 'flex'; return; }
  if (!data.debit_party_id || !data.credit_party_id) { errEl.textContent = 'Both parties required.'; errEl.style.display = 'flex'; return; }

  const btn = Modal.footer.querySelector('.btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  try {
    await API.patch('/api/transactions/' + txId, data);
    toast('Transaction updated', 'success');
    Modal.close();
    if (typeof editTransaction._onSuccess === 'function') {
      editTransaction._onSuccess();
      editTransaction._onSuccess = null;
    } else {
      loadTransactions(txPage);
    }
  } catch (e) {
    errEl.textContent = e.message; errEl.style.display = 'flex';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }
  }
}

async function verifyTransaction(txId) {
  if (!confirm('Approve this transaction? Ledger entries will be posted.')) return;
  try {
    const updated = await API.patch(`/api/transactions/${txId}/verify`, {});
    toast(`${updated.voucher_number} approved`, 'success');
    loadTransactions(txPage);
  } catch (e) { toast(e.message, 'error'); }
}

function buildTransactionForm(tx = null) {
  const today = new Date().toISOString().slice(0, 10);
  const v = (f, fb = '') => tx ? (tx[f] ?? fb) : fb;

  // Commission is stored as a fraction (÷1000 on save), convert back to display units
  const dCommDisplay = tx && parseFloat(tx.debit_commission)
    ? parseFloat((parseFloat(tx.debit_commission) * 1000).toFixed(4)) : '';
  const cCommDisplay = tx && parseFloat(tx.credit_commission)
    ? parseFloat((parseFloat(tx.credit_commission) * 1000).toFixed(4)) : '';
  const dRateDisplay = tx ? (parseFloat(tx.debit_rate)  || '') : '';
  const cRateDisplay = tx ? (parseFloat(tx.credit_rate) || '') : '';

  return `
    <form id="tx-form" autocomplete="off">
      <div class="section-label">Transaction Details</div>
      <div class="form-grid-3">
        <div class="field-group">
          <label>Date</label>
          <input type="date" id="tx-date" value="${v('transaction_date', today)}" />
        </div>
        <div class="field-group">
          <label>Token</label>
          <input type="text" id="tx-token" value="${escHtml(v('token_details'))}" placeholder="Token / ref" />
        </div>
        <div class="field-group">
          <label class="required">Amount <span style="font-weight:400;color:#9ca3af;font-size:0.72rem">(in '000s)</span></label>
          <input type="number" id="tx-amount" value="${v('amount','')}" step="0.001" min="0"
            oninput="onEditAmountChange()" />
        </div>
        <div class="field-group">
          <label>City</label>
          <input type="text" id="tx-city" value="${escHtml(v('transaction_city'))}" placeholder="City" />
        </div>
        <div class="field-group">
          <label>Wallet City</label>
          <input type="text" id="tx-wallet-city" value="${escHtml(v('wallet_city'))}" />
        </div>
        <div class="field-group">
          <label>Remarks</label>
          <input type="text" id="tx-remarks" value="${escHtml(v('remarks'))}" />
        </div>
      </div>
      <div class="field-group">
        <label>Message</label>
        <textarea id="tx-message" rows="2">${escHtml(v('message'))}</textarea>
      </div>

      <hr class="divider"/>
      <div class="section-label">Debit Party</div>
      <div class="form-grid-3">
        <div class="field-group col-span-3">
          <label class="required">Debit Party</label>
          <select id="tx-debit-party">
            <option value="">— Select —</option>
            ${APP.accountOptions(v('debit_party_id'))}
          </select>
        </div>
        <div class="field-group">
          <label>Debit Rate %</label>
          <input type="number" id="tx-debit-rate" value="${dRateDisplay}" step="0.0001" min="0" placeholder="0.00"
            oninput="onEditRateChange('debit')" />
        </div>
        <div class="field-group">
          <label>Debit Commission</label>
          <input type="number" id="tx-debit-comm" value="${dCommDisplay}" step="0.001" min="0" placeholder="0"
            oninput="onEditCommChange('debit')" />
        </div>
        <div class="field-group" style="display:flex;align-items:flex-end">
          <div id="tx-debit-preview" style="font-size:0.8rem;color:#6b7280;padding-bottom:0.5rem"></div>
        </div>
      </div>

      <hr class="divider"/>
      <div class="section-label">Credit Party</div>
      <div class="form-grid-3">
        <div class="field-group">
          <label class="required">Credit Party</label>
          <select id="tx-credit-party">
            <option value="">— Select —</option>
            ${APP.accountOptions(v('credit_party_id'))}
          </select>
        </div>
        <div class="field-group">
          <label>Credit Wallet City</label>
          <input type="text" id="tx-credit-wallet-city" value="${escHtml(v('credit_wallet_city'))}" />
        </div>
        <div class="field-group"></div>
        <div class="field-group">
          <label>Credit Rate %</label>
          <input type="number" id="tx-credit-rate" value="${cRateDisplay}" step="0.0001" min="0" placeholder="0.00"
            oninput="onEditRateChange('credit')" />
        </div>
        <div class="field-group">
          <label>Credit Commission</label>
          <input type="number" id="tx-credit-comm" value="${cCommDisplay}" step="0.001" min="0" placeholder="0"
            oninput="onEditCommChange('credit')" />
        </div>
        <div class="field-group" style="display:flex;align-items:flex-end">
          <div id="tx-credit-preview" style="font-size:0.8rem;color:#6b7280;padding-bottom:0.5rem"></div>
        </div>
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
  if (preset === 'today') { fromEl.value = today; toEl.value = today; }
  else if (preset === 'month') { fromEl.value = monthStart; toEl.value = today; }
  loadTransactions(1);
}

// ── Inline date edit ──────────────────────────────────────────────────────
// Clicking the date cell replaces it with a date input; committing saves via PATCH.
function inlineDateClick(td, txId, currentDate) {
  if (!APP.isOperator()) return;
  if (td.querySelector('input')) return; // already editing

  const original = currentDate; // YYYY-MM-DD
  td.innerHTML = `<input type="date" value="${original}" style="font-size:0.85rem;padding:2px 4px;border:1px solid #4b9ef5;border-radius:4px;outline:none" />`;
  const input = td.querySelector('input');
  input.focus();

  async function commit() {
    const newDate = input.value;
    if (!newDate || newDate === original) {
      td.innerHTML = `<span style="white-space:nowrap;color:#374151;cursor:pointer" onclick="inlineDateClick(this.parentElement,${txId},'${original}')">${fmtDate(original)}</span>`;
      return;
    }
    try {
      // Fetch full transaction, merge new date, PATCH back
      const tx = await API.get('/api/transactions/' + txId);
      await API.patch('/api/transactions/' + txId, {
        transaction_date:   newDate,
        transaction_city:   tx.transaction_city   || '',
        token_details:      tx.token_details       || '',
        amount:             tx.amount,
        wallet_city:        tx.wallet_city         || '',
        debit_party_id:     tx.debit_party_id,
        debit_rate:         tx.debit_rate          || 0,
        debit_commission:   parseFloat(((parseFloat(tx.debit_commission)  || 0) * 1000).toFixed(4)),
        remarks:            tx.remarks             || '',
        message:            tx.message             || '',
        credit_wallet_city: tx.credit_wallet_city  || '',
        credit_party_id:    tx.credit_party_id,
        credit_rate:        tx.credit_rate         || 0,
        credit_commission:  parseFloat(((parseFloat(tx.credit_commission) || 0) * 1000).toFixed(4)),
      });
      toast('Date updated', 'success');
      td.innerHTML = `<span style="white-space:nowrap;color:#374151;cursor:pointer" onclick="inlineDateClick(this.parentElement,${txId},'${newDate}')">${fmtDate(newDate)}</span>`;
    } catch (e) {
      toast(e.message, 'error');
      td.innerHTML = `<span style="white-space:nowrap;color:#374151;cursor:pointer" onclick="inlineDateClick(this.parentElement,${txId},'${original}')">${fmtDate(original)}</span>`;
    }
  }

  input.addEventListener('change', commit);
  input.addEventListener('blur',   commit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') {
      td.innerHTML = `<span style="white-space:nowrap;color:#374151;cursor:pointer" onclick="inlineDateClick(this.parentElement,${txId},'${original}')">${fmtDate(original)}</span>`;
    }
  });
}
