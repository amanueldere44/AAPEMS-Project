export async function writeAudit(connection, { userId, action, entityType = null, entityId = null, details = {}, ipAddress = null }) {
  await connection.execute(
    'INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
    [userId ?? null, action, entityType, entityId, JSON.stringify(details), ipAddress]
  );
}
