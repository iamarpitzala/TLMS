const { pool, istTimestamp } = require('../db');

function audit(req, action, tableName = null, recordId = null, oldData = null, newData = null) {
  try {
    const actor     = req.session?.user;
    const actorId   = actor ? actor.id : null;
    const actorName = actor ? actor.username : (req.body?.username) || 'unknown';
    const oldValue  = oldData ? (typeof oldData === 'object' ? JSON.stringify(oldData) : String(oldData)) : null;
    const newValue  = newData ? (typeof newData === 'object' ? JSON.stringify(newData) : String(newData)) : null;

    // Fire-and-forget — never throw into the request handler
    pool.query(
      `INSERT INTO audit_log(actor_id, actor_name, action, table_name, record_id, old_value, new_value, timestamp)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [actorId, actorName, action, tableName, recordId, oldValue, newValue, istTimestamp()]
    ).catch(err => console.error('Audit log error:', err.message));
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
}

module.exports = audit;
