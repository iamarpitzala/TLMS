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
      <button class="btn btn-primary" onclick="loadTrialBalance()">🔍 Calculate</button>
      <button class="btn btn-outline" onclick="clearTbFilters()">All Time</button>
    </div>

    <div id="tb-summary" class="stats-grid" style="display:none"></div>

    <div class="card">
      <div id="tb-export-bar" style="display:none;margin-bottom:1rem">
        <div class="btn-group">
          <button class="btn btn-outline btn-sm" onclick="exportTrialBalance('pdf')">📄 Export PDF</button>
          <button class="btn btn-outline btn-sm" onclick="exportTrialBalance('excel')">📊 Export Excel</button>
        </div>
      </div>
      <div id="tb-table-wrap">
        <div class="empty-state">
          <div class="empty-icon">⚖️</div>
          <p>Click "Calculate" to load the trial balance.</p>
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
    date_to: document.getElementById('tb-to')?.value || ''
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

  let totOC = 0, totOD = 0, totCC = 0, totCD = 0;
  rows.forEach(r => {
    totOC += r.opening_credit; totOD += r.opening_debit;
    totCC += r.closing_credit; totCD += r.closing_debit;
  });

  wrap.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Account Name</th>
            <th>Opening Credit</th>
            <th>Opening Debit</th>
            <th>Closing Credit</th>
            <th>Closing Debit</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td><strong>${escHtml(r.account_name)}</strong></td>
              <td>${fmtNum(r.opening_credit)}</td>
              <td>${fmtNum(r.opening_debit)}</td>
              <td>${fmtNum(r.closing_credit)}</td>
              <td>${fmtNum(r.closing_debit)}</td>
              <td>${r.is_verified
                ? '<span class="badge badge-verified">✓ Verified</span>'
                : '<span class="badge badge-pending">Pending</span>'}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr>
            <td>TOTAL</td>
            <td>${fmtNum(totOC)}</td>
            <td>${fmtNum(totOD)}</td>
            <td>${fmtNum(totCC)}</td>
            <td>${fmtNum(totCD)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
    <div style="margin-top:0.5rem;font-size:0.82rem;color:#6b7280">${rows.length} account(s)</div>
  `;
}

function exportTrialBalance(format) {
  const q = API.buildQuery({
    date_from: document.getElementById('tb-from')?.value || '',
    date_to: document.getElementById('tb-to')?.value || ''
  });
  window.open(`/api/export/trial-balance/${format}${q}`, '_blank');
}
