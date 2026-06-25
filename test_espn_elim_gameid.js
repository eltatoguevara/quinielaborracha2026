// Test funcional del nuevo matching por gameId de ESPN en fetchESPNElim()
// (v7.0) — reemplaza la detección por nombre de equipo/orden cronológico.
// 1) Carga completa en jsdom de los 6 archivos JS de producción, en el
//    mismo orden que index.html (participantes -> legacy-migracion ->
//    utils -> scoring -> app -> registro), para detectar errores de
//    sintaxis/declaración duplicada/scope que node --check no ve.
// 2) Prueba funcional del nuevo matching por gameId de ESPN en
//    fetchESPNElim(): carga de cruce nuevo, corrección silenciosa de
//    cruce mal generado (sin resultado en juego), y conflicto cuando ya
//    hay un resultado guardado.
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const FILES = ["participantes.js", "legacy-migracion.js", "utils.js", "scoring.js", "app.js", "registro.js"];

// HTML real del index.html, sin los <script> originales (los inyectamos
// nosotros a mano, en el mismo orden, para controlar el entorno).
let html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
html = html.replace(/<script[^>]*src=[^>]*><\/script>/g, "");
html = html.replace(/<script type="module">[\s\S]*?<\/script>/g, "");

const dom = new JSDOM(html, { url: "https://example.org/", runScripts: "dangerously" });
const { window } = dom;
window.confirm = () => true;
window.alert = () => {};
window.URL.createObjectURL = () => "blob:fake";
window.URL.revokeObjectURL = () => {};
window.Blob = function () {};
window.setInterval = () => 0;

// Mock mínimo de Firebase: nunca dispara callbacks (no necesitamos sync
// real para este test), solo evita que wireFirebaseAuth/wireParticipantesSync exploten.
window.__fb = {
  auth: {},
  PARTICIPANTS_COL: {}, REGISTRO_META_DOC: {}, REGISTRO_PAPELERA_DOC: {},
  onAuthStateChanged: () => {},
  signInAnonymously: () => Promise.resolve(),
  onSnapshot: () => () => {},
  signOut: () => Promise.resolve(),
};

let allOk = true;
function check(label, cond) { console.log((cond ? "✅ " : "❌ ") + label); if (!cond) allOk = false; }

// Mock de fetch: devuelve eventos ESPN según la fecha pedida.
let fetchResponses = {};
window.fetch = (url) => {
  const m = String(url).match(/dates=(\d+)/);
  const d = m ? m[1] : null;
  const events = fetchResponses[d] || [];
  return Promise.resolve({ ok: true, json: () => Promise.resolve({ events }) });
};

for (const f of FILES) {
  const code = fs.readFileSync(path.join(__dirname, f), "utf8");
  const script = window.document.createElement("script");
  script.textContent = code;
  try {
    window.document.body.appendChild(script);
  } catch (e) {
    console.error(`❌ Excepción al cargar ${f}:`, e.message);
    process.exit(1);
  }
}

// Bridge: `let`/`const` de script clásico no quedan como propiedades de
// `window` (solo `var`/`function` sí) — exponemos lo que el test necesita,
// igual patrón que ya usa test_login_reclaim.js para la IIFE de registro.js.
const bridgeScript = window.document.createElement("script");
bridgeScript.textContent = `
window.__test = {
  getS: () => S,
  getGameIdMap: () => ESPN_GAMEID_TO_PID,
  getElimConflictQueue: () => _elimConflictQueue,
  getElimConflictCurrent: () => _elimConflictCurrent,
};
`;
window.document.body.appendChild(bridgeScript);
const T = window.__test;

check("Los 6 archivos cargaron sin lanzar excepción", true);
check("ESPN_GAMEID_TO_PID está definido y tiene 32 entradas", T.getGameIdMap() && Object.keys(T.getGameIdMap()).length === 32);
check("ESPN_GAMEID_TO_PID['760486'] === 73 (P73)", T.getGameIdMap()["760486"] === 73);
check("ESPN_GAMEID_TO_PID['760517'] === 104 (Final)", T.getGameIdMap()["760517"] === 104);
check("fetchESPNElim es una función global", typeof window.fetchESPNElim === "function");
check("openElimConflict es una función global", typeof window.openElimConflict === "function");
check("resolveElimTeamConflict es una función global", typeof window.resolveElimTeamConflict === "function");

function espnEvent(id, homeName, awayName, homeScore, awayAbbr, awayScore, state, date) {
  return {
    id: String(id), date: date || "2026-06-28T19:00Z",
    competitions: [{
      status: { type: { state: state || "pre" } },
      competitors: [
        { homeAway: "home", score: String(homeScore || 0), team: { displayName: homeName, abbreviation: "X" } },
        { homeAway: "away", score: String(awayScore || 0), team: { displayName: awayName, abbreviation: awayAbbr || "Y" } },
      ],
    }],
    status: { type: { state: state || "pre" } },
  };
}

(async () => {
  // ── Caso 1: cruce nuevo (sin nada cargado todavía) — debe cargarse directo ──
  T.getS().elimTeams = {}; T.getS().elimScores = {};
  fetchResponses = { "20260628": [espnEvent(760486, "South Africa", "Canada", 0, "CAN", 0, "pre")] };
  await window.fetchESPNElim();
  check("Caso 1: P73 cargó equipos nuevos desde ESPN", T.getS().elimTeams[73] && T.getS().elimTeams[73].h === "Sudáfrica" && T.getS().elimTeams[73].a === "Canadá");
  check("Caso 1: sin conflictos pendientes", T.getElimConflictQueue().length === 0);

  // ── Caso 2: llave mal generada (otro equipo) pero SIN resultado cargado — corrección silenciosa ──
  T.getS().elimTeams = { 73: { h: "México", a: "Catar" } }; // mal generada a propósito
  T.getS().elimScores = {};
  fetchResponses = { "20260628": [espnEvent(760486, "South Africa", "Canada", 0, "CAN", 0, "pre")] };
  await window.fetchESPNElim();
  check("Caso 2: corrigió la llave sin pedir confirmación (no había resultado en juego)", T.getS().elimTeams[73].h === "Sudáfrica" && T.getS().elimTeams[73].a === "Canadá");
  check("Caso 2: sin conflictos pendientes", T.getElimConflictQueue().length === 0);

  // ── Caso 3: llave mal generada Y YA tiene un resultado cargado — debe abrir conflicto, no pisar nada ──
  T.getS().elimTeams = { 73: { h: "México", a: "Catar" } };
  T.getS().elimScores = { 73: { h: 2, a: 1, live: false } }; // resultado ya cargado para el cruce equivocado
  fetchResponses = { "20260628": [espnEvent(760486, "South Africa", "Canada", 3, "CAN", 0, "post")] };
  await window.fetchESPNElim();
  check("Caso 3: NO pisó los equipos en silencio", T.getS().elimTeams[73].h === "México" && T.getS().elimTeams[73].a === "Catar");
  check("Caso 3: NO pisó el resultado viejo", T.getS().elimScores[73].h === 2 && T.getS().elimScores[73].a === 1);
  check("Caso 3: quedó el modal de conflicto abierto", window.document.getElementById("elim-conflict-overlay").style.display === "flex");
  check("Caso 3: el conflicto pendiente es el pid 73", T.getElimConflictCurrent() && T.getElimConflictCurrent().pid === 73);

  // Resolver el conflicto eligiendo ESPN: debe corregir equipos y borrar el resultado viejo
  window.resolveElimTeamConflict("espn");
  check("Caso 3b: al elegir ESPN, corrigió los equipos", T.getS().elimTeams[73].h === "Sudáfrica" && T.getS().elimTeams[73].a === "Canadá");
  check("Caso 3b: al elegir ESPN, borró el resultado viejo (ya no aplicaba)", T.getS().elimScores[73] === undefined);
  check("Caso 3b: modal cerrado", window.document.getElementById("elim-conflict-overlay").style.display === "none");

  // ── Caso 4: mismo conflicto, pero esta vez el admin elige mantener lo actual ──
  T.getS().elimTeams = { 73: { h: "México", a: "Catar" } };
  T.getS().elimScores = { 73: { h: 2, a: 1, live: false } };
  fetchResponses = { "20260628": [espnEvent(760486, "South Africa", "Canada", 3, "CAN", 0, "post")] };
  await window.fetchESPNElim();
  window.resolveElimTeamConflict("keep");
  check("Caso 4: al mantener, los equipos NO cambian", T.getS().elimTeams[73].h === "México" && T.getS().elimTeams[73].a === "Catar");
  check("Caso 4: al mantener, el resultado viejo NO se borra", T.getS().elimScores[73] && T.getS().elimScores[73].h === 2);

  console.log(allOk ? "\n✅✅✅ TODO OK" : "\n❌❌❌ HAY FALLOS");
  process.exit(allOk ? 0 : 1);
})();
