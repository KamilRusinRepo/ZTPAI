function toIsoOrNull(value) {
  return value == null ? null : new Date(value).toISOString();
}

export function toReservationDetailsResponse(reservation) {
  if (!reservation.room) return toReservationResponse(reservation);
  const { id, roomId, ...fields } = toReservationResponse(reservation);
  return {
    id,
    room: { id: reservation.room.id, name: reservation.room.name,
      building: { id: reservation.room.building.id, name: reservation.room.building.name } },
    ...fields,
  };
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
