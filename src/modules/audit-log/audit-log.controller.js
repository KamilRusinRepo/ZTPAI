export function createAuditLogController(auditLogRepository) {
  return {
    async list(req, res) {
      const { page, limit } = req.validated.query;
      const { items, total } = await auditLogRepository.listPage(req.validated.query);
      return res.json({ data: items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } });
    },
  };
}
