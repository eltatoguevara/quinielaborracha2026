// Test funcional de "cruce válido" (criterio ampliado de llave eliminatoria).
//
// app.js y scoring.js NO usan IIFE (a diferencia de registro.js), así que
// sus funciones quedan disponibles directamente en window tras cargarlos
// con runScripts:"dangerously" en jsdom — no se necesita bridge.
//
// Escenario base (igual al del pedido original):
//   Participante predijo "Argentina vs Francia" en Cuartos slot 2 (pid 98).
//   En la REALIDAD, "Argentina vs Francia" ocurrió en Cuartos slot 1 (pid 97),
//   con marcador real 1-1 (penales: gana Argentina, tieBreaker "h").
//   En el cruce real de pid 98 jugaron otros 2 países (Brasil vs España).
//
// Casos probados:
//  1) Llave exacta de pid 98 (Argentina-Francia) falla porque el cruce real
//     ahí fue Brasil-España.
//  2) findCruceValido(pid 98) SÍ encuentra que ese cruce ocurrió realmente
//     en pid 97 (misma ronda = Cuartos).
//  3) calcElimMatchPts otorga 2pts de llave-por-cruce + puntos de resultado
//     comparando el marcador predicho (en pid 98) contra el marcador real
//     de pid 97, con orden h/a realineado si está invertido.
//  4) Si el participante predijo "Francia vs Argentina" (orden invertido) en
//     su slot, el cruce se sigue detectando igual (swapped=true) y el
//     marcador se realinea correctamente antes de comparar.
//  5) Si la llave exacta SÍ es correcta, findCruceValido no debe activarse
//     (consuelo exclusivo) — no debe haber doble conteo.
//  6) El bono de cruce respeta el gate de fase cerrada (isPrevPhaseClosed):
//     si la fase previa (octavos) no está cerrada, no se otorgan puntos.
//  7) El bono de cruce NO cruza rondas: un cruce idéntico que ocurrió
//     realmente en semifinales no debe contar para una predicción de cuartos.
//  8) calcElimMatchPts para llaves SIN ningún cruce real disponible sigue
//     devolviendo 0 (caso base preexistente, no debe romperse).
const { JSDOM } = require("jsdom");
const fs = require("fs");

// Cargamos el index.html REAL (jsdom full-page load test, como exige el
// proyecto) pero removemos: 1) el <script type="module"> de Firebase
// (requiere red externa a gstatic.com, irrelevante para testear scoring
// puro), 2) los <script src="https://..."> de html2canvas/jsPDF (mismo
// motivo). Los 6 scripts LOCALES (participantes.js...registro.js) se
// dejan intactos y se cargan en su orden real de index.html.
let htmlRaw = fs.readFileSync("./index.html", "utf8");
htmlRaw = htmlRaw.replace(/<script type="module">[\s\S]*?<\/script>/, "");
htmlRaw = htmlRaw.replace(/<script src="https:\/\/[^"]*"><\/script>\s*/g, "");

const dom = new JSDOM(htmlRaw, { url: "https://example.org/", runScripts: "dangerously" });
const { window } = dom;

window.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] || null; },
  setItem(k, v) { this._d[k] = v; },
  removeItem(k) { delete this._d[k]; },
};
window.toast = () => {};
window.alert = () => {};
window.confirm = () => true;
window.setInterval = () => 0;
window.isAdmin = () => true;
window.URL.createObjectURL = () => "blob:fake";
window.URL.revokeObjectURL = () => {};
window.Blob = function (parts, opts) { this.parts = parts; this.opts = opts; };
window.fetch = () => Promise.reject(new Error("network disabled in test"));

function readFile(p) { return fs.readFileSync(p, "utf8"); }

// Los 6 scripts locales se cargan en el MISMO orden que index.html define
// (ver <script src="...js?v=6.3"> al final del body):
//   participantes.js -> legacy-migracion.js -> utils.js -> scoring.js
//   -> app.js -> registro.js
const files = ["participantes.js", "legacy-migracion.js", "utils.js", "scoring.js", "app.js", "registro.js"];
let code = files.map(readFile).join("\n;\n");

// DB y S se declaran con "let" en participantes.js/app.js — a diferencia
// de "var" o las "function" declarations, "let" top-level NO se adjunta a
// window (ni en navegador real ni en jsdom: vive en el scope léxico del
// script, no en el global object). Para poder leerlos desde el test
// externo, agregamos un bridge AL FINAL del mismo bloque de código (mismo
// scope léxico que las declaraciones), igual en espíritu al bridge que ya
// usa test_backfill_special.js para las funciones internas de la IIFE de
// registro.js — acá no hace falta IIFE porque DB/S son top-level, pero el
// problema de fondo (let no cuelga de window) es el mismo.
code += `\n;\nwindow.__DB = DB; window.__S = S;\n`;

const script = window.document.createElement("script");
script.textContent = code;
window.document.body.appendChild(script);

const DB = window.__DB, S = window.__S;
const { isLlaveCorrecta, findCruceValido, calcElimMatchPts, uid } = window;

if (!isLlaveCorrecta || !findCruceValido || !calcElimMatchPts || !DB || !S) {
  console.error("❌ Las funciones/estado de scoring no quedaron disponibles — revisar carga.");
  process.exit(1);
}
console.log("✅ index.html completo (sin scripts externos) cargó sin errores — jsdom full-page load test OK.");

let allOk = true;
function check(label, condition) {
  console.log((condition ? "✅" : "❌") + " " + label);
  if (!condition) allOk = false;
}

// ── Setup participante de prueba ──
const pid = uid ? uid() : "test-id-1";
DB.participants.push({
  id: pid, codigo: "T1", name: "TEST CRUCE",
  city: "Panama", country: "Panama", email: "cruce@example.com", clave: "000000",
  estadoQuiniela: "enviada", fechaCreacion: Date.now(), fechaActualizacion: Date.now()
});

// Slots de Cuartos: qf_1 -> pid 97, qf_2 -> pid 98 (confirmado por
// KO_SLOT_IDS_V62 en app.js: 16 r32 + 8 r16 = 24 entradas antes de qf,
// pid = 73 + index, qf_1 es el índice 24 => pid 97).
DB.predictions[pid] = {
  qf_2: { h: 2, a: 1, _a: "Argentina", _b: "Francia" }, // predicción del usuario
};

// ── Resultado REAL: el cruce Argentina-Francia ocurrió en pid 97 (qf_1),
// no en pid 98 (qf_2, donde realmente jugaron Brasil vs España).
//
// getRealElimTeams() para pids >=89 NO lee S.elimTeams directo: recorre
// ELIM_TREE recursivamente hasta llegar a las HOJAS reales (1/16, pids
// 73-88, ELIM_1_16_IDS), que sí leen S.elimTeams/S.elimScores directo.
// Por eso construimos los resultados desde dieciseisavos hacia arriba,
// igual que pasaría en producción con datos reales del torneo:
//
//   ELIM_TREE[89] = {parentH:74, parentA:77}  -> pid97.h = ganador(89)
//   ELIM_TREE[90] = {parentH:73, parentA:75}  -> pid97.a = ganador(90)
//   ELIM_TREE[93] = {parentH:83, parentA:84}  -> pid98.h = ganador(93)
//   ELIM_TREE[94] = {parentH:81, parentA:82}  -> pid98.a = ganador(94)
S.elimTeams[74] = { h: "Argentina", a: "Bélgica" };
S.elimTeams[77] = { h: "Países Bajos", a: "Senegal" };
S.elimTeams[73] = { h: "Francia", a: "Marruecos" };
S.elimTeams[75] = { h: "Croacia", a: "Ghana" };
S.elimTeams[83] = { h: "Brasil", a: "Suiza" };
S.elimTeams[84] = { h: "Portugal", a: "Túnez" };
S.elimTeams[81] = { h: "España", a: "Irán" };
S.elimTeams[82] = { h: "Inglaterra", a: "Panamá" };

S.elimScores[74] = { h: 2, a: 0 }; // gana Argentina -> pid89.h
S.elimScores[77] = { h: 0, a: 1 }; // gana Senegal -> pid89.a (irrelevante, pierde igual luego)
S.elimScores[73] = { h: 3, a: 0 }; // gana Francia -> pid90.h
S.elimScores[75] = { h: 1, a: 0 }; // gana Croacia -> pid90.a (irrelevante)
S.elimScores[83] = { h: 2, a: 1 }; // gana Brasil -> pid93.h
S.elimScores[84] = { h: 0, a: 1 }; // gana Túnez -> pid93.a (irrelevante)
S.elimScores[81] = { h: 1, a: 0 }; // gana España -> pid94.h
S.elimScores[82] = { h: 2, a: 1 }; // gana Inglaterra -> pid94.a (irrelevante)

// Octavos (89,90,93,94): ganador de cada cruce de dieciseisavos avanza.
// pid89 = ganador(74)=Argentina vs ganador(77)=Senegal:
S.elimScores[89] = { h: 2, a: 0 }; // gana Argentina
// pid90 = ganador(73)=Francia vs ganador(75)=Croacia:
S.elimScores[90] = { h: 3, a: 1 }; // gana Francia
// pid93 = ganador(83)=Brasil vs ganador(84)=Túnez:
S.elimScores[93] = { h: 2, a: 0 }; // gana Brasil
// pid94 = ganador(81)=España vs ganador(82)=Inglaterra:
S.elimScores[94] = { h: 1, a: 0 }; // gana España

// Ahora sí, resultado real de pid 97 (qf_1 = Argentina vs Francia, según
// ELIM_TREE: parentH:89,parentA:90) y pid 98 (qf_2 = Brasil vs España,
// parentH:93,parentA:94):
S.elimScores[97] = { h: 1, a: 1 }; // empate -> tieBreaker decide quién avanza
S.tieBreakers[97] = "h"; // avanza Argentina (no afecta el test de pts, solo avance)
S.elimScores[98] = { h: 0, a: 2 }; // gana España

// Cerrar fase "octavos" (r8) para que cuartos (qf) pueda otorgar pts
// (isPrevPhaseClosed exige que la fase PREVIA a qf, que es r8, esté
// cerrada — ver BONUS_PHASES: {key:"qf", prevPhase:"r8"}).
S.bonos.closed["r8"] = true;

// ── Caso 1: llave exacta de pid 98 falla (Argentina/Francia ≠ Brasil/España) ──
check("CASO 1: llave exacta de pid 98 (su slot) es incorrecta",
  isLlaveCorrecta("TEST CRUCE", 98) === false);

// ── Caso 2: findCruceValido encuentra el cruce en pid 97 (misma ronda) ──
const cruce = findCruceValido("TEST CRUCE", 98);
check("CASO 2: findCruceValido detecta el cruce real en pid 97",
  !!cruce && cruce.pidReal === 97);

// ── Caso 3: calcElimMatchPts otorga 2pts llave-por-cruce + pts de resultado.
// Predicción: Argentina(h) 2 - Francia(a) 1. Real en pid97 (mismo orden,
// h=Argentina/a=Francia, sin swap): 1-1 empate.
// rR="D" (empate), pR="H" (predijo ganador local) -> NO coinciden -> 0pts
// de resultado. Total esperado: 2 (llave por cruce) + 0 = 2.
const pts1 = calcElimMatchPts("TEST CRUCE", 98);
check("CASO 3: calcElimMatchPts(pid 98) = 2 (solo llave por cruce, resultado no coincide)",
  pts1 === 2);

// ── Caso 4: orden h/a invertido en la predicción del usuario.
// Mismo escenario, pero el usuario predijo "Francia(h) 1 - Argentina(a) 2"
// (orden invertido respecto al real Argentina(h)-Francia(a) en pid97).
// findCruceValido debe marcar swapped=true y realinear el marcador real
// antes de comparar: realH(realineado)=real.a=1(Francia), realA=real.h=1
// (Argentina) -> en este caso 1-1 sigue siendo empate en ambos órdenes,
// así que para probar bien el realineamiento necesitamos un marcador NO
// simétrico. Ajustamos pid97 a un resultado no-empate para esta sub-prueba.
const pid4 = uid ? uid() : "test-id-4";
DB.participants.push({
  id: pid4, codigo: "T4", name: "TEST CRUCE SWAP",
  city: "Panama", country: "Panama", email: "swap@example.com", clave: "000001",
  estadoQuiniela: "enviada", fechaCreacion: Date.now(), fechaActualizacion: Date.now()
});
DB.predictions[pid4] = {
  // Usuario predijo Francia(h) 1 - Argentina(a) 2 -> ganador predicho: Argentina (visitante)
  qf_2: { h: 1, a: 2, _a: "Francia", _b: "Argentina" },
};
// pid97 real sigue siendo Argentina(h) vs Francia(a), ahora con marcador
// real 2-1 (gana Argentina como local, NO empate):
S.elimScores[97] = { h: 2, a: 1 };

const cruce4 = findCruceValido("TEST CRUCE SWAP", 98);
check("CASO 4a: swap detectado correctamente (predicción tiene Francia como local)",
  !!cruce4 && cruce4.swapped === true);

// Marcador real realineado al orden de la predicción (Francia=h,
// Argentina=a): realH=real.a=1, realA=real.h=2 -> "1-2", ganador=Argentina
// (visitante=A). El usuario predijo h=1,a=2 -> ganador predicho = A
// (Argentina) también. rR="A", pR="A" -> coinciden, +2pts. Marcador exacto
// (1-2 vs 1-2 realineado) -> +3 extra. Total: 2(llave-cruce)+2(ganador)+3(exacto)=7.
const pts4 = calcElimMatchPts("TEST CRUCE SWAP", 98);
check("CASO 4b: calcElimMatchPts realinea correctamente el marcador swapped (esperado 7)",
  pts4 === 7);

// ── Caso 5: si la llave exacta SÍ es correcta, findCruceValido no debe
// activarse (consuelo exclusivo) ──
const pid5 = uid ? uid() : "test-id-5";
DB.participants.push({
  id: pid5, codigo: "T5", name: "TEST LLAVE EXACTA",
  city: "Panama", country: "Panama", email: "exacta@example.com", clave: "000002",
  estadoQuiniela: "enviada", fechaCreacion: Date.now(), fechaActualizacion: Date.now()
});
DB.predictions[pid5] = {
  qf_2: { h: 0, a: 2, _a: "Brasil", _b: "España" }, // coincide exactamente con el cruce real de pid98
};
check("CASO 5: llave exacta correcta -> findCruceValido devuelve null (no se activa el fallback)",
  isLlaveCorrecta("TEST LLAVE EXACTA", 98) === true && findCruceValido("TEST LLAVE EXACTA", 98) === null);
const pts5 = calcElimMatchPts("TEST LLAVE EXACTA", 98);
// h=0,a=2 vs real h=0,a=2 -> ganador A coincide + exacto: 2(llave)+2(ganador)+3(exacto)=7
check("CASO 5b: puntaje de llave exacta sigue calculándose normal (sin interferencia del cruce, esperado 7)",
  pts5 === 7);

// ── Caso 6: gate de fase cerrada — si "r8" NO está cerrada, no se otorgan
// puntos de cruce (mismo criterio que la llave exacta) ──
S.bonos.closed["r8"] = false;
const pts6 = calcElimMatchPts("TEST CRUCE", 98);
check("CASO 6: sin fase previa cerrada, calcElimMatchPts(pid98) = 0 (gate respetado)",
  pts6 === 0);
S.bonos.closed["r8"] = true; // restaurar para los siguientes casos

// ── Caso 7: el cruce NO debe cruzar rondas — un mismo cruce que ocurrió
// realmente en semifinales no debe contar para una predicción de cuartos ──
// Pid 101 (sf_1, parentH:97,parentA:98) tendría como equipos reales a los
// ganadores de 97 y 98 (Argentina y España respectivamente), por lo que el
// cruce real ahí sería "Argentina vs España", DISTINTO del predicho
// "Argentina vs Francia" -> no debería ni aplicar como ejemplo de
// contaminación cruzada, pero confirmamos explícitamente que findCruceValido
// solo mira dentro de ELIM_ROUNDS de pid 98 (Cuartos: 97,98,99,100) y nunca
// pid 101/102 (Semis) ni 89-96 (Octavos).
const pid7 = uid ? uid() : "test-id-7";
DB.participants.push({
  id: pid7, codigo: "T7", name: "TEST NO CRUZA RONDA",
  city: "Panama", country: "Panama", email: "ronda@example.com", clave: "000003",
  estadoQuiniela: "enviada", fechaCreacion: Date.now(), fechaActualizacion: Date.now()
});
// Predice en OCTAVOS (pid 89) el cruce "Argentina vs Francia" (que sabemos
// ocurre realmente en CUARTOS pid 97, otra ronda) — no debe colarse:
DB.predictions[pid7] = {
  r16_1: { h: 2, a: 1, _a: "Argentina", _b: "Francia" }, // r16_1 -> pid 89 (octavos)
};
check("CASO 7: cruce idéntico en OTRA ronda (cuartos) no contamina una predicción de octavos",
  findCruceValido("TEST NO CRUZA RONDA", 89) === null);

// ── Caso 8: caso base preexistente — llave sin cruce real disponible en
// ninguna parte de la ronda sigue devolviendo 0, sin romperse ──
const pid8 = uid ? uid() : "test-id-8";
DB.participants.push({
  id: pid8, codigo: "T8", name: "TEST SIN CRUCE",
  city: "Panama", country: "Panama", email: "sincruce@example.com", clave: "000004",
  estadoQuiniela: "enviada", fechaCreacion: Date.now(), fechaActualizacion: Date.now()
});
DB.predictions[pid8] = {
  qf_2: { h: 1, a: 0, _a: "Italia", _b: "Portugal" }, // ninguno de estos jugó realmente en Cuartos
};
check("CASO 8: sin ningún cruce real coincidente en la ronda, calcElimMatchPts = 0 (no se rompe el caso base)",
  calcElimMatchPts("TEST SIN CRUCE", 98) === 0 && findCruceValido("TEST SIN CRUCE", 98) === null);

console.log("\n=== RESULTADO FINAL:", allOk ? "TODOS LOS CASOS PASAN ✅" : "HAY FALLOS ❌", "===");
process.exit(allOk ? 0 : 1);
