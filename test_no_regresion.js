// Test de no-regresión: con llaves TODAS exactas (caso típico cuando el
// usuario predijo bien la posición), el resultado de calcElimMatchPts debe
// ser IDÉNTICO al comportamiento preexistente (2pts llave + pts resultado,
// sin que el nuevo camino de "cruce" interfiera para nada).
const { JSDOM } = require("jsdom");
const fs = require("fs");

let htmlRaw = fs.readFileSync("./index.html", "utf8");
htmlRaw = htmlRaw.replace(/<script type="module">[\s\S]*?<\/script>/, "");
htmlRaw = htmlRaw.replace(/<script src="https:\/\/[^"]*"><\/script>\s*/g, "");
const dom = new JSDOM(htmlRaw, { url: "https://example.org/", runScripts: "dangerously" });
const { window } = dom;
window.localStorage = { _d:{}, getItem(k){return this._d[k]||null;}, setItem(k,v){this._d[k]=v;}, removeItem(k){delete this._d[k];} };
window.toast=()=>{};window.alert=()=>{};window.confirm=()=>true;window.setInterval=()=>0;window.isAdmin=()=>true;
window.URL.createObjectURL=()=>"blob:fake";window.URL.revokeObjectURL=()=>{};window.Blob=function(){};
window.fetch=()=>Promise.reject(new Error("off"));

function readFile(p){return fs.readFileSync(p,"utf8");}
const files = ["participantes.js","legacy-migracion.js","utils.js","scoring.js","app.js","registro.js"];
let code = files.map(readFile).join("\n;\n");
code += "\n;\nwindow.__DB=DB;window.__S=S;\n";
const script = window.document.createElement("script");
script.textContent = code;
window.document.body.appendChild(script);
const DB = window.__DB, S = window.__S;
const { isLlaveCorrecta, findCruceValido, calcElimMatchPts, uid } = window;

let allOk = true;
function check(label, cond) { console.log((cond?"✅":"❌")+" "+label); if(!cond) allOk=false; }

// Participante con llave 100% exacta en dieciseisavos (pid 73), sin
// ningún otro cruce posible que pudiera confundirse.
const pid = uid();
DB.participants.push({ id: pid, codigo:"R1", name:"TEST REGRESION", city:"Panama", country:"Panama",
  email:"r@x.com", clave:"000009", estadoQuiniela:"enviada", fechaCreacion:Date.now(), fechaActualizacion:Date.now() });
DB.predictions[pid] = {
  r32_1: { h: 2, a: 0, _a: "México", _b: "Sudáfrica" }, // pid 73, exacto y marcador exacto
};
S.elimTeams[73] = { h: "México", a: "Sudáfrica" };
S.elimScores[73] = { h: 2, a: 0 }; // marcador real idéntico al predicho
S.bonos.closed["grupos"] = true; // prevPhase de r16 es "grupos"

check("Llave exacta sigue detectándose igual (pid 73)", isLlaveCorrecta("TEST REGRESION", 73) === true);
check("findCruceValido no se activa cuando la llave exacta es correcta", findCruceValido("TEST REGRESION", 73) === null);
// 2(llave) + 2(ganador) + 3(exacto) = 7, idéntico al comportamiento preexistente
check("calcElimMatchPts sigue dando 7pts (llave+ganador+exacto), sin cambios", calcElimMatchPts("TEST REGRESION", 73) === 7);

// Participante SIN ninguna predicción de llaves -> debe seguir devolviendo 0
const pid2 = uid();
DB.participants.push({ id: pid2, codigo:"R2", name:"TEST SIN PREDICCION", city:"Panama", country:"Panama",
  email:"r2@x.com", clave:"000010", estadoQuiniela:"borrador", fechaCreacion:Date.now(), fechaActualizacion:Date.now() });
DB.predictions[pid2] = {};
check("Sin predicción de llave, calcElimMatchPts sigue siendo 0", calcElimMatchPts("TEST SIN PREDICCION", 73) === 0);
check("Sin predicción de llave, findCruceValido devuelve null sin tronar", findCruceValido("TEST SIN PREDICCION", 73) === null);

console.log("\n=== RESULTADO FINAL:", allOk ? "SIN REGRESIONES ✅" : "HAY REGRESIONES ❌", "===");
process.exit(allOk ? 0 : 1);
