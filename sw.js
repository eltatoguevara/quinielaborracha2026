// QUINIELA BORRACHA 2026 — Service Worker v7.3
// ══════════════════════════════════════════════════════════════
// Objetivo: instalabilidad (ícono en pantalla de inicio), NO caché
// agresivo. Con el Mundial en vivo, lo peor que puede pasar es que
// alguien quede viendo una versión vieja sin darse cuenta -- por
// eso la estrategia es "red primero, caché solo como red de
// salvación si no hay conexión en ese momento".
//
// Reglas:
//   1. Con conexión: SIEMPRE se pide la red. Si responde bien, se
//      guarda una copia en caché (por si después no hay señal) y
//      se devuelve esa respuesta fresca -- igual que sin Service
//      Worker, no cambia nada del comportamiento normal online.
//   2. Sin conexión: si la red falla, se devuelve la última copia
//      que sí se haya guardado en caché (puede estar vieja, pero
//      es mejor que la pantalla de error del navegador).
//   3. Solo se cachean pedidos GET del propio sitio (same-origin).
//      Todo lo de Firebase/Firestore/CDNs externos (gstatic.com,
//      cdnjs, fonts.googleapis.com, etc.) NUNCA pasa por el Service
//      Worker -- el navegador los maneja directo, como siempre.
// ══════════════════════════════════════════════════════════════

const CACHE_NAME = "qb2026-v1";

self.addEventListener("install", (event) => {
  // No precargamos nada a propósito: los nombres de los .js/.css
  // llevan "?v=X.X" que cambia en cada release, así que no hay una
  // lista fija de URLs para precachear. El caché se va llenando
  // solo, a medida que la gente navega con conexión (ver fetch).
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Solo GET y solo mismo origen (deja pasar Firebase/CDNs sin tocar).
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    fetch(req)
      .then((res) => {
        // Red OK -> guardamos copia fresca para el día que no haya señal.
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => {
        // Sin red -> lo que haya en caché (puede no haber nada la
        // primera vez que alguien usa el sitio sin conexión todavía).
        return caches.match(req);
      })
  );
});
