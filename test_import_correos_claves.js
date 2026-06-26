// Test de integración v6.9.3 — reproduce el bug real reportado:
// 1) Login anónimo (bootstrap) -> login admin real, y verifica que
//    rgWirePrivadoSyncIfAdmin() SÍ se reintenta al pasar a admin (antes
//    no se reintentaba, así que el admin nunca veía correo/clave).
// 2) Simula que Firestore ya tiene clave/correo guardados (snapshot de
//    registro_privado) y verifica que se mezclan en DB.participants
//    (lo que se ve en la tabla del panel Admin).
// 3) Importa un CSV de correos/claves real y verifica que el batch se
//    escribe sin reventar (antes: "Expected first argument to
//    collection() to be a CollectionReference...").
// 4) Caso roto a propósito (fb.PRIVADO_COL undefined, ej. cache vieja
//    del index.html) -> debe mostrar un mensaje claro, NUNCA el error
//    crudo de Firestore, y NUNCA reportar éxito falso.
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const FILES = ["participantes.js", "legacy-migracion.js", "utils.js", "scoring.js", "totp.js", "app.js", "registro.js"];

let html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
html = html.replace(/<script[^>]*src=[^>]*><\/script>/g, "");
html = html.replace(/<script type="module">[\s\S]*?<\/script>/g, "");

const dom = new JSDOM(html, { url: "https://example.org/", runScripts: "dangerously" });
const { window } = dom;
// jsdom no implementa crypto.subtle (SubtleCrypto) -- en un navegador real
// siempre está disponible; para poder probar de verdad sha256Hex/
// verifyTOTPCode (totp.js, v7.1) acá, usamos el WebCrypto real de Node.
const { webcrypto } = require("crypto");
Object.defineProperty(window, "crypto", { value: webcrypto, configurable: true });
window.confirm = () => true;
window.alert = () => {};
window.URL.createObjectURL = () => "blob:fake";
window.URL.revokeObjectURL = () => {};
window.Blob = function (parts) { this.parts = parts; };
window.setInterval = () => 0;

// ── Mock de Firebase que REPLICA la validación real de doc()/collection()
//    (confirmada contra el SDK real firebase@10.13.0): si el "parent" no
//    es exactamente una de las colecciones válidas, tira el mismo error
//    textual que tira la app real. ──
const PARTICIPANTS_COL = { __col: "registro_participants" };
const PRIVADO_COL = { __col: "registro_privado" };
const REGISTRO_META_DOC = { __doc: "registro/meta" };
const REGISTRO_PAPELERA_DOC = { __doc: "registro/papelera" };
// v7.1 — secreto de prueba fijo (no necesita ser real, solo necesita ser
// el mismo que usamos para calcular el código TOTP esperado más abajo).
const TEST_TOTP_SECRET = "JBSWY3DPEHPK3PXP";
const ADMIN2FA_DOC = { __doc: "registro/admin2fa" };

function fakeDoc(parent, id) {
  if (parent !== PARTICIPANTS_COL && parent !== PRIVADO_COL) {
    throw new Error("Expected first argument to collection() to be a CollectionReference, a DocumentReference or FirebaseFirestore");
  }
  return { __ref: true, col: parent.__col, id };
}

const writeLog = []; // cada batch.commit() exitoso empuja sus ops acá
let authCb = null;
let currentUser = null;
const snapshotCbs = {}; // key -> [callbacks]
function keyOf(target) {
  if (target === PARTICIPANTS_COL) return "participants";
  if (target === PRIVADO_COL) return "privado";
  if (target === REGISTRO_META_DOC) return "meta";
  if (target === REGISTRO_PAPELERA_DOC) return "papelera";
  return "?";
}

window.__fb = {
  db: {}, auth: { get currentUser() { return currentUser; } },
  PARTICIPANTS_COL, PRIVADO_COL, REGISTRO_META_DOC, REGISTRO_PAPELERA_DOC,
  ADMIN2FA_DOC,
  doc: fakeDoc,
  getDoc: (ref) => {
    if (ref === ADMIN2FA_DOC) {
      return Promise.resolve({ exists: () => true, data: () => ({ secret: TEST_TOTP_SECRET, trustedDevices: {} }) });
    }
    return Promise.resolve({ exists: () => false, data: () => ({}) });
  },
  query: (x) => x, where: () => ({}),
  setDoc: () => Promise.resolve(),
  deleteDoc: () => Promise.resolve(),
  deleteField: () => "__deleteField__",
  writeBatch: () => {
    const ops = [];
    return {
      set: (ref, data) => ops.push({ type: "set", ref, data }),
      delete: (ref) => ops.push({ type: "delete", ref }),
      commit: () => { writeLog.push(ops); return Promise.resolve(); },
    };
  },
  onSnapshot: (target, cb) => { const k = keyOf(target); (snapshotCbs[k] = snapshotCbs[k] || []).push(cb); return () => {}; },
  serverTimestamp: () => "__serverTimestamp__",
  signInWithEmailAndPassword: () => Promise.resolve(),
  signInAnonymously: () => {
    currentUser = { uid: "anon-uid", isAnonymous: true };
    setTimeout(() => authCb && authCb(currentUser), 0);
    return Promise.resolve();
  },
  signOut: () => Promise.resolve(),
  onAuthStateChanged: (auth, cb) => { authCb = cb; },
};

let allOk = true;
function check(label, cond) { console.log((cond ? "✅ " : "❌ ") + label); if (!cond) allOk = false; }

for (const f of FILES) {
  let code = fs.readFileSync(path.join(__dirname, f), "utf8");
  if (f === "registro.js") {
    // registro.js es un único IIFE -- importarCorreosClaves() vive en su
    // scope interno y no queda accesible desde afuera solo por exponer
    // render/renderAdminTab/tryAutoLoginByOwnerUid (lo único que el
    // propio archivo expone hoy). Lo inyectamos por slicing justo antes
    // del cierre del IIFE, mismo patrón que ya usa test_login_reclaim.js.
    code = code.replace(/\}\)\(\);\s*$/, `
window.importarCorreosClaves = importarCorreosClaves;
})();`);
  }
  const script = window.document.createElement("script");
  script.textContent = code;
  window.document.body.appendChild(script); // window.__fb ya existe -> cada archivo se conecta solo (sin esperar "firebase-ready")
}

const bridgeScript = window.document.createElement("script");
bridgeScript.textContent = `
window.__test = {
  getDB: () => DB,
  isAdmin: () => (typeof isAdmin === "function" ? isAdmin() : undefined),
  isPending2FA: () => (typeof isPending2FA === "function" ? isPending2FA() : undefined),
  getTOTPCode: (secret) => getTOTPCode(secret),
  fillAndSubmit2FACode: async (code) => {
    document.getElementById("login-2fa-code").value = code;
    await submit2FACode();
  },
  importarCorreosClaves: (file) => window.importarCorreosClaves(file),
  getLastToast: () => { const t = document.getElementById("toast"); return t ? t.textContent : null; },
};
`;
window.document.body.appendChild(bridgeScript);
const T = window.__test;

check("Los 6 archivos cargaron sin lanzar excepción", true);

// Necesitamos al menos 1 participante con código conocido para que el
// import tenga algo con qué matchear.
T.getDB().participants = [
  { id: "p1", codigo: "QB-2026-0001", name: "Juan Perez", email: "", clave: "", estadoQuiniela: "enviada" },
  { id: "p2", codigo: "QB-2026-0002", name: "Maria Lopez", email: "", clave: "", estadoQuiniela: "enviada" },
];
T.getDB().predictions = {};
T.getDB().nextSeq = 3;
T.getDB().configGlobal = T.getDB().configGlobal || {};

(async () => {
  // ── Paso 1: arranca como nadie logueado -> dispara signInAnonymously() ──
  authCb && authCb(null);
  await new Promise((r) => setTimeout(r, 10));
  check("Caso 1: tras el bootstrap anónimo, isAdmin() es false", T.isAdmin() === false);
  check("Caso 1: el listener de 'participants' quedó conectado durante la fase anónima", (snapshotCbs.participants || []).length >= 1);
  check("Caso 1: el listener de 'privado' NO se conecta todavía (todavía no es admin)", !(snapshotCbs.privado && snapshotCbs.privado.length));

  // ── Paso 2: ahora entra el admin real (no anónimo) ──
  currentUser = { uid: "admin-uid", isAnonymous: false };
  authCb && authCb(currentUser);
  await new Promise((r) => setTimeout(r, 10));
  check("Caso 2a (v7.1): tras correo+contraseña, todavía NO es admin (falta 2FA)", T.isAdmin() === false);
  check("Caso 2a (v7.1): isPending2FA() es true (modal de código pendiente)", T.isPending2FA() === true);

  // ── Paso 2b (v7.1): resuelve el segundo factor con un código TOTP válido ──
  const validCode = await T.getTOTPCode(TEST_TOTP_SECRET);
  await T.fillAndSubmit2FACode(validCode);
  await new Promise((r) => setTimeout(r, 10));
  check("Caso 2: isAdmin() ahora es true", T.isAdmin() === true);
  check("Caso 2 (FIX #1): el listener de 'privado' SÍ se conectó al pasar a admin", (snapshotCbs.privado || []).length >= 1);

  // ── Paso 3: Firestore entrega un snapshot de registro_privado con datos ya guardados ──
  const fakeSnap = {
    docs: [
      { id: "p1", data: () => ({ clave: "ABC123", email: "juan@correo.com" }) },
    ],
  };
  (snapshotCbs.privado || []).forEach((cb) => cb(fakeSnap));
  const p1 = T.getDB().participants.find((p) => p.id === "p1");
  check("Caso 3: la clave/correo de p1 se mezcló en DB.participants (lo que ve la tabla del admin)", p1.clave === "ABC123" && p1.email === "juan@correo.com");

  // ── Paso 4: importar un CSV real (mismo formato que exportarCorreosClaves) ──
  const csv = '\uFEFF"Nombre","Correo","Codigo","Clave","Estado"\r\n"JUAN PEREZ","nuevo.juan@correo.com","QB-2026-0001","NUEVACLAVE1","enviada"\r\n"MARIA LOPEZ","maria@correo.com","QB-2026-0002","NUEVACLAVE2","enviada"\r\n';
  window.FileReader = function () {
    this.readAsText = () => { this.onload({ target: { result: csv } }); };
  };
  const fakeFile = {};
  T.importarCorreosClaves(fakeFile);
  await new Promise((r) => setTimeout(r, 10));

  check("Caso 4 (FIX #2): el import escribió sin reventar (hay un batch en writeLog)", writeLog.length >= 1);
  const p1after = T.getDB().participants.find((p) => p.id === "p1");
  const p2after = T.getDB().participants.find((p) => p.id === "p2");
  check("Caso 4: p1 quedó con la clave/correo nuevos del CSV", p1after.clave === "NUEVACLAVE1" && p1after.email === "nuevo.juan@correo.com");
  check("Caso 4: p2 quedó con la clave/correo nuevos del CSV", p2after.clave === "NUEVACLAVE2" && p2after.email === "maria@correo.com");
  const lastBatch = writeLog[writeLog.length - 1];
  const privadoWrites = lastBatch.filter((op) => op.ref && op.ref.col === "registro_privado");
  check("Caso 4: el batch incluyó escrituras al documento privado de p1 y p2", privadoWrites.length === 2);

  // ── Paso 5: caso roto a propósito -- fb.PRIVADO_COL desaparece (ej. cache vieja) ──
  const realPrivadoCol = window.__fb.PRIVADO_COL;
  window.__fb.PRIVADO_COL = undefined;
  const writesBefore = writeLog.length;
  let threw = false;
  try {
    T.importarCorreosClaves({});
  } catch (e) {
    threw = true;
  }
  await new Promise((r) => setTimeout(r, 10));
  check("Caso 5 (FIX #3): con PRIVADO_COL roto, NO se lanza ninguna excepción", threw === false);
  check("Caso 5: con PRIVADO_COL roto, NO se intentó ningún batch nuevo (no hay éxito falso)", writeLog.length === writesBefore);
  const toastMsg = T.getLastToast() || "";
  check("Caso 5: se mostró el mensaje claro de 'Recargá la página', no el error crudo de Firestore", toastMsg.includes("Recargá la página") && !toastMsg.includes("collection()"));
  window.__fb.PRIVADO_COL = realPrivadoCol; // restaurar

  console.log(allOk ? "\n✅✅✅ TODO OK" : "\n❌❌❌ HAY FALLOS");
  process.exit(allOk ? 0 : 1);
})();
