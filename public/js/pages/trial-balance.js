// ── Trial Balance page ────────────────────────────────────────────────────

async function renderTrialBalance() {
  const page = document.getElementById('page-trial-balance');
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + '01';

  page.innerHTML = `
    <div class="page-header">
      <h2>Trial Balance</h2>
      <div class="btn-group">
        <button class="btn btn-outline btn-sm" onclick="exportTrialBalance('excel')">CSV</button>
        <button class="btn btn-outline btn-sm" onclick="exportTrialBalance('pdf')">PDF</button>
      </div>
    </div>

    <div class="card" style="padding:0.85rem 1.1rem;margin-bottom:1rem">
      <div class="tb-header-bar">
        <div class="filter-field">
          <label>From</label>
          <input type="date" id="tb-from" value="${monthStart}" style="width:150px" />
        </div>
        <div class="filter-field">
          <label>To</label>
          <input type="date" id="tb-to" value="${today}" style="width:150px" />
        </div>
        <button class="btn btn-primary btn-sm" onclick="loadTrialBalance()">Search</button>
        <button class="btn btn-outline btn-sm" onclick="clearTbFilters()">All Time</button>
        <button class="btn btn-outline btn-sm" onclick="setTbPreset('today')">Today</button>
        <button class="btn btn-outline btn-sm" onclick="setTbPreset('month')">This Month</button>
        <label class="tb-include-pending">
          <input type="checkbox" id="tb-pending" checked onchange="loadTrialBalance()" />
          Include pending transactions
        </label>
      </div>
    </div>

    <div id="tb-summary" class="stats-grid" style="display:none"></div>

    <div class="card" style="padding:0">
      <div id="tb-table-wrap">
        <div class="empty-state">
          <div class="empty-icon">⚖️</div>
          <p>Click "Search" to load the trial balance.</p>
        </div>
      </div>
    </div>
  `;

  loadTrialBalance();
}

function clearTbFilters() {
  document.getElementById('tb-from').value = '';
  document.getElementById('tb-to').value   = '';
  loadTrialBalance();
}

async function loadTrialBalance() {
  const wrap      = document.getElementById('tb-table-wrap');
  const summaryEl = document.getElementById('tb-summary');
  wrap.innerHTML  = `<div class="loading"><span class="spinner"></span> Calculating…</div>`;
  summaryEl.style.display = 'none';

  const q = API.buildQuery({
    date_from: document.getElementById('tb-from')?.value || '',
    date_to:   document.getElementById('tb-to')?.value   || ''
  });

  try {
    const result = await API.get('/api/trial-balance' + q);
    renderTrialBalanceSummary(result.summary, summaryEl);
    renderTrialBalanceTable(result.data, wrap);
  } catch (e) {
    wrap.innerHTML = `<div class="alert alert-error" style="margin:1rem">${escHtml(e.message)}</div>`;
  }
}

function renderTrialBalanceSummary(s, el) {
  el.style.display = 'grid';
  el.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Total Accounts</div>
      <div class="stat-value">${s.totalAccounts}</div>
    </div>
    <div class="stat-card green">
      <div class="stat-label">Verified</div>
      <div class="stat-value">${s.verifiedAccounts}</div>
    </div>
    <div class="stat-card orange">
      <div class="stat-label">Pending</div>
      <div class="stat-value">${s.pendingVerification}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Verification %</div>
      <div class="stat-value">${s.verificationPct}%</div>
      <div class="stat-sub">completion rate</div>
    </div>
  `;
}

function renderTrialBalanceTable(rows, wrap) {
  if (rows.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">⚖️</div><p>No active accounts found.</p></div>`;
    return;
  }

  const canVerify = APP.isOperator();
  const isAdmin   = APP.isAdmin();

  // Check if books balance
  let totDr = 0, totCr = 0;
  rows.forEach(r => { totDr += r.closing_debit; totCr += r.closing_credit; });
  const isBalanced = Math.abs(totDr - totCr) < 0.001;

  wrap.innerHTML = `
    ${isBalanced
      ? `<div class="alert-balanced" style="margin:0.75rem 1rem 0">
           <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>
           Books are balanced. Total debit equals total credit.
         </div>`
      : ''}
    <div style="overflow-x:auto">
      <table class="tb-table">
        <thead>
          <tr>
            <th rowspan="2" class="tb-th-account" style="padding:0.7rem 1rem">Account</th>
            <th colspan="2" class="tb-th-group">Debit</th>
            <th colspan="2" class="tb-th-group">Credit</th>
          </tr>
          <tr>
            <th class="tb-th-sub">Amount</th>
            <th class="tb-th-sub">Commission (Dr)</th>
            <th class="tb-th-sub">Amount</th>
            <th class="tb-th-sub">Commission (Cr)</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr class="tb-account-row">
              <td style="padding:0.6rem 1rem">
                <strong>${escHtml(r.account_name)}</strong>
                ${r.group_name ? `<span style="font-size:0.75rem;color:#9ca3af;margin-left:6px">${escHtml(r.group_name)}</span>` : ''}
                ${r.total_entries > 0 ? `
                  <div style="margin-top:0.3rem">
                    <button class="btn btn-outline btn-xs" onclick="toggleTbEntries(${r.account_id})">
                      ${r.verified_entries}/${r.total_entries} verified
                    </button>
                  </div>` : ''}
              </td>
              <td class="tb-num" style="color:${r.closing_debit > 0 ? '#1d4ed8' : '#9ca3af'}">${r.closing_debit > 0 ? fmtAmt(r.closing_debit) : ''}</td>
              <td class="tb-num" style="color:#9ca3af">${r.debit_commission > 0 ? fmtAmt(r.debit_commission) : ''}</td>
              <td class="tb-num" style="color:${r.closing_credit > 0 ? '#dc2626' : '#9ca3af'}">${r.closing_credit > 0 ? fmtAmt(r.closing_credit) : ''}</td>
              <td class="tb-num" style="color:#9ca3af">${r.credit_commission > 0 ? fmtAmt(r.credit_commission) : ''}</td>
            </tr>
            ${r.total_entries > 0 ? `
              <tr id="tb-entries-${r.account_id}" style="display:none">
                <td colspan="5" style="padding:0;background:#f8fafc">
                  ${renderTbEntriesTable(r.entries, r.account_id, canVerify, isAdmin)}
                </td>
              </tr>` : ''}
          `).join('')}
        </tbody>
        <tfoot>
          <tr>
            <td style="padding:0.6rem 1rem;font-weight:700">SUBTOTAL</td>
            <td class="tb-num"><strong>${fmtAmt(totDr)}</strong></td>
            <td class="tb-num"></td>
            <td class="tb-num"><strong>${fmtAmt(totCr)}</strong></td>
            <td class="tb-num"></td>
          </tr>
          <tr>
            <td style="padding:0.6rem 1rem;font-weight:700;font-size:0.9rem">GRAND TOTAL (AMOUNT + COMMISSION)</td>
            <td class="tb-num" colspan="2"><strong>${fmtAmt(totDr)}</strong></td>
            <td class="tb-num" colspan="2"><strong>${fmtAmt(totCr)}</strong></td>
          </tr>
        </tfoot>
      </table>
    </div>
    <div style="padding:0.5rem 1rem;font-size:0.8rem;color:#9ca3af;border-top:1px solid #f5f6fa">${rows.length} account(s)</div>
  `;
}

function renderTbEntriesTable(entries, accountId, canVerify, isAdmin) {
  const showActions = canVerify || isAdmin;
  return `
    <div style="padding:0.75rem 1.25rem 0.75rem 2rem;border-left:3px solid #4b9ef5">
      <table style="font-size:0.82rem;width:100%;background:transparent;border-collapse:collapse">
        <thead>
          <tr style="background:#f0f7ff">
            <th style="padding:0.4rem 0.75rem;text-align:left;color:#6b7280;font-weight:600;font-size:0.72rem;text-transform:uppercase">ID</th>
            <th style="padding:0.4rem 0.75rem;text-align:left;color:#6b7280;font-weight:600;font-size:0.72rem;text-transform:uppercase">Date</th>
            <th style="padding:0.4rem 0.75rem;text-align:left;color:#6b7280;font-weight:600;font-size:0.72rem;text-transform:uppercase">Type</th>
            <th style="padding:0.4rem 0.75rem;text-align:left;color:#6b7280;font-weight:600;font-size:0.72rem;text-transform:uppercase">Particulars</th>
            <th style="padding:0.4rem 0.75rem;text-align:right;color:#6b7280;font-weight:600;font-size:0.72rem;text-transform:uppercase">Brokerage</th>
            <th style="padding:0.4rem 0.75rem;text-align:right;color:#6b7280;font-weight:600;font-size:0.72rem;text-transform:uppercase">Amount</th>
            <th style="padding:0.4rem 0.75rem;text-align:center;color:#6b7280;font-weight:600;font-size:0.72rem;text-transform:uppercase">Verified</th>
            <th style="padding:0.4rem 0.75rem;text-align:left;color:#6b7280;font-weight:600;font-size:0.72rem;text-transform:uppercase">By</th>
            ${showActions ? '<th style="padding:0.4rem 0.75rem;text-align:center;color:#6b7280;font-weight:600;font-size:0.72rem;text-transform:uppercase">Action</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${entries.map(e => {
            const verifiedCell = e.is_verified
              ? `<span class="badge badge-verified">Verified</span><div style="font-size:0.72rem;color:#9ca3af">${e.verified_at ? e.verified_at.slice(0,16) : ''}</div>`
              : `<span class="badge badge-pending">Pending</span>`;

            const editBtn = canVerify && e.transaction_id
              ? `<button class="btn btn-outline btn-xs" onclick="editTransaction(${e.transaction_id}, () => loadTrialBalance().then(() => { const r = document.getElementById('tb-entries-${accountId}'); if (r) r.style.display = 'table-row'; }))">Edit</button>`
              : '';

            let lockBtn = '';
            if (!e.is_locked && canVerify) {
              lockBtn = `<button class="btn btn-success btn-xs" onclick="verifyTbEntry(${e.id}, ${accountId})">Lock</button>`;
            } else if (e.is_locked && isAdmin) {
              lockBtn = `<button class="btn btn-warning btn-xs" onclick="unlockTbEntry(${e.id}, ${accountId})">Unlock</button>`;
            } else if (e.is_locked) {
              lockBtn = `<span class="badge badge-locked">Locked</span>`;
            }

            return `
              <tr id="tb-entry-row-${e.id}" style="background:${e.is_locked ? '#f0f9ff' : 'transparent'};border-bottom:1px solid #f1f5f9">
                <td style="padding:0.4rem 0.75rem;color:#9ca3af">${e.id}</td>
                <td style="padding:0.4rem 0.75rem;white-space:nowrap">${fmtDate(e.entry_date)}</td>
                <td style="padding:0.4rem 0.75rem">
                  <span class="badge ${e.entry_type === 'credit' ? 'badge-verified' : 'badge-pending'}">${e.entry_type}</span>
                </td>
                <td style="padding:0.4rem 0.75rem">${escHtml(e.particulars) || '—'}</td>
                <td style="padding:0.4rem 0.75rem;text-align:right;color:#9ca3af">${fmtAmt(e.brokerage)}</td>
                <td style="padding:0.4rem 0.75rem;text-align:right;font-weight:600">${tbAmtWithBreakdown(e)}</td>
                <td style="padding:0.4rem 0.75rem;text-align:center">${verifiedCell}</td>
                <td style="padding:0.4rem 0.75rem;color:#6b7280">${escHtml(e.verified_by_name) || '—'}</td>
                ${showActions ? `<td style="padding:0.4rem 0.75rem;text-align:center"><div class="btn-group" style="justify-content:center">${editBtn} ${lockBtn}</div></td>` : ''}
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function toggleTbEntries(accountId) {
  const row = document.getElementById(`tb-entries-${accountId}`);
  if (!row) return;
  row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
}

async function verifyTbEntry(entryId, accountId) {
  if (!confirm('Lock this entry?')) return;
  try {
    await API.patch(`/api/trial-balance/entries/${entryId}/verify`, {});
    toast('Entry locked', 'success');
    loadTrialBalance().then(() => {
      const row = document.getElementById(`tb-entries-${accountId}`);
      if (row) row.style.display = 'table-row';
    });
  } catch (e) { toast(e.message, 'error'); }
}

async function unlockTbEntry(entryId, accountId) {
  if (!confirm('Unlock this entry? The action will be recorded in the audit log.')) return;
  try {
    await API.patch(`/api/trial-balance/entries/${entryId}/unlock`, {});
    toast('Entry unlocked', 'success');
    loadTrialBalance().then(() => {
      const row = document.getElementById(`tb-entries-${accountId}`);
      if (row) row.style.display = 'table-row';
    });
  } catch (e) { toast(e.message, 'error'); }
}

function exportTrialBalance(format) {
  const q = API.buildQuery({
    date_from: document.getElementById('tb-from')?.value || '',
    date_to:   document.getElementById('tb-to')?.value   || ''
  });
  window.open(`/api/export/trial-balance/${format}${q}`, '_blank');
}

function tbAmtWithBreakdown(entry) {
  const total = parseFloat(entry.amount)         || 0;
  const comm  = parseFloat(entry.brokerage)      || 0;
  const base  = parseFloat(entry.tx_base_amount);
  if (comm === 0 || isNaN(base)) return fmtAmt(total);
  const sign      = entry.entry_type === 'debit' ? '+' : '−';
  const commColor = entry.entry_type === 'debit' ? '#dc2626' : '#16a34a';
  return `${fmtAmt(total)}<div style="font-size:0.72rem;font-weight:400;color:#9ca3af">${fmtAmt(base)}&thinsp;<span style="color:${commColor}">${sign}&thinsp;${fmtAmt(comm)}</span></div>`;
}

function setTbPreset(preset) {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + '01';
  if (preset === 'today') {
    document.getElementById('tb-from').value = today;
    document.getElementById('tb-to').value   = today;
  } else if (preset === 'month') {
    document.getElementById('tb-from').value = monthStart;
    document.getElementById('tb-to').value   = today;
  }
  loadTrialBalance();
}
