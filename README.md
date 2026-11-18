# Room Booking API

## Uruchomienie od zera przez Docker Compose

Wymagany Git i uruchomiony Docker Desktop.
Lokalny Node.js nie jest potrzebny do uruchomienia kontenerów.

```powershell
git clone https://github.com/KamilRusinRepo/ZTPAI.git
cd ZTPAI
cp .env.example .env
docker compose up --build
```

Swagger UI: **http://localhost:3000/api/docs/**.
Specyfikacja JSON: http://localhost:3000/api/docs/openapi.json.
API startuje po uzyskaniu gotowości PostgreSQL i automatycznym wykonaniu migracji.
Do startu nie potrzeba `npm install`, ręcznych migracji ani seedów.
Panel Swagger jest publiczny; operacje API wymagają JWT po rejestracji/logowaniu.

`.env.example` zawiera publiczne wartości demonstracyjne. Przy wdrożeniu ustaw
w `.env` własne `DB_PASSWORD` i losowy `JWT_SECRET` (minimum 32 znaki).
Zmiana danych w `.env` nie zmienia hasła w już istniejącym wolumenie PostgreSQL.
Wartości użyte w adresie PostgreSQL powinny być bezpieczne w URL.

Port API ustawia `PORT` (domyślnie 3000), a hostowy port bazy `DB_PORT` (5433).
Jeśli port jest zajęty, ustaw inny w `.env`. Kontenery komunikują się przez
`db:5432`; lokalny `DATABASE_URL` nie zastępuje adresu bazy wewnątrz Compose.
Projekt zachowuje nazwany wolumen `room-booking-pgdata` z wcześniejszej konfiguracji.

## Konto ADMIN i dane demonstracyjne

W drugim terminalu, w katalogu projektu:

```powershell
docker compose exec api npx knex seed:run
```

Konto demonstracyjne: `admin@example.com`, hasło `admin-password-123`.
W Swagger UI użyj `POST /api/auth/login`, skopiuj `accessToken` i wklej do
**Authorize**. Seed jest przeznaczony do demonstracji: zastępuje sale,
budynki i rezerwacje danymi przykładowymi. Samo uruchomienie Compose nie seeduje bazy.

## Stan, logi i zatrzymanie

```powershell
docker compose ps
docker compose logs api
docker compose down
```

`docker compose down` wysyła SIGTERM. API kończy obsługiwane żądania,
zamyka serwer HTTP i pulę Knexa, a następnie kończy proces.
W logach pojawiają się `SIGTERM received`, `HTTP server closed`,
`Database connection pool closed` oraz `Shutdown complete`.
`exec node` w Dockerfile zapewnia, że Node odbiera sygnał jako PID 1 kontenera.

`down` zachowuje dane w nazwanym wolumenie; ponowne `up` używa tych samych danych.
Opcja `down -v` usuwa także wolumen i dane — nie jest potrzebna do zwykłego zatrzymania.

## Uruchamianie testów lokalnie

Wymagania: Node.js >= 22, npm i Docker Desktop z kontenerami Linux.

## Testy jednostkowe

```powershell
npm ci
npm run test:unit
```

27 testów serwisu rezerwacji, repozytoria in-memory i wstrzyknięty zegar.
Nie wymagają bazy danych ani `.env`.

## Testy integracyjne

```powershell
npm ci
npm run test:db:up
npm run test:integration
```

`test:db:up` uruchamia wyłącznie PostgreSQL testowy z `tests/compose.yaml`.
Osobna baza `room_booking_test` działa na porcie **55432**, niezależnie od
deweloperskiego PostgreSQL na 5432. Nie trzeba uruchamiać API, wykonywać ręcznie
migracji ani seedów. Testy przekazują `createApp()` bezpośrednio do Supertesta.

10 testów sprawdza rejestrację/logowanie/me, zapis rezerwacji i Location,
400/details, 401, 403, 404, 409, paginację, anulowanie i równoległe rezerwacje.
Migracje wykonują się w `beforeAll`, tabele są czyszczone przed każdym testem,
a `afterAll` zamyka pulę Knexa.

## Wszystkie testy z zestawu 05

```powershell
npm test
```

Wynik: **37/37** (27 unit + 10 integration).