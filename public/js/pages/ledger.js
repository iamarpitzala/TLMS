// ── Ledger page ───────────────────────────────────────────────────────────
let currentLedgerType = 'debit';

async function renderLedger() {
  const page = document.getElementById('page-ledger');
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + '01';

  page.innerHTML = `
    <div class="page-header">
      <h2>📖 Ledger</h2>
    </div>

    <div class="filters-bar">
      <div class="filter-field">
        <label class="required">Account</label>
        <select id="led-account" style="width:200px">
          <option value="">-- Select Account --</option>
          ${APP.accountOptions()}
        </select>
      </div>
      <div class="filter-field">
        <label>From Date</label>
        <input type="date" id="led-from" value="${monthStart}" />
      </div>
      <div class="filter-field">
        <label>To Date</label>
        <input type="date" id="led-to" value="${today}" />
      </div>
      <button class="btn btn-primary" onclick="loadLedger()">🔍 Load Ledger</button>
      <button class="btn btn-outline" onclick="clearLedgerFilters()">Clear</button>
    </div>

    <div class="tabs">
      <button class="tab-btn active" onclick="switchLedgerTab('debit', this)">Debit Ledger</button>
      <button class="tab-btn" onclick="switchLedgerTab('credit', this)">Credit Ledger</button>
      <button class="tab-btn" onclick="switchLedgerTab('all', this)">All Entries</button>
    </div>

    <div class="card">
      <div id="ledger-export-bar" style="display:none;margin-bottom:1rem">
        <div class="btn-group">
          <button class="btn btn-outline btn-sm" onclick="exportLedger('pdf')">📄 Export PDF</button>
          <button class="btn btn-outline btn-sm" onclick="exportLedger('excel')">📊 Export Excel</button>
        </div>
      </div>
      <div id="ledger-table-wrap">
        <div class="empty-state">
          <div class="empty-icon">📖</div>
          <p>Select an account and click "Load Ledger" to view entries.</p>
        </div>
      </div>
    </div>
  `;
}

function switchLedgerTab(type, btn) {
  currentLedgerType = type;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadLedger();
}

function clearLedgerFilters() {
  document.getElementById('led-account').value = '';
  document.getElementById('led-from').value = '';
  document.getElementById('led-to').value = '';
  document.getElementById('ledger-table-wrap').innerHTML = `
    <div class="empty-state"><div class="empty-icon">📖</div><p>Select an account and click "Load Ledger".</p></div>
  `;
  document.getElementById('ledger-export-bar').style.display = 'none';
}

async function loadLedger() {
  const accountId = document.getElementById('led-account')?.value;
  if (!accountId) {
    toast('Please select an account first.', 'error');
    return;
  }

  const wrap = document.getElementById('ledger-table-wrap');
  wrap.innerHTML = `<div class="loading"><span class="spinner"></span> Loading...</div>`;
  document.getElementById('ledger-export-bar').style.display = 'none';

  const q = API.buildQuery({
    account_id: accountId,
    type: currentLedgerType === 'all' ? '' : currentLedgerType,
    date_from: document.getElementById('led-from')?.value || '',
    date_to: document.getElementById('led-to')?.value || ''
  });

  try {
    const result = await API.get('/api/ledger' + q);
    renderLedgerTable(result.data, result.totals);
    document.getElementById('ledger-export-bar').style.display = 'block';
  } catch (e) {
    wrap.innerHTML = `<div class="alert alert-error">${escHtml(e.message)}</div>`;
  }
}

function renderLedgerTable(rows, totals) {
  const wrap = document.getElementById('ledger-table-wrap');

  if (rows.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">📖</div><p>No ledger entries found for this account in the selected period.</p></div>`;
    return;
  }

  wrap.innerHTML = `
    <div class="table-wrap">
      <table id="ledger-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Date</th>
            <th>Type</th>
            <th>Particulars</th>
            <th>Message</th>
            <th>Brokerage</th>
            <th>Amount</th>
            <th>Verified</th>
            <th>Verified By</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => renderLedgerRow(r)).join('')}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="5" style="text-align:right;font-weight:700">TOTAL</td>
            <td>${fmtNum(totals.brokerage)}</td>
            <td>${fmtNum(totals.amount)}</td>
            <td colspan="2"></td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

function renderLedgerRow(r) {
  const isDebit  = r.entry_type === 'debit'  || r.entry_type === 'commission_debit';
  const isCredit = r.entry_type === 'credit' || r.entry_type === 'commission_credit';

  const rowBg = r.is_locked
    ? '#f0f9ff'
    : isDebit  ? '#fff5f5'
    : isCredit ? '#f0fdf4'
    : '';

  const amtStyle = isDebit
    ? 'color:#c62828;font-weight:700'
    : isCredit
    ? 'color:#2e7d32;font-weight:700'
    : 'font-weight:700';

  const typeBadge = {
    debit:             '<span class="badge badge-debit">Debit</span>',
    credit:            '<span class="badge badge-credit">Credit</span>',
    commission_debit:  '<span class="badge badge-comm-debit">Comm.D</span>',
    commission_credit: '<span class="badge badge-comm-credit">Comm.C</span>'
  }[r.entry_type] || r.entry_type;

  const verifiedCell = r.is_verified
    ? `<span class="badge badge-verified">✓ Verified</span>
       <div class="verified-info">at ${r.verified_at ? r.verified_at.slice(0,16) : ''}</div>`
    : `<span class="badge badge-pending">Pending</span>`;

  const verifiedByCell = r.verified_by_name
    ? `<span>${escHtml(r.verified_by_name)}</span>`
    : '-';

  return `
    <tr id="ledger-row-${r.id}" style="background:${rowBg}">
      <td>${r.id}</td>
      <td>${fmtDate(r.entry_date)}</td>
      <td>${typeBadge}</td>
      <td>${escHtml(r.particulars) || '-'}</td>
      <td>${escHtml(r.message) || '-'}</td>
      <td>${fmtNum(r.brokerage)}</td>
      <td style="${amtStyle}">${fmtNum(r.amount)}</td>
      <td>${verifiedCell}</td>
      <td>${verifiedByCell}</td>
    </tr>
  `;
}

function exportLedger(format) {
  const accountId = document.getElementById('led-account')?.value;
  if (!accountId) { toast('Select an account first', 'error'); return; }

  const q = API.buildQuery({
    account_id: accountId,
    type: currentLedgerType === 'all' ? '' : currentLedgerType,
    date_from: document.getElementById('led-from')?.value || '',
    date_to: document.getElementById('led-to')?.value || ''
  });

  const url = `/api/export/ledger/${format}${q}`;
  window.open(url, '_blank');
}
