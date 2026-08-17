const express = require('express');
const { pool, nextVoucherNumber, istDate, istTimestamp } = require('../db');
const { requireLogin, requireOperator } = require('../middleware/auth');
const audit = require('../middleware/audit');
const router = express.Router();

// GET /api/transactions
router.get('/', requireLogin, async (req, res) => {
  try {
    const { account, debit, credit, amount, city, search, date_from, date_to, status, page = 1, limit = 50 } = req.query;
    let sql = `
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
      WHERE 1=1
    `;
    const params = [];
    const add = (val) => { params.push(val); return `$${params.length}`; };

    if (account)   { const p1 = add(account); const p2 = add(account); sql += ` AND (t.debit_party_id = ${p1} OR t.credit_party_id = ${p2})`; }
    if (debit)     { sql += ` AND t.debit_party_id = ${add(debit)}`; }
    if (credit)    { sql += ` AND t.credit_party_id = ${add(credit)}`; }
    if (amount)    { sql += ` AND t.amount = ${add(parseFloat(amount))}`; }
    if (status)    { sql += ` AND t.status = ${add(status)}`; }
    if (city) {
      const like = `%${city}%`;
      sql += ` AND (t.transaction_city ILIKE ${add(like)} OR t.wallet_city ILIKE ${add(like)} OR t.credit_wallet_city ILIKE ${add(like)})`;
    }
    if (date_from) { sql += ` AND t.transaction_date >= ${add(date_from)}`; }
    if (date_to)   { sql += ` AND t.transaction_date <= ${add(date_to)}`; }
    if (search) {
      const like = `%${search}%`;
      const p1 = add(like); const p2 = add(like); const p3 = add(like); const p4 = add(like);
      sql += ` AND (t.voucher_number ILIKE ${p1} OR da.account_name ILIKE ${p2} OR ca.account_name ILIKE ${p3} OR t.transaction_city ILIKE ${p4})`;
    }

    sql += ` ORDER BY t.transaction_date DESC, t.id DESC`;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const whereClause = sql.split('WHERE 1=1')[1].split('ORDER BY')[0];
    const countSql = `SELECT COUNT(*) AS total FROM transactions t WHERE 1=1` + whereClause;
    const countParams = [...params];
    const totalRes = await pool.query(countSql, countParams);
    const total = parseInt(totalRes.rows[0].total);

    params.push(parseInt(limit)); sql += ` LIMIT $${params.length}`;
    params.push(offset);          sql += ` OFFSET $${params.length}`;

    const { rows } = await pool.query(sql, params);
    res.json({ data: rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/transactions/:id
router.get('/:id', requireLogin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
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
      WHERE t.id = $1
    `, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Transaction not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/transactions — create (Pending Verification, no ledger entries yet)
router.post('/', requireOperator, async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      transaction_date, transaction_city, token_details, amount,
      wallet_city, debit_party_id, debit_rate, debit_commission, remarks, message,
      credit_wallet_city, credit_party_id, credit_rate, credit_commission
    } = req.body;

    if (!amount || isNaN(parseFloat(amount))) return res.status(400).json({ error: 'Amount is required' });
    if (!debit_party_id || !credit_party_id) return res.status(400).json({ error: 'Debit and Credit Party are required' });

    const amt   = parseFloat(amount);
    const dComm = parseFloat((parseFloat(debit_commission || 0) / 1000).toFixed(4));
    const cComm = parseFloat((parseFloat(credit_commission || 0) / 1000).toFixed(4));
    const dRate = parseFloat(debit_rate  || 0);
    const cRate = parseFloat(credit_rate || 0);
    const txDate = transaction_date || istDate();

    const dAcc = (await pool.query('SELECT * FROM accounts WHERE id=$1 AND is_active=1', [debit_party_id])).rows[0];
    const cAcc = (await pool.query('SELECT * FROM accounts WHERE id=$1 AND is_active=1', [credit_party_id])).rows[0];
    if (!dAcc) return res.status(400).json({ error: 'Debit Party not found or inactive' });
    if (!cAcc) return res.status(400).json({ error: 'Credit Party not found or inactive' });

    const voucherNumber = await nextVoucherNumber();
    const now = istTimestamp();

    await client.query('BEGIN');
    const { rows } = await client.query(`
      INSERT INTO transactions(
        voucher_number, transaction_date, transaction_city, token_details, amount,
        wallet_city, debit_party_id, debit_rate, debit_commission,
        remarks, message, credit_wallet_city, credit_party_id, credit_rate, credit_commission,
        status, created_by, created_at
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'Pending Verification',$16,$17)
      RETURNING *
    `, [voucherNumber, txDate, transaction_city||null, token_details||null, amt,
        wallet_city||null, debit_party_id, dRate, dComm,
        remarks||null, message||null, credit_wallet_city||null, credit_party_id, cRate, cComm,
        req.session.user.id, now]);
    await client.query('COMMIT');

    audit(req, 'create', 'transactions', rows[0].id, null, {
      voucher_number:    voucherNumber,
      transaction_date:  txDate,
      transaction_city:  transaction_city  || null,
      token_details:     token_details     || null,
      amount:            amt,
      wallet_city:       wallet_city       || null,
      debit_party:       dAcc.account_name,
      debit_commission:  dComm,
      credit_party:      cAcc.account_name,
      credit_wallet_city:credit_wallet_city|| null,
      credit_commission: cComm,
      remarks:           remarks           || null,
      message:           message           || null,
      status:            'Pending Verification'
    });

    res.status(201).json({ ...rows[0], debit_party_name: dAcc.account_name, credit_party_name: cAcc.account_name });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PATCH /api/transactions/:id — edit (any status, admin/operator only)
router.patch('/:id', requireOperator, async (req, res) => {
  try {
    const tx = (await pool.query('SELECT * FROM transactions WHERE id=$1', [req.params.id])).rows[0];
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });

    const {
      transaction_date, transaction_city, token_details, amount,
      wallet_city, debit_party_id, debit_rate, debit_commission, remarks, message,
      credit_wallet_city, credit_party_id, credit_rate, credit_commission
    } = req.body;

    if (!amount || isNaN(parseFloat(amount))) return res.status(400).json({ error: 'Amount is required' });
    if (!debit_party_id || !credit_party_id) return res.status(400).json({ error: 'Debit and Credit Party are required' });

    const amt   = parseFloat(amount);
    const dComm = parseFloat((parseFloat(debit_commission || 0) / 1000).toFixed(4));
    const cComm = parseFloat((parseFloat(credit_commission || 0) / 1000).toFixed(4));
    const dRate = parseFloat(debit_rate  || 0);
    const cRate = parseFloat(credit_rate || 0);
    const txDate = transaction_date || tx.transaction_date;

    const dAcc = (await pool.query('SELECT * FROM accounts WHERE id=$1 AND is_active=1', [debit_party_id])).rows[0];
    const cAcc = (await pool.query('SELECT * FROM accounts WHERE id=$1 AND is_active=1', [credit_party_id])).rows[0];
    if (!dAcc) return res.status(400).json({ error: 'Debit Party not found or inactive' });
    if (!cAcc) return res.status(400).json({ error: 'Credit Party not found or inactive' });

    // Fetch old party names so audit before/after both use names (not IDs)
    const oldDAcc = (await pool.query('SELECT account_name FROM accounts WHERE id=$1', [tx.debit_party_id])).rows[0];
    const oldCAcc = (await pool.query('SELECT account_name FROM accounts WHERE id=$1', [tx.credit_party_id])).rows[0];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(`
        UPDATE transactions SET
          transaction_date=$1, transaction_city=$2, token_details=$3, amount=$4,
          wallet_city=$5, debit_party_id=$6, debit_rate=$7, debit_commission=$8,
          remarks=$9, message=$10, credit_wallet_city=$11, credit_party_id=$12,
          credit_rate=$13, credit_commission=$14
        WHERE id=$15 RETURNING *
      `, [txDate, transaction_city||null, token_details||null, amt,
          wallet_city||null, debit_party_id, dRate, dComm,
          remarks||null, message||null, credit_wallet_city||null, credit_party_id, cRate, cComm, tx.id]);

      // If already Verified, keep ledger entries in sync with updated values
      if (tx.status === 'Verified') {
        const voucherNumber = tx.voucher_number;
        const debitAmt  = parseFloat((amt + dComm).toFixed(4));
        const creditAmt = parseFloat((amt - cComm).toFixed(4));

        await client.query(`
          UPDATE ledger_entries SET
            entry_date=$1, account_id=$2, amount=$3, brokerage=$4,
            particulars=$5, message=$6
          WHERE transaction_id=$7 AND entry_type='debit'
        `, [txDate, debit_party_id, debitAmt, dComm,
            `Txn to ${cAcc.account_name} [${voucherNumber}]`, message||null, tx.id]);

        await client.query(`
          UPDATE ledger_entries SET
            entry_date=$1, account_id=$2, amount=$3, brokerage=$4,
            particulars=$5, message=$6
          WHERE transaction_id=$7 AND entry_type='credit'
        `, [txDate, credit_party_id, creditAmt, cComm,
            `Txn from ${dAcc.account_name} [${voucherNumber}]`, message||null, tx.id]);
      }

      await client.query('COMMIT');

      // Build before/after capturing every editable field
      audit(req, 'update', 'transactions', tx.id,
        {
          transaction_date:   tx.transaction_date,
          transaction_city:   tx.transaction_city,
          token_details:      tx.token_details,
          amount:             tx.amount,
          wallet_city:        tx.wallet_city,
          debit_party:        oldDAcc?.account_name || tx.debit_party_id,
          debit_commission:   tx.debit_commission,
          credit_party:       oldCAcc?.account_name || tx.credit_party_id,
          credit_commission:  tx.credit_commission,
          credit_wallet_city: tx.credit_wallet_city,
          remarks:            tx.remarks,
          message:            tx.message
        },
        {
          transaction_date:   txDate,
          transaction_city:   transaction_city   || null,
          token_details:      token_details      || null,
          amount:             amt,
          wallet_city:        wallet_city        || null,
          debit_party:        dAcc.account_name,
          debit_commission:   dComm,
          credit_party:       cAcc.account_name,
          credit_commission:  cComm,
          credit_wallet_city: credit_wallet_city || null,
          remarks:            remarks            || null,
          message:            message            || null
        }
      );
      res.json({ ...rows[0], debit_party_name: dAcc.account_name, credit_party_name: cAcc.account_name });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/transactions/:id/verify — creates ledger entries (adjusted amounts, single row per party)
router.patch('/:id/verify', requireOperator, async (req, res) => {
  const client = await pool.connect();
  try {
    const tx = (await pool.query(`
      SELECT t.*, da.account_name AS debit_party_name, ca.account_name AS credit_party_name
      FROM transactions t
      LEFT JOIN accounts da ON t.debit_party_id  = da.id
      LEFT JOIN accounts ca ON t.credit_party_id = ca.id
      WHERE t.id = $1
    `, [req.params.id])).rows[0];

    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    if (tx.status === 'Verified') return res.status(400).json({ error: 'Already verified' });

    const now = istTimestamp();
    const dComm = parseFloat(tx.debit_commission)  || 0;
    const cComm = parseFloat(tx.credit_commission) || 0;
    const baseAmt = parseFloat(tx.amount);

    // Debit party pays base + their commission; credit party receives base - their commission
    const debitAmt  = parseFloat((baseAmt + dComm).toFixed(4));
    const creditAmt = parseFloat((baseAmt - cComm).toFixed(4));

    await client.query('BEGIN');

    await client.query(
      `UPDATE transactions SET status='Verified', verified_by=$1, verified_at=$2 WHERE id=$3`,
      [req.session.user.id, now, tx.id]
    );

    const insertLE = `
      INSERT INTO ledger_entries(account_id, transaction_id, entry_date, entry_type, particulars, message, brokerage, amount, created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `;

    // Single debit entry: amount includes commission (debit party is charged base + comm)
    await client.query(insertLE, [
      tx.debit_party_id, tx.id, tx.transaction_date, 'debit',
      `Txn to ${tx.credit_party_name} [${tx.voucher_number}]`,
      tx.message || null, dComm, debitAmt, now
    ]);

    // Single credit entry: amount net of commission (credit party receives base - comm)
    await client.query(insertLE, [
      tx.credit_party_id, tx.id, tx.transaction_date, 'credit',
      `Txn from ${tx.debit_party_name} [${tx.voucher_number}]`,
      tx.message || null, cComm, creditAmt, now
    ]);

    await client.query('COMMIT');

    audit(req, 'verify_transaction', 'transactions', tx.id,
      { status: 'Pending Verification' },
      {
        status:           'Verified',
        voucher_number:   tx.voucher_number,
        transaction_date: tx.transaction_date,
        amount:           baseAmt,
        debit_party:      tx.debit_party_name,
        debit_commission: dComm,
        debit_ledger_amt: debitAmt,
        credit_party:     tx.credit_party_name,
        credit_commission:cComm,
        credit_ledger_amt:creditAmt
      }
    );

    const updated = (await pool.query(`
      SELECT t.*, da.account_name AS debit_party_name, ca.account_name AS credit_party_name,
        v.username AS verified_by_name
      FROM transactions t
      LEFT JOIN accounts da ON t.debit_party_id  = da.id
      LEFT JOIN accounts ca ON t.credit_party_id = ca.id
      LEFT JOIN users v ON t.verified_by = v.id
      WHERE t.id = $1
    `, [tx.id])).rows[0];

    res.json(updated);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
