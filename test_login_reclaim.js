// Test funcional del flujo de login/re-claim en registro.js (renderLogin).
// registro.js está envuelto en una única IIFE -- igual que en el Punto 1,
// el bridge para acceder a sus funciones internas debe insertarse DENTRO
// de esa IIFE, justo antes de su cierre "})();".
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const ADMIN_EMAIL = "agustingb23@gmail.com";

// Mismo mock de Firestore que test_participantes_security.js, simplificado
// a lo que este test necesita (solo participantes, sin meta/papelera).
function makeFakeFirestore() {
  const participantsStore = {};
  let currentAuthUser = null;

  function diffAffectedKeys(before, after) {
    const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
    const affected = [];
    keys.forEach(k => {
      if (JSON.stringify(before ? before[k] : undefined) !== JSON.stringify(after ? after[k] : undefined)) affected.push(k);
    });
    return affected;
  }
  function hasOnly(affected, allowed) { return affected.every(k => allowed.includes(k)); }
  function rulesAllowMergeSet(auth, before, mergedFields) {
    if (!auth) return false;
    const after = { ...(before || {}), ...mergedFields };
    const isAdmin = auth.email === ADMIN_EMAIL;
    if (before === null) return after.ownerUid === auth.uid || isAdmin;
    if (before.ownerUid === auth.uid) return true;
    if (isAdmin) return true;
    const affected = diffAffectedKeys(before, after);
    return hasOnly(affected, ['ownerUid', 'clave', 'fechaActualizacion']) && after.clave === before.clave;
  }

  return {
    db: {}, auth: { get currentUser() { return currentAuthUser; } },
    PARTICIPANTS_COL: { __isParticipantsCol: true },
    REGISTRO_META_DOC: { __isMetaDoc: true },
    REGISTRO_PAPELERA_DOC: { __isPapeleraDoc: true },
    doc(_col, id) { return { __isParticipantDoc: true, id }; },
    serverTimestamp() { return "ST"; },
    setDoc(ref, data, opts) {
      if (!ref.__isParticipantDoc) return Promise.resolve();
      const merge = !!(opts && opts.merge);
      const before = participantsStore[ref.id] || null;
      const allowed = rulesAllowMergeSet(currentAuthUser, before, data);
      if (!allowed) { const e = new Error("permission-denied"); e.code = "permission-denied"; return Promise.reject(e); }
      participantsStore[ref.id] = merge ? { ...(before || {}), ...data } : data;
      return Promise.resolve();
    },
    deleteDoc() { return Promise.resolve(); },
    writeBatch() { return { set() {}, delete() {}, commit() { return Promise.resolve(); } }; },
    onSnapshot() { return () => {}; },
    __setAuthUser(u) { currentAuthUser = u; },
    __rawParticipants() { return participantsStore; },
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
window.URL.createObjectURL = () => "blob:fake";
window.URL.revokeObjectURL = () => {};
window.Blob = function () {};
window.confirm = () => true;
window.alert = () => {};
window.toast = (m, e) => console.log(`[toast]${e ? " ERR" : ""}: ${m}`);
window.isAdmin = () => false; // estos tests son desde la perspectiva de un participante, no admin
window.setInterval = () => 0;

const fakeFb = makeFakeFirestore();
window.__fb = fakeFb;

const code1 = fs.readFileSync(path.join(__dirname, "participantes.js"), "utf8");
let code2 = fs.readFileSync(path.join(__dirname, "registro.js"), "utf8");

const closeIdx = code2.lastIndexOf("})();");
if (closeIdx === -1) throw new Error("No se encontró el cierre de la IIFE en registro.js");
const bridge = `
window.__test = {
  DB, uid, nextCode, genClave,
  goToLogin: () => { clearDraft(); INICIO_VIEW = 'login'; CURRENT_TAB = 'inicio'; render(); },
};
`;
code2 = code2.slice(0, closeIdx) + bridge + code2.slice(closeIdx);

const script = window.document.createElement("script");
script.textContent = code1 + "\n;\n" + code2;
window.document.body.appendChild(script);

if (!window.__test) {
  console.error("❌ El bridge no se ejecutó.");
  process.exit(1);
}
const T = window.__test;

let allOk = true;
function check(label, cond) { console.log((cond ? "✅ " : "❌ ") + label); if (!cond) allOk = false; }

// ── Preparamos un participante existente directamente en DB (como si ya
// hubiera sido creado en una sesión anterior, desde otro dispositivo) ──
const pid = T.uid();
T.DB.participants.push({
  id: pid, codigo: T.nextCode(), name: "María López",
  city: "Buenos Aires", country: "Argentina", email: "maria@example.com",
  clave: "555555", ownerUid: "anon-laptop-de-maria",
  estadoQuiniela: "borrador", fechaCreacion: Date.now(), fechaActualizacion: Date.now()
});
T.DB.predictions[pid] = {};

console.log("\n--- CASO A: entra desde el MISMO dispositivo (ownerUid ya coincide) ---");
fakeFb.__setAuthUser({ uid: "anon-laptop-de-maria", isAnonymous: true });
T.goToLogin();

function fillAndSubmit(usuario, clave) {
  window.document.getElementById('e_user').value = usuario;
  window.document.getElementById('e_clave').value = clave;
  window.document.getElementById('e_submit').click();
}

fillAndSubmit("maria@example.com", "555555");

// Caso A no toca la red (ownerUid ya coincide) -> debería resolver de inmediato, sin async.
setImmediate(() => {
  const errEl = window.document.getElementById('e_err');
  // Tras un login exitoso, renderLogin() ya no es la vista activa (entró
  // al wizard), así que #e_err puede directamente no existir en el DOM
  // -- eso es la señal correcta de éxito, no un fallo.
  check("CASO A: no quedó mostrando un error (login exitoso cambió de vista)", !errEl || errEl.style.display !== 'block');
  runCasoB();
});

function runCasoB() {
  console.log("\n--- CASO B: entra desde un dispositivo NUEVO (celular), clave correcta ---");
  fakeFb.__setAuthUser({ uid: "anon-celular-de-maria", isAnonymous: true });
  T.goToLogin();
  fillAndSubmit("maria@example.com", "555555");

  // Este caso SÍ va a Firestore (rgClaimOwnership) -> esperamos un poco más.
  setTimeout(() => {
    const p = T.DB.participants.find(x => x.id === pid);
    check("CASO B: el ownerUid en memoria (DB) quedó actualizado al celular", p.ownerUid === "anon-celular-de-maria");
    check("CASO B: el ownerUid en el 'Firestore' simulado también quedó actualizado", fakeFb.__rawParticipants()[pid].ownerUid === "anon-celular-de-maria");
    runCasoC();
  }, 50);
}

function runCasoC() {
  console.log("\n--- CASO C: alguien intenta entrar con la clave INCORRECTA ---");
  fakeFb.__setAuthUser({ uid: "anon-atacante", isAnonymous: true });
  T.goToLogin();
  fillAndSubmit("maria@example.com", "000000");

  setImmediate(() => {
    const errEl = window.document.getElementById('e_err');
    check("CASO C: muestra el error de 'Usuario o Clave incorrectos'", errEl.style.display === 'block' && /incorrecto/i.test(errEl.textContent));
    const p = T.DB.participants.find(x => x.id === pid);
    check("CASO C: el ownerUid NO cambió (sigue siendo el celular legítimo)", p.ownerUid === "anon-celular-de-maria");
    finish();
  });
}

function finish() {
  console.log("\n=== RESULTADO FINAL:", allOk ? "TODOS LOS CASOS PASAN ✅" : "HAY FALLOS ❌", "===");
  process.exit(allOk ? 0 : 1);
}
