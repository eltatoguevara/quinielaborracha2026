// Test rápido y aislado de la lógica de enrutamiento de sw.js v7.4.
// No se puede instanciar un Service Worker real en Node, así que esto
// valida la misma regla que usa el fetch handler: ¿la URL tiene "?v="
// o no? -- es la única decisión que cambia con este release.

const casos = [
  { url: "https://x.github.io/quinielaborracha2026/participantes.js?v=6.9.1", esperado: true },
  { url: "https://x.github.io/quinielaborracha2026/styles.css?v=6.6.4", esperado: true },
  { url: "https://x.github.io/quinielaborracha2026/manifest.json?v=1", esperado: true },
  { url: "https://x.github.io/quinielaborracha2026/favicon.png?v=1", esperado: true },
  { url: "https://x.github.io/quinielaborracha2026/icon-512.png?v=1&extra=1", esperado: true },
  { url: "https://x.github.io/quinielaborracha2026/index.html", esperado: false },
  { url: "https://x.github.io/quinielaborracha2026/", esperado: false },
  { url: "https://x.github.io/quinielaborracha2026/?test=1", esperado: false }, // ?test=1, no "v"
  { url: "https://x.github.io/quinielaborracha2026/sw.js", esperado: false },
];

let ok = true;
for (const c of casos) {
  const url = new URL(c.url);
  const esVersionado = url.searchParams.has("v");
  const pasa = esVersionado === c.esperado;
  console.log(`${pasa ? "✅" : "❌"} ${c.url} -> esVersionado=${esVersionado} (esperado ${c.esperado})`);
  if (!pasa) ok = false;
}

console.log(ok ? "\n=== RESULTADO: TODO OK ✅ ===" : "\n=== RESULTADO: HAY ERRORES ❌ ===");
process.exit(ok ? 0 : 1);
