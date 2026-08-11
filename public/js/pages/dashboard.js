// ── Dashboard page ────────────────────────────────────────────────────────
async function renderDashboard() {
  const page = document.getElementById('page-dashboard');
  page.innerHTML = `<div class="loading"><span class="spinner"></span> Loading...</div>`;

  try {
    const today = new Date().toISOString().slice(0, 10);
    const [tb, accounts] = await Promise.all([
      API.get('/api/trial-balance'),
      API.get('/api/accounts')
    ]);

    const { summary } = tb;
    const totalAccounts = accounts.length;
    const activeAccounts = accounts.filter(a => a.is_active).length;

    page.innerHTML = `
      <div class="page-header">
        <h2>🏠 Dashboard</h2>
        <span style="font-size:0.85rem;color:#6b7280">Today: ${today}</span>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">Total Accounts</div>
          <div class="stat-value">${summary.totalAccounts}</div>
          <div class="stat-sub">${activeAccounts} active</div>
        </div>
        <div class="stat-card green">
          <div class="stat-label">Verified</div>
          <div class="stat-value">${summary.verifiedAccounts}</div>
          <div class="stat-sub">accounts verified</div>
        </div>
        <div class="stat-card orange">
          <div class="stat-label">Pending Verification</div>
          <div class="stat-value">${summary.pendingVerification}</div>
          <div class="stat-sub">need verification</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Verification %</div>
          <div class="stat-value">${summary.verificationPct}%</div>
          <div class="stat-sub">completion rate</div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Quick Trial Balance (All Time)</div>
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
              ${tb.data.length === 0 ? `<tr><td colspan="6" class="empty-state"><div class="empty-icon">📊</div><p>No accounts yet. <a href="#" onclick="navigate('accounts')">Create an account</a> to get started.</p></td></tr>` :
                tb.data.map(r => `
                  <tr>
                    <td><strong>${escHtml(r.account_name)}</strong></td>
                    <td>${fmtAmt(r.opening_credit)}</td>
                    <td>${fmtAmt(r.opening_debit)}</td>
                    <td>${fmtAmt(r.closing_credit)}</td>
                    <td>${fmtAmt(r.closing_debit)}</td>
                    <td>${r.is_verified
                      ? '<span class="badge badge-verified">✓ Verified</span>'
                      : '<span class="badge badge-pending">Pending</span>'}</td>
                  </tr>
                `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (e) {
    page.innerHTML = `<div class="alert alert-error">Failed to load dashboard: ${escHtml(e.message)}</div>`;
  }
}
