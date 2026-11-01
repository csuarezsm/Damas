/* Damas — el motor trabaja en segundo plano para que la app no se bloquee. © 2026 IT Canarias. */
importScripts('damas.js', 'motor.js');
self.onmessage = e => {
  const d = e.data;
  try {
    const res = Motor.handle(d, p => self.postMessage({ id: d.id, progress: p }));
    self.postMessage({ id: d.id, ok: true, res });
  } catch (err) {
    self.postMessage({ id: d.id, ok: false, error: String(err && err.message || err) });
  }
};
