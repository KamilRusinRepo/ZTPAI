const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const array = (name) => ({ type: 'array', items: ref(name) });
const id = { type: 'integer', minimum: 1 };
const date = { type: 'string', format: 'date-time' };
const json = (schema) => ({ 'application/json': { schema } });
const errorResponse = (name) => ({ $ref: `#/components/responses/${name}` });
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties,
  ...(required.length ? { required } : {}) });
const idParameter = { name: 'id', in: 'path', required: true, schema: id, description: 'ID zasobu.' };
const query = (name, schema, description) => ({ name, in: 'query', schema, description });

function operation(tag, summary, status, schema, options = {}) {
  const responses = {
    [status]: { description: status === 201 ? 'Utworzono zasób.' : status === 204 ? 'Usunięto zasób; puste body.' : 'Operacja zakończona powodzeniem.',
      ...(schema ? { content: json(schema) } : {}),
      ...(options.location ? { headers: { Location: { description: 'Adres utworzonego zasobu.', schema: { type: 'string' } } } } : {}) },
    400: errorResponse('BadRequest'),
    ...(!options.public ? { 401: errorResponse('Unauthorized') } : {}),
    ...Object.fromEntries((options.errors ?? []).map(([code, name]) => [code, errorResponse(name)])),
    413: errorResponse('PayloadTooLarge'), 500: errorResponse('InternalError'),
  };
  return { tags: [tag], summary, ...(options.description ? { description: options.description } : {}),
    ...(options.public ? { security: [] } : {}),
    parameters: [...(options.id ? [idParameter] : []), ...(options.query ?? []),
      { name: 'X-Request-Id', in: 'header', required: false, schema: { type: 'string' }, description: 'Opcjonalny identyfikator żądania; API zwraca go w nagłówku i błędach.' }],
    ...(options.body ? { requestBody: { required: true, content: json(ref(options.body)) } } : {}), responses };
}

export function createOpenapiDocument({ jwtExpiresIn = '15m', enableDebugRoutes = false } = {}) {
  const buildingProperties = { id, name: { type: 'string' }, address: { type: 'string' } };
  const roomProperties = { id, name: { type: 'string' }, capacity: { type: 'integer', minimum: 1 } };
  const reservationProperties = { id, user: ref('UserIdentity'), participants: { type: 'integer', minimum: 1 },
    startTime: date, endTime: date, status: { type: 'string', enum: ['CONFIRMED', 'CANCELLED'] },
    createdAt: date, cancelledAt: { ...date, nullable: true } };
  const buildingInput = { name: { type: 'string', minLength: 1, maxLength: 120, example: 'Budynek C' },
    address: { type: 'string', minLength: 1, maxLength: 255, example: 'ul. Warszawska 10, Kraków' } };
  const roomInput = { buildingId: id, name: { type: 'string', minLength: 1, maxLength: 120, example: 'Sala 105' },
    capacity: { type: 'integer', minimum: 1, maximum: 2147483647, example: 30 } };
  const schemas = {
    ApiError: object({ error: object({ code: { type: 'string', example: 'VALIDATION_ERROR' },
      message: { type: 'string', example: 'Validation failed' },
      details: { type: 'array', items: object({ location: { type: 'string', enum: ['body', 'query', 'params'] },
        field: { type: 'string' }, message: { type: 'string' } }) },
      requestId: { type: 'string', example: 'request-123' } }, ['code', 'message', 'requestId']) }),
    UserIdentity: object({ id, email: { type: 'string', format: 'email' } }),
    User: object({ id, email: { type: 'string', format: 'email' }, role: { type: 'string', enum: ['USER', 'ADMIN'] }, createdAt: date }),
    RegisterBody: object({ email: { type: 'string', format: 'email', maxLength: 254, example: 'Jan.Kowalski@example.com', description: 'Normalizowany do małych liter.' },
      password: { type: 'string', format: 'password', minLength: 10, maxLength: 72, writeOnly: true,
        description: '10–72 znaki i najwyżej 72 bajty UTF-8.', example: 'bardzo-dlugie-haslo' } }),
    LoginBody: object({ email: { type: 'string', format: 'email', maxLength: 254, example: 'jan.kowalski@example.com' },
      password: { type: 'string', format: 'password', minLength: 1, writeOnly: true, example: 'bardzo-dlugie-haslo' } }),
    LoginResponse: object({ accessToken: { type: 'string', description: 'JWT HS256 z sub, role, iat i exp. Skopiuj tę wartość do Authorize.' },
      tokenType: { type: 'string', enum: ['Bearer'] }, expiresIn: { type: 'string', example: jwtExpiresIn } }),
    Building: object(buildingProperties),
    BuildingListItem: object({ ...buildingProperties, roomsCount: { type: 'integer', minimum: 0 } }),
    CreateBuilding: object(buildingInput),
    UpdateBuilding: { ...object(buildingInput, []), minProperties: 1 },
    Room: object({ ...roomProperties, buildingId: id }),
    RoomDetails: object({ ...roomProperties, building: ref('BuildingIdentity') }),
    BuildingIdentity: object({ id, name: { type: 'string' } }),
    CreateRoom: object(roomInput),
    UpdateRoom: { ...object(roomInput, []), minProperties: 1 },
    CreateReservation: { ...object({ roomId: id, participants: { type: 'integer', minimum: 1, example: 2 },
      startTime: { ...date, example: '2035-01-01T10:00:00Z' }, endTime: { ...date, example: '2035-01-01T11:00:00Z' } }),
      description: 'Przyszły termin, czas trwania 15 minut–8 godzin. Autor pochodzi wyłącznie z tokenu. userId i reservedBy w body są zabronione.' },
    Reservation: object({ id, roomId: id, ...reservationProperties }),
    ReservationDetails: object({ id, room: object({ id, name: { type: 'string' }, building: ref('BuildingIdentity') }), ...reservationProperties }),
    ReservationPage: object({ data: array('ReservationDetails'), meta: object({ page: id, limit: id,
      total: { type: 'integer', minimum: 0 }, totalPages: { type: 'integer', minimum: 0 } }) }),
  };
  const response = (description, code, message) => ({ description, content: { 'application/json': {
    schema: ref('ApiError'), example: { error: { code, message, requestId: 'request-123' } },
  } } });
  const responses = {
    BadRequest: response('Niepoprawne body, parametry, zakres dat, czas trwania albo JSON. Nieznane pola są odrzucane; details opisuje błędy walidacji.', 'VALIDATION_ERROR', 'Validation failed'),
    Unauthorized: response('Brak lub zły format nagłówka, niepoprawny podpis/algorytm, wygasły token (Token expired), nieistniejące konto lub błędne dane logowania (Invalid email or password).', 'UNAUTHORIZED', 'Authentication required'),
    Forbidden: response('Rola USER nie może zarządzać salami/budynkami ani używać filtra userId.', 'FORBIDDEN', 'Insufficient permissions'),
    NotFound: response('Zasób nie istnieje; cudza rezerwacja jest również ukrywana odpowiedzią 404.', 'NOT_FOUND', 'Reservation not found'),
    Conflict: response('Konflikt: EMAIL_TAKEN, UNIQUE_VIOLATION, RESOURCE_IN_USE, ROOM_ALREADY_BOOKED, ROOM_CAPACITY_EXCEEDED, RESERVATION_ALREADY_STARTED lub INVALID_STATUS_TRANSITION.', 'CONFLICT', 'Operation conflicts with the current state'),
    PayloadTooLarge: response('Body przekracza limit parsera JSON (100 KB).', 'PAYLOAD_TOO_LARGE', 'Request body too large'),
    InternalError: response('Nieoczekiwany błąd serwera; szczegóły pozostają w logach.', 'INTERNAL_ERROR', 'Unexpected error'),
  };
  const adminErrors = [[403, 'Forbidden'], [404, 'NotFound'], [409, 'Conflict']];
  const paths = {
    '/api/docs': { get: { tags: ['Docs'], summary: 'Przekierowanie do Swagger UI', security: [],
      responses: { 301: { description: 'Przekierowanie do /api/docs/.', headers: { Location: { schema: { type: 'string' } } } },
        400: errorResponse('BadRequest'), 413: errorResponse('PayloadTooLarge'), 500: errorResponse('InternalError') } } },
    '/api/docs/': { get: { tags: ['Docs'], summary: 'Publiczny interfejs Swagger UI', security: [],
      responses: { 200: { description: 'Strona dokumentacji.', content: { 'text/html': { schema: { type: 'string' } } } },
        400: errorResponse('BadRequest'), 413: errorResponse('PayloadTooLarge'), 500: errorResponse('InternalError') } } },
    '/api/docs/openapi.json': { get: { tags: ['Docs'], summary: 'Publiczny dokument OpenAPI', security: [],
      responses: { 200: { description: 'Specyfikacja OpenAPI 3.0.3.', content: json({ type: 'object', additionalProperties: true }) },
        400: errorResponse('BadRequest'), 413: errorResponse('PayloadTooLarge'), 500: errorResponse('InternalError') } } },
    '/api/auth/register': { post: operation('Auth', 'Rejestracja konta USER', 201, ref('User'), {
      public: true, body: 'RegisterBody', errors: [[409, 'Conflict']],
      description: 'Zawsze tworzy USER. Pole role i inne nieznane pola dają 400. Zajęty email, także równolegle, daje 409 EMAIL_TAKEN. Odpowiedź nie zawiera hasha.' }) },
    '/api/auth/login': { post: operation('Auth', 'Logowanie i token JWT', 200, ref('LoginResponse'), {
      public: true, body: 'LoginBody', errors: [[401, 'Unauthorized']],
      description: 'Niepoprawny email konta lub hasło dają identyczne 401 Invalid email or password. Niepoprawny format body daje 400.' }) },
    '/api/auth/me': { get: operation('Auth', 'Dane zalogowanego użytkownika', 200, ref('User')) },
    '/api/buildings': {
      get: operation('Buildings', 'Budynki z liczbą sal', 200, array('BuildingListItem')),
      post: operation('Buildings', 'Utwórz budynek — ADMIN', 201, ref('Building'), {
        body: 'CreateBuilding', location: true, errors: [[403, 'Forbidden'], [409, 'Conflict']] }),
    },
    '/api/buildings/{id}': {
      get: operation('Buildings', 'Szczegóły budynku', 200, ref('Building'), { id: true, errors: [[404, 'NotFound']] }),
      patch: operation('Buildings', 'Zmień budynek — ADMIN', 200, ref('Building'), { id: true, body: 'UpdateBuilding', errors: adminErrors }),
      delete: operation('Buildings', 'Usuń pusty budynek — ADMIN', 204, null, {
        id: true, errors: adminErrors, description: 'Budynek posiadający sale daje 409 RESOURCE_IN_USE. Sukces nie zawiera body.' }),
    },
    '/api/buildings/{id}/rooms': { get: operation('Buildings', 'Sale w budynku', 200, array('RoomDetails'), { id: true, errors: [[404, 'NotFound']] }) },
    '/api/rooms': {
      get: operation('Rooms', 'Lista sal', 200, array('Room')),
      post: operation('Rooms', 'Utwórz salę — ADMIN', 201, ref('Room'), { body: 'CreateRoom', location: true, errors: adminErrors }),
    },
    '/api/rooms/{id}': {
      get: operation('Rooms', 'Szczegóły sali z budynkiem', 200, ref('RoomDetails'), { id: true, errors: [[404, 'NotFound']] }),
      patch: operation('Rooms', 'Zmień salę — ADMIN', 200, ref('Room'), { id: true, body: 'UpdateRoom', errors: adminErrors }),
      delete: operation('Rooms', 'Usuń salę bez rezerwacji — ADMIN', 204, null, {
        id: true, errors: adminErrors, description: 'Także anulowane rezerwacje blokują usunięcie sali: 409 RESOURCE_IN_USE.' }),
    },
    '/api/reservations': {
      get: operation('Reservations', 'Lista własnych rezerwacji lub wszystkich dla ADMIN-a', 200, ref('ReservationPage'), {
        errors: [[403, 'Forbidden']], description: 'USER zawsze widzi tylko swoje rekordy. userId jest dostępne wyłącznie dla ADMIN-a; dla USER-a daje 403. Filtry łączą się, total obejmuje tylko widoczne rekordy. Wymagane from < to.',
        query: [query('userId', { ...id, maximum: 2147483647 }, 'Tylko ADMIN; filtr autora.'),
          query('roomId', { ...id, maximum: 2147483647 }, 'Filtr sali.'), query('buildingId', { ...id, maximum: 2147483647 }, 'Filtr budynku.'),
          query('status', { type: 'string', enum: ['CONFIRMED', 'CANCELLED'] }, 'Filtr statusu.'),
          query('from', date, 'Rezerwacja kończy się po from.'), query('to', date, 'Rezerwacja zaczyna się przed to.'),
          query('page', { ...id, default: 1 }, 'Numer strony; offset musi być bezpieczną liczbą całkowitą.'),
          query('limit', { ...id, maximum: 100, default: 20 }, 'Liczba rekordów na stronę.'),
          query('sort', { type: 'string', enum: ['startTime', '-startTime', 'createdAt', '-createdAt', 'participants', '-participants'], default: 'startTime' }, 'Minus oznacza kolejność malejącą.')],
      }),
      post: operation('Reservations', 'Utwórz rezerwację jako zalogowany użytkownik', 201, ref('Reservation'), {
        body: 'CreateReservation', location: true, errors: [[404, 'NotFound'], [409, 'Conflict']],
        description: 'Autor pochodzi z tokenu. Obowiązują pojemność sali, brak kolizji, przyszły termin i czas 15 minut–8 godzin, również dla ADMIN-a.' }),
    },
    '/api/reservations/{id}': { get: operation('Reservations', 'Pobierz rezerwację — właściciel lub ADMIN', 200, ref('ReservationDetails'), {
      id: true, errors: [[404, 'NotFound']], description: 'Obcy USER dostaje 404, identycznie jak przy brakującym rekordzie.' }) },
    '/api/reservations/{id}/cancel': { patch: operation('Reservations', 'Anuluj rezerwację — właściciel lub ADMIN', 200, ref('Reservation'), {
      id: true, errors: [[404, 'NotFound'], [409, 'Conflict']], description: 'Bez body. Cudza rezerwacja daje 404. Rozpoczętej rezerwacji nie anuluje również ADMIN. Powtórzenie anulowania zwraca ten sam stan.' }) },
  };
  if (enableDebugRoutes) paths['/api/debug/error'] = { get: { tags: ['Debug'], summary: 'Kontrolowana demonstracja błędu 500',
    responses: { 400: errorResponse('BadRequest'), 401: errorResponse('Unauthorized'), 413: errorResponse('PayloadTooLarge'), 500: errorResponse('InternalError') } } };
  return { openapi: '3.0.3', info: { title: 'Room Booking API', version: '1.0.0',
    description: 'Zaloguj się w POST /api/auth/login, skopiuj accessToken i kliknij Authorize. Wklej sam token, bez słowa Bearer. Do zarządzania salami i budynkami potrzebny jest ADMIN.' },
    servers: [{ url: '/', description: 'Ten sam serwer co Swagger UI' }],
    tags: [{ name: 'Auth' }, { name: 'Buildings' }, { name: 'Rooms' }, { name: 'Reservations' }, { name: 'Docs' }],
    security: [{ bearerAuth: [] }], paths,
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } }, schemas, responses } };
}
