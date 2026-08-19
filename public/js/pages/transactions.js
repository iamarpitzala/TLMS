// ── Transactions page ─────────────────────────────────────────────────────
let txPage = 1;
const TX_PAGE_SIZE = 50;
let txStatusFilter = '';
let txEditId = null; // non-null when the inline form is in edit mode

// ── Rate ↔ Commission helpers ─────────────────────────────────────────────
// commission = amount × rate / 100
// rate       = commission / amount × 100
// Amounts are stored in '000s units (same as the amount field)

function calcCommFromRate(amtRaw, rateRaw) {
  const amt  = parseFloat(amtRaw)  || 0;
  const rate = parseFloat(rateRaw);
  if (amt === 0 || isNaN(rate) || rate === 0) return '';
  return parseFloat((amt * rate / 100).toFixed(4));
}

function calcRateFromComm(amtRaw, commRaw) {
  const amt  = parseFloat(amtRaw)  || 0;
  const comm = parseFloat(commRaw);
  if (amt === 0 || isNaN(comm) || comm === 0) return '';
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
    if (rateEl.value !== '' && rateEl.value !== null) {
      // rate is set → update commission (supports negative rates)
      commEl.value = calcCommFromRate(amt, rateEl.value);
    } else if (commEl.value !== '' && commEl.value !== null) {
      // commission is set → update rate (supports negative commissions)
      rateEl.value = calcRateFromComm(amt, commEl.value);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────

async function renderTransactions() {
  const page = document.getElementById('page-transactions');
  const canCreate = APP.isOperator();
  const today = APP.workingDate;

  page.innerHTML = `
    <div class="page-header">
      <h2>Transactions</h2>
    </div>

    ${canCreate ? `
    <!-- ── Inline entry row ─────────────────────────────── -->
    <div class="card tx-entry-card">
      <div class="tx-entry-row" id="tx-entry-row">

        <!-- Top fields: date / token / amount -->
        <div class="tx-entry-group tx-entry-group--top">
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
        </div>

        <!-- ── Debit side ── -->
        <div class="tx-entry-group tx-entry-group--party">
          <div class="tx-entry-group-label">Debit</div>
          <div class="tx-entry-group-fields">
            <div class="tx-entry-field tx-entry-field--wide">
              <label>Party <span class="req">*</span></label>
              <select id="te-debit">
                <option value="">Select…</option>
                ${APP.accountOptions()}
              </select>
            </div>
            <div class="tx-entry-field tx-entry-field--xs">
              <label>Rate %</label>
              <input type="number" id="te-debit-rate" step="0.0001" placeholder="0.00"
                oninput="onInlineRateChange('debit')" />
            </div>
            <div class="tx-entry-field tx-entry-field--xs">
              <label>Commission</label>
              <input type="number" id="te-debit-comm" step="0.001" placeholder="0"
                oninput="onInlineCommChange('debit')" />
            </div>
          </div>
        </div>

        <!-- ── Credit side ── -->
        <div class="tx-entry-group tx-entry-group--party">
          <div class="tx-entry-group-label">Credit</div>
          <div class="tx-entry-group-fields">
            <div class="tx-entry-field tx-entry-field--wide">
              <label>Party <span class="req">*</span></label>
              <select id="te-credit">
                <option value="">Select…</option>
                ${APP.accountOptions()}
              </select>
            </div>
            <div class="tx-entry-field tx-entry-field--xs">
              <label>Rate %</label>
              <input type="number" id="te-credit-rate" step="0.0001" placeholder="0.00"
                oninput="onInlineRateChange('credit')" />
            </div>
            <div class="tx-entry-field tx-entry-field--xs">
              <label>Commission</label>
              <input type="number" id="te-credit-comm" step="0.001" placeholder="0"
                oninput="onInlineCommChange('credit')" />
            </div>
          </div>
        </div>

        <!-- Bottom fields: city / remarks / actions -->
        <div class="tx-entry-group tx-entry-group--bottom">
          <div class="tx-entry-field tx-entry-field--sm">
            <label>City</label>
            <input type="text" id="te-city" placeholder="City" />
          </div>

          <div class="tx-entry-field">
            <label>Remarks</label>
            <input type="text" id="te-remarks" placeholder="Remarks" />
          </div>

          <div class="tx-entry-actions">
            <button class="btn-entry-submit" id="te-submit-btn" onclick="submitInlineTransaction()" title="Add Transaction">+</button>
            <button class="btn-entry-reset" onclick="resetInlineForm()" title="Reset">↺</button>
            <button class="btn-entry-cancel" id="te-cancel-btn" onclick="cancelEdit()" title="Cancel Edit" style="display:none">✕</button>
          </div>
        </div>

      </div>
      <div id="te-edit-banner" style="display:none;align-items:center;gap:0.5rem;padding:0.35rem 0.75rem;background:#fff3cd;border:1px solid #ffc107;border-radius:6px;font-size:0.82rem;color:#856404;margin-top:0.5rem">
        <svg viewBox="0 0 24 24" fill="currentColor" style="width:14px;height:14px;flex-shrink:0"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
        <span id="te-edit-banner-text">Editing transaction</span>
        <button onclick="cancelEdit()" style="margin-left:auto;background:none;border:none;cursor:pointer;color:#856404;font-size:0.8rem;padding:0 0.25rem">Cancel</button>
      </div>
      <div id="te-error" class="alert alert-error" style="display:none;margin-top:0.5rem"></div>
    </div>
    ` : ''}

    <!-- ── Filters + Tabs ──────────────────────────────── -->
    <div class="card" style="padding:0.75rem 1.1rem">
      <div class="tx-toolbar">
        <div class="tx-toolbar-left">
          <input type="text" id="tx-f-search" placeholder="Search…" style="width:210px" oninput="loadTransactions(1)" />
          <select id="tx-f-account" style="width:150px" onchange="loadTransactions(1)">
            <option value="">All Accounts</option>
            ${APP.accountOptions()}
          </select>
          <div class="tx-date-range">
            <input type="date" id="tx-f-from" onchange="loadTransactions(1)" />
            <span class="tx-date-sep">–</span>
            <input type="date" id="tx-f-to" onchange="loadTransactions(1)" />
          </div>
          <div class="tx-toolbar-btns">
            <button class="btn btn-outline btn-sm" onclick="clearTxFilters()">Clear</button>
            <button class="btn btn-outline btn-sm" onclick="setTxDatePreset('today')">Today</button>
            <button class="btn btn-outline btn-sm" onclick="setTxDatePreset('month')">Month</button>
            <button class="btn btn-outline btn-sm" onclick="exportTransactions('excel')">CSV</button>
            <button class="btn btn-outline btn-sm" onclick="exportTransactions('pdf')">PDF</button>
          </div>
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
  ['te-token','te-city','te-remarks'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  ['te-debit','te-credit'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  ['te-amount','te-debit-rate','te-debit-comm','te-credit-rate','te-credit-comm'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const date = document.getElementById('te-date'); if (date) date.value = APP.workingDate;
  const errEl = document.getElementById('te-error'); if (errEl) errEl.style.display = 'none';
  // clear edit state
  txEditId = null;
  const submitBtn = document.getElementById('te-submit-btn');
  if (submitBtn) { submitBtn.textContent = '+'; submitBtn.title = 'Add Transaction'; }
  const cancelBtn = document.getElementById('te-cancel-btn');
  if (cancelBtn) cancelBtn.style.display = 'none';
  const banner = document.getElementById('te-edit-banner');
  if (banner) banner.style.display = 'none';
  const card = document.querySelector('.tx-entry-card');
  if (card) card.classList.remove('tx-entry-card--editing');
}

function cancelEdit() {
  resetInlineForm();
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

  const btn = document.getElementById('te-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }

  try {
    if (txEditId) {
      // ── Edit mode: PATCH existing transaction ──────────────────────────
      // Commission is stored in '000s units — no scaling, send as-is
      await API.patch('/api/transactions/' + txEditId, {
        transaction_date:   data.transaction_date,
        transaction_city:   data.transaction_city,
        token_details:      data.token_details,
        amount:             data.amount,
        wallet_city:        '',
        debit_party_id:     data.debit_party_id,
        debit_rate:         data.debit_rate,
        debit_commission:   data.debit_commission,
        remarks:            data.remarks,
        message:            '',
        credit_wallet_city: '',
        credit_party_id:    data.credit_party_id,
        credit_rate:        data.credit_rate,
        credit_commission:  data.credit_commission,
      });
      toast('Transaction updated', 'success');
      resetInlineForm();
      loadTransactions(txPage);
    } else {
      // ── Create mode: POST new transaction ──────────────────────────────
      const created = await API.post('/api/transactions', data);
      toast(`Saved: ${created.voucher_number}`, 'success');
      resetInlineForm();
      loadTransactions(1);
    }
  } catch (e) {
    errEl.textContent = e.message;
    errEl.style.display = 'flex';
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = txEditId ? '✓' : '+';
    }
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
      <table class="tx-list-table rwd-table">
        <thead>
          <tr>
            <th style="width:32px"></th>
            <th>Date</th>
            <th>Token</th>
            <th style="text-align:right">Amount</th>
            <th>Debit</th>
            <th style="text-align:right">D.Rate</th>
            <th style="text-align:right">D.Comm</th>
            <th>Credit</th>
            <th style="text-align:right">C.Rate</th>
            <th style="text-align:right">C.Comm</th>
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
              <td class="td-check"><input type="checkbox" style="width:14px;height:14px;accent-color:#4b9ef5" /></td>
              <td data-label="Date" style="white-space:nowrap;color:#374151;cursor:${canAct ? 'pointer' : 'default'}" ${canAct ? `onclick="inlineDateClick(this,${tx.id},'${tx.transaction_date}')" title="Click to edit date"` : ''}>${fmtDate(tx.transaction_date)}</td>
              <td data-label="Token" style="color:#6b7280;font-size:0.82rem">${escHtml(tx.token_details) || '—'}</td>
              <td data-label="Amount" style="text-align:right;font-weight:600">${fmtAmt(tx.amount)}</td>
              <td data-label="Debit">
                ${tx.debit_party_name
                  ? `<span class="party-chip"><span class="party-chip-badge">D</span>${escHtml(tx.debit_party_name)}</span>`
                  : '—'}
              </td>
              <td data-label="D.Rate" style="text-align:right;color:#6b7280">${fmtRate(tx.debit_rate)}</td>
              <td data-label="D.Comm" style="text-align:right;color:#c62828">${fmtAmt(tx.debit_commission)}</td>
              <td data-label="Credit">
                ${tx.credit_party_name
                  ? `<span class="party-chip credit"><span class="party-chip-badge">C</span>${escHtml(tx.credit_party_name)}</span>`
                  : '—'}
              </td>
              <td data-label="C.Rate" style="text-align:right;color:#6b7280">${fmtRate(tx.credit_rate)}</td>
              <td data-label="C.Comm" style="text-align:right;color:#2e7d32">${fmtAmt(tx.credit_commission)}</td>
              <td data-label="Remarks" style="color:#6b7280;font-size:0.82rem">${escHtml(tx.remarks) || '—'}</td>
              <td data-label="Status" style="text-align:center">
                <span class="badge ${isPending ? 'badge-pending' : 'badge-verified'}">
                  ${isPending ? 'pending' : 'approved'}
                </span>
              </td>
              <td class="td-actions" style="text-align:center">
                <div style="display:inline-flex;align-items:center;gap:4px">
                  ${canAct ? `
                  <button class="btn-row-edit" onclick="editTransaction(${tx.id})" title="Edit">
                    <svg viewBox="0 0 24 24" fill="currentColor" style="width:14px;height:14px"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                  </button>` : ''}
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
                      ${!isPending && APP.isAdmin() ? `
                      <button class="action-menu-item" onclick="unapproveTransaction(${tx.id})">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11H7v-2h10v2z"/></svg>
                        Un-approve
                      </button>` : ''}
                      <hr class="action-menu-sep"/>
                      <a href="/api/export/transaction/pdf?id=${tx.id}" target="_blank" class="action-menu-item">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
                        PDF
                      </a>
                      ${APP.isAdmin() ? `
                      <hr class="action-menu-sep"/>
                      <button class="action-menu-item danger" onclick="deleteTransaction(${tx.id}, '${escHtml(tx.voucher_number)}')">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                        Delete
                      </button>` : ''}
                      ` : ''}
                    </div>
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

async function editTransaction(txId) {
  if (!APP.isOperator()) { toast('Access denied', 'error'); return; }
  let tx;
  try { tx = await API.get('/api/transactions/' + txId); }
  catch (e) { toast(e.message, 'error'); return; }

  // Populate the inline entry form
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };

  set('te-date',   tx.transaction_date || '');
  set('te-token',  tx.token_details    || '');
  set('te-amount', tx.amount           || '');
  set('te-city',   tx.transaction_city || '');
  set('te-remarks',tx.remarks          || '');
  set('te-debit',  tx.debit_party_id   || '');
  set('te-credit', tx.credit_party_id  || '');

  // Commission stored as-is (same units as amount), no scaling needed
  const dRate = parseFloat(tx.debit_rate)  || '';
  const cRate = parseFloat(tx.credit_rate) || '';
  const dComm = (tx.debit_commission  != null && tx.debit_commission  !== '') ? parseFloat(parseFloat(tx.debit_commission).toFixed(4))  : '';
  const cComm = (tx.credit_commission != null && tx.credit_commission !== '') ? parseFloat(parseFloat(tx.credit_commission).toFixed(4)) : '';
  set('te-debit-rate',  dRate);
  set('te-debit-comm',  dComm);
  set('te-credit-rate', cRate);
  set('te-credit-comm', cComm);

  // Switch form to edit mode
  txEditId = txId;
  const submitBtn = document.getElementById('te-submit-btn');
  if (submitBtn) { submitBtn.textContent = '✓'; submitBtn.title = 'Save Changes'; }
  const cancelBtn = document.getElementById('te-cancel-btn');
  if (cancelBtn) cancelBtn.style.display = '';
  const banner = document.getElementById('te-edit-banner');
  const bannerText = document.getElementById('te-edit-banner-text');
  if (banner) banner.style.display = 'flex';
  if (bannerText) bannerText.textContent = `Editing: ${tx.voucher_number}`;
  const card = document.querySelector('.tx-entry-card');
  if (card) card.classList.add('tx-entry-card--editing');

  // Scroll the entry form into view
  const entryRow = document.getElementById('tx-entry-row');
  if (entryRow) entryRow.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function verifyTransaction(txId) {
  if (!confirm('Approve this transaction? Ledger entries will be posted.')) return;
  try {
    const updated = await API.patch(`/api/transactions/${txId}/verify`, {});
    toast(`${updated.voucher_number} approved`, 'success');
    loadTransactions(txPage);
  } catch (e) { toast(e.message, 'error'); }
}

async function unapproveTransaction(txId) {
  if (!confirm('Un-approve this transaction? Ledger entries will be removed and status reverted to Pending.')) return;
  try {
    await API.patch(`/api/transactions/${txId}/unapprove`, {});
    toast('Transaction reverted to Pending', 'success');
    loadTransactions(txPage);
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteTransaction(txId, voucherNumber) {
  if (!confirm(`Delete ${voucherNumber}? This cannot be undone.`)) return;
  try {
    await API.delete(`/api/transactions/${txId}`);
    toast(`${voucherNumber} deleted`, 'success');
    loadTransactions(txPage);
  } catch (e) { toast(e.message, 'error'); }
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
        debit_commission:   parseFloat(parseFloat(tx.debit_commission  || 0).toFixed(4)),
        remarks:            tx.remarks             || '',
        message:            tx.message             || '',
        credit_wallet_city: tx.credit_wallet_city  || '',
        credit_party_id:    tx.credit_party_id,
        credit_rate:        tx.credit_rate         || 0,
        credit_commission:  parseFloat(parseFloat(tx.credit_commission || 0).toFixed(4)),
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
