// ── Trial Balance page ────────────────────────────────────────────────────

async function renderTrialBalance() {
  const page = document.getElementById('page-trial-balance');
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + '01';

  page.innerHTML = `
    <div class="page-header">
      <h2>⚖️ Trial Balance</h2>
    </div>

    <div class="filters-bar">
      <div class="filter-field">
        <label>From Date</label>
        <input type="date" id="tb-from" value="${monthStart}" />
      </div>
      <div class="filter-field">
        <label>To Date</label>
        <input type="date" id="tb-to" value="${today}" />
      </div>
      <button class="btn btn-primary" onclick="loadTrialBalance()">🔍 Search</button>
      <button class="btn btn-outline" onclick="clearTbFilters()">All Time</button>
    </div>

    <div id="tb-summary" class="stats-grid" style="display:none"></div>

    <div class="card">
      <div id="tb-export-bar" style="display:none;margin-bottom:1rem">
        <div class="btn-group">
          <button class="btn btn-outline btn-sm" onclick="exportTrialBalance('pdf')">📄 Export To PDF</button>
          <button class="btn btn-outline btn-sm" onclick="exportTrialBalance('excel')">📊 Export To Excel</button>
        </div>
      </div>
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
  document.getElementById('tb-to').value = '';
  loadTrialBalance();
}

async function loadTrialBalance() {
  const wrap = document.getElementById('tb-table-wrap');
  const summaryEl = document.getElementById('tb-summary');
  wrap.innerHTML = `<div class="loading"><span class="spinner"></span> Calculating...</div>`;
  summaryEl.style.display = 'none';
  document.getElementById('tb-export-bar').style.display = 'none';

  const q = API.buildQuery({
    date_from: document.getElementById('tb-from')?.value || '',
    date_to:   document.getElementById('tb-to')?.value   || ''
  });

  try {
    const result = await API.get('/api/trial-balance' + q);
    renderTrialBalanceSummary(result.summary, summaryEl);
    renderTrialBalanceTable(result.data, wrap);
    document.getElementById('tb-export-bar').style.display = 'block';
  } catch (e) {
    wrap.innerHTML = `<div class="alert alert-error">${escHtml(e.message)}</div>`;
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
      <div class="stat-label">Verified Accounts</div>
      <div class="stat-value">${s.verifiedAccounts}</div>
    </div>
    <div class="stat-card orange">
      <div class="stat-label">Pending Verification</div>
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

  let totOC = 0, totOD = 0, totCC = 0, totCD = 0;
  rows.forEach(r => {
    totOC += r.opening_credit; totOD += r.opening_debit;
    totCC += r.closing_credit; totCD += r.closing_debit;
  });

  wrap.innerHTML = `
    <div class="table-wrap">
      <table class="tb-table">
        <thead>
          <tr>
            <th rowspan="2" class="tb-th-account">Account Name</th>
            <th colspan="2" class="tb-th-group">Opening Trial Balance</th>
            <th colspan="2" class="tb-th-group">Closing Trial Balance</th>
            <th rowspan="2" class="tb-th-status">Status</th>
          </tr>
          <tr>
            <th class="tb-th-sub">Credit (Jama)</th>
            <th class="tb-th-sub">Debit (Nave)</th>
            <th class="tb-th-sub">Credit (Jama)</th>
            <th class="tb-th-sub">Debit (Nave)</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr class="tb-account-row">
              <td>
                <strong>${escHtml(r.account_name)}</strong>
                ${r.total_entries > 0 ? `
                  <div style="margin-top:0.3rem">
                    <button class="btn btn-outline btn-xs" onclick="toggleTbEntries(${r.account_id})">
                      📋 ${r.verified_entries}/${r.total_entries} verified
                    </button>
                  </div>
                ` : ''}
              </td>
              <td class="tb-num">${fmtAmt(r.opening_credit)}</td>
              <td class="tb-num">${fmtAmt(r.opening_debit)}</td>
              <td class="tb-num">${fmtAmt(r.closing_credit)}</td>
              <td class="tb-num">${fmtAmt(r.closing_debit)}</td>
              <td>
                ${r.is_verified
                  ? '<span class="badge badge-verified">✓ Verified</span>'
                  : (r.total_entries === 0
                      ? '<span class="badge badge-pending">No entries</span>'
                      : '<span class="badge badge-pending">Pending</span>')}
              </td>
            </tr>
            ${r.total_entries > 0 ? `
              <tr id="tb-entries-${r.account_id}" style="display:none">
                <td colspan="6" style="padding:0;background:#f8fafc">
                  ${renderTbEntriesTable(r.entries, r.account_id, canVerify, isAdmin)}
                </td>
              </tr>
            ` : ''}
          `).join('')}
        </tbody>
        <tfoot>
          <tr>
            <td><strong>TOTAL</strong></td>
            <td class="tb-num"><strong>${fmtAmt(totOC)}</strong></td>
            <td class="tb-num"><strong>${fmtAmt(totOD)}</strong></td>
            <td class="tb-num"><strong>${fmtAmt(totCC)}</strong></td>
            <td class="tb-num"><strong>${fmtAmt(totCD)}</strong></td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
    <div style="margin-top:0.5rem;font-size:0.82rem;color:#6b7280">${rows.length} account(s)</div>
  `;
}

function renderTbEntriesTable(entries, accountId, canVerify, isAdmin) {
  const typeBadge = {
    debit:             '<span class="badge badge-pending">Debit</span>',
    credit:            '<span class="badge badge-verified">Credit</span>',
    commission_debit:  '<span class="badge badge-admin">Comm.D</span>',
    commission_credit: '<span class="badge badge-operator">Comm.C</span>'
  };

  return `
    <div style="padding:0.75rem 1.25rem 0.75rem 2rem;border-left:4px solid #4fc3f7">
      <table style="font-size:0.82rem;width:100%;background:transparent">
        <thead>
          <tr style="background:#e8f4fd">
            <th style="padding:0.45rem 0.75rem">ID</th>
            <th style="padding:0.45rem 0.75rem">Date</th>
            <th style="padding:0.45rem 0.75rem">Type</th>
            <th style="padding:0.45rem 0.75rem">Particulars</th>
            <th style="padding:0.45rem 0.75rem">Brokerage</th>
            <th style="padding:0.45rem 0.75rem">Amount</th>
            <th style="padding:0.45rem 0.75rem">Verified</th>
            <th style="padding:0.45rem 0.75rem">Verified By</th>
            ${canVerify || isAdmin ? '<th style="padding:0.45rem 0.75rem">Action</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${entries.map(e => {
            const verifiedCell = e.is_verified
              ? `<span class="badge badge-verified">✓ Verified</span>
                 <div class="verified-info">${e.verified_at ? e.verified_at.slice(0,16) : ''}</div>`
              : `<span class="badge badge-pending">Pending</span>`;

            let action = '';
            if (!e.is_locked && canVerify) {
              action = `<button class="btn btn-success btn-xs" onclick="verifyTbEntry(${e.id}, ${accountId})">✓ Verify</button>`;
            } else if (e.is_locked && isAdmin) {
              action = `<button class="btn btn-warning btn-xs" onclick="unlockTbEntry(${e.id}, ${accountId})">🔓 Unlock</button>`;
            } else if (e.is_locked) {
              action = `<span class="badge badge-locked">🔒 Locked</span>`;
            }

            return `
              <tr id="tb-entry-row-${e.id}" style="background:${e.is_locked ? '#f0f9ff' : 'transparent'}">
                <td style="padding:0.4rem 0.75rem">${e.id}</td>
                <td style="padding:0.4rem 0.75rem">${fmtDate(e.entry_date)}</td>
                <td style="padding:0.4rem 0.75rem">${typeBadge[e.entry_type] || e.entry_type}</td>
                <td style="padding:0.4rem 0.75rem">${escHtml(e.particulars) || '-'}</td>
                <td style="padding:0.4rem 0.75rem">${fmtAmt(e.brokerage)}</td>
                <td style="padding:0.4rem 0.75rem"><strong>${fmtAmt(e.amount)}</strong></td>
                <td style="padding:0.4rem 0.75rem">${verifiedCell}</td>
                <td style="padding:0.4rem 0.75rem">${escHtml(e.verified_by_name) || '-'}</td>
                ${canVerify || isAdmin ? `<td style="padding:0.4rem 0.75rem">${action}</td>` : ''}
              </tr>
            `;
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
  if (!confirm('Mark this entry as verified? It will be locked.')) return;
  try {
    await API.patch(`/api/trial-balance/entries/${entryId}/verify`, {});
    toast('Entry verified and locked', 'success');
    loadTrialBalance().then(() => {
      // Re-open the expanded entries panel for this account
      const row = document.getElementById(`tb-entries-${accountId}`);
      if (row) row.style.display = 'table-row';
    });
  } catch (e) {
    toast(e.message, 'error');
  }
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
  } catch (e) {
    toast(e.message, 'error');
  }
}

function exportTrialBalance(format) {
  const q = API.buildQuery({
    date_from: document.getElementById('tb-from')?.value || '',
    date_to:   document.getElementById('tb-to')?.value   || ''
  });
  window.open(`/api/export/trial-balance/${format}${q}`, '_blank');
}
