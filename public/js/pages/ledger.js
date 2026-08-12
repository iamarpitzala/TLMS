// ── Ledger Report page ────────────────────────────────────────────────────
let currentLedgerType = 'all';
let showNarration = true;

async function renderLedger() {
  const page = document.getElementById('page-ledger');
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + '01';

  page.innerHTML = `
    <div class="page-header">
      <h2>📖 Ledger Report</h2>
    </div>

    <!-- ── Toolbar ─────────────────────────────────────── -->
    <div class="card ledger-toolbar-card">
      <div class="ledger-toolbar">
        <div class="ledger-toolbar-left">
          <button class="btn btn-outline btn-sm" onclick="exportLedger('pdf')">📄 PDF</button>
          <button class="btn btn-outline btn-sm" onclick="exportLedger('excel')">📊 CSV</button>
          <button class="btn btn-entry-reset" onclick="resetLedger()" title="Reset">↺</button>
          <input type="date" id="led-from" value="${monthStart}" style="width:140px" onchange="loadLedger()" />
          <select id="led-account" style="width:190px" onchange="loadLedger()">
            <option value="">-- Select Account --</option>
            ${APP.accountOptions()}
          </select>
          <label class="led-narration-toggle">
            <input type="checkbox" id="led-narration" checked onchange="toggleNarration(this)" />
            <span>Narration</span>
          </label>
        </div>
        <div class="ledger-toolbar-right">
          <span class="led-balance-label">Total Balance :</span>
          <span id="led-total-balance" class="led-balance-value">—</span>
        </div>
      </div>

      <!-- Sub-toolbar: to-date + tabs -->
      <div class="ledger-subtoolbar">
        <div style="display:flex;align-items:center;gap:0.5rem">
          <label style="font-size:0.8rem;color:#6b7280">To:</label>
          <input type="date" id="led-to" value="${today}" style="width:140px" onchange="loadLedger()" />
        </div>
        <div class="ledger-tabs">
          <button class="led-tab active" onclick="switchLedgerTab('all', this)">All Entries</button>
          <button class="led-tab" onclick="switchLedgerTab('debit', this)">Debit</button>
          <button class="led-tab" onclick="switchLedgerTab('credit', this)">Credit</button>
        </div>
      </div>
    </div>

    <!-- ── Table ───────────────────────────────────────── -->
    <div class="card" style="padding:0">
      <div id="ledger-table-wrap">
        <div class="empty-state">
          <div class="empty-icon">📖</div>
          <p>Select an account and click "Load" to view the ledger.</p>
        </div>
      </div>
    </div>
  `;
}

function switchLedgerTab(type, btn) {
  currentLedgerType = type;
  document.querySelectorAll('.led-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadLedger();
}

function toggleNarration(cb) {
  showNarration = cb.checked;
  // Re-render without re-fetching
  const table = document.getElementById('ledger-table');
  if (!table) return;
  table.querySelectorAll('.led-narration-col').forEach(el => {
    el.style.display = showNarration ? '' : 'none';
  });
}

function resetLedger() {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + '01';
  const accEl = document.getElementById('led-account'); if (accEl) accEl.value = '';
  const frEl  = document.getElementById('led-from');    if (frEl)  frEl.value  = monthStart;
  const toEl  = document.getElementById('led-to');      if (toEl)  toEl.value  = today;
  document.getElementById('led-total-balance').textContent = '—';
  document.getElementById('ledger-table-wrap').innerHTML = `
    <div class="empty-state"><div class="empty-icon">📖</div><p>Select an account and click "Load".</p></div>`;
}

async function loadLedger() {
  const accountId = document.getElementById('led-account')?.value;
  if (!accountId) return;

  const wrap = document.getElementById('ledger-table-wrap');
  wrap.innerHTML = `<div class="loading"><span class="spinner"></span> Loading...</div>`;

  const q = API.buildQuery({
    account_id: accountId,
    type:       currentLedgerType === 'all' ? '' : currentLedgerType,
    date_from:  document.getElementById('led-from')?.value || '',
    date_to:    document.getElementById('led-to')?.value   || ''
  });

  try {
    const result = await API.get('/api/ledger' + q);
    renderLedgerTable(result.data, result.totals);
  } catch (e) {
    wrap.innerHTML = `<div class="alert alert-error">${escHtml(e.message)}</div>`;
  }
}

function renderLedgerTable(rows, totals) {
  const wrap = document.getElementById('ledger-table-wrap');
  const balEl = document.getElementById('led-total-balance');

  if (rows.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">📖</div><p>No entries found for this account in the selected period.</p></div>`;
    balEl.textContent = '—';
    balEl.style.color = '#374151';
    return;
  }

  // Get account opening balance from APP.accounts
  const accountId = parseInt(document.getElementById('led-account').value);
  const acc = APP.accounts.find(a => a.id === accountId);
  const opening = acc ? (acc.opening_amount || 0) : 0;

  // Compute running balance and separate cr/dr totals
  let runningBal = opening;
  let totalCr = 0, totalDr = 0, totalBrok = 0;

  const processedRows = rows.map(r => {
    const isDebit  = r.entry_type === 'debit';
    const isCredit = r.entry_type === 'credit';
    const amt = parseFloat(r.amount) || 0;
    const brok = parseFloat(r.brokerage) || 0;

    if (isCredit) { runningBal += amt; totalCr += amt; }
    else          { runningBal -= amt; totalDr += amt; }
    totalBrok += brok;

    return { ...r, isDebit, isCredit, runningBal: runningBal };
  });

  const finalBal = runningBal;
  const balSign  = finalBal >= 0 ? 'Cr' : 'Dr';
  const balColor = finalBal >= 0 ? '#2e7d32' : '#c62828';
  balEl.textContent = `${fmtAmt(Math.abs(finalBal))} ${balSign}`;
  balEl.style.color = balColor;

  const narDisplay = showNarration ? '' : 'none';

  wrap.innerHTML = `
    <div style="overflow-x:auto">
      <table id="ledger-table" class="ledger-report-table">
        <thead>
          <tr>
            <th>Tran Id</th>
            <th>Date</th>
            <th>Particular</th>
            <th class="led-narration-col" style="display:${narDisplay}">Narration</th>
            <th style="text-align:right">Brokerage</th>
            <th style="text-align:right">Cr Amount</th>
            <th style="text-align:right">Dr Amount</th>
            <th style="text-align:right">Balance</th>
            <th style="text-align:center">Action</th>
          </tr>
        </thead>
        <tbody>
          <!-- Opening balance row -->
          <tr class="led-opening-row">
            <td></td>
            <td></td>
            <td><em>Opening Balance</em></td>
            <td class="led-narration-col" style="display:${narDisplay}"><em>Opening Balance</em></td>
            <td></td>
            <td style="text-align:right;color:#2e7d32">${opening >= 0 ? fmtAmt(opening) : ''}</td>
            <td style="text-align:right;color:#c62828">${opening < 0  ? fmtAmt(Math.abs(opening)) : ''}</td>
            <td style="text-align:right;font-weight:600">
              ${fmtAmt(Math.abs(opening))} ${opening >= 0 ? 'Cr' : 'Dr'}
            </td>
            <td></td>
          </tr>
          ${processedRows.map(r => {
            const balStr = `${fmtAmt(Math.abs(r.runningBal))} ${r.runningBal >= 0 ? 'Cr' : 'Dr'}`;
            const balC   = r.runningBal >= 0 ? '#2e7d32' : '#c62828';

            // Build action buttons based on role and lock state
            let actionBtn = '';
            if (APP.isOperator()) {
              // Edit is always available to operators regardless of lock state
              actionBtn += `<button class="btn btn-outline btn-xs" onclick="editTransaction(${r.transaction_id}, loadLedger)" title="Edit Transaction">✏️</button> `;
            }
            if (r.is_locked) {
              if (APP.isAdmin()) {
                actionBtn += `<button class="btn btn-warning btn-xs" onclick="unlockLedgerEntry(${r.id})">🔓 Unlock</button>`;
              } else {
                actionBtn += `<span class="badge badge-locked" title="Locked">🔒</span>`;
              }
            } else {
              if (APP.isOperator()) {
                actionBtn += `<button class="btn btn-success btn-xs" onclick="lockLedgerEntry(${r.id})">🔒 Lock</button>`;
              }
            }

            return `
              <tr id="ledger-row-${r.id}" class="${r.is_locked ? 'led-locked-row' : ''}">
                <td style="color:#1e3a5f;font-size:0.8rem">
                  ${r.transaction_id
                    ? `<a href="#" onclick="viewTransaction(${r.transaction_id});return false" style="color:#1e3a5f;text-decoration:underline;cursor:pointer">${r.transaction_id}</a>`
                    : `<span style="color:#9ca3af">${r.id}</span>`}
                </td>
                <td style="white-space:nowrap">${fmtDate(r.entry_date)}</td>
                <td>${escHtml(r.particulars) || 'Transaction'}</td>
                <td class="led-narration-col" style="display:${narDisplay};color:#6b7280;font-size:0.82rem">
                  ${escHtml(r.message) || ''}
                </td>
                <td style="text-align:right;color:#6b7280">${r.brokerage ? fmtAmt(r.brokerage) : ''}</td>
                <td style="text-align:right;color:#2e7d32;font-weight:600">${r.isCredit ? renderAmtWithBreakdown(r, 'credit') : ''}</td>
                <td style="text-align:right;color:#c62828;font-weight:600">${r.isDebit  ? renderAmtWithBreakdown(r, 'debit')  : ''}</td>
                <td style="text-align:right;font-weight:600;color:${balC}">${balStr}</td>
                <td style="text-align:center">${actionBtn}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
        <tfoot>
          <tr class="led-total-row">
            <td colspan="3" style="text-align:right;font-weight:700">Total :</td>
            <td class="led-narration-col" style="display:${narDisplay}"></td>
            <td style="text-align:right;font-weight:700;color:#6b7280">${totalBrok ? fmtAmt(totalBrok) : ''}</td>
            <td style="text-align:right;font-weight:700;color:#2e7d32">${fmtAmt(totalCr)}</td>
            <td style="text-align:right;font-weight:700;color:#c62828">${fmtAmt(totalDr)}</td>
            <td style="text-align:right;font-weight:700;color:${balColor}">${fmtAmt(Math.abs(finalBal))} ${balSign}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
    <div style="padding:0.5rem 1rem;font-size:0.8rem;color:#9ca3af">${rows.length} entries</div>
  `;
}

function exportLedger(format) {
  const accountId = document.getElementById('led-account')?.value;
  if (!accountId) { toast('Select an account first', 'error'); return; }

  const q = API.buildQuery({
    account_id: accountId,
    type:      currentLedgerType === 'all' ? '' : currentLedgerType,
    date_from: document.getElementById('led-from')?.value || '',
    date_to:   document.getElementById('led-to')?.value   || ''
  });
  window.open(`/api/export/ledger/${format}${q}`, '_blank');
}

// ── Lock / Unlock ledger entries from the Ledger page ─────────────────────

async function lockLedgerEntry(entryId) {
  if (!confirm('Lock this entry? It will be marked as verified and cannot be edited without an administrator unlock.')) return;
  try {
    await API.patch(`/api/trial-balance/entries/${entryId}/verify`, {});
    toast('Entry locked', 'success');
    loadLedger();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function unlockLedgerEntry(entryId) {
  if (!confirm('Unlock this entry? The action will be recorded in the audit log.')) return;
  try {
    await API.patch(`/api/trial-balance/entries/${entryId}/unlock`, {});
    toast('Entry unlocked', 'success');
    loadLedger();
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ── Amount + commission breakdown renderer ────────────────────────────────
// tx_base_amount = original transaction amount (from transactions table join)
// entry.brokerage = commission portion
// Shows: total amount with a sub-line "base + comm" or "base − comm"
function renderAmtWithBreakdown(entry, side) {
  const total = parseFloat(entry.amount) || 0;
  const comm  = parseFloat(entry.brokerage) || 0;
  const base  = parseFloat(entry.tx_base_amount);

  // Only show breakdown if we have a valid base and there is commission
  if (comm === 0 || isNaN(base)) {
    return fmtAmt(total);
  }

  const sign      = side === 'debit' ? '+' : '−';
  const commColor = side === 'debit' ? '#c62828' : '#2e7d32';

  return `${fmtAmt(total)}
    <div style="font-size:0.73rem;font-weight:400;color:#6b7280;margin-top:1px">
      ${fmtAmt(base)}&thinsp;<span style="color:${commColor}">${sign}&thinsp;${fmtAmt(comm)}</span>
    </div>`;
}
