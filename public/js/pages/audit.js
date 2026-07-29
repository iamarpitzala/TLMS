// ── Audit Log page (admin only) ───────────────────────────────────────────

const ACTION_BADGE = {
  login:          'badge-verified',
  login_failed:   'badge-admin',
  logout:         'badge-operator',
  create:         'badge-verified',
  update:         'badge-warning',
  disable:        'badge-admin',
  enable:         'badge-verified',
  verify:         'badge-verified',
  unlock:         'badge-warning',
};

function auditActionBadge(action) {
  const cls = ACTION_BADGE[action] || 'badge-pending';
  return `<span class="badge ${cls}">${escHtml(action)}</span>`;
}

// Pretty-print JSON values so they're readable in the table
function fmtAuditVal(raw) {
  if (!raw) return '-';
  try {
    const parsed = JSON.parse(raw);
    return Object.entries(parsed)
      .map(([k, v]) => `<span style="color:#6b7280">${escHtml(k)}:</span> ${escHtml(String(v ?? '-'))}`)
      .join('<br>');
  } catch {
    return escHtml(raw);
  }
}

async function renderAudit() {
  const page = document.getElementById('page-audit');

  if (!APP.isAdmin()) {
    page.innerHTML = `<div class="alert alert-error">Access denied. Administrators only.</div>`;
    return;
  }

  page.innerHTML = `
    <div class="page-header">
      <h2>🔍 Audit Log</h2>
      <button class="btn btn-outline btn-sm" onclick="renderAudit()">↻ Refresh</button>
    </div>
    <div class="card">
      <div id="audit-table-wrap">
        <div class="loading"><span class="spinner"></span> Loading...</div>
      </div>
    </div>
  `;

  try {
    const rows = await API.get('/api/ledger/audit');
    const wrap = document.getElementById('audit-table-wrap');

    if (rows.length === 0) {
      wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><p>No audit log entries yet. Actions like login, account changes, transactions, and ledger verifications will appear here.</p></div>`;
      return;
    }

    wrap.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Timestamp</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Table</th>
              <th>Record ID</th>
              <th>Before</th>
              <th>After</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td style="font-size:0.78rem;color:#9ca3af">${r.id}</td>
                <td style="white-space:nowrap;font-size:0.82rem">${r.timestamp ? r.timestamp.slice(0,16).replace('T',' ') : '-'}</td>
                <td><strong>${escHtml(r.actor_name) || '-'}</strong></td>
                <td>${auditActionBadge(r.action)}</td>
                <td style="font-size:0.82rem">${escHtml(r.table_name) || '-'}</td>
                <td style="text-align:center">${r.record_id || '-'}</td>
                <td style="font-size:0.8rem;color:#c62828;max-width:200px">${fmtAuditVal(r.old_value)}</td>
                <td style="font-size:0.8rem;color:#2e7d32;max-width:200px">${fmtAuditVal(r.new_value)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div style="margin-top:0.5rem;font-size:0.82rem;color:#6b7280">${rows.length} entries (most recent 1000)</div>
    `;
  } catch (e) {
    document.getElementById('audit-table-wrap').innerHTML =
      `<div class="alert alert-error">${escHtml(e.message)}</div>`;
  }
}
