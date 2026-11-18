export function createAuditLogRepository() {
  const entries = [];
  let nextId = 1n;
  return {
    async create(event) {
      const entry = { id: String(nextId++), eventType: event.name,
        payload: structuredClone(event.payload), createdAt: event.occurredAt };
      entries.push(entry);
      return structuredClone(entry);
    },
    async listPage({ eventType, page = 1, limit = 20 } = {}) {
      const filtered = entries.filter((entry) => eventType === undefined || entry.eventType === eventType)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)
          || (BigInt(b.id) > BigInt(a.id) ? 1 : -1));
      return { items: structuredClone(filtered.slice((page - 1) * limit, page * limit)), total: filtered.length };
    },
  };
}
