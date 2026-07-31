const express = require('express');
const { db, nextVoucherNumber, istDate } = require('../db');
const { requireLogin, requireOperator } = require('../middleware/auth');
const audit = require('../middleware/audit');
const router = express.Router();

// GET /api/transactions — search/list
router.get('/', requireLogin, (req, res) => {
  const { account, debit, credit, amount, city, date_from, date_to, status, page = 1, limit = 50 } = req.query;
  let sql = `
    SELECT t.*,
      da.account_name AS debit_party_name,
      ca.account_name AS credit_party_name,
      u.username  AS created_by_name,
      v.username  AS verified_by_name
    FROM transactions t
    LEFT JOIN accounts da ON t.debit_party_id  = da.id
    LEFT JOIN accounts ca ON t.credit_party_id = ca.id
    LEFT JOIN users u ON t.created_by  = u.id
    LEFT JOIN users v ON t.verified_by = v.id
    WHERE 1=1
  `;
  const params = [];

  if (account)   { sql += ` AND (t.debit_party_id = ? OR t.credit_party_id = ?)`; params.push(account, account); }
  if (debit)     { sql += ` AND t.debit_party_id = ?`;   params.push(debit); }
  if (credit)    { sql += ` AND t.credit_party_id = ?`;  params.push(credit); }
  if (amount)    { sql += ` AND t.amount = ?`;            params.push(parseFloat(amount)); }
  if (status)    { sql += ` AND t.status = ?`;            params.push(status); }
  if (city) {
    sql += ` AND (t.transaction_city LIKE ? OR t.wallet_city LIKE ? OR t.credit_wallet_city LIKE ?)`;
    const like = `%${city}%`;
    params.push(like, like, like);
  }
  if (date_from) { sql += ` AND t.transaction_date >= ?`; params.push(date_from); }
  if (date_to)   { sql += ` AND t.transaction_date <= ?`; params.push(date_to); }

  sql += ` ORDER BY t.transaction_date DESC, t.id DESC`;

  const offset   = (parseInt(page) - 1) * parseInt(limit);
  const countSql = sql.replace(/SELECT t\.\*.*?FROM transactions t/s, 'SELECT COUNT(*) as total FROM transactions t');
  const total    = db.prepare(countSql).get(...params);
  sql           += ` LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), offset);

  const rows = db.prepare(sql).all(...params);
  res.json({ data: rows, total: total ? total.total : 0, page: parseInt(page), limit: parseInt(limit) });
});

// GET /api/transactions/:id
router.get('/:id', requireLogin, (req, res) => {
  const row = db.prepare(`
    SELECT t.*,
      da.account_name AS debit_party_name,
      ca.account_name AS credit_party_name,
      u.username AS created_by_name,
      v.username AS verified_by_name
    FROM transactions t
    LEFT JOIN accounts da ON t.debit_party_id  = da.id
    LEFT JOIN accounts ca ON t.credit_party_id = ca.id
    LEFT JOIN users u ON t.created_by  = u.id
    LEFT JOIN users v ON t.verified_by = v.id
    WHERE t.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Transaction not found' });
  res.json(row);
});

// POST /api/transactions — create (status = Pending Verification, NO ledger entries yet)
router.post('/', requireOperator, (req, res) => {
  const {
    transaction_date, transaction_city, token_details, amount,
    wallet_city, debit_party_id, debit_rate, remarks, message,
    credit_wallet_city, credit_party_id, credit_rate
  } = req.body;

  if (!amount || isNaN(parseFloat(amount))) {
    return res.status(400).json({ error: 'Amount is required and must be a number' });
  }
  if (!debit_party_id || !credit_party_id) {
    return res.status(400).json({ error: 'Debit Party and Credit Party are required' });
  }

  const amt    = parseFloat(amount);
  const dRate  = parseFloat(debit_rate)  || 0;
  const cRate  = parseFloat(credit_rate) || 0;
  const dComm  = parseFloat((amt * dRate / 100).toFixed(2));
  const cComm  = parseFloat((amt * cRate / 100).toFixed(2));
  const txDate = transaction_date || istDate();

  const debitAccount  = db.prepare('SELECT * FROM accounts WHERE id = ? AND is_active = 1').get(debit_party_id);
  const creditAccount = db.prepare('SELECT * FROM accounts WHERE id = ? AND is_active = 1').get(credit_party_id);

  if (!debitAccount)  return res.status(400).json({ error: 'Debit Party account not found or inactive' });
  if (!creditAccount) return res.status(400).json({ error: 'Credit Party account not found or inactive' });

  const voucherNumber = nextVoucherNumber();

  try {
    const result = db.prepare(`
      INSERT INTO transactions(
        voucher_number, transaction_date, transaction_city, token_details, amount,
        wallet_city, debit_party_id, debit_rate, debit_commission,
        remarks, message, credit_wallet_city, credit_party_id, credit_rate, credit_commission,
        status, created_by
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'Pending Verification',?)
    `).run(
      voucherNumber, txDate, transaction_city || null, token_details || null, amt,
      wallet_city || null, debit_party_id, dRate, dComm,
      remarks || null, message || null, credit_wallet_city || null, credit_party_id, cRate, cComm,
      req.session.user.id
    );

    const txId   = result.lastInsertRowid;
    const created = db.prepare(`
      SELECT t.*, da.account_name AS debit_party_name, ca.account_name AS credit_party_name
      FROM transactions t
      LEFT JOIN accounts da ON t.debit_party_id  = da.id
      LEFT JOIN accounts ca ON t.credit_party_id = ca.id
      WHERE t.id = ?
    `).get(txId);

    audit(req, 'create', 'transactions', txId, null, {
      voucher_number:    voucherNumber,
      amount:            amt,
      debit_party:       debitAccount.account_name,
      credit_party:      creditAccount.account_name,
      debit_commission:  dComm,
      credit_commission: cComm,
      status:            'Pending Verification'
    });

    res.status(201).json(created);
  } catch (err) {
    console.error('Transaction save error:', err);
    res.status(500).json({ error: 'Failed to save transaction: ' + err.message });
  }
});

// PATCH /api/transactions/:id/verify
// Stage 1 verification: operator verifies the transaction.
// This creates the ledger entries and moves status to 'Verified'.
// The ledger entries then appear in Trial Balance for Stage 2 verification.
router.patch('/:id/verify', requireOperator, (req, res) => {
  const tx = db.prepare(`
    SELECT t.*, da.account_name AS debit_party_name, ca.account_name AS credit_party_name
    FROM transactions t
    LEFT JOIN accounts da ON t.debit_party_id  = da.id
    LEFT JOIN accounts ca ON t.credit_party_id = ca.id
    WHERE t.id = ?
  `).get(req.params.id);

  if (!tx) return res.status(404).json({ error: 'Transaction not found' });
  if (tx.status === 'Verified') return res.status(400).json({ error: 'Transaction is already verified' });

  const verifyAll = db.transaction(() => {
    // 1. Mark transaction verified
    db.prepare(`
      UPDATE transactions
      SET status='Verified', verified_by=?, verified_at=now_ist()
      WHERE id=?
    `).run(req.session.user.id, tx.id);

    // 2. Create ledger entries — these will now appear in Trial Balance
    db.prepare(`
      INSERT INTO ledger_entries(account_id, transaction_id, entry_date, entry_type, particulars, message, brokerage, amount)
      VALUES(?,?,?,?,?,?,?,?)
    `).run(
      tx.debit_party_id, tx.id, tx.transaction_date, 'debit',
      `Txn to ${tx.credit_party_name} [${tx.voucher_number}]`,
      tx.message || null, tx.debit_commission, tx.amount
    );

    db.prepare(`
      INSERT INTO ledger_entries(account_id, transaction_id, entry_date, entry_type, particulars, message, brokerage, amount)
      VALUES(?,?,?,?,?,?,?,?)
    `).run(
      tx.credit_party_id, tx.id, tx.transaction_date, 'credit',
      `Txn from ${tx.debit_party_name} [${tx.voucher_number}]`,
      tx.message || null, tx.credit_commission, tx.amount
    );

    if (tx.debit_commission > 0) {
      db.prepare(`
        INSERT INTO ledger_entries(account_id, transaction_id, entry_date, entry_type, particulars, message, brokerage, amount)
        VALUES(?,?,?,?,?,?,?,?)
      `).run(
        tx.debit_party_id, tx.id, tx.transaction_date, 'commission_debit',
        `Commission [${tx.voucher_number}]`, null, tx.debit_commission, tx.debit_commission
      );
    }

    if (tx.credit_commission > 0) {
      db.prepare(`
        INSERT INTO ledger_entries(account_id, transaction_id, entry_date, entry_type, particulars, message, brokerage, amount)
        VALUES(?,?,?,?,?,?,?,?)
      `).run(
        tx.credit_party_id, tx.id, tx.transaction_date, 'commission_credit',
        `Commission [${tx.voucher_number}]`, null, tx.credit_commission, tx.credit_commission
      );
    }
  });

  try {
    verifyAll();

    audit(req, 'verify_transaction', 'transactions', tx.id,
      { status: 'Pending Verification' },
      {
        status:        'Verified',
        voucher_number: tx.voucher_number,
        amount:         tx.amount,
        debit_party:    tx.debit_party_name,
        credit_party:   tx.credit_party_name
      }
    );

    const updated = db.prepare(`
      SELECT t.*, da.account_name AS debit_party_name, ca.account_name AS credit_party_name,
        v.username AS verified_by_name
      FROM transactions t
      LEFT JOIN accounts da ON t.debit_party_id  = da.id
      LEFT JOIN accounts ca ON t.credit_party_id = ca.id
      LEFT JOIN users v ON t.verified_by = v.id
      WHERE t.id = ?
    `).get(tx.id);

    res.json(updated);
  } catch (err) {
    console.error('Verify transaction error:', err);
    res.status(500).json({ error: 'Failed to verify transaction: ' + err.message });
  }
});

module.exports = router;
