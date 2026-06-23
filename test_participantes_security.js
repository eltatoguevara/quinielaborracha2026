// Test funcional de la nueva capa de seguridad en participantes.js:
// sync por documento con diff inteligente, reclamo de propiedad
// (re-claim), borrado de documentos, y reset total.
//
// participantes.js NO está envuelto en IIFE (a diferencia de registro.js),
// así que podemos cargarlo directo con vm/jsdom sin pelear con scopes.
//
// En vez de un mock superficial, este "Firestore en memoria" aplica la
// MISMA lógica de permisos que firestore.rules (reutilizando el simulador
// de rules_sim/sim_firestore_rules.js) antes de aceptar cada escritura,
// para que el test detecte tanto bugs del código JS como mismatches entre
// el código y las reglas reales.
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const ADMIN_EMAIL = "agustingb23@gmail.com";

// ── Reglas reutilizadas del simulador (misma lógica, copiada inline para
// no depender de un require entre carpetas distintas en este entorno) ──
function diffAffectedKeys(before, after) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  const affected = [];
  keys.forEach(k => {
    if (JSON.stringify(before ? before[k] : undefined) !== JSON.stringify(after ? after[k] : undefined)) {
      affected.push(k);
    }
  });
  return affected;
}
function hasOnly(affectedKeys, allowed) { return affectedKeys.every(k => allowed.includes(k)); }

function rulesAllowSet(auth, before, after) {
  // setDoc() sin {merge:true}: si el doc no existe -> create; si existe -> update.
  if (!auth) return false;
  const isAdmin = auth.email === ADMIN_EMAIL;
  if (before === null) { // create
    return after.ownerUid === auth.uid || isAdmin;
  }
  // update
  if (before.ownerUid === auth.uid) return true;
  if (isAdmin) return true;
  const affected = diffAffectedKeys(before, after);
  return hasOnly(affected, ['ownerUid', 'clave', 'fechaActualizacion']) && after.clave === before.clave;
}
function rulesAllowMergeSet(auth, before, mergedFields) {
  // setDoc(ref, {...}, {merge:true}): Firestore evalúa "update" comparando
  // resource.data (antes) contra request.resource.data (resultado DESPUÉS
  // de aplicar el merge) -- replicamos eso explícitamente aquí.
  const after = { ...(before || {}), ...mergedFields };
  return rulesAllowSet(auth, before, after);
}
function rulesAllowDelete(auth, before) {
  if (!auth || !before) return false;
  const isAdmin = auth.email === ADMIN_EMAIL;
  return before.ownerUid === auth.uid || isAdmin;
}

// ── "Firestore" en memoria ──────────────────────────────────────────
function makeFakeFirestore() {
  const participantsStore = {}; // { [id]: data }
  const metaStore = { current: null };
  const papeleraStore = { current: null };
  let currentAuthUser = null; // simula fb.auth.currentUser

  const participantListeners = [];
  const metaListeners = [];
  const papeleraListeners = [];

  function notifyParticipants() {
    const docs = Object.entries(participantsStore).map(([id, data]) => ({
      id, data: () => data
    }));
    participantListeners.forEach(cb => cb({ docs }));
  }
  function notifyMeta() {
    metaListeners.forEach(cb => cb({
      exists: () => metaStore.current !== null,
      data: () => metaStore.current
    }));
  }
  function notifyPapelera() {
    papeleraListeners.forEach(cb => cb({
      exists: () => papeleraStore.current !== null,
      data: () => papeleraStore.current
    }));
  }

  const fb = {
    db: {},
    auth: { get currentUser() { return currentAuthUser; } },
    PARTICIPANTS_COL: { __isParticipantsCol: true },
    REGISTRO_META_DOC: { __isMetaDoc: true },
    REGISTRO_PAPELERA_DOC: { __isPapeleraDoc: true },
    doc(_col, id) { return { __isParticipantDoc: true, id }; },
    serverTimestamp() { return "SERVER_TIMESTAMP"; },

    setDoc(ref, data, opts) {
      const merge = !!(opts && opts.merge);
      if (ref.__isMetaDoc) {
        metaStore.current = data;
        notifyMeta();
        return Promise.resolve();
      }
      if (ref.__isPapeleraDoc) {
        papeleraStore.current = data;
        notifyPapelera();
        return Promise.resolve();
      }
      if (ref.__isParticipantDoc) {
        const before = participantsStore[ref.id] || null;
        const allowed = merge
          ? rulesAllowMergeSet(currentAuthUser, before, data)
          : rulesAllowSet(currentAuthUser, before, data);
        if (!allowed) {
          const err = new Error("permission-denied (simulado)");
          err.code = "permission-denied";
          return Promise.reject(err);
        }
        participantsStore[ref.id] = merge ? { ...(before || {}), ...data } : data;
        notifyParticipants();
        return Promise.resolve();
      }
      return Promise.reject(new Error("setDoc: ref desconocida en el mock"));
    },

    deleteDoc(ref) {
      const before = participantsStore[ref.id] || null;
      if (!rulesAllowDelete(currentAuthUser, before)) {
        const err = new Error("permission-denied (simulado)");
        err.code = "permission-denied";
        return Promise.reject(err);
      }
      delete participantsStore[ref.id];
      notifyParticipants();
      return Promise.resolve();
    },

    writeBatch(_db) {
      const ops = [];
      return {
        set(ref, data) { ops.push({ type: "set", ref, data }); },
        delete(ref) { ops.push({ type: "delete", ref }); },
        commit() {
          // Validamos TODAS las operaciones contra las reglas antes de
          // aplicar ninguna (atomicidad real de Firestore: o se aplica
          // todo el batch, o nada).
          for (const op of ops) {
            if (op.type === "set" && op.ref.__isParticipantDoc) {
              const before = participantsStore[op.ref.id] || null;
              if (!rulesAllowSet(currentAuthUser, before, op.data)) {
                const err = new Error(`permission-denied en batch.set(${op.ref.id})`);
                err.code = "permission-denied";
                return Promise.reject(err);
              }
            }
            if (op.type === "delete" && op.ref.__isParticipantDoc) {
              const before = participantsStore[op.ref.id] || null;
              if (!rulesAllowDelete(currentAuthUser, before)) {
                const err = new Error(`permission-denied en batch.delete(${op.ref.id})`);
                err.code = "permission-denied";
                return Promise.reject(err);
              }
            }
          }
          ops.forEach(op => {
            if (op.type === "set") {
              if (op.ref.__isMetaDoc) metaStore.current = op.data;
              else if (op.ref.__isParticipantDoc) participantsStore[op.ref.id] = op.data;
            } else if (op.type === "delete") {
              if (op.ref.__isParticipantDoc) delete participantsStore[op.ref.id];
            }
          });
          notifyParticipants();
          notifyMeta();
          return Promise.resolve();
        }
      };
    },

    onSnapshot(ref, onNext) {
      if (ref.__isParticipantsCol) {
        participantListeners.push(onNext);
        notifyParticipants(); // emite el estado actual de inmediato, como el SDK real
      } else if (ref.__isMetaDoc) {
        metaListeners.push(onNext);
        notifyMeta();
      } else if (ref.__isPapeleraDoc) {
        papeleraListeners.push(onNext);
        notifyPapelera();
      }
      return () => {}; // unsubscribe (no usado en este test)
    },

    // Helpers de control del test, NO parte de la API real de Firebase:
    __setAuthUser(user) { currentAuthUser = user; },
    __rawParticipants() { return participantsStore; },
    __rawMeta() { return metaStore.current; },
    __rawPapelera() { return papeleraStore.current; },
  };
  return fb;
}

// ── Carga participantes.js en un contexto jsdom mínimo ──────────────
const dom = new JSDOM("<!doctype html><html><body></body></html>", { runScripts: "dangerously" });
const { window } = dom;
window.toast = (msg, err) => console.log(`[toast]${err ? " ERR" : ""}: ${msg}`);
window.isAdmin = () => window.__simIsAdmin === true; // controlado por el test

const fakeFb = makeFakeFirestore();
window.__fb = fakeFb;

const code = fs.readFileSync(path.join(__dirname, "participantes.js"), "utf8");
const bridge = `
window.DB = DB;
window.uid = uid;
window.nextCode = nextCode;
window.genClave = genClave;
window.saveData = saveData;
window.rgClaimOwnership = rgClaimOwnership;
window.rgDeleteParticipantDoc = rgDeleteParticipantDoc;
window.rgResetAll = rgResetAll;
window.rgSavePapelera = rgSavePapelera;
window.loadData = loadData;
`;
const script = window.document.createElement("script");
script.textContent = code + "\n;\n" + bridge;
window.document.body.appendChild(script);

// participantes.js corre rgWireFirestoreSync() de inmediato al cargar
// (porque window.__fb ya existe antes de insertarlo) — confirmamos que
// efectivamente se conectó sin reventar.
let allOk = true;
function check(label, cond) {
  console.log((cond ? "✅ " : "❌ ") + label);
  if (!cond) allOk = false;
}

check("loadData()/DB existen tras cargar el script", !!window.DB);

// ════════════════════════════════════════════════════════════════
// CASO 1 — Crear un participante nuevo (sesión anónima) y guardar
// ════════════════════════════════════════════════════════════════
console.log("\n--- CASO 1: crear participante nuevo ---");
fakeFb.__setAuthUser({ uid: "anon-juan", isAnonymous: true });

const pid1 = window.uid();
window.DB.participants.push({
  id: pid1, codigo: window.nextCode(), name: "Juan Pérez",
  city: "Panama", country: "Panama", email: "juan@example.com",
  clave: "111111", ownerUid: "anon-juan",
  estadoQuiniela: "borrador", fechaCreacion: Date.now(), fechaActualizacion: Date.now()
});
window.DB.predictions[pid1] = { m1: { h: 1, a: 0 } };

window.saveData(window.DB);

// rgPushToFirestore hace su propio chequeo de auth.currentUser y, si no
// hay, reintenta con setTimeout — como SÍ hay sesión seteada, debería
// escribir de inmediato (síncrono en este mock, sin esperar timers).
setTimeoutFlushAndCheck();

function setTimeoutFlushAndCheck() {
  // saveData -> rgPushToFirestore es mayormente síncrono en nuestro mock
  // (las promesas se resuelven en microtasks), así que damos una vuelta
  // de microtask antes de verificar.
  setImmediate(() => {
    const raw = fakeFb.__rawParticipants()[pid1];
    check("El documento de Juan se escribió en el 'Firestore' simulado", !!raw);
    check("El documento escrito tiene el nombre correcto", raw && raw.name === "Juan Pérez");
    check("El documento escrito tiene predictions embebidas", raw && raw.predictions && raw.predictions.m1 && raw.predictions.m1.h === 1);

    runCaso2();
  });
}

// ════════════════════════════════════════════════════════════════
// CASO 2 — Otro participante intenta escribir el documento de Juan
// directamente contra el "Firestore" simulado (saltándose la UI) ->
// debe ser rechazado por las reglas, incluso aunque construya el batch
// "a mano" igual que rgPushToFirestore.
// ════════════════════════════════════════════════════════════════
function runCaso2() {
  console.log("\n--- CASO 2: intento de escritura no autorizada (simulando alguien con devtools) ---");
  fakeFb.__setAuthUser({ uid: "anon-atacante", isAnonymous: true });
  const batch = fakeFb.writeBatch(fakeFb.db);
  batch.set(fakeFb.doc(fakeFb.PARTICIPANTS_COL, pid1), {
    id: pid1, name: "Juan Pérez (HACKEADO)", ownerUid: "anon-juan", clave: "111111",
    predictions: { m1: { h: 9, a: 9 } }
  });
  batch.commit()
    .then(() => { check("Un atacante NO debería poder escribir el doc de Juan, pero la promesa se resolvió", false); runCaso3(); })
    .catch(err => {
      check("El intento de escritura no autorizada fue rechazado (permission-denied)", err.code === "permission-denied");
      check("El documento de Juan NO fue modificado por el intento fallido",
        fakeFb.__rawParticipants()[pid1].name === "Juan Pérez");
      runCaso3();
    });
}

// ════════════════════════════════════════════════════════════════
// CASO 3 — Juan entra desde un dispositivo nuevo (UID anónimo distinto)
// con su clave correcta -> debe poder reclamar el documento.
// ════════════════════════════════════════════════════════════════
function runCaso3() {
  console.log("\n--- CASO 3: re-claim desde dispositivo nuevo, clave correcta ---");
  fakeFb.__setAuthUser({ uid: "anon-juan-CELULAR", isAnonymous: true });
  window.rgClaimOwnership(pid1, "anon-juan-CELULAR", "111111")
    .then(() => {
      check("rgClaimOwnership() se resolvió sin error", true);
      check("El ownerUid en el 'Firestore' simulado quedó actualizado al nuevo dispositivo",
        fakeFb.__rawParticipants()[pid1].ownerUid === "anon-juan-CELULAR");
      check("La clave sigue siendo la misma tras el re-claim",
        fakeFb.__rawParticipants()[pid1].clave === "111111");
      runCaso4();
    })
    .catch(err => {
      check("rgClaimOwnership() NO debería fallar con clave correcta: " + err.message, false);
      runCaso4();
    });
}

// ════════════════════════════════════════════════════════════════
// CASO 4 — Alguien intenta reclamar con una clave INCORRECTA -> debe
// ser rechazado por las reglas (no por la app, que es justo el punto).
// ════════════════════════════════════════════════════════════════
function runCaso4() {
  console.log("\n--- CASO 4: intento de re-claim con clave incorrecta ---");
  fakeFb.__setAuthUser({ uid: "anon-atacante-2", isAnonymous: true });
  window.rgClaimOwnership(pid1, "anon-atacante-2", "000000") // clave inventada
    .then(() => { check("Un re-claim con clave incorrecta NO debería tener éxito", false); runCaso5(); })
    .catch(err => {
      check("El re-claim con clave incorrecta fue rechazado", err.code === "permission-denied" || !!err);
      check("El ownerUid sigue siendo el del dispositivo legítimo (celular de Juan), no el del atacante",
        fakeFb.__rawParticipants()[pid1].ownerUid === "anon-juan-CELULAR");
      runCaso5();
    });
}

// ════════════════════════════════════════════════════════════════
// CASO 5 — El admin mueve a Juan a la papelera: su documento debe
// desaparecer de la colección pública (rgDeleteParticipantDoc).
// ════════════════════════════════════════════════════════════════
function runCaso5() {
  console.log("\n--- CASO 5: admin elimina (mueve a papelera) ---");
  fakeFb.__setAuthUser({ uid: "admin-uid", isAnonymous: false, email: ADMIN_EMAIL });
  window.__simIsAdmin = true;

  window.rgDeleteParticipantDoc(pid1)
    .then(() => {
      check("El documento de Juan ya NO existe en el 'Firestore' simulado tras el borrado",
        !fakeFb.__rawParticipants()[pid1]);
      runCaso6();
    });
}

// ════════════════════════════════════════════════════════════════
// CASO 6 — Migración legacy: el admin crea un documento SIN ownerUid.
// ════════════════════════════════════════════════════════════════
function runCaso6() {
  console.log("\n--- CASO 6: admin crea participante migrado, sin ownerUid ---");
  fakeFb.__setAuthUser({ uid: "admin-uid", isAnonymous: false, email: ADMIN_EMAIL });
  const pidLegacy = window.uid();
  window.DB.participants.push({
    id: pidLegacy, codigo: window.nextCode(), name: "Migrado Histórico",
    city: "Maracaibo", country: "Venezuela", email: "", clave: window.genClave(),
    estadoQuiniela: "enviada", fechaCreacion: Date.now(), fechaActualizacion: Date.now()
    // sin ownerUid a propósito
  });
  window.DB.predictions[pidLegacy] = {};
  window.saveData(window.DB);

  setImmediate(() => {
    const raw = fakeFb.__rawParticipants()[pidLegacy];
    check("El admin pudo crear un documento sin ownerUid (migración legacy)", !!raw);
    runCaso7(pidLegacy);
  });
}

// ════════════════════════════════════════════════════════════════
// CASO 7 — rgResetAll(): borra TODOS los documentos reales de la
// colección (no solo lo que esté en DB.participants en memoria).
// ════════════════════════════════════════════════════════════════
function runCaso7(pidLegacy) {
  console.log("\n--- CASO 7: reset total ---");
  fakeFb.__setAuthUser({ uid: "admin-uid", isAnonymous: false, email: ADMIN_EMAIL });

  const before = Object.keys(fakeFb.__rawParticipants()).length;
  check("Antes del reset hay al menos 1 documento real en el 'Firestore' simulado", before >= 1);

  window.rgResetAll().then(() => {
    const after = Object.keys(fakeFb.__rawParticipants()).length;
    check("Después de rgResetAll(), la colección de participantes quedó vacía en el servidor", after === 0);
    check("La papelera quedó vacía en el servidor", JSON.stringify(fakeFb.__rawPapelera().items) === "[]");
    finish();
  });
}

function finish() {
  console.log("\n=== RESULTADO FINAL:", allOk ? "TODOS LOS CASOS PASAN ✅" : "HAY FALLOS ❌", "===");
  process.exit(allOk ? 0 : 1);
}
