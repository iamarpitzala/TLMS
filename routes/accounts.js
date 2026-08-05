const express = require('express');
const { pool, istTimestamp } = require('../db');
const { requireLogin, requireOperator } = require('../middleware/auth');
const audit = require('../middleware/audit');
const router = express.Router();

// GET /api/accounts
router.get('/', requireLogin, async (req, res) => {
  try {
    const { search, active } = req.query;
    let sql = `
      SELECT a.*, p.account_name AS parent_name
      FROM accounts a
      LEFT JOIN accounts p ON a.parent_account = p.id::text
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (a.account_name ILIKE $${params.length} OR a.mobile_number ILIKE $${params.length} OR a.group_name ILIKE $${params.length})`;
    }
    if (active !== undefined) {
      params.push(active === 'true' || active === '1' ? 1 : 0);
      sql += ` AND a.is_active = $${params.length}`;
    }
    sql += ` ORDER BY a.account_name`;

    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load accounts' });
  }
});

// GET /api/accounts/:id
router.get('/:id', requireLogin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM accounts WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Account not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/accounts
router.post('/', requireOperator, async (req, res) => {
  try {
    const { account_name, mobile_number, opening_amount, balance_date, group_name, parent_account } = req.body;

    if (!account_name?.trim()) return res.status(400).json({ error: 'Account Name is mandatory' });

    const dup = await pool.query('SELECT id FROM accounts WHERE LOWER(account_name) = LOWER($1)', [account_name.trim()]);
    if (dup.rows[0]) return res.status(409).json({ error: 'Account Name already exists' });

    const now = istTimestamp();
    const { rows } = await pool.query(`
      INSERT INTO accounts(account_name, mobile_number, opening_amount, balance_date, group_name, parent_account, created_at, updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$7) RETURNING *
    `, [account_name.trim(), mobile_number||null, parseFloat(opening_amount)||0, balance_date||null, group_name||null, parent_account||null, now]);

    audit(req, 'create', 'accounts', rows[0].id, null, {
      account_name: rows[0].account_name, opening_amount: rows[0].opening_amount
    });
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/accounts/:id
router.put('/:id', requireOperator, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = (await pool.query('SELECT * FROM accounts WHERE id = $1', [id])).rows[0];
    if (!existing) return res.status(404).json({ error: 'Account not found' });

    const { account_name, mobile_number, opening_amount, balance_date, group_name, parent_account } = req.body;
    if (!account_name?.trim()) return res.status(400).json({ error: 'Account Name is mandatory' });

    const dup = await pool.query('SELECT id FROM accounts WHERE LOWER(account_name) = LOWER($1) AND id != $2', [account_name.trim(), id]);
    if (dup.rows[0]) return res.status(409).json({ error: 'Account Name already exists' });

    const now = istTimestamp();
    const { rows } = await pool.query(`
      UPDATE accounts SET account_name=$1, mobile_number=$2, opening_amount=$3, balance_date=$4,
        group_name=$5, parent_account=$6, updated_at=$7
      WHERE id=$8 RETURNING *
    `, [account_name.trim(), mobile_number||null, parseFloat(opening_amount)||0, balance_date||null, group_name||null, parent_account||null, now, id]);

    audit(req, 'update', 'accounts', parseInt(id),
      { account_name: existing.account_name, opening_amount: existing.opening_amount },
      { account_name: rows[0].account_name, opening_amount: rows[0].opening_amount }
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/accounts/:id/disable
router.patch('/:id/disable', requireOperator, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = (await pool.query('SELECT * FROM accounts WHERE id = $1', [id])).rows[0];
    if (!existing) return res.status(404).json({ error: 'Account not found' });

    const newStatus = existing.is_active === 1 ? 0 : 1;
    await pool.query('UPDATE accounts SET is_active=$1, updated_at=$2 WHERE id=$3', [newStatus, istTimestamp(), id]);

    audit(req, newStatus === 0 ? 'disable' : 'enable', 'accounts', parseInt(id),
      { is_active: existing.is_active }, { is_active: newStatus }
    );
    res.json({ success: true, is_active: newStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
