/**
 * Shared audit logging helper.
 * Writes a row to audit_log for every significant action.
 *
 * Usage:
 *   audit(req, 'create', 'accounts', newId, { account_name: 'Alice' });
 *   audit(req, 'update', 'accounts', id, { old_name: 'Alice' }, { new_name: 'Bob' });
 *   audit(req, 'login', null, null);
 */

const { db, istTimestamp } = require('../db');

function audit(req, action, tableName = null, recordId = null, oldData = null, newData = null) {
  try {
    const actor = req.session && req.session.user;
    const actorId = actor ? actor.id : null;
    const actorName = actor ? actor.username : (req.body && req.body.username) || 'unknown';

    const oldValue = oldData ? (typeof oldData === 'object' ? JSON.stringify(oldData) : String(oldData)) : null;
    const newValue = newData ? (typeof newData === 'object' ? JSON.stringify(newData) : String(newData)) : null;

    db.prepare(`
      INSERT INTO audit_log(actor_id, actor_name, action, table_name, record_id, old_value, new_value, timestamp)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?)
    `).run(actorId, actorName, action, tableName, recordId, oldValue, newValue, istTimestamp());
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
}

module.exports = audit;
