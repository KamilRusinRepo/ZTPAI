export function toRoomResponse(room) {
  return { id: room.id ?? null, name: room.name ?? null, capacity: room.capacity ?? null };
}
