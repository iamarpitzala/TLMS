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

// Normalise legacy audit objects that used _id keys instead of name keys
function normaliseAuditObj(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = { ...obj };
  // Map old id-based keys to name-based keys if name key absent
  if (out.debit_party_id !== undefined && out.debit_party === undefined) {
    out.debit_party = out.debit_party_id;
    delete out.debit_party_id;
  }
  if (out.credit_party_id !== undefined && out.credit_party === undefined) {
    out.credit_party = out.credit_party_id;
    delete out.credit_party_id;
  }
  return out;
}

// For update rows: show only the fields that actually changed, highlighted
function fmtAuditDiff(oldRaw, newRaw) {
  if (!oldRaw || !newRaw) {
    return { old: fmtAuditVal(oldRaw), new: fmtAuditVal(newRaw) };
  }
  try {
    const oldObj = normaliseAuditObj(JSON.parse(oldRaw));
    const newObj = normaliseAuditObj(JSON.parse(newRaw));
    const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
    let oldOut = '', newOut = '';
    allKeys.forEach(k => {
      const ov = String(oldObj[k] ?? '-');
      const nv = String(newObj[k] ?? '-');
      const changed = ov !== nv;
      const style = changed ? 'font-weight:700' : 'opacity:0.45';
      oldOut += `<div style="${style}"><span style="color:#6b7280">${escHtml(k)}:</span> ${escHtml(ov)}</div>`;
      newOut += `<div style="${style}"><span style="color:#6b7280">${escHtml(k)}:</span> ${escHtml(nv)}</div>`;
    });
    return { old: oldOut || '-', new: newOut || '-' };
  } catch {
    return { old: fmtAuditVal(oldRaw), new: fmtAuditVal(newRaw) };
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
            ${rows.map(r => {
              const isUpdate = r.action === 'update';
              let beforeHtml, afterHtml;
              if (isUpdate) {
                const diff = fmtAuditDiff(r.old_value, r.new_value);
                beforeHtml = diff.old;
                afterHtml  = diff.new;
              } else {
                beforeHtml = fmtAuditVal(r.old_value);
                afterHtml  = fmtAuditVal(r.new_value);
              }
              return `
              <tr>
                <td style="font-size:0.78rem;color:#9ca3af">${r.id}</td>
                <td style="white-space:nowrap;font-size:0.82rem">${r.timestamp ? r.timestamp.slice(0,16).replace('T',' ') : '-'}</td>
                <td><strong>${escHtml(r.actor_name) || '-'}</strong></td>
                <td>${auditActionBadge(r.action)}</td>
                <td style="font-size:0.82rem">${escHtml(r.table_name) || '-'}</td>
                <td style="text-align:center">${r.record_id || '-'}</td>
                <td style="font-size:0.8rem;color:#c62828;max-width:220px">${beforeHtml}</td>
                <td style="font-size:0.8rem;color:#2e7d32;max-width:220px">${afterHtml}</td>
              </tr>`;
            }).join('')}
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
