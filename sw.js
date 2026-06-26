// QUINIELA BORRACHA 2026 — Service Worker v7.4
// ══════════════════════════════════════════════════════════════
// Objetivo: instalabilidad (ícono en pantalla de inicio), NO caché
// agresivo. Con el Mundial en vivo, lo peor que puede pasar es que
// alguien quede viendo una versión vieja sin darse cuenta -- por
// eso la estrategia base sigue siendo "red primero, caché solo
// como red de salvación si no hay conexión en ese momento".
//
// v7.4 — Excepción a esa regla SOLO para pedidos con "?v=" en la URL
// (participantes.js?v=6.9.1, styles.css?v=6.6.4, los íconos,
// manifest.json?v=1, etc. -- todo lo que ya sigue la disciplina de
// cache-busting documentada en el proyecto). Esos archivos son
// INMUTABLES para esa versión exacta: si su contenido cambia, el
// "?v=" cambia con él. Por eso tiene sentido servirlos cache-first
// (caché primero, red solo si no estaba) en vez de pagar una ida y
// vuelta a la red en cada apertura de la PWA -- esa ida y vuelta
// repetida a archivos que nunca cambian era la causa real de la
// demora al abrir desde la pantalla de inicio en iPhone.
// index.html (y cualquier otro pedido sin "?v=") sigue exactamente
// igual que antes: red primero, sin excepciones, para no arriesgar
// que alguien quede con una versión vieja del HTML.
//
// Reglas:
//   1. Pedido CON "?v=": caché primero; si no está, va a la red y
//      recién ahí se guarda en caché.
//   2. Pedido SIN "?v=" (típicamente index.html): red primero, como
//      siempre. Si responde bien, se guarda una copia en caché (por
//      si después no hay señal) y se devuelve esa respuesta fresca.
//   3. Sin conexión (en cualquiera de los dos casos anteriores): si
//      la red falla, se devuelve la última copia que sí se haya
//      guardado en caché (puede estar vieja, pero es mejor que la
//      pantalla de error del navegador).
//   4. Solo se cachean pedidos GET del propio sitio (same-origin).
//      Todo lo de Firebase/Firestore/CDNs externos (gstatic.com,
//      cdnjs, fonts.googleapis.com, etc.) NUNCA pasa por el Service
//      Worker -- el navegador los maneja directo, como siempre.
// ══════════════════════════════════════════════════════════════

const CACHE_NAME = "qb2026-v2";

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

  const url = new URL(req.url);
  const esVersionado = url.searchParams.has("v");

  if (esVersionado) {
    // v7.4 — Caché primero: este archivo, con este "?v=" exacto, no va
    // a cambiar de contenido. Si ya lo tenemos guardado, lo devolvemos
    // de una sin tocar la red. Si es la primera vez (o se limpió el
    // caché), va a la red y lo guarda para la próxima apertura.
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        });
      })
    );
    return;
  }

  // Sin "?v=" (index.html, manifest.json sin versionar si lo hubiera,
  // etc.) -- SIN CAMBIOS respecto a v7.3: red primero siempre.
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
