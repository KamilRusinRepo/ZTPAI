# Room Booking API

[![CI](https://github.com/KamilRusinRepo/ZTPAI/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/KamilRusinRepo/ZTPAI/actions/workflows/ci.yml)

## Zadanie 5 — Continuous Integration

Workflow `.github/workflows/ci.yml` uruchamia się przy pushu do `main`
i przy każdym pull requeście. Job `Tests and Docker` uruchamia PostgreSQL 16
z healthcheckiem, pobiera kod, ustawia Node.js 22 z cache npm, wykonuje
`npm ci`, `npm test` (unit i integration) oraz `docker build`.

CI korzysta z osobnej bazy `room_booking_test` w jednorazowym kontenerze usługi.
`TEST_DATABASE_URL` jest ustawiany w workflow; `.env` ani dane deweloperskie
nie są potrzebne. Baza CI używa `trust` w izolowanym środowisku runnera, a sekret
JWT generuje `tests/setupEnv.js`. Workflow nie zawiera haseł ani tokenów
i nie wymaga konfigurowania sekretów do testów. Ma uprawnienie `contents: read`.

Do sprawozdania pokaż czerwone uruchomienie po celowej zmianie reguły kolizji,
zielone uruchomienie po przywróceniu poprawnego kodu w tym samym PR,
zmergowany PR oraz badge w README. Historia zadań 1–4 pozostaje w osobnych commitach.

### Demonstracja czerwonego i zielonego CI na GitHubie

Pliki workflow i badge muszą zostać zapisane w repozytorium GitHub; lokalne
uruchomienie testów nie jest uruchomieniem GitHub Actions. Poniższa procedura
pozwala uzyskać rzeczywiste wyniki do sprawozdania.

1. Z poprawnej wersji `Lab5` utwórz gałąź i zapisz konfigurację:

   ```powershell
   git switch -c ci/zadanie05
   git add .github/workflows/ci.yml README.md
   git commit -m "Add CI with PostgreSQL tests and Docker build"
   ```

2. W `src/modules/reservations/reservations.service.js` tymczasowo zmień
   `start < new Date(reservation.endTime).getTime()` na
   `start <= new Date(reservation.endTime).getTime()`. Zapisz błąd osobno:

   ```powershell
   git add src/modules/reservations/reservations.service.js
   git commit -m "Demonstrate CI detecting an overlap boundary regression"
   git push -u origin ci/zadanie05
   ```

3. Na GitHubie otwórz PR z `ci/zadanie05` do `main`. Poczekaj na wynik
   `CI / Tests and Docker`. Test stykających się przedziałów powinien nie przejść.
   Zrób screenshot czerwonego uruchomienia i zapisz jego URL w sprawozdaniu.

4. Przywróć `<` w tej samej linii i wypchnij poprawkę do **tej samej gałęzi**:

   ```powershell
   git add src/modules/reservations/reservations.service.js
   git commit -m "Fix overlap boundary and restore passing tests"
   git push
   ```

5. Poczekaj na zielone CI dla nowego commita. Pokaż, że testy oraz krok
   `Build Docker image` zakończyły się sukcesem. Zrób screenshot i zapisz URL.

6. Scal ten PR przez `Create a merge commit`, aby zachować historię demonstracji.
   Push do `main` uruchomi CI ponownie. Po sukcesie badge dla `main` będzie zielony.
   Do sprawozdania dodaj URL PR, oba uruchomienia, README z badge oraz hash merge commita.

Jeżeli GitHub wskazuje konflikt z `main`, rozwiąż go przed demonstracją.
Workflow raportuje wynik testów; blokowanie przycisku Merge wymaga dodatkowo
ustawienia tego checka jako wymaganego w regułach ochrony gałęzi `main`.

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

