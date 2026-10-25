export function createRoomsRepository() {
  const rooms = [
    { id: 1, name: 'A101', capacity: 30 },
    { id: 2, name: 'A102', capacity: 20 },
    { id: 3, name: 'B201', capacity: 50 },
    { id: 4, name: 'B202', capacity: 10 },
  ];
  return {
    async list() {
      return structuredClone(rooms);
    },
    async findById(id) {
      return structuredClone(rooms.find((room) => room.id === id) ?? null);
    },
  };
}
