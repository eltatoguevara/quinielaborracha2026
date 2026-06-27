// Test funcional del FIX v7.5 al bug reportado: "me registro, me pide el
// correo otra vez la próxima vez, y nunca aparece en el panel Admin".
//
// Este test ejercita onCrearSubmit() (registro.js) de punta a punta --
// no solo rgCreateParticipantConfirmed() en aislamiento (eso ya lo cubre
// CASO 8/9 de test_participantes_security.js) -- contra el mismo
// "Firestore" en memoria con atomicidad real de batch y el mismo
// chequeo de reglas de registro_privado, para confirmar que la PANTALLA
// (botón deshabilitado durante el guardado, mensaje de error visible y
// persistente si el servidor rechaza, nada queda "a medias" en
// DB.participants) se comporta como debería en ambos escenarios.
//
// registro.js está envuelto en una única IIFE -- el bridge para acceder
// a sus funciones internas (onCrearSubmit, DB, etc.) se inserta DENTRO
// de esa IIFE, justo antes de su cierre "})();", mismo patrón que
// test_login_reclaim.js.
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const ADMIN_EMAIL = "agustingb23@gmail.com";

// ── "Firestore" en memoria -- mismo modelo de reglas reales que
// test_participantes_security.js (batch atómico + reglas de
// registro_privado, con el mismo interruptor para reproducir el bug:
// la regla de esa colección nunca se publicó en Firebase Console). ──
function makeFakeFirestore() {
  const participantsStore = {};
  const privadoStore = {};
  const metaStore = { current: null };
  let currentAuthUser = null;
  let privadoRulesMissing = false;

  function isAdminAuth(auth) { return !!auth && auth.email === ADMIN_EMAIL; }
  function diffAffectedKeys(before, after) {
    const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
    const affected = [];
    keys.forEach(k => {
      if (JSON.stringify(before ? before[k] : undefined) !== JSON.stringify(after ? after[k] : undefined)) affected.push(k);
    });
    return affected;
  }
  function hasOnly(affected, allowed) { return affected.every(k => allowed.includes(k)); }

  function rulesAllowParticipantSet(auth, before, after) {
    if (!auth) return false;
    if (before === null) return after.ownerUid === auth.uid || isAdminAuth(auth);
    if (before.ownerUid === auth.uid) return true;
    return isAdminAuth(auth);
  }
  function rulesAllowPrivadoSet(auth, before, after) {
    if (privadoRulesMissing) return false; // v7.5 — reproduce el bug: sin regla publicada = niega TODO
    if (!auth) return false;
    if (before === null) return after.ownerUid === auth.uid || isAdminAuth(auth);
    if (before.ownerUid === auth.uid) return true;
    return isAdminAuth(auth);
  }
  function rulesAllowMetaSet(auth, before, after) {
    if (!auth) return false;
    if (isAdminAuth(auth)) return true;
    if (before === null) return true; // primera escritura del documento, igual que en firestore.rules real
    const affected = diffAffectedKeys(before, after);
    return hasOnly(affected, ['nextSeq', 'updatedAt']);
  }

  return {
    db: {}, auth: { get currentUser() { return currentAuthUser; } },
    PARTICIPANTS_COL: { __isParticipantsCol: true },
    PRIVADO_COL: { __isPrivadoCol: true },
    REGISTRO_META_DOC: { __isMetaDoc: true },
    REGISTRO_PAPELERA_DOC: { __isPapeleraDoc: true },
    doc(col) {
      if (col && col.__isPrivadoCol) return { __isPrivadoDoc: true, id: arguments[1] };
      if (col && col.__isMetaDoc !== undefined && col.__isMetaDoc) return { __isMetaDoc: true };
      return { __isParticipantDoc: true, id: arguments[1] };
    },
    serverTimestamp() { return "ST"; },
    onSnapshot() { return () => {}; },
    writeBatch() {
      const ops = [];
      return {
        set(ref, data) { ops.push({ ref, data }); },
        delete() {},
        commit() {
          for (const op of ops) {
            if (op.ref.__isParticipantDoc) {
              const before = participantsStore[op.ref.id] || null;
              if (!rulesAllowParticipantSet(currentAuthUser, before, op.data)) {
                const e = new Error("permission-denied (simulado)"); e.code = "permission-denied"; return Promise.reject(e);
              }
            }
            if (op.ref.__isPrivadoDoc) {
              const before = privadoStore[op.ref.id] || null;
              if (!rulesAllowPrivadoSet(currentAuthUser, before, op.data)) {
                const e = new Error("permission-denied (simulado, registro_privado)"); e.code = "permission-denied"; return Promise.reject(e);
              }
            }
            if (op.ref.__isMetaDoc) {
              if (!rulesAllowMetaSet(currentAuthUser, metaStore.current, op.data)) {
                const e = new Error("permission-denied (simulado, meta)"); e.code = "permission-denied"; return Promise.reject(e);
              }
            }
          }
          ops.forEach(op => {
            if (op.ref.__isParticipantDoc) participantsStore[op.ref.id] = op.data;
            else if (op.ref.__isPrivadoDoc) privadoStore[op.ref.id] = op.data;
            else if (op.ref.__isMetaDoc) metaStore.current = op.data;
          });
          return Promise.resolve();
        }
      };
    },
    __setAuthUser(u) { currentAuthUser = u; },
    __setPrivadoRulesMissing(v) { privadoRulesMissing = !!v; },
    __rawParticipants() { return participantsStore; },
    __rawPrivado() { return privadoStore; },
  };
}

const html = `<!doctype html><html><body>
  <div id="rg-tabs"><button class="rg-tab on" data-tab="inicio">Inicio</button><button class="rg-tab admin-tab" data-tab="admin">Admin</button></div>
  <div id="rg-content"></div>
  <div id="toast"></div>
  <div id="em_continue"></div><div id="em_save_exit"></div><div id="em_discard"></div>
  <div id="block_ok"></div><div id="block_goto"></div>
  <div id="exitModal" style="display:none"></div><div id="blockModal" style="display:none"></div>
  <div id="blockModalText"></div><div id="pdfPoster"></div>
</body></html>`;

const dom = new JSDOM(html, { url: "https://example.org/", runScripts: "dangerously" });
const { window } = dom;
window.toast = (m, e) => console.log(`[toast]${e ? " ERR" : ""}: ${m}`);
window.isAdmin = () => false;
window.setInterval = () => 0;
window.URL.createObjectURL = () => "blob:fake";
window.URL.revokeObjectURL = () => {};
window.Blob = function () {};
window.confirm = () => true;
window.alert = () => {};

const fakeFb = makeFakeFirestore();
window.__fb = fakeFb;

const codeUtils = fs.readFileSync(path.join(__dirname, "utils.js"), "utf8");
const utilsScript = window.document.createElement("script");
utilsScript.textContent = codeUtils;
window.document.body.appendChild(utilsScript);

const code1 = fs.readFileSync(path.join(__dirname, "participantes.js"), "utf8");
let code2 = fs.readFileSync(path.join(__dirname, "registro.js"), "utf8");

const closeIdx = code2.lastIndexOf("})();");
if (closeIdx === -1) throw new Error("No se encontró el cierre de la IIFE en registro.js");
const bridge = `
window.__test = {
  DB, get DRAFT_PID(){ return DRAFT_PID; },
  onCrearSubmit,
  goToCrear: () => { clearDraft(); INICIO_VIEW = 'crear'; render(); },
};
`;
code2 = code2.slice(0, closeIdx) + bridge + code2.slice(closeIdx);

const script = window.document.createElement("script");
script.textContent = code1 + "\n;\n" + code2;
window.document.body.appendChild(script);

if (!window.__test) { console.error("❌ El bridge no se ejecutó."); process.exit(1); }
const T = window.__test;
let allOk = true;
function check(label, cond) { console.log((cond ? "✅ " : "❌ ") + label); if (!cond) allOk = false; }

function fillForm(vals) {
  window.document.getElementById("r_name").value = vals.name;
  window.document.getElementById("r_city").value = vals.city;
  window.document.getElementById("r_country").value = vals.country;
  window.document.getElementById("r_country_iso").value = vals.countryIso;
  window.document.getElementById("r_email").value = vals.email;
  window.document.getElementById("r_email2").value = vals.email;
  window.document.getElementById("r_clave").value = vals.clave;
  window.document.getElementById("r_clave2").value = vals.clave;
}

// ════════════════════════════════════════════════════════════════
// CASO A — Camino feliz: las reglas de registro_privado SÍ están
// publicadas. Debe verse "Creando..." mientras se confirma, y solo
// entrar al wizard (DRAFT_PID seteado) tras la confirmación real.
// ════════════════════════════════════════════════════════════════
fakeFb.__setAuthUser({ uid: "anon-luis", isAnonymous: true });
T.goToCrear();
fillForm({ name: "Luis Test", city: "Panamá", country: "Panamá", countryIso: "pa", email: "luis@example.com", clave: "444444" });

T.onCrearSubmit();

const btn = window.document.getElementById("r_submit");
check("CASO A: el botón se deshabilita ni bien se manda el formulario (evita doble registro)", btn.disabled === true);
check("CASO A: el botón muestra 'Creando...' mientras se espera al servidor", btn.textContent === "Creando...");
check("CASO A: DRAFT_PID NO se setea todavía (no se entra al wizard antes de la confirmación real)", !T.DRAFT_PID);

setImmediate(() => {
  check("CASO A: tras confirmar el servidor, sí se entró al wizard (DRAFT_PID seteado)", !!T.DRAFT_PID);
  check("CASO A: el participante quedó en DB.participants en memoria", T.DB.participants.some(p => p.email === "luis@example.com"));
  const pid = T.DB.participants.find(p => p.email === "luis@example.com").id;
  check("CASO A: el documento público SÍ llegó al servidor", !!fakeFb.__rawParticipants()[pid]);
  check("CASO A: el documento privado (correo/clave) SÍ llegó al servidor", !!fakeFb.__rawPrivado()[pid]);
  runCasoB();
});

// ════════════════════════════════════════════════════════════════
// CASO B — REPRODUCCIÓN DEL BUG: la regla de registro_privado NO está
// publicada (exactamente lo reportado). El botón debe volver a
// habilitarse, debe aparecer un error VISIBLE Y PERSISTENTE (no un
// toast de 2.8s fácil de pasar por alto), y -- lo más importante -- NO
// debe quedar ningún participante fantasma en DB.participants ni
// entrarse al wizard como si todo hubiera salido bien.
// ════════════════════════════════════════════════════════════════
function runCasoB() {
  // Reseteamos DRAFT_PID volviendo a la pantalla de inicio, como haría
  // alguien que cierra el wizard y un amigo distinto usa el mismo
  // dispositivo/sesión de prueba para registrarse.
  fakeFb.__setAuthUser({ uid: "anon-amigo-de-tato", isAnonymous: true });
  fakeFb.__setPrivadoRulesMissing(true);
  T.goToCrear();
  fillForm({ name: "Amigo De Tato", city: "Maracaibo", country: "Venezuela", countryIso: "ve", email: "amigo@example.com", clave: "555555" });

  const countAntes = T.DB.participants.length;
  T.onCrearSubmit();

  setImmediate(() => {
    const btnB = window.document.getElementById("r_submit");
    const errEl = window.document.getElementById("r_err");
    check("CASO B: el botón se reactiva tras el rechazo del servidor (se puede reintentar)", btnB.disabled === false);
    check("CASO B: el botón vuelve a su texto original", btnB.textContent === "Crear mi quiniela");
    check("CASO B: se muestra un error VISIBLE (no un toast que desaparece solo)", errEl.style.display === "block" && errEl.textContent.length > 0);
    check("CASO B: el mensaje de error es comprensible para alguien no técnico (menciona configuración, no jerga de Firestore)",
      /configuraci|servidor/i.test(errEl.textContent));
    check("CASO B: NO quedó ningún participante fantasma en DB.participants (antes del fix, esto SÍ pasaba)",
      T.DB.participants.length === countAntes);
    check("CASO B: NO se entró al wizard con datos que nunca llegaron al servidor",
      !T.DB.participants.some(p => p.email === "amigo@example.com"));
    fakeFb.__setPrivadoRulesMissing(false);
    finish();
  });
}

function finish() {
  console.log("\n=== RESULTADO FINAL:", allOk ? "TODOS LOS CASOS PASAN ✅" : "HAY FALLOS ❌", "===");
  process.exit(allOk ? 0 : 1);
}
