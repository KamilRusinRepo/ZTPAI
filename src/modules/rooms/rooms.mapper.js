export function toRoomResponse(room) {
  return { id: room.id, name: room.name, capacity: room.capacity };
}
