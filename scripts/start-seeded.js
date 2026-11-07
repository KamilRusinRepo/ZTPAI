// Configuration interprets this flag before the server starts.
process.argv.push('--seed-demo');
await import('../src/server.js');
