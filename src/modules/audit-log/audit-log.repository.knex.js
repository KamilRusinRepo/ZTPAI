function toAuditEntry(row) {
  return { id: String(row.id), eventType: row.event_type, payload: row.payload, createdAt: row.created_at.toISOString() };
}

export function createAuditLogRepository(db) {
  return {
    async create(event) {
      const [row] = await db('audit_log').insert({
        event_type: event.name, payload: event.payload, created_at: event.occurredAt,
      }).returning('*');
      return toAuditEntry(row);
    },
    async listPage({ eventType, page = 1, limit = 20 } = {}) {
      const query = db('audit_log').modify((builder) => {
        if (eventType !== undefined) builder.where('event_type', eventType);
      });
      const [rows, count] = await Promise.all([
        query.clone().orderBy('created_at', 'desc').orderBy('id', 'desc').limit(limit).offset((page - 1) * limit),
        query.clone().count({ total: '*' }).first(),
      ]);
      return { items: rows.map(toAuditEntry), total: Number(count.total) };
    },
  };
}
