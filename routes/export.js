const express = require('express');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const { pool } = require('../db');
const { requireLogin } = require('../middleware/auth');
const router = express.Router();

// ─── Helper: ledger data ──────────────────────────────────────────────────
async function getLedgerData(account_id, type, date_from, date_to) {
  let typeFilter;
  if (type === 'debit')       typeFilter = ['debit', 'commission_debit'];
  else if (type === 'credit') typeFilter = ['credit', 'commission_credit'];
  else                        typeFilter = ['debit', 'credit', 'commission_debit', 'commission_credit'];

  const params = [account_id, typeFilter];
  let sql = `
    SELECT le.*, u.username AS verified_by_name, a.account_name
    FROM ledger_entries le
    LEFT JOIN users u ON le.verified_by = u.id
    LEFT JOIN accounts a ON le.account_id = a.id
    WHERE le.account_id=$1 AND le.entry_type = ANY($2)
  `;
  if (date_from) { params.push(date_from); sql += ` AND le.entry_date >= $${params.length}`; }
  if (date_to)   { params.push(date_to);   sql += ` AND le.entry_date <= $${params.length}`; }
  sql += ` ORDER BY le.entry_date ASC, le.id ASC`;
  const { rows } = await pool.query(sql, params);
  return rows;
}

// ─── Helper: trial balance data ───────────────────────────────────────────
async function getTrialBalanceData(date_from, date_to) {
  const params = [];
  const df = date_from ? (params.push(date_from), `AND le.entry_date >= $${params.length}`) : '';
  const dt = date_to   ? (params.push(date_to),   `AND le.entry_date <= $${params.length}`) : '';

  const [accsRes, sumsRes] = await Promise.all([
    pool.query(`SELECT * FROM accounts WHERE is_active=1 ORDER BY account_name`),
    pool.query(`
      SELECT
        le.account_id,
        SUM(CASE WHEN le.entry_type IN ('debit','commission_debit')   THEN le.amount ELSE 0 END) AS debit_total,
        SUM(CASE WHEN le.entry_type IN ('credit','commission_credit') THEN le.amount ELSE 0 END) AS credit_total
      FROM ledger_entries le
      WHERE 1=1 ${df} ${dt}
      GROUP BY le.account_id
    `, params)
  ]);

  const sumsMap = {};
  sumsRes.rows.forEach(r => { sumsMap[r.account_id] = r; });

  return accsRes.rows.map(acc => {
    const opening    = acc.opening_amount || 0;
    const sums       = sumsMap[acc.id] || { debit_total: 0, credit_total: 0 };
    const debitTotal  = parseFloat(sums.debit_total)  || 0;
    const creditTotal = parseFloat(sums.credit_total) || 0;
    const net = opening + creditTotal - debitTotal;
    return {
      account_name:   acc.account_name,
      opening_credit: opening >= 0 ? opening : 0,
      opening_debit:  opening < 0  ? Math.abs(opening) : 0,
      closing_credit: net >= 0 ? net : 0,
      closing_debit:  net < 0  ? Math.abs(net) : 0
    };
  });
}

// ─── Helper: transactions data ────────────────────────────────────────────
async function getTransactionsData(query) {
  const { account, debit, credit, date_from, date_to, status } = query;
  let sql = `
    SELECT t.*, da.account_name AS debit_party_name, ca.account_name AS credit_party_name,
      u.username AS created_by_name
    FROM transactions t
    LEFT JOIN accounts da ON t.debit_party_id = da.id
    LEFT JOIN accounts ca ON t.credit_party_id = ca.id
    LEFT JOIN users u ON t.created_by = u.id
    WHERE 1=1
  `;
  const params = [];
  const p = () => `$${params.length}`;
  if (account)   { params.push(account);       sql += ` AND (t.debit_party_id=${p()} OR t.credit_party_id=${p()})`; params.push(account); }
  if (debit)     { params.push(debit);         sql += ` AND t.debit_party_id=${p()}`; }
  if (credit)    { params.push(credit);        sql += ` AND t.credit_party_id=${p()}`; }
  if (status)    { params.push(status);        sql += ` AND t.status=${p()}`; }
  if (date_from) { params.push(date_from);     sql += ` AND t.transaction_date>=${p()}`; }
  if (date_to)   { params.push(date_to);       sql += ` AND t.transaction_date<=${p()}`; }
  sql += ` ORDER BY t.transaction_date DESC, t.id DESC`;
  const { rows } = await pool.query(sql, params);
  return rows;
}

// ─── LEDGER PDF ──────────────────────────────────────────────────────────
router.get('/ledger/pdf', requireLogin, async (req, res) => {
  const { account_id, type, date_from, date_to } = req.query;
  if (!account_id) return res.status(400).json({ error: 'account_id required' });

  const acc = (await pool.query('SELECT * FROM accounts WHERE id=$1', [account_id])).rows[0];
  if (!acc) return res.status(404).json({ error: 'Account not found' });
  const rows = await getLedgerData(account_id, type, date_from, date_to);

  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="ledger_${acc.account_name}_${Date.now()}.pdf"`);
  doc.pipe(res);

  doc.fontSize(16).font('Helvetica-Bold').text('Transaction & Ledger Management System', { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(12).font('Helvetica').text(`${type === 'debit' ? 'Debit' : type === 'credit' ? 'Credit' : 'Full'} Ledger: ${acc.account_name}`, { align: 'center' });
  if (date_from || date_to) doc.fontSize(10).text(`Period: ${date_from||'Start'} to ${date_to||'End'}`, { align: 'center' });
  doc.moveDown(0.5);

  const cols = [40, 85, 200, 310, 420, 500];
  doc.fontSize(9).font('Helvetica-Bold');
  ['ID','Date','Particulars','Message','Brokerage','Amount'].forEach((h,i) =>
    doc.text(h, cols[i], doc.y, { width: cols[i+1] ? cols[i+1]-cols[i]-5 : 80 }));
  doc.moveDown(0.3);
  doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
  doc.moveDown(0.2);

  let tb = 0, ta = 0;
  doc.font('Helvetica').fontSize(8);
  rows.forEach(r => {
    const y = doc.y;
    doc.text(String(r.id), cols[0], y, {width:40});
    doc.text(r.entry_date, cols[1], y, {width:80});
    doc.text(r.particulars||'', cols[2], y, {width:100});
    doc.text(r.message||'', cols[3], y, {width:100});
    doc.text((r.brokerage||0).toFixed(2), cols[4], y, {width:75});
    doc.text((r.amount||0).toFixed(2), cols[5], y, {width:75});
    doc.moveDown(0.7);
    tb += r.brokerage||0; ta += r.amount||0;
  });
  doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke(); doc.moveDown(0.3);
  doc.font('Helvetica-Bold').fontSize(9);
  doc.text('TOTAL', cols[0], doc.y, {width:350});
  const ty = doc.y - doc.currentLineHeight();
  doc.text(tb.toFixed(2), cols[4], ty, {width:75});
  doc.text(ta.toFixed(2), cols[5], ty, {width:75});
  doc.end();
});

// ─── LEDGER EXCEL ─────────────────────────────────────────────────────────
router.get('/ledger/excel', requireLogin, async (req, res) => {
  const { account_id, type, date_from, date_to } = req.query;
  if (!account_id) return res.status(400).json({ error: 'account_id required' });

  const acc = (await pool.query('SELECT * FROM accounts WHERE id=$1', [account_id])).rows[0];
  if (!acc) return res.status(404).json({ error: 'Account not found' });
  const rows = await getLedgerData(account_id, type, date_from, date_to);

  const wb = new ExcelJS.Workbook(); wb.creator = 'TLMS';
  const ws = wb.addWorksheet('Ledger');
  ws.mergeCells('A1:F1');
  ws.getCell('A1').value = `${type==='debit'?'Debit':type==='credit'?'Credit':'Full'} Ledger: ${acc.account_name}`;
  ws.getCell('A1').font = { bold:true, size:14 };
  ws.getCell('A1').alignment = { horizontal:'center' };
  if (date_from||date_to) {
    ws.mergeCells('A2:F2');
    ws.getCell('A2').value = `Period: ${date_from||'Start'} to ${date_to||'End'}`;
    ws.getCell('A2').alignment = { horizontal:'center' };
  }
  ws.addRow([]);
  const hr = ws.addRow(['ID','Date','Particulars','Message','Brokerage','Amount']);
  hr.font = {bold:true};
  hr.eachCell(c => { c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFD9E1F2'}}; c.border={bottom:{style:'thin'}}; });

  let tb=0, ta=0;
  rows.forEach(r => {
    ws.addRow([r.id, r.entry_date, r.particulars||'', r.message||'',
      parseFloat((r.brokerage||0).toFixed(2)), parseFloat((r.amount||0).toFixed(2))]);
    tb += r.brokerage||0; ta += r.amount||0;
  });
  const tr = ws.addRow(['','','','TOTAL', parseFloat(tb.toFixed(2)), parseFloat(ta.toFixed(2))]);
  tr.font = {bold:true};
  ws.columns = [{width:8},{width:14},{width:35},{width:30},{width:14},{width:14}];

  res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition',`attachment; filename="ledger_${acc.account_name}_${Date.now()}.xlsx"`);
  await wb.xlsx.write(res); res.end();
});

// ─── TRIAL BALANCE PDF ────────────────────────────────────────────────────
router.get('/trial-balance/pdf', requireLogin, async (req, res) => {
  const { date_from, date_to } = req.query;
  const rows = await getTrialBalanceData(date_from, date_to);

  const doc = new PDFDocument({ margin:40, size:'A4', layout:'landscape' });
  res.setHeader('Content-Type','application/pdf');
  res.setHeader('Content-Disposition',`attachment; filename="trial_balance_${Date.now()}.pdf"`);
  doc.pipe(res);

  doc.fontSize(16).font('Helvetica-Bold').text('Trial Balance', {align:'center'});
  if (date_from||date_to) doc.fontSize(10).font('Helvetica').text(`Period: ${date_from||'Start'} to ${date_to||'End'}`, {align:'center'});
  doc.moveDown(0.5);

  const cols = [40,220,320,420,520];
  doc.fontSize(9).font('Helvetica-Bold');
  ['Account Name','Opening Credit','Opening Debit','Closing Credit','Closing Debit'].forEach((h,i) =>
    doc.text(h, cols[i], doc.y, {width:95}));
  doc.moveDown(0.3); doc.moveTo(40,doc.y).lineTo(760,doc.y).stroke(); doc.moveDown(0.2);

  let tOC=0,tOD=0,tCC=0,tCD=0;
  doc.font('Helvetica').fontSize(8);
  rows.forEach(r => {
    const y = doc.y;
    doc.text(r.account_name, cols[0], y, {width:175});
    doc.text(r.opening_credit.toFixed(2), cols[1], y, {width:95});
    doc.text(r.opening_debit.toFixed(2),  cols[2], y, {width:95});
    doc.text(r.closing_credit.toFixed(2), cols[3], y, {width:95});
    doc.text(r.closing_debit.toFixed(2),  cols[4], y, {width:95});
    doc.moveDown(0.7);
    tOC+=r.opening_credit; tOD+=r.opening_debit; tCC+=r.closing_credit; tCD+=r.closing_debit;
  });
  doc.moveTo(40,doc.y).lineTo(760,doc.y).stroke(); doc.moveDown(0.3);
  doc.font('Helvetica-Bold').fontSize(9);
  const ty=doc.y;
  ['TOTAL',tOC.toFixed(2),tOD.toFixed(2),tCC.toFixed(2),tCD.toFixed(2)].forEach((v,i) =>
    doc.text(v, cols[i]||cols[4], ty, {width:i===0?175:95}));
  doc.end();
});

// ─── TRIAL BALANCE EXCEL ──────────────────────────────────────────────────
router.get('/trial-balance/excel', requireLogin, async (req, res) => {
  const { date_from, date_to } = req.query;
  const rows = await getTrialBalanceData(date_from, date_to);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Trial Balance');
  ws.mergeCells('A1:E1'); ws.getCell('A1').value='Trial Balance';
  ws.getCell('A1').font={bold:true,size:14}; ws.getCell('A1').alignment={horizontal:'center'};
  if (date_from||date_to) {
    ws.mergeCells('A2:E2');
    ws.getCell('A2').value=`Period: ${date_from||'Start'} to ${date_to||'End'}`;
    ws.getCell('A2').alignment={horizontal:'center'};
  }
  ws.addRow([]);
  const hr=ws.addRow(['Account Name','Opening Credit','Opening Debit','Closing Credit','Closing Debit']);
  hr.font={bold:true};
  hr.eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFD9E1F2'}};c.border={bottom:{style:'thin'}};});
  let tOC=0,tOD=0,tCC=0,tCD=0;
  rows.forEach(r=>{
    ws.addRow([r.account_name,parseFloat(r.opening_credit.toFixed(2)),parseFloat(r.opening_debit.toFixed(2)),
      parseFloat(r.closing_credit.toFixed(2)),parseFloat(r.closing_debit.toFixed(2))]);
    tOC+=r.opening_credit;tOD+=r.opening_debit;tCC+=r.closing_credit;tCD+=r.closing_debit;
  });
  const tr=ws.addRow(['TOTAL',parseFloat(tOC.toFixed(2)),parseFloat(tOD.toFixed(2)),parseFloat(tCC.toFixed(2)),parseFloat(tCD.toFixed(2))]);
  tr.font={bold:true};
  ws.columns=[{width:35},{width:18},{width:18},{width:18},{width:18}];

  res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition',`attachment; filename="trial_balance_${Date.now()}.xlsx"`);
  await wb.xlsx.write(res); res.end();
});

// ─── TRANSACTIONS LIST PDF ────────────────────────────────────────────────
router.get('/transactions/pdf', requireLogin, async (req, res) => {
  const rows = await getTransactionsData(req.query);
  const { date_from, date_to } = req.query;

  const doc = new PDFDocument({ margin:30, size:'A4', layout:'landscape' });
  res.setHeader('Content-Type','application/pdf');
  res.setHeader('Content-Disposition',`attachment; filename="transactions_${Date.now()}.pdf"`);
  doc.pipe(res);

  doc.fontSize(15).font('Helvetica-Bold').text('Transaction & Ledger Management System',{align:'center'});
  doc.moveDown(0.2);
  doc.fontSize(11).font('Helvetica').text('Transactions List',{align:'center'});
  if (date_from||date_to) doc.fontSize(9).text(`Period: ${date_from||'Start'} to ${date_to||'End'}`,{align:'center'});
  doc.moveDown(0.5);

  const cols=[30,130,200,310,420,490,545,600];
  const widths=[95,65,105,105,65,50,50,75];
  doc.fontSize(8).font('Helvetica-Bold');
  ['Voucher #','Date','Debit Party','Credit Party','Amount','D.Comm','C.Comm','Status'].forEach((h,i)=>
    doc.text(h,cols[i],doc.y,{width:widths[i]}));
  doc.moveDown(0.3); doc.moveTo(30,doc.y).lineTo(780,doc.y).stroke(); doc.moveDown(0.2);

  let tA=0,tDC=0,tCC=0;
  doc.font('Helvetica').fontSize(7.5);
  rows.forEach(r=>{
    if(doc.y>530) doc.addPage();
    const y=doc.y;
    doc.text(r.voucher_number||'',cols[0],y,{width:widths[0]});
    doc.text(r.transaction_date||'',cols[1],y,{width:widths[1]});
    doc.text(r.debit_party_name||'-',cols[2],y,{width:widths[2]});
    doc.text(r.credit_party_name||'-',cols[3],y,{width:widths[3]});
    doc.text((r.amount||0).toFixed(2),cols[4],y,{width:widths[4]});
    doc.text((r.debit_commission||0).toFixed(2),cols[5],y,{width:widths[5]});
    doc.text((r.credit_commission||0).toFixed(2),cols[6],y,{width:widths[6]});
    doc.text(r.status||'',cols[7],y,{width:widths[7]});
    doc.moveDown(0.65);
    tA+=r.amount||0; tDC+=r.debit_commission||0; tCC+=r.credit_commission||0;
  });
  doc.moveTo(30,doc.y).lineTo(780,doc.y).stroke(); doc.moveDown(0.3);
  doc.font('Helvetica-Bold').fontSize(8);
  const ty=doc.y;
  doc.text('TOTAL',cols[0],ty,{width:350});
  doc.text(tA.toFixed(2),cols[4],ty,{width:widths[4]});
  doc.text(tDC.toFixed(2),cols[5],ty,{width:widths[5]});
  doc.text(tCC.toFixed(2),cols[6],ty,{width:widths[6]});
  doc.end();
});

// ─── TRANSACTIONS LIST EXCEL ──────────────────────────────────────────────
router.get('/transactions/excel', requireLogin, async (req, res) => {
  const rows = await getTransactionsData(req.query);
  const { date_from, date_to } = req.query;

  const wb = new ExcelJS.Workbook(); wb.creator='TLMS';
  const ws = wb.addWorksheet('Transactions');
  ws.mergeCells('A1:N1'); ws.getCell('A1').value='Transactions List';
  ws.getCell('A1').font={bold:true,size:14}; ws.getCell('A1').alignment={horizontal:'center'};
  if (date_from||date_to) {
    ws.mergeCells('A2:N2');
    ws.getCell('A2').value=`Period: ${date_from||'Start'} to ${date_to||'End'}`;
    ws.getCell('A2').alignment={horizontal:'center'};
  }
  ws.addRow([]);
  const hr=ws.addRow(['Voucher #','Date','City','Debit Party','Credit Party','Amount',
    'D.Rate%','D.Comm','C.Rate%','C.Comm','Status','Created By','Remarks','Message']);
  hr.font={bold:true};
  hr.eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1E3A5F'}};c.font={bold:true,color:{argb:'FFFFFFFF'}};c.border={bottom:{style:'thin'}};});

  let tA=0,tDC=0,tCC=0;
  rows.forEach(r=>{
    ws.addRow([r.voucher_number,r.transaction_date,r.transaction_city||'',
      r.debit_party_name||'',r.credit_party_name||'',
      parseFloat((r.amount||0).toFixed(2)),parseFloat((r.debit_rate||0).toFixed(2)),
      parseFloat((r.debit_commission||0).toFixed(2)),parseFloat((r.credit_rate||0).toFixed(2)),
      parseFloat((r.credit_commission||0).toFixed(2)),r.status,r.created_by_name||'',r.remarks||'',r.message||'']);
    tA+=r.amount||0; tDC+=r.debit_commission||0; tCC+=r.credit_commission||0;
  });
  const tr=ws.addRow(['TOTAL','','','','',parseFloat(tA.toFixed(2)),'',parseFloat(tDC.toFixed(2)),'',parseFloat(tCC.toFixed(2)),'','','','']);
  tr.font={bold:true};
  ws.columns=[{width:22},{width:14},{width:18},{width:25},{width:25},{width:14},{width:12},{width:18},{width:12},{width:18},{width:22},{width:16},{width:25},{width:30}];

  res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition',`attachment; filename="transactions_${Date.now()}.xlsx"`);
  await wb.xlsx.write(res); res.end();
});

// ─── SINGLE TRANSACTION VOUCHER PDF ──────────────────────────────────────
router.get('/transaction/pdf', requireLogin, async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Transaction id required' });

  const tx = (await pool.query(`
    SELECT t.*, da.account_name AS debit_party_name, ca.account_name AS credit_party_name
    FROM transactions t
    LEFT JOIN accounts da ON t.debit_party_id=da.id
    LEFT JOIN accounts ca ON t.credit_party_id=ca.id
    WHERE t.id=$1
  `, [id])).rows[0];
  if (!tx) return res.status(404).json({ error: 'Transaction not found' });

  const doc = new PDFDocument({ margin:50, size:'A4' });
  res.setHeader('Content-Type','application/pdf');
  res.setHeader('Content-Disposition',`attachment; filename="voucher_${tx.voucher_number}.pdf"`);
  doc.pipe(res);

  doc.fontSize(18).font('Helvetica-Bold').text('Transaction & Ledger Management System',{align:'center'});
  doc.moveDown(0.2);
  doc.fontSize(12).font('Helvetica').text('Transaction Voucher',{align:'center'});
  doc.moveDown(0.5);
  doc.moveTo(50,doc.y).lineTo(545,doc.y).stroke();
  doc.moveDown(0.5);

  const field=(label,value)=>{
    doc.fontSize(10).font('Helvetica-Bold').text(`${label}: `,{continued:true})
      .font('Helvetica').text(String(value||'-'));
  };
  field('Voucher Number',tx.voucher_number);
  field('Date',tx.transaction_date);
  field('Status',tx.status);
  doc.moveDown(0.3);
  field('Transaction City',tx.transaction_city);
  field('Token Details',tx.token_details);
  field('Amount',tx.amount?(+tx.amount).toFixed(2):'0.00');
  field('Wallet City',tx.wallet_city);
  doc.moveDown(0.3);
  field('Debit Party',tx.debit_party_name);
  field('Debit Rate',`${tx.debit_rate||0}%`);
  field('Debit Commission',tx.debit_commission?(+tx.debit_commission).toFixed(2):'0.00');
  doc.moveDown(0.3);
  field('Credit Party',tx.credit_party_name);
  field('Credit Wallet City',tx.credit_wallet_city);
  field('Credit Rate',`${tx.credit_rate||0}%`);
  field('Credit Commission',tx.credit_commission?(+tx.credit_commission).toFixed(2):'0.00');
  doc.moveDown(0.3);
  field('Remarks',tx.remarks);
  field('Message',tx.message);
  doc.end();
});

module.exports = router;
