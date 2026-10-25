// Uruchomienie demonstracji z rozpoczętą rezerwacją, niezależnie od ustawień terminala.
process.env.SEED_STARTED_RESERVATION = 'true';
await import('../src/server.js');
