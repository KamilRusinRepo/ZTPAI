function toIsoOrNull(value) {
  return value == null ? null : new Date(value).toISOString();
}

export function toReservationResponse(reservation) {
  return {
    id: reservation.id ?? null,
    roomId: reservation.roomId ?? null,
    reservedBy: reservation.reservedBy ?? null,
    participants: reservation.participants ?? null,
    startTime: toIsoOrNull(reservation.startTime),
    endTime: toIsoOrNull(reservation.endTime),
    status: reservation.status ?? null,
    createdAt: toIsoOrNull(reservation.createdAt),
    cancelledAt: toIsoOrNull(reservation.cancelledAt),
  };
}
