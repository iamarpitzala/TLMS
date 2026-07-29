// ── Audit Log page (admin only) ───────────────────────────────────────────
async function renderAudit() {
  const page = document.getElementById('page-audit');

  if (!APP.isAdmin()) {
    page.innerHTML = `<div class="alert alert-error">Access denied. Administrators only.</div>`;
    return;
  }

  page.innerHTML = `
    <div class="page-header">
      <h2>🔍 Audit Log</h2>
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
      wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><p>No audit log entries yet.</p></div>`;
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
              <th>Field</th>
              <th>Old Value</th>
              <th>New Value</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td>${r.id}</td>
                <td>${r.timestamp ? r.timestamp.slice(0,16) : '-'}</td>
                <td><strong>${escHtml(r.actor_name) || '-'}</strong></td>
                <td><span class="badge badge-warning">${escHtml(r.action)}</span></td>
                <td>${escHtml(r.table_name) || '-'}</td>
                <td>${r.record_id || '-'}</td>
                <td>${escHtml(r.field_name) || '-'}</td>
                <td style="color:#c62828">${escHtml(r.old_value) || '-'}</td>
                <td style="color:#2e7d32">${escHtml(r.new_value) || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div style="margin-top:0.5rem;font-size:0.82rem;color:#6b7280">${rows.length} log entries (most recent 500)</div>
    `;
  } catch (e) {
    document.getElementById('audit-table-wrap').innerHTML =
      `<div class="alert alert-error">${escHtml(e.message)}</div>`;
  }
}
