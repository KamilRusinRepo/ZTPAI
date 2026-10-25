export function toReservationResponse(reservation) {
  return {
    id: reservation.id,
    roomId: reservation.roomId,
    reservedBy: reservation.reservedBy,
    participants: reservation.participants,
    startTime: new Date(reservation.startTime).toISOString(),
    endTime: new Date(reservation.endTime).toISOString(),
    status: reservation.status,
    createdAt: new Date(reservation.createdAt).toISOString(),
    cancelledAt: reservation.cancelledAt == null ? null : new Date(reservation.cancelledAt).toISOString(),
  };
}
