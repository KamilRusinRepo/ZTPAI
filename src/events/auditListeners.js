export function registerAuditListeners(eventBus, auditLogRepository) {
  const save = (event) => auditLogRepository.create(event);
  const unsubscribe = [
    eventBus.subscribe('reservation.created', save),
    eventBus.subscribe('reservation.cancelled', save),
  ];
  return () => unsubscribe.forEach((stop) => stop());
}
