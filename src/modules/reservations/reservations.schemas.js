import { AppError } from '../../errors/AppError.js';


function parseTime(value, field) {
  const isoWithZone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
  if (typeof value !== 'string' || !isoWithZone.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new AppError(`${field} must be an ISO 8601 date with a timezone`, 400);
  }
  return new Date(value).toISOString();
}

export function parseCreateReservation(body) {
  const { roomId, reservedBy, participants, startTime, endTime } = body ?? {};
  if (!Number.isSafeInteger(roomId) || roomId <= 0) {
    throw new AppError('roomId must be a positive integer', 400);
  }
  if (typeof reservedBy !== 'string' || !reservedBy.trim()) {
    throw new AppError('reservedBy is required', 400);
  }
  if (typeof participants !== 'number' || !Number.isFinite(participants) || participants <= 0) {
    throw new AppError('participants must be a number greater than 0', 400);
  }
  return {
    roomId,
    reservedBy: reservedBy.trim(),
    participants,
    startTime: parseTime(startTime, 'startTime'),
    endTime: parseTime(endTime, 'endTime'),
  };
}

export function parseReservationId(value) {
  return Number(value);
}

export function parseReservationFilters(query) {
  return { roomId: query.roomId === undefined ? undefined : Number(query.roomId) };
}
