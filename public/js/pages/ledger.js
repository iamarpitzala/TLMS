// ── Ledger Report page ────────────────────────────────────────────────────
let currentLedgerType = 'all';
let showNarration = true;

async function renderLedger() {
  const page = document.getElementById('page-ledger');
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + '01';

  page.innerHTML = `
    <div class="page-header">
      <h2>Ledger Report</h2>
    </div>

    <!-- ── Toolbar ─────────────────────────────────────── -->
    <div class="card ledger-toolbar-card">
      <div class="ledger-toolbar">
        <div class="ledger-toolbar-left">
          <select id="led-account" style="width:200px" onchange="loadLedger()">
            <option value="">— Select Account —</option>
            ${APP.accountOptions()}
          </select>
          <input type="date" id="led-from" value="${monthStart}" style="width:140px" onchange="loadLedger()" />
          <input type="date" id="led-to" value="${today}" style="width:140px" onchange="loadLedger()" />
          <button class="btn-entry-reset" onclick="resetLedger()" title="Reset">↺</button>
          <label class="led-narration-toggle">
            <input type="checkbox" id="led-narration" checked onchange="toggleNarration(this)" />
            <span>Narration</span>
          </label>
        </div>
        <div class="ledger-toolbar-right">
          <button class="btn btn-outline btn-sm" onclick="exportLedger('pdf')">PDF</button>
          <button class="btn btn-outline btn-sm" onclick="exportLedger('excel')">CSV</button>
          <span class="led-balance-label">Total Balance:</span>
          <span id="led-total-balance" class="led-balance-value">—</span>
        </div>
      </div>

      <div class="ledger-subtoolbar">
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
          <p>Select an account to view the ledger.</p>
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
  const balEl = document.getElementById('led-total-balance');
  if (balEl) { balEl.textContent = '—'; balEl.style.color = ''; }
  document.getElementById('ledger-table-wrap').innerHTML = `
    <div class="empty-state"><div class="empty-icon">📖</div><p>Select an account to view the ledger.</p></div>`;
}

async function loadLedger() {
  const accountId = document.getElementById('led-account')?.value;
  if (!accountId) return;

  const wrap = document.getElementById('ledger-table-wrap');
  wrap.innerHTML = `<div class="loading"><span class="spinner"></span> Loading…</div>`;

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
    wrap.innerHTML = `<div class="alert alert-error" style="margin:1rem">${escHtml(e.message)}</div>`;
  }
}

function renderLedgerTable(rows, totals) {
  const wrap  = document.getElementById('ledger-table-wrap');
  const balEl = document.getElementById('led-total-balance');

  if (rows.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">📖</div><p>No entries found for this account in the selected period.</p></div>`;
    if (balEl) { balEl.textContent = '—'; balEl.style.color = ''; }
    return;
  }

  const accountId = parseInt(document.getElementById('led-account').value);
  const acc = APP.accounts.find(a => a.id === accountId);
  const opening = acc ? (acc.opening_amount || 0) : 0;

  let runningBal = opening;
  let totalCr = 0, totalDr = 0, totalBrok = 0;

  const processedRows = rows.map(r => {
    const isDebit  = r.entry_type === 'debit';
    const isCredit = r.entry_type === 'credit';
    // Use base amount for CR/DR display columns and totals
    const base    = parseFloat(r.tx_base_amount);
    const dispAmt = (!isNaN(base) && base !== 0) ? base : (parseFloat(r.amount) || 0);
    // Use commission-adjusted ledger amount for running balance
    const ledgerAmt = parseFloat(r.amount) || 0;
    const brok = parseFloat(r.brokerage) || 0;
    if (isCredit) { runningBal += ledgerAmt; totalCr += dispAmt; }
    else          { runningBal -= ledgerAmt; totalDr += dispAmt; }
    totalBrok += brok;
    return { ...r, isDebit, isCredit, runningBal };
  });

  const finalBal = runningBal;
  const balSign  = finalBal >= 0 ? 'Cr' : 'Dr';
  const balColor = finalBal >= 0 ? '#16a34a' : '#dc2626';
  if (balEl) { balEl.textContent = `${fmtAmt(Math.abs(finalBal))} ${balSign}`; balEl.style.color = balColor; }

  const narDisplay = showNarration ? '' : 'none';

  wrap.innerHTML = `
    <div style="overflow-x:auto">
      <table id="ledger-table" class="ledger-report-table rwd-table">
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
          <tr class="led-opening-row">
            <td data-label="Tran Id"></td><td data-label="Date"></td>
            <td data-label="Particular"><em>Opening Balance</em></td>
            <td class="led-narration-col" data-label="Narration" style="display:${narDisplay}"><em>Opening Balance</em></td>
            <td data-label="Brokerage"></td>
            <td data-label="Cr Amount" style="text-align:right;color:#16a34a">${opening >= 0 ? fmtAmt(opening) : ''}</td>
            <td data-label="Dr Amount" style="text-align:right;color:#dc2626">${opening < 0  ? fmtAmt(Math.abs(opening)) : ''}</td>
            <td data-label="Balance" style="text-align:right;font-weight:600">${fmtAmt(Math.abs(opening))} ${opening >= 0 ? 'Cr' : 'Dr'}</td>
            <td class="td-actions"></td>
          </tr>
          ${processedRows.map(r => {
            const balStr = `${fmtAmt(Math.abs(r.runningBal))} ${r.runningBal >= 0 ? 'Cr' : 'Dr'}`;
            const balC   = r.runningBal >= 0 ? '#16a34a' : '#dc2626';

            let actionBtn = '';
            if (APP.isOperator()) {
              actionBtn += `
                <div class="action-menu-wrap" style="display:inline-block">
                  <button class="btn-action-menu" onclick="toggleActionMenu(this)">···</button>
                  <div class="action-dropdown">
                    <button class="action-menu-item" onclick="editTransaction(${r.transaction_id}, loadLedger)">
                      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                      Edit
                    </button>`;
              if (r.is_locked) {
                if (APP.isAdmin()) {
                  actionBtn += `
                    <button class="action-menu-item" onclick="unlockLedgerEntry(${r.id})">
                      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h2c0-1.66 1.34-3 3-3s3 1.34 3 3v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6v-10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"/></svg>
                      Unlock
                    </button>`;
                }
              } else {
                actionBtn += `
                  <button class="action-menu-item" onclick="lockLedgerEntry(${r.id})">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
                    Lock
                  </button>`;
              }
              actionBtn += `</div></div>`;
            } else if (r.is_locked) {
              actionBtn = `<span class="badge badge-locked">Locked</span>`;
            }

            return `
              <tr id="ledger-row-${r.id}" class="${r.is_locked ? 'led-locked-row' : ''}">
                <td data-label="Tran Id" style="color:#4b9ef5;font-size:0.8rem">
                  ${r.transaction_id
                    ? `<a href="#" onclick="viewTransaction(${r.transaction_id});return false" style="color:#4b9ef5;text-decoration:none">${r.transaction_id}</a>`
                    : `<span style="color:#9ca3af">${r.id}</span>`}
                </td>
                <td data-label="Date" style="white-space:nowrap;color:#374151">${fmtDate(r.entry_date)}</td>
                <td data-label="Particular">${escHtml(r.particulars) || 'Transaction'}</td>
                <td class="led-narration-col" data-label="Narration" style="display:${narDisplay};color:#9ca3af;font-size:0.82rem">${escHtml(r.message) || ''}</td>
                <td data-label="Brokerage" style="text-align:right;color:#9ca3af">${r.brokerage ? fmtAmt(r.brokerage) : ''}</td>
                <td data-label="Cr Amount" style="text-align:right;color:#16a34a;font-weight:600">${r.isCredit ? renderAmtWithBreakdown(r, 'credit') : ''}</td>
                <td data-label="Dr Amount" style="text-align:right;color:#dc2626;font-weight:600">${r.isDebit  ? renderAmtWithBreakdown(r, 'debit')  : ''}</td>
                <td data-label="Balance" style="text-align:right;font-weight:600;color:${balC}">${balStr}</td>
                <td class="td-actions" style="text-align:center">${actionBtn}</td>
              </tr>`;
          }).join('')}
        </tbody>
        <tfoot>
          <tr class="led-total-row">
            <td colspan="3" style="text-align:right;font-weight:700;color:#374151">Total</td>
            <td class="led-narration-col" style="display:${narDisplay}"></td>
            <td data-label="Brokerage" style="text-align:right;font-weight:700;color:#9ca3af">${totalBrok ? fmtAmt(totalBrok) : ''}</td>
            <td data-label="Cr Amount" style="text-align:right;font-weight:700;color:#16a34a">${fmtAmt(totalCr)}</td>
            <td data-label="Dr Amount" style="text-align:right;font-weight:700;color:#dc2626">${fmtAmt(totalDr)}</td>
            <td data-label="Balance" style="text-align:right;font-weight:700;color:${balColor}">${fmtAmt(Math.abs(finalBal))} ${balSign}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
    <div style="padding:0.4rem 1rem;font-size:0.8rem;color:#9ca3af;border-top:1px solid #f5f6fa">${rows.length} entries</div>
  `;
}

function exportLedger(format) {
  const accountId = document.getElementById('led-account')?.value;
  if (!accountId) { toast('Select an account first', 'error'); return; }
  const q = API.buildQuery({
    account_id: accountId,
    type:       currentLedgerType === 'all' ? '' : currentLedgerType,
    date_from:  document.getElementById('led-from')?.value || '',
    date_to:    document.getElementById('led-to')?.value   || ''
  });
  window.open(`/api/export/ledger/${format}${q}`, '_blank');
}

async function lockLedgerEntry(entryId) {
  if (!confirm('Lock this entry? It will be marked as verified and cannot be edited without an admin unlock.')) return;
  try {
    await API.patch(`/api/trial-balance/entries/${entryId}/verify`, {});
    toast('Entry locked', 'success');
    loadLedger();
  } catch (e) { toast(e.message, 'error'); }
}

async function unlockLedgerEntry(entryId) {
  if (!confirm('Unlock this entry? The action will be recorded in the audit log.')) return;
  try {
    await API.patch(`/api/trial-balance/entries/${entryId}/unlock`, {});
    toast('Entry unlocked', 'success');
    loadLedger();
  } catch (e) { toast(e.message, 'error'); }
}

function renderAmtWithBreakdown(entry, side) {
  const total = parseFloat(entry.amount)         || 0;
  const comm  = parseFloat(entry.brokerage)      || 0;
  const base  = parseFloat(entry.tx_base_amount);
  // Always show base amount in the CR/DR column; brokerage is in its own column
  const display = (!isNaN(base) && base !== 0) ? base : total;
  return fmtAmt(display);
}
