// Writes one row to the append-only audit log.
// q is query() or a transaction query function.
async function recordAudit(q, { library_id = null, actor_user_id = null, action, entity = null, entity_id = null, details = null, ip = null }) {
  await q(
    `INSERT INTO audit_log (library_id, actor_user_id, action, entity, entity_id, details, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      library_id,
      actor_user_id,
      action,
      entity,
      entity_id === null ? null : String(entity_id),
      details ? JSON.stringify(details) : null,
      ip,
    ]
  );
}

module.exports = { recordAudit };