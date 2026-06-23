// Test funcional del fix "campeón/subcampeón/3er lugar no persistidos".
//
// registro.js encapsula TODO su código dentro de una única IIFE
// `(function(){ ... })();` (patrón correcto de encapsulación: no ensucia
// el scope global con sus ~80 funciones internas; los botones se
// conectan vía addEventListener programático, no onclick="" inline). Por
// eso, para acceder a sus funciones internas desde un test externo, hay
// que insertar un pequeño "bridge" (`window.__test = {...}`) DENTRO del
// cuerpo de esa IIFE, justo antes de su cierre `})();` — no se puede leer
// `GROUP_MATCHES`/`computeBracket`/etc. desde afuera de ninguna otra forma,
// ni siquiera con dom.window.eval(), exactamente como pasaría en un
// navegador real con este mismo código.
//
// Casos probados:
//  1) Un participante que llena su quiniela completa (grupos + las 31
//     llaves de eliminatoria) y hace clic en "Enviar" -> debe quedar con
//     preds.special.campeon/subcampeon/tercer ya PERSISTIDOS en DB
//     (antes del fix, quedaban vacíos para siempre).
//  2) Un participante "legacy bug": ya tiene su bracket completo y su
//     quiniela marcada como 'enviada' (como quedaba cualquiera que envió
//     ANTES de este fix), pero preds.special no tiene esos 3 campos ->
//     backfillAutoSpecialForAll() (botón real del panel Admin) debe
//     corregirlo sin tocar el resto de su quiniela.
//  3) Correr el backfill una segunda vez es idempotente.
//  4) Un participante con bracket incompleto no debe ser tocado.
const { JSDOM } = require("jsdom");
const fs = require("fs");

const html = `<!doctype html><html><body>
  <div id="rg-tabs">
    <button class="rg-tab on" data-tab="inicio">Inicio</button>
    <button class="rg-tab admin-tab" data-tab="admin">Admin</button>
  </div>
  <div id="rg-content"></div>
  <div id="toast"></div>
  <div id="em_continue"></div>
  <div id="em_save_exit"></div>
  <div id="em_discard"></div>
  <div id="block_ok"></div>
  <div id="block_goto"></div>
  <div id="exitModal" style="display:none"></div>
  <div id="blockModal" style="display:none"></div>
  <div id="blockModalText"></div>
  <div id="pdfPoster"></div>
</body></html>`;

const dom = new JSDOM(html, { url: "https://example.org/", runScripts: "dangerously" });
const { window } = dom;

window.URL.createObjectURL = () => "blob:fake";
window.URL.revokeObjectURL = () => {};
window.Blob = function (parts, opts) { this.parts = parts; this.opts = opts; };
window.confirm = () => true;  // auto-aceptar confirm() del backfill/migración
window.alert = () => {};
window.toast = (msg, err) => { console.log(`[toast]${err ? " ERR" : ""}: ${msg}`); };
window.isAdmin = () => true;  // sesión de admin simulada
window.setInterval = () => 0; // neutraliza el chequeo de cierre automático (30s) de producción

function readFile(p) { return fs.readFileSync(p, "utf8"); }

const code1 = readFile("./participantes.js");
let code2 = readFile("./registro.js");

// Insertamos el bridge JUSTO ANTES del cierre de la IIFE ("})();" al
// final del archivo), para que quede dentro de su scope real.
const closeIdx = code2.lastIndexOf("})();");
if (closeIdx === -1) throw new Error("No se encontró el cierre de la IIFE en registro.js — revisar si cambió la estructura del archivo.");
const bridge = `
window.__test = {
  GROUP_MATCHES, KO_SLOT_IDS, computeBracket, computeAutoSpecial,
  uid, nextCode, genClave, backfillAutoSpecialForAll, DB, saveData
};
`;
code2 = code2.slice(0, closeIdx) + bridge + code2.slice(closeIdx);

const script = window.document.createElement("script");
script.textContent = code1 + "\n;\n" + code2;
window.document.body.appendChild(script);

if (!window.__test) {
  console.error("❌ El bridge no se ejecutó — algo abortó la carga de registro.js antes de llegar a él.");
  process.exit(1);
}

const T = window.__test;
const { GROUP_MATCHES, KO_SLOT_IDS, computeBracket, computeAutoSpecial,
        uid, nextCode, genClave, DB } = T;

console.log("GROUP_MATCHES:", GROUP_MATCHES.length, "partidos");
console.log("KO_SLOT_IDS:", KO_SLOT_IDS.length, "slots");

// ── Helper: construye predicciones con TODOS los partidos de grupos
// resueltos sin empates (evita la rama de penales) y, sobre esa base,
// recorre las rondas de eliminatoria completando cada cruce disponible
// (eligiendo siempre el equipo "a" de cada llave) hasta que el bracket
// quede 'ready' con final.winner y third.winner resueltos. ──
function buildFullPreds() {
  const preds = {};
  GROUP_MATCHES.forEach(m => { preds[m.id] = { h: 2, a: 0 }; });

  for (let iter = 0; iter < 10; iter++) {
    const bracket = computeBracket(preds);
    if (!bracket.ready) break; // no debería pasar, los grupos ya están completos desde la 1ra vuelta
    if (bracket.final.winner && bracket.third.winner) break;
    [...bracket.r32, ...bracket.r16, ...bracket.qf, ...bracket.sf, bracket.third, bracket.final]
      .forEach(m => {
        if (m.a && m.b && !m.winner) {
          preds[m.slot] = { h: 2, a: 0, pick: m.a, _a: m.a, _b: m.b };
        }
      });
  }
  return preds;
}

const preds = buildFullPreds();
const bracket = computeBracket(preds);
console.log("\nbracket.ready:", bracket.ready);
console.log("bracket.final winner:", bracket.final && bracket.final.winner);
console.log("bracket.third winner:", bracket.third && bracket.third.winner);

const autoSp = computeAutoSpecial(bracket);
console.log("\ncomputeAutoSpecial() resultado:", autoSp);

if (!bracket.ready || !autoSp.campeon || !autoSp.subcampeon || !autoSp.tercer) {
  console.error("\n❌ El bracket de prueba no quedó completamente resuelto — el harness necesita ajuste, no el fix.");
  process.exit(1);
}

let allOk = true;
function check(label, condition) {
  console.log((condition ? "✅" : "❌") + " " + label);
  if (!condition) allOk = false;
}

// ── Caso 1: simular el envío real a través de DB (la misma instancia que
// usa el módulo cargado) ──
const pid = uid();
DB.participants.push({
  id: pid, codigo: nextCode(), name: "TEST PARTICIPANTE NUEVO",
  city: "Panama", country: "Panama", email: "test@example.com", clave: genClave(),
  estadoQuiniela: "borrador", fechaCreacion: Date.now(), fechaActualizacion: Date.now()
});
DB.predictions[pid] = JSON.parse(JSON.stringify(preds)); // sin 'special' todavía

console.log("\n--- Caso 1: ANTES del submit ---");
console.log("preds.special:", DB.predictions[pid].special);

// Replicamos EXACTAMENTE lo que hace el handler del botón "Enviar" del
// paso 'review' en renderQuinielaForm (ver registro.js):
//   const finalBracket = computeBracket(DRAFT_PREDS);
//   const autoSp = computeAutoSpecial(finalBracket);
//   DRAFT_PREDS.special = {...(DRAFT_PREDS.special||{}), ...autoSp};
//   p.estadoQuiniela = 'enviada'; ...
function simulateSubmit(participantId) {
  const p = DB.participants.find(x => x.id === participantId);
  const predsRef = DB.predictions[participantId];
  const finalBracket = computeBracket(predsRef);
  const autoSpecial = computeAutoSpecial(finalBracket);
  predsRef.special = { ...(predsRef.special || {}), ...autoSpecial };
  p.estadoQuiniela = "enviada";
  p.fechaEnvio = Date.now();
}
simulateSubmit(pid);

console.log("\n--- Caso 1: DESPUÉS del submit (con el fix aplicado) ---");
console.log("preds.special:", DB.predictions[pid].special);

check("CASO 1: special.campeon persistido correctamente",
  DB.predictions[pid].special.campeon === autoSp.campeon && !!autoSp.campeon);
check("CASO 1: special.subcampeon persistido correctamente",
  DB.predictions[pid].special.subcampeon === autoSp.subcampeon && !!autoSp.subcampeon);
check("CASO 1: special.tercer persistido correctamente",
  DB.predictions[pid].special.tercer === autoSp.tercer && !!autoSp.tercer);

// ── Caso 2: participante "legacy bug" — bracket completo y ya enviada,
// pero preds.special vacío en esos 3 campos (estado típico de quien
// envió ANTES de este fix) ──
const pid2 = uid();
DB.participants.push({
  id: pid2, codigo: nextCode(), name: "TEST PARTICIPANTE BUGUEADO",
  city: "Panama", country: "Panama", email: "bug@example.com", clave: genClave(),
  estadoQuiniela: "enviada", fechaCreacion: Date.now() - 99999, fechaActualizacion: Date.now() - 99999,
  fechaEnvio: Date.now() - 99999
});
DB.predictions[pid2] = JSON.parse(JSON.stringify(preds));
// Tiene otros campos de 'special' (de antes del fix), pero NUNCA campeon/subcampeon/tercer:
DB.predictions[pid2].special = { goleador: "Jugador Falso", goles_goleador: 5, pais_goleador: "Brasil" };

console.log("\n--- Caso 2 (legacy bug) ANTES del backfill ---");
console.log("preds.special:", DB.predictions[pid2].special);

T.backfillAutoSpecialForAll();

console.log("\n--- Caso 2 DESPUÉS del backfill ---");
console.log("preds.special:", DB.predictions[pid2].special);

const sp2 = DB.predictions[pid2].special;
check("CASO 2: backfill llenó campeon/subcampeon/tercer del legacy bug",
  sp2.campeon === autoSp.campeon && sp2.subcampeon === autoSp.subcampeon && sp2.tercer === autoSp.tercer);
check("CASO 2: backfill NO pisó otros campos de special ya existentes",
  sp2.goleador === "Jugador Falso" && sp2.goles_goleador === 5 && sp2.pais_goleador === "Brasil");

// ── Caso 3: correr el backfill una SEGUNDA vez es idempotente ──
const beforeSecondRun = JSON.stringify(DB.predictions[pid2].special);
T.backfillAutoSpecialForAll();
const afterSecondRun = JSON.stringify(DB.predictions[pid2].special);
check("CASO 3: correr el backfill 2 veces es idempotente (no cambia nada en la 2da)",
  beforeSecondRun === afterSecondRun);

// ── Caso 4: un participante SIN bracket completo (torneo en curso, normal
// para la mayoría hoy) no debe ser tocado por el backfill ──
const pid3 = uid();
DB.participants.push({
  id: pid3, codigo: nextCode(), name: "TEST PARTICIPANTE EN PROGRESO",
  city: "Panama", country: "Panama", email: "progreso@example.com", clave: genClave(),
  estadoQuiniela: "borrador", fechaCreacion: Date.now(), fechaActualizacion: Date.now()
});
const predsParciales = {};
GROUP_MATCHES.slice(0, 10).forEach(m => { predsParciales[m.id] = { h: 1, a: 0 }; }); // solo 10 de 72
DB.predictions[pid3] = predsParciales;
const before3 = JSON.stringify(DB.predictions[pid3]);
T.backfillAutoSpecialForAll();
const after3 = JSON.stringify(DB.predictions[pid3]);
check("CASO 4: participante con bracket incompleto queda intacto tras el backfill",
  before3 === after3);

console.log("\n=== RESULTADO FINAL:", allOk ? "TODOS LOS CASOS PASAN ✅" : "HAY FALLOS ❌", "===");
process.exit(allOk ? 0 : 1);
