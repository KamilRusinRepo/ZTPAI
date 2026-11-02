// Uruchomienie demonstracji z rozpoczętą rezerwacją, niezależnie od ustawień terminala.
process.env.SEED_STARTED_RESERVATION = 'true';
process.env.REPOSITORY_DRIVER = 'memory';
await import('../src/server.js');
