import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}
const server = createApp().listen(port, () => {
  console.log(`Room Booking API: http://localhost:${port}`);
});
server.on('error', (error) => {
  console.error(`Cannot start API: ${error.message}`);
  process.exitCode = 1;
});
