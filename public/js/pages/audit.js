// ── Audit Log page (admin only) ───────────────────────────────────────────

const ACTION_BADGE = {
  login:              'badge-verified',
  login_failed:       'badge-admin',
  logout:             'badge-operator',
  create:             'badge-verified',
  update:             'badge-warning',
  disable:            'badge-admin',
  enable:             'badge-verified',
  verify:             'badge-verified',
  verify_transaction: 'badge-verified',
  unlock:             'badge-warning',
};

let _auditAllRows = [];

function auditActionBadge(action) {
  const cls = ACTION_BADGE[action] || 'badge-pending';
  return `<span class="badge ${cls}">${escHtml(action)}</span>`;
}

function fmtAuditVal(raw) {
  if (!raw) return '—';
  try {
    const parsed = JSON.parse(raw);
    return Object.entries(parsed)
      .map(([k, v]) => `<span style="color:#9ca3af">${escHtml(k)}:</span> ${escHtml(String(v ?? '—'))}`)
      .join('<br>');
  } catch {
    return escHtml(raw);
  }
}

function normaliseAuditObj(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = { ...obj };
  if (out.debit_party_id !== undefined && out.debit_party === undefined) {
    out.debit_party = out.debit_party_id; delete out.debit_party_id;
  }
  if (out.credit_party_id !== undefined && out.credit_party === undefined) {
    out.credit_party = out.credit_party_id; delete out.credit_party_id;
  }
  return out;
}

function fmtAuditDiff(oldRaw, newRaw) {
  if (!oldRaw || !newRaw) return { old: fmtAuditVal(oldRaw), new: fmtAuditVal(newRaw) };
  try {
    const oldObj = normaliseAuditObj(JSON.parse(oldRaw));
    const newObj = normaliseAuditObj(JSON.parse(newRaw));
    const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
    let oldOut = '', newOut = '';
    allKeys.forEach(k => {
      const ov = String(oldObj[k] ?? '—');
      const nv = String(newObj[k] ?? '—');
      const changed = ov !== nv;
      const style = changed ? 'font-weight:600' : 'opacity:0.4';
      oldOut += `<div style="${style}"><span style="color:#9ca3af">${escHtml(k)}:</span> ${escHtml(ov)}</div>`;
      newOut += `<div style="${style}"><span style="color:#9ca3af">${escHtml(k)}:</span> ${escHtml(nv)}</div>`;
    });
    return { old: oldOut || '—', new: newOut || '—' };
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
      <h2>Audit Log</h2>
      <button class="btn btn-outline btn-sm" onclick="renderAudit()">Refresh</button>
    </div>

    <div class="filters-bar">
      <div class="filter-field">
        <label>Search</label>
        <input type="text" id="audit-search" placeholder="Actor, action, table, ID…" style="width:220px" oninput="filterAuditRows()" />
      </div>
      <div class="filter-field">
        <label>Action</label>
        <select id="audit-action-filter" onchange="filterAuditRows()" style="width:160px">
          <option value="">All Actions</option>
          <option value="login">login</option>
          <option value="login_failed">login_failed</option>
          <option value="logout">logout</option>
          <option value="create">create</option>
          <option value="update">update</option>
          <option value="verify_transaction">verify_transaction</option>
          <option value="verify">verify</option>
          <option value="unlock">unlock</option>
          <option value="disable">disable</option>
          <option value="enable">enable</option>
        </select>
      </div>
      <div class="filter-field">
        <label>From</label>
        <input type="date" id="audit-from" oninput="filterAuditRows()" />
      </div>
      <div class="filter-field">
        <label>To</label>
        <input type="date" id="audit-to" oninput="filterAuditRows()" />
      </div>
      <button class="btn btn-outline btn-sm" onclick="clearAuditFilters()">Clear</button>
    </div>

    <div class="card" style="padding:0">
      <div id="audit-table-wrap">
        <div class="loading"><span class="spinner"></span> Loading…</div>
      </div>
    </div>
  `;

  try {
    _auditAllRows = await API.get('/api/ledger/audit');
    filterAuditRows();
  } catch (e) {
    document.getElementById('audit-table-wrap').innerHTML =
      `<div class="alert alert-error" style="margin:1rem">${escHtml(e.message)}</div>`;
  }
}

function clearAuditFilters() {
  ['audit-search','audit-from','audit-to'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const af = document.getElementById('audit-action-filter'); if (af) af.value = '';
  filterAuditRows();
}

function filterAuditRows() {
  const wrap = document.getElementById('audit-table-wrap');
  if (!wrap) return;

  const search = (document.getElementById('audit-search')?.value || '').toLowerCase();
  const action = document.getElementById('audit-action-filter')?.value || '';
  const from   = document.getElementById('audit-from')?.value || '';
  const to     = document.getElementById('audit-to')?.value   || '';

  let rows = _auditAllRows;
  if (action) rows = rows.filter(r => r.action === action);
  if (from)   rows = rows.filter(r => r.timestamp && r.timestamp.slice(0,10) >= from);
  if (to)     rows = rows.filter(r => r.timestamp && r.timestamp.slice(0,10) <= to);
  if (search) {
    rows = rows.filter(r =>
      (r.actor_name||'').toLowerCase().includes(search) ||
      (r.action||'').toLowerCase().includes(search) ||
      (r.table_name||'').toLowerCase().includes(search) ||
      String(r.record_id||'').includes(search) ||
      (r.old_value||'').toLowerCase().includes(search) ||
      (r.new_value||'').toLowerCase().includes(search)
    );
  }

  if (rows.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><p>${_auditAllRows.length === 0 ? 'No audit log entries yet.' : 'No entries match the current filters.'}</p></div>`;
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
            <th style="text-align:center">Record ID</th>
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
              beforeHtml = diff.old; afterHtml = diff.new;
            } else {
              beforeHtml = fmtAuditVal(r.old_value);
              afterHtml  = fmtAuditVal(r.new_value);
            }
            return `
            <tr>
              <td style="font-size:0.78rem;color:#9ca3af">${r.id}</td>
              <td style="white-space:nowrap;font-size:0.82rem;color:#6b7280">${r.timestamp ? r.timestamp.slice(0,16).replace('T',' ') : '—'}</td>
              <td><strong>${escHtml(r.actor_name) || '—'}</strong></td>
              <td>${auditActionBadge(r.action)}</td>
              <td style="font-size:0.82rem;color:#6b7280">${escHtml(r.table_name) || '—'}</td>
              <td style="text-align:center;color:#6b7280">${r.record_id || '—'}</td>
              <td style="font-size:0.79rem;color:#dc2626;max-width:200px">${beforeHtml}</td>
              <td style="font-size:0.79rem;color:#16a34a;max-width:200px">${afterHtml}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div style="padding:0.5rem 1rem;font-size:0.8rem;color:#9ca3af;border-top:1px solid #f5f6fa">${rows.length} of ${_auditAllRows.length} entries</div>
  `;
}
