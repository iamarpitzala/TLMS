const express = require('express');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const { db } = require('../db');
const { requireLogin } = require('../middleware/auth');
const router = express.Router();

// ─── Helper: Ledger data ───────────────────────────────────────────────────
function getLedgerData(account_id, type, date_from, date_to) {
  let typeFilter = [];
  if (type === 'debit') typeFilter = ['debit', 'commission_debit'];
  else if (type === 'credit') typeFilter = ['credit', 'commission_credit'];
  else typeFilter = ['debit', 'credit', 'commission_debit', 'commission_credit'];

  const ph = typeFilter.map(() => '?').join(',');
  let sql = `
    SELECT le.*, u.username AS verified_by_name,
      a.account_name
    FROM ledger_entries le
    LEFT JOIN users u ON le.verified_by = u.id
    LEFT JOIN accounts a ON le.account_id = a.id
    WHERE le.account_id = ? AND le.entry_type IN (${ph})
  `;
  const params = [account_id, ...typeFilter];
  if (date_from) { sql += ` AND le.entry_date >= ?`; params.push(date_from); }
  if (date_to) { sql += ` AND le.entry_date <= ?`; params.push(date_to); }
  sql += ` ORDER BY le.entry_date ASC, le.id ASC`;
  return db.prepare(sql).all(...params);
}

// ─── Helper: Trial balance data ────────────────────────────────────────────
function getTrialBalanceData(date_from, date_to) {
  const accounts = db.prepare(`SELECT * FROM accounts WHERE is_active = 1 ORDER BY account_name`).all();
  return accounts.map(acc => {
    const opening = acc.opening_amount || 0;
    const debitSum = db.prepare(`
      SELECT COALESCE(SUM(amount),0) AS total FROM ledger_entries
      WHERE account_id=? AND entry_type IN ('debit','commission_debit')
      ${date_from ? "AND entry_date >= '" + date_from + "'" : ''}
      ${date_to ? "AND entry_date <= '" + date_to + "'" : ''}
    `).get(acc.id).total;
    const creditSum = db.prepare(`
      SELECT COALESCE(SUM(amount),0) AS total FROM ledger_entries
      WHERE account_id=? AND entry_type IN ('credit','commission_credit')
      ${date_from ? "AND entry_date >= '" + date_from + "'" : ''}
      ${date_to ? "AND entry_date <= '" + date_to + "'" : ''}
    `).get(acc.id).total;
    const net = opening + creditSum - debitSum;
    return {
      account_name: acc.account_name,
      opening_credit: opening >= 0 ? opening : 0,
      opening_debit: opening < 0 ? Math.abs(opening) : 0,
      closing_credit: net >= 0 ? net : 0,
      closing_debit: net < 0 ? Math.abs(net) : 0
    };
  });
}

// ─── LEDGER PDF ─────────────────────────────────────────────────────────────
router.get('/ledger/pdf', requireLogin, (req, res) => {
  const { account_id, type, date_from, date_to } = req.query;
  if (!account_id) return res.status(400).json({ error: 'account_id required' });

  const acc = db.prepare('SELECT * FROM accounts WHERE id=?').get(account_id);
  if (!acc) return res.status(404).json({ error: 'Account not found' });

  const rows = getLedgerData(account_id, type, date_from, date_to);

  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="ledger_${acc.account_name}_${Date.now()}.pdf"`);
  doc.pipe(res);

  // Title
  doc.fontSize(16).font('Helvetica-Bold').text('Transaction & Ledger Management System', { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(12).font('Helvetica').text(`${type === 'debit' ? 'Debit' : type === 'credit' ? 'Credit' : 'Full'} Ledger: ${acc.account_name}`, { align: 'center' });
  if (date_from || date_to) {
    doc.fontSize(10).text(`Period: ${date_from || 'Start'} to ${date_to || 'End'}`, { align: 'center' });
  }
  doc.moveDown(0.5);

  // Table header
  const cols = [40, 85, 200, 310, 420, 500];
  const headers = ['ID', 'Date', 'Particulars', 'Message', 'Brokerage', 'Amount'];
  doc.fontSize(9).font('Helvetica-Bold');
  headers.forEach((h, i) => doc.text(h, cols[i], doc.y, { width: cols[i + 1] ? cols[i + 1] - cols[i] - 5 : 80 }));
  doc.moveDown(0.3);
  doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
  doc.moveDown(0.2);

  // Rows
  let totalBrok = 0, totalAmt = 0;
  doc.font('Helvetica').fontSize(8);
  rows.forEach(r => {
    const y = doc.y;
    doc.text(String(r.id), cols[0], y, { width: 40 });
    doc.text(r.entry_date, cols[1], y, { width: 80 });
    doc.text(r.particulars || '', cols[2], y, { width: 100 });
    doc.text(r.message || '', cols[3], y, { width: 100 });
    doc.text((r.brokerage || 0).toFixed(2), cols[4], y, { width: 75 });
    doc.text((r.amount || 0).toFixed(2), cols[5], y, { width: 75 });
    doc.moveDown(0.7);
    totalBrok += r.brokerage || 0;
    totalAmt += r.amount || 0;
  });

  doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
  doc.moveDown(0.3);
  doc.font('Helvetica-Bold').fontSize(9);
  doc.text('TOTAL', cols[0], doc.y, { width: 350 });
  const ty = doc.y - doc.currentLineHeight();
  doc.text(totalBrok.toFixed(2), cols[4], ty, { width: 75 });
  doc.text(totalAmt.toFixed(2), cols[5], ty, { width: 75 });

  doc.end();
});

// ─── LEDGER EXCEL ──────────────────────────────────────────────────────────
router.get('/ledger/excel', requireLogin, async (req, res) => {
  const { account_id, type, date_from, date_to } = req.query;
  if (!account_id) return res.status(400).json({ error: 'account_id required' });

  const acc = db.prepare('SELECT * FROM accounts WHERE id=?').get(account_id);
  if (!acc) return res.status(404).json({ error: 'Account not found' });

  const rows = getLedgerData(account_id, type, date_from, date_to);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'TLMS';
  const ws = wb.addWorksheet('Ledger');

  ws.mergeCells('A1:F1');
  ws.getCell('A1').value = `${type === 'debit' ? 'Debit' : type === 'credit' ? 'Credit' : 'Full'} Ledger: ${acc.account_name}`;
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.getCell('A1').alignment = { horizontal: 'center' };

  if (date_from || date_to) {
    ws.mergeCells('A2:F2');
    ws.getCell('A2').value = `Period: ${date_from || 'Start'} to ${date_to || 'End'}`;
    ws.getCell('A2').alignment = { horizontal: 'center' };
  }

  ws.addRow([]);
  const headerRow = ws.addRow(['ID', 'Date', 'Particulars', 'Message', 'Brokerage', 'Amount']);
  headerRow.font = { bold: true };
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
    cell.border = { bottom: { style: 'thin' } };
  });

  let totalBrok = 0, totalAmt = 0;
  rows.forEach(r => {
    ws.addRow([r.id, r.entry_date, r.particulars || '', r.message || '',
      parseFloat((r.brokerage || 0).toFixed(2)),
      parseFloat((r.amount || 0).toFixed(2))]);
    totalBrok += r.brokerage || 0;
    totalAmt += r.amount || 0;
  });

  const totalRow = ws.addRow(['', '', '', 'TOTAL',
    parseFloat(totalBrok.toFixed(2)),
    parseFloat(totalAmt.toFixed(2))]);
  totalRow.font = { bold: true };

  ws.columns = [
    { key: 'id', width: 8 }, { key: 'date', width: 14 },
    { key: 'particulars', width: 35 }, { key: 'message', width: 30 },
    { key: 'brokerage', width: 14 }, { key: 'amount', width: 14 }
  ];

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="ledger_${acc.account_name}_${Date.now()}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

// ─── TRIAL BALANCE PDF ─────────────────────────────────────────────────────
router.get('/trial-balance/pdf', requireLogin, (req, res) => {
  const { date_from, date_to } = req.query;
  const rows = getTrialBalanceData(date_from, date_to);

  const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="trial_balance_${Date.now()}.pdf"`);
  doc.pipe(res);

  doc.fontSize(16).font('Helvetica-Bold').text('Trial Balance', { align: 'center' });
  if (date_from || date_to) {
    doc.fontSize(10).font('Helvetica').text(`Period: ${date_from || 'Start'} to ${date_to || 'End'}`, { align: 'center' });
  }
  doc.moveDown(0.5);

  const cols = [40, 220, 320, 420, 520, 620];
  const headers = ['Account Name', 'Opening Credit', 'Opening Debit', 'Closing Credit', 'Closing Debit'];
  doc.fontSize(9).font('Helvetica-Bold');
  headers.forEach((h, i) => doc.text(h, cols[i], doc.y, { width: 95 }));
  doc.moveDown(0.3);
  doc.moveTo(40, doc.y).lineTo(760, doc.y).stroke();
  doc.moveDown(0.2);

  doc.font('Helvetica').fontSize(8);
  let totOC = 0, totOD = 0, totCC = 0, totCD = 0;
  rows.forEach(r => {
    const y = doc.y;
    doc.text(r.account_name, cols[0], y, { width: 175 });
    doc.text(r.opening_credit.toFixed(2), cols[1], y, { width: 95 });
    doc.text(r.opening_debit.toFixed(2), cols[2], y, { width: 95 });
    doc.text(r.closing_credit.toFixed(2), cols[3], y, { width: 95 });
    doc.text(r.closing_debit.toFixed(2), cols[4], y, { width: 95 });
    doc.moveDown(0.7);
    totOC += r.opening_credit; totOD += r.opening_debit;
    totCC += r.closing_credit; totCD += r.closing_debit;
  });

  doc.moveTo(40, doc.y).lineTo(760, doc.y).stroke();
  doc.moveDown(0.3);
  doc.font('Helvetica-Bold').fontSize(9);
  const ty = doc.y;
  doc.text('TOTAL', cols[0], ty, { width: 175 });
  doc.text(totOC.toFixed(2), cols[1], ty, { width: 95 });
  doc.text(totOD.toFixed(2), cols[2], ty, { width: 95 });
  doc.text(totCC.toFixed(2), cols[3], ty, { width: 95 });
  doc.text(totCD.toFixed(2), cols[4], ty, { width: 95 });

  doc.end();
});

// ─── TRIAL BALANCE EXCEL ──────────────────────────────────────────────────
router.get('/trial-balance/excel', requireLogin, async (req, res) => {
  const { date_from, date_to } = req.query;
  const rows = getTrialBalanceData(date_from, date_to);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Trial Balance');

  ws.mergeCells('A1:E1');
  ws.getCell('A1').value = 'Trial Balance';
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.getCell('A1').alignment = { horizontal: 'center' };

  if (date_from || date_to) {
    ws.mergeCells('A2:E2');
    ws.getCell('A2').value = `Period: ${date_from || 'Start'} to ${date_to || 'End'}`;
    ws.getCell('A2').alignment = { horizontal: 'center' };
  }

  ws.addRow([]);
  const hr = ws.addRow(['Account Name', 'Opening Credit', 'Opening Debit', 'Closing Credit', 'Closing Debit']);
  hr.font = { bold: true };
  hr.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
    c.border = { bottom: { style: 'thin' } };
  });

  let tOC = 0, tOD = 0, tCC = 0, tCD = 0;
  rows.forEach(r => {
    ws.addRow([r.account_name,
      parseFloat(r.opening_credit.toFixed(2)),
      parseFloat(r.opening_debit.toFixed(2)),
      parseFloat(r.closing_credit.toFixed(2)),
      parseFloat(r.closing_debit.toFixed(2))]);
    tOC += r.opening_credit; tOD += r.opening_debit;
    tCC += r.closing_credit; tCD += r.closing_debit;
  });

  const tr = ws.addRow(['TOTAL',
    parseFloat(tOC.toFixed(2)), parseFloat(tOD.toFixed(2)),
    parseFloat(tCC.toFixed(2)), parseFloat(tCD.toFixed(2))]);
  tr.font = { bold: true };

  ws.columns = [
    { width: 35 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }
  ];

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="trial_balance_${Date.now()}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

// ─── TRANSACTION PDF ──────────────────────────────────────────────────────
router.get('/transaction/pdf', requireLogin, (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Transaction id required' });

  const tx = db.prepare(`
    SELECT t.*, da.account_name AS debit_party_name, ca.account_name AS credit_party_name
    FROM transactions t
    LEFT JOIN accounts da ON t.debit_party_id = da.id
    LEFT JOIN accounts ca ON t.credit_party_id = ca.id
    WHERE t.id = ?
  `).get(id);
  if (!tx) return res.status(404).json({ error: 'Transaction not found' });

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="voucher_${tx.voucher_number}.pdf"`);
  doc.pipe(res);

  doc.fontSize(18).font('Helvetica-Bold').text('Transaction & Ledger Management System', { align: 'center' });
  doc.moveDown(0.2);
  doc.fontSize(12).font('Helvetica').text('Transaction Voucher', { align: 'center' });
  doc.moveDown(0.5);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(0.5);

  const field = (label, value) => {
    doc.fontSize(10).font('Helvetica-Bold').text(`${label}: `, { continued: true })
      .font('Helvetica').text(String(value || '-'));
  };

  field('Voucher Number', tx.voucher_number);
  field('Date', tx.transaction_date);
  field('Status', tx.status);
  doc.moveDown(0.3);
  field('Transaction City', tx.transaction_city);
  field('Token Details', tx.token_details);
  field('Amount', tx.amount ? tx.amount.toFixed(2) : '0.00');
  field('Wallet City', tx.wallet_city);
  doc.moveDown(0.3);
  field('Debit Party', tx.debit_party_name);
  field('Debit Rate', `${tx.debit_rate || 0}%`);
  field('Debit Commission', tx.debit_commission ? tx.debit_commission.toFixed(2) : '0.00');
  doc.moveDown(0.3);
  field('Credit Party', tx.credit_party_name);
  field('Credit Wallet City', tx.credit_wallet_city);
  field('Credit Rate', `${tx.credit_rate || 0}%`);
  field('Credit Commission', tx.credit_commission ? tx.credit_commission.toFixed(2) : '0.00');
  doc.moveDown(0.3);
  field('Remarks', tx.remarks);
  field('Message', tx.message);

  doc.end();
});

module.exports = router;
