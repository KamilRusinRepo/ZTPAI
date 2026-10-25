import express from 'express';

// Każda instancja aplikacji ma własne dane w pamięci, bez bazy danych.
export function createApp() {
  const app = express();
  const rooms = [
    { id: 1, name: 'A101', capacity: 30 },
    { id: 2, name: 'A102', capacity: 20 },
    { id: 3, name: 'B201', capacity: 50 },
    { id: 4, name: 'B202', capacity: 10 },
  ];
  const reservations = [];
  let nextReservationId = 1;

  app.disable('x-powered-by');
  app.use(express.json());

  app.get('/api/rooms', (req, res) => res.json(rooms));

  app.get('/api/rooms/:id', (req, res) => {
    const room = rooms.find((item) => item.id === Number(req.params.id));
    if (!room) return res.status(404).json({ message: 'Room not found' });
    return res.json(room);
  });

  app.post('/api/reservations', (req, res) => {
    const { roomId, reservedBy, participants, date } = req.body ?? {};
    if (!Number.isSafeInteger(roomId) || roomId <= 0) {
      return res.status(400).json({ message: 'roomId must be a positive integer' });
    }
    if (typeof reservedBy !== 'string' || !reservedBy.trim()) {
      return res.status(400).json({ message: 'reservedBy is required' });
    }
    if (typeof participants !== 'number' || !Number.isFinite(participants) || participants <= 0) {
      return res.status(400).json({ message: 'participants must be a number greater than 0' });
    }
    if (typeof date !== 'string' || !date.trim()) {
      return res.status(400).json({ message: 'date is required' });
    }


    const reservation = {
      id: nextReservationId++,
      roomId,
      reservedBy: reservedBy.trim(),
      participants,
      date: date.trim(),
      status: 'CONFIRMED',
    };

    const room = rooms.find((item) => item.id === roomId);
    if (!room) return res.status(404).json({ message: 'Room not found' });
    if (participants > room.capacity) {
      return res.status(409).json({ message: 'Room capacity exceeded' });
    }
    
    reservations.push(reservation);
    return res.status(201).json(reservation);
  });
    
  app.get('/api/reservations', (req, res) => {
    if (req.query.roomId === undefined) return res.json(reservations);
    const roomId = Number(req.query.roomId);
    return res.json(reservations.filter((item) => item.roomId === roomId));
  });

  app.patch('/api/reservations/:id/cancel', (req, res) => {
    const reservation = reservations.find((item) => item.id === Number(req.params.id));
    if (!reservation) {
      return res.status(404).json({ message: 'Reservation not found' });
    }
    reservation.status = 'CANCELLED';
    return res.json(reservation);
  });

  app.use((req, res) => res.status(404).json({ message: 'Endpoint not found' }));
  app.use((error, req, res, next) => {
    if (error.type === 'entity.parse.failed') {
      return res.status(400).json({ message: 'Invalid JSON body' });
    }
    if (error.status === 413) {
      return res.status(413).json({ message: 'Request body too large' });
    }
    console.error(error);
    return res.status(500).json({ message: 'Internal server error' });
  });
  return app;
}
