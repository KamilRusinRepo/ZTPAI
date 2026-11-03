export function toRoomResponse(room) {
  return { id: room.id ?? null, name: room.name ?? null, capacity: room.capacity ?? null,
    ...(room.buildingId === undefined ? {} : { buildingId: room.buildingId }) };
}

export function toRoomDetailsResponse(room) {
  if (!room.building) return toRoomResponse(room);
  return { id: room.id, name: room.name, capacity: room.capacity,
    building: { id: room.building.id, name: room.building.name } };
}
