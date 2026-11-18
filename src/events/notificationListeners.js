export function registerNotificationListeners(eventBus, usersRepository, { logger = console } = {}) {
  return eventBus.subscribe('reservation.cancelled', async ({ payload }) => {
    if (payload.cancelledBy === payload.userId) return;
    const [actor, owner] = await Promise.all([
      usersRepository.findById(payload.cancelledBy),
      usersRepository.findById(payload.userId),
    ]);
    if (actor?.role === 'ADMIN' && owner) {
      logger.log(`[notification] to: ${owner.email} reservation ${payload.reservationId} cancelled by ADMIN ${actor.id}`);
    }
  });
}
