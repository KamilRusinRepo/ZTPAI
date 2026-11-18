import { EventEmitter } from 'node:events';

export function createEventBus({ logger = console, now = () => new Date() } = {}) {
  const emitter = new EventEmitter();
  const pending = new Set();
  return {
    publish(name, payload) {
      emitter.emit(name, { name, occurredAt: now().toISOString(), payload: structuredClone(payload) });
    },
    subscribe(name, handler) {
      const listener = (event) => {
        // Odroczenie przechwytuje zarówno throw, jak i odrzucony Promise listenera.
        const task = Promise.resolve().then(() => handler(event))
          .catch((error) => { logger.error(`[event:${name}] handler failed`, error); });
        pending.add(task);
        void task.then(() => pending.delete(task));
      };
      emitter.on(name, listener);
      return () => emitter.off(name, listener);
    },
    // Testy i graceful shutdown czekają na zakończenie zadań przed zamknięciem DB.
    async flush() {
      while (pending.size) await Promise.all([...pending]);
    },
  };
}

export const noopEventBus = { publish() {}, subscribe() {}, async flush() {} };
