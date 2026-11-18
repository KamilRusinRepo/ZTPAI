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

## Zadanie 4 — eventy i audit log

Po aktualizacji kodu przebuduj API:

```powershell
docker compose up -d --build
```

Nowa migracja automatycznie tworzy tabelę `audit_log` z payloadem `jsonb`.
Serwis po zatwierdzeniu transakcji publikuje `reservation.created` lub
`reservation.cancelled`. Kolizja i inne błędy nie publikują eventu;
ponowne anulowanie nie tworzy kolejnego eventu.

Event bus używa `EventEmitter`. Każdy listener wykonuje się asynchronicznie,
a jego błąd jest logowany i nie zmienia wyniku operacji API. Jeden listener
zapisuje audyt, drugi wypisuje `[notification] to: <email> ...` wyłącznie wtedy,
gdy ADMIN anuluje cudzą rezerwację. Przy wyłączaniu API oczekuje na zakończenie
listenerów przed zamknięciem puli bazy (`Event listeners finished` w logach).
Event bus jest w pamięci procesu: nagła awaria procesu może spowodować utratę
eventu pomiędzy COMMIT a wykonaniem listenera.

W Swagger UI jest grupa **Admin** i endpoint:

```text
GET /api/admin/audit-log?page=1&limit=20
GET /api/admin/audit-log?eventType=reservation.cancelled&page=1&limit=5
```

Wymaga tokenu ADMIN-a; bez tokenu zwraca 401, dla USER-a 403. Format odpowiedzi
to `{ data, meta: { page, limit, total, totalPages } }`, najnowsze wpisy są pierwsze
(`createdAt DESC`, następnie `id DESC`). ID wpisu audytu jest tekstem, ponieważ
PostgreSQL używa BIGINT. Zapisy audytu są asynchroniczne — po operacji odśwież listę.

