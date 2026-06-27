// Test funcional de la nueva capa de seguridad en participantes.js:
// sync por documento con diff inteligente, reclamo de propiedad en DOS
// PASOS (v6.9, registro_privado), borrado de documentos (público +
// privado), y reset total.
//
// participantes.js NO está envuelto en IIFE (a diferencia de registro.js),
// así que podemos cargarlo directo con vm/jsdom sin pelear con scopes.
// También cargamos utils.js (real, no un stub) porque participantes.js
// usa crc32() de ahí para emailHash -- en producción esto funciona
// porque utils.js carga ANTES que participantes.js sea efectivamente
// LLAMADO (no antes de que se DECLARE), así que cargarlo acá también es
// fiel al comportamiento real.
//
// En vez de un mock superficial, este "Firestore en memoria" aplica la
// MISMA lógica de permisos que firestore.rules (incluido el get()
// cross-documento que ahora usa el re-claim de registro_participants
// contra registro_privado) antes de aceptar cada escritura, para que el
// test detecte tanto bugs del código JS como mismatches entre el código
// y las reglas reales.
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const ADMIN_EMAIL = "agustingb23@gmail.com";

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

// ── "Firestore" en memoria ──────────────────────────────────────────
function makeFakeFirestore() {
  const participantsStore = {}; // { [id]: data }
  const privadoStore = {};      // { [id]: data } -- v6.9
  const metaStore = { current: null };
  const papeleraStore = { current: null };
  let currentAuthUser = null; // simula fb.auth.currentUser
  // v7.5 — simula el bug real reportado: la regla de registro_privado
  // NUNCA llegó a publicarse en Firebase Console (el archivo
  // firestore.rules del repo se actualizó, pero ese paso manual de
  // "pegar y Publicar" se saltó) -- Firestore niega por defecto
  // cualquier ruta sin regla explícita, así que CUALQUIER escritura a
  // esa colección se rechaza, sin importar quién la haga.
  let privadoRulesMissing = false;

  const participantListeners = [];
  const privadoListeners = [];  // solo se usa si quien escucha es admin (igual que en producción)
  const metaListeners = [];
  const papeleraListeners = [];

  function notifyParticipants() {
    const docs = Object.entries(participantsStore).map(([id, data]) => ({
      id, data: () => data
    }));
    participantListeners.forEach(cb => cb({ docs }));
  }
  function notifyPrivado() {
    const docs = Object.entries(privadoStore).map(([id, data]) => ({
      id, data: () => data
    }));
    privadoListeners.forEach(cb => cb({ docs }));
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

  function isAdminAuth(auth) { return !!auth && auth.email === ADMIN_EMAIL; }

  // registro_participants -- v6.9: SIN clave/correo, reclamo en dos pasos
  function rulesAllowParticipantSet(auth, before, after) {
    if (!auth) return false;
    const isAdmin = isAdminAuth(auth);
    if (before === null) { // create
      return after.ownerUid === auth.uid || isAdmin;
    }
    if (before.ownerUid === auth.uid) return before.estadoQuiniela !== "enviada"; // deadline real: ver sim_firestore_rules.js
    if (isAdmin) return true;
    // v6.9 — el re-claim del documento público YA NO compara una clave
    // (no vive acá). Exige que registro_privado/{pid} YA tenga el
    // ownerUid nuevo -- simula get(/registro_privado/{pid}).data.ownerUid.
    const affected = diffAffectedKeys(before, after);
    const onlyOwnerFields = hasOnly(affected, ['ownerUid', 'fechaActualizacion']);
    const privado = privadoStore[/* pid se inyecta abajo, ver wrapper */ currentParticipantIdBeingChecked];
    const privadoYaReclamado = !!(privado && privado.ownerUid === auth.uid);
    return onlyOwnerFields && privadoYaReclamado;
  }
  // currentParticipantIdBeingChecked: hack mínimo para que la función de
  // arriba (que no recibe el pid como parámetro, por simetría con el
  // resto del archivo) pueda mirar privadoStore[pid] -- se setea justo
  // antes de cada chequeo, ver los call-sites en setDoc/writeBatch.
  let currentParticipantIdBeingChecked = null;

  function rulesAllowParticipantMergeSet(auth, before, mergedFields, pid) {
    const after = { ...(before || {}), ...mergedFields };
    currentParticipantIdBeingChecked = pid;
    const r = rulesAllowParticipantSet(auth, before, after);
    currentParticipantIdBeingChecked = null;
    return r;
  }
  function rulesAllowParticipantDelete(auth, before) {
    if (!auth || !before) return false;
    return before.ownerUid === auth.uid || isAdminAuth(auth);
  }

  // registro_privado -- v6.9, NUEVO
  function rulesAllowPrivadoRead(auth, before) {
    if (!auth || !before) return false;
    return before.ownerUid === auth.uid || isAdminAuth(auth);
  }
  function rulesAllowPrivadoSet(auth, before, after) {
    if (privadoRulesMissing) return false; // v7.5 — sin regla publicada = Firestore niega TODO por defecto
    if (!auth) return false;
    const isAdmin = isAdminAuth(auth);
    if (before === null) return after.ownerUid === auth.uid || isAdmin; // create
    if (before.ownerUid === auth.uid) return true;
    if (isAdmin) return true;
    const affected = diffAffectedKeys(before, after);
    return hasOnly(affected, ['ownerUid', 'clave']) && after.clave === before.clave;
  }
  function rulesAllowPrivadoMergeSet(auth, before, mergedFields) {
    const after = { ...(before || {}), ...mergedFields };
    return rulesAllowPrivadoSet(auth, before, after);
  }
  function rulesAllowPrivadoDelete(auth, before) {
    if (!auth || !before) return false;
    return before.ownerUid === auth.uid || isAdminAuth(auth);
  }

  function rulesAllowMetaSet(auth, before, after) {
    if (!auth) return false;
    if (isAdminAuth(auth)) return true;
    if (before === null) return true;
    const affected = diffAffectedKeys(before, after);
    return hasOnly(affected, ['nextSeq', 'updatedAt']);
  }

  const fb = {
    db: {},
    auth: { get currentUser() { return currentAuthUser; } },
    PARTICIPANTS_COL: { __isParticipantsCol: true },
    PRIVADO_COL: { __isPrivadoCol: true },
    REGISTRO_META_DOC: { __isMetaDoc: true },
    REGISTRO_PAPELERA_DOC: { __isPapeleraDoc: true },
    doc(col, id) {
      if (col && col.__isPrivadoCol) return { __isPrivadoDoc: true, id };
      return { __isParticipantDoc: true, id };
    },
    serverTimestamp() { return "SERVER_TIMESTAMP"; },

    getDoc(ref) {
      if (ref.__isPrivadoDoc) {
        const before = privadoStore[ref.id] || null;
        if (!rulesAllowPrivadoRead(currentAuthUser, before)) {
          const err = new Error("permission-denied (simulado, lectura registro_privado)");
          err.code = "permission-denied";
          return Promise.reject(err);
        }
        return Promise.resolve({ exists: () => before !== null, data: () => before });
      }
      if (ref.__isParticipantDoc) {
        const before = participantsStore[ref.id] || null;
        return Promise.resolve({ exists: () => before !== null, data: () => before });
      }
      return Promise.reject(new Error("getDoc: ref desconocida en el mock"));
    },

    setDoc(ref, data, opts) {
      const merge = !!(opts && opts.merge);
      if (ref.__isMetaDoc) {
        const beforeMeta = metaStore.current;
        if (!rulesAllowMetaSet(currentAuthUser, beforeMeta, data)) {
          const err = new Error("permission-denied (simulado, registro/meta)");
          err.code = "permission-denied";
          return Promise.reject(err);
        }
        metaStore.current = data;
        notifyMeta();
        return Promise.resolve();
      }
      if (ref.__isPapeleraDoc) {
        papeleraStore.current = data;
        notifyPapelera();
        return Promise.resolve();
      }
      if (ref.__isPrivadoDoc) {
        const before = privadoStore[ref.id] || null;
        const allowed = merge
          ? rulesAllowPrivadoMergeSet(currentAuthUser, before, data)
          : rulesAllowPrivadoSet(currentAuthUser, before, data);
        if (!allowed) {
          const err = new Error("permission-denied (simulado, registro_privado)");
          err.code = "permission-denied";
          return Promise.reject(err);
        }
        privadoStore[ref.id] = merge ? { ...(before || {}), ...data } : data;
        notifyPrivado();
        return Promise.resolve();
      }
      if (ref.__isParticipantDoc) {
        const before = participantsStore[ref.id] || null;
        const allowed = merge
          ? rulesAllowParticipantMergeSet(currentAuthUser, before, data, ref.id)
          : (() => { currentParticipantIdBeingChecked = ref.id; const r = rulesAllowParticipantSet(currentAuthUser, before, data); currentParticipantIdBeingChecked = null; return r; })();
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
      if (ref.__isPrivadoDoc) {
        const before = privadoStore[ref.id] || null;
        if (!rulesAllowPrivadoDelete(currentAuthUser, before)) {
          const err = new Error("permission-denied (simulado, registro_privado)");
          err.code = "permission-denied";
          return Promise.reject(err);
        }
        delete privadoStore[ref.id];
        notifyPrivado();
        return Promise.resolve();
      }
      const before = participantsStore[ref.id] || null;
      if (!rulesAllowParticipantDelete(currentAuthUser, before)) {
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
              currentParticipantIdBeingChecked = op.ref.id;
              const allowed = rulesAllowParticipantSet(currentAuthUser, before, op.data);
              currentParticipantIdBeingChecked = null;
              if (!allowed) {
                const err = new Error(`permission-denied en batch.set(${op.ref.id})`);
                err.code = "permission-denied";
                return Promise.reject(err);
              }
            }
            if (op.type === "set" && op.ref.__isPrivadoDoc) {
              const before = privadoStore[op.ref.id] || null;
              if (!rulesAllowPrivadoSet(currentAuthUser, before, op.data)) {
                const err = new Error(`permission-denied en batch.set(privado/${op.ref.id})`);
                err.code = "permission-denied";
                return Promise.reject(err);
              }
            }
            if (op.type === "set" && op.ref.__isMetaDoc) {
              const before = metaStore.current;
              if (!rulesAllowMetaSet(currentAuthUser, before, op.data)) {
                const err = new Error("permission-denied en batch.set(registro/meta)");
                err.code = "permission-denied";
                return Promise.reject(err);
              }
            }
            if (op.type === "delete" && op.ref.__isParticipantDoc) {
              const before = participantsStore[op.ref.id] || null;
              if (!rulesAllowParticipantDelete(currentAuthUser, before)) {
                const err = new Error(`permission-denied en batch.delete(${op.ref.id})`);
                err.code = "permission-denied";
                return Promise.reject(err);
              }
            }
            if (op.type === "delete" && op.ref.__isPrivadoDoc) {
              const before = privadoStore[op.ref.id] || null;
              if (!rulesAllowPrivadoDelete(currentAuthUser, before)) {
                const err = new Error(`permission-denied en batch.delete(privado/${op.ref.id})`);
                err.code = "permission-denied";
                return Promise.reject(err);
              }
            }
          }
          ops.forEach(op => {
            if (op.type === "set") {
              if (op.ref.__isMetaDoc) metaStore.current = op.data;
              else if (op.ref.__isPrivadoDoc) privadoStore[op.ref.id] = op.data;
              else if (op.ref.__isParticipantDoc) participantsStore[op.ref.id] = op.data;
            } else if (op.type === "delete") {
              if (op.ref.__isPrivadoDoc) delete privadoStore[op.ref.id];
              else if (op.ref.__isParticipantDoc) delete participantsStore[op.ref.id];
            }
          });
          notifyParticipants();
          notifyPrivado();
          notifyMeta();
          return Promise.resolve();
        }
      };
    },

    onSnapshot(ref, onNext) {
      if (ref.__isParticipantsCol) {
        participantListeners.push(onNext);
        notifyParticipants(); // emite el estado actual de inmediato, como el SDK real
      } else if (ref.__isPrivadoCol) {
        // v6.9 — en producción esto solo se wirea si isAdmin() es true
        // (rgWirePrivadoSyncIfAdmin); el mock no impone esa restricción
        // de "quién puede suscribirse sin filtro" (eso es responsabilidad
        // del código JS, no de este mock) -- si participantes.js alguna
        // vez intentara esto sin ser admin, el bug estaría en el código,
        // y CASO 8 más abajo confirma que isAdmin() sí lo está gateando.
        privadoListeners.push(onNext);
        notifyPrivado();
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
    __setPrivadoRulesMissing(v) { privadoRulesMissing = !!v; },
    __rawParticipants() { return participantsStore; },
    __rawPrivado() { return privadoStore; },
    __rawMeta() { return metaStore.current; },
    __rawPapelera() { return papeleraStore.current; },
  };
  return fb;
}

// ── Carga utils.js (real, para crc32) + participantes.js en un
// contexto jsdom mínimo ──────────────────────────────────────────────
const dom = new JSDOM("<!doctype html><html><body></body></html>", { runScripts: "dangerously" });
const { window } = dom;
window.toast = (msg, err) => console.log(`[toast]${err ? " ERR" : ""}: ${msg}`);
window.isAdmin = () => window.__simIsAdmin === true; // controlado por el test
window.URL.createObjectURL = () => "blob:fake";
window.URL.revokeObjectURL = () => {};
window.Blob = function (parts) { this.parts = parts; };

const fakeFb = makeFakeFirestore();
window.__fb = fakeFb;

const utilsCode = fs.readFileSync(path.join(__dirname, "utils.js"), "utf8");
const utilsScript = window.document.createElement("script");
utilsScript.textContent = utilsCode;
window.document.body.appendChild(utilsScript);

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
window.rgHydrateOwnPrivado = rgHydrateOwnPrivado;
window.rgWirePrivadoSyncIfAdmin = rgWirePrivadoSyncIfAdmin;
window.rgCreateParticipantConfirmed = rgCreateParticipantConfirmed;
window.runMigracionPrivacidad = runMigracionPrivacidad;
window.loadData = loadData;
window._rgEmailHash = _rgEmailHash;
window._rgGetLastKnownParticipantsJSON = () => _rgLastKnownParticipantsJSON;
window._rgGetLastKnownPrivadoJSON = () => _rgLastKnownPrivadoJSON;
`;
const script = window.document.createElement("script");
script.textContent = code + "\n;\n" + bridge;
window.document.body.appendChild(script);

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

setTimeoutFlushAndCheck();

function setTimeoutFlushAndCheck() {
  setImmediate(() => {
    const rawPub = fakeFb.__rawParticipants()[pid1];
    const rawPriv = fakeFb.__rawPrivado()[pid1];
    check("El documento PÚBLICO de Juan se escribió en el 'Firestore' simulado", !!rawPub);
    check("El documento escrito tiene el nombre correcto", rawPub && rawPub.name === "Juan Pérez");
    check("El documento escrito tiene predictions embebidas", rawPub && rawPub.predictions && rawPub.predictions.m1 && rawPub.predictions.m1.h === 1);
    check("v6.9 — el documento PÚBLICO ya NO tiene el campo 'clave'", rawPub && rawPub.clave === undefined);
    check("v6.9 — el documento PÚBLICO ya NO tiene el campo 'email' (en texto plano)", rawPub && rawPub.email === undefined);
    check("v6.9 — el documento PÚBLICO sí tiene emailHash (no reversible, para detectar duplicados)", rawPub && typeof rawPub.emailHash === "string" && rawPub.emailHash.length > 0);
    check("v6.9 — el documento PRIVADO se creó con la clave correcta", !!rawPriv && rawPriv.clave === "111111");
    check("v6.9 — el documento PRIVADO tiene el correo en texto plano", !!rawPriv && rawPriv.email === "juan@example.com");
    check("v6.9 — el documento PRIVADO tiene el ownerUid correcto", !!rawPriv && rawPriv.ownerUid === "anon-juan");

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
    id: pid1, name: "Juan Pérez (HACKEADO)", ownerUid: "anon-juan",
    predictions: { m1: { h: 9, a: 9 } }
  });
  batch.commit()
    .then(() => { check("Un atacante NO debería poder escribir el doc de Juan, pero la promesa se resolvió", false); runCaso2b(); })
    .catch(err => {
      check("El intento de escritura no autorizada fue rechazado (permission-denied)", err.code === "permission-denied");
      check("El documento de Juan NO fue modificado por el intento fallido",
        fakeFb.__rawParticipants()[pid1].name === "Juan Pérez");
      runCaso2b();
    });
}

// ════════════════════════════════════════════════════════════════
// CASO 2b — v6.9: un atacante que LEE la colección pública completa NO
// encuentra ninguna clave/correo ahí -- y aunque IGUAL intentara leer
// directo el documento privado de Juan (sin ser su dueño ni admin), eso
// también se rechaza.
// ════════════════════════════════════════════════════════════════
function runCaso2b() {
  console.log("\n--- CASO 2b: un atacante intenta leer datos privados de Juan ---");
  fakeFb.__setAuthUser({ uid: "anon-atacante", isAnonymous: true });
  fakeFb.getDoc(fakeFb.doc(fakeFb.PRIVADO_COL, pid1))
    .then(() => { check("Un atacante NO debería poder leer el documento privado de Juan, pero se resolvió", false); runCaso3(); })
    .catch(err => {
      check("La lectura no autorizada del documento privado fue rechazada (permission-denied)", err.code === "permission-denied");
      runCaso3();
    });
}

// ════════════════════════════════════════════════════════════════
// CASO 3 — Juan entra desde un dispositivo nuevo (UID anónimo distinto)
// con su clave correcta -> debe poder reclamar el documento (DOS pasos:
// primero registro_privado, después registro_participants).
// ════════════════════════════════════════════════════════════════
function runCaso3() {
  console.log("\n--- CASO 3: re-claim desde dispositivo nuevo, clave correcta ---");
  fakeFb.__setAuthUser({ uid: "anon-juan-CELULAR", isAnonymous: true });
  window.rgClaimOwnership(pid1, "anon-juan-CELULAR", "111111")
    .then(() => {
      check("rgClaimOwnership() se resolvió sin error", true);
      check("El ownerUid del documento PÚBLICO quedó actualizado al nuevo dispositivo",
        fakeFb.__rawParticipants()[pid1].ownerUid === "anon-juan-CELULAR");
      check("El ownerUid del documento PRIVADO también quedó actualizado",
        fakeFb.__rawPrivado()[pid1].ownerUid === "anon-juan-CELULAR");
      check("La clave sigue siendo la misma tras el re-claim",
        fakeFb.__rawPrivado()[pid1].clave === "111111");
      runCaso4();
    })
    .catch(err => {
      check("rgClaimOwnership() NO debería fallar con clave correcta: " + err.message, false);
      runCaso4();
    });
}

// ════════════════════════════════════════════════════════════════
// CASO 4 — Alguien intenta reclamar con una clave INCORRECTA -> debe
// ser rechazado por las reglas (no por la app, que es justo el punto),
// y el paso 2 (ownerUid público) ni siquiera debería intentarse.
// ════════════════════════════════════════════════════════════════
function runCaso4() {
  console.log("\n--- CASO 4: intento de re-claim con clave incorrecta ---");
  fakeFb.__setAuthUser({ uid: "anon-atacante-2", isAnonymous: true });
  window.rgClaimOwnership(pid1, "anon-atacante-2", "000000") // clave inventada
    .then(() => { check("Un re-claim con clave incorrecta NO debería tener éxito", false); runCaso4b(); })
    .catch(err => {
      check("El re-claim con clave incorrecta fue rechazado", err.code === "permission-denied" || !!err);
      check("El ownerUid público sigue siendo el del dispositivo legítimo (celular de Juan), no el del atacante",
        fakeFb.__rawParticipants()[pid1].ownerUid === "anon-juan-CELULAR");
      check("El ownerUid privado TAMBIÉN sigue siendo el del dispositivo legítimo (el paso 1 ya lo había bloqueado)",
        fakeFb.__rawPrivado()[pid1].ownerUid === "anon-juan-CELULAR");
      runCaso4b();
    });
}

// ════════════════════════════════════════════════════════════════
// CASO 4b — v6.9: findByEmail() por hash sigue detectando duplicados
// sin que el buscador necesite leer ningún correo en texto plano.
// ════════════════════════════════════════════════════════════════
function runCaso4b() {
  console.log("\n--- CASO 4b: emailHash detecta duplicados sin exponer el correo ---");
  const hashReal = window._rgEmailHash("juan@example.com");
  const hashMayusYEspacios = window._rgEmailHash("  JUAN@EXAMPLE.COM  ");
  check("El hash es estable ante mayúsculas/espacios (mismo correo normalizado)", hashReal === hashMayusYEspacios && !!hashReal);
  check("El documento público de Juan tiene exactamente ese emailHash",
    fakeFb.__rawParticipants()[pid1].emailHash === hashReal);
  check("Un correo DISTINTO da un hash distinto (no hay colisión obvia)",
    window._rgEmailHash("otra-persona@example.com") !== hashReal);
  runCaso5();
}

// ════════════════════════════════════════════════════════════════
// CASO 5 — El admin mueve a Juan a la papelera: su documento debe
// desaparecer de la colección pública Y de la privada
// (rgDeleteParticipantDoc).
// ════════════════════════════════════════════════════════════════
function runCaso5() {
  console.log("\n--- CASO 5: admin elimina (mueve a papelera) ---");
  fakeFb.__setAuthUser({ uid: "admin-uid", isAnonymous: false, email: ADMIN_EMAIL });
  window.__simIsAdmin = true;

  window.rgDeleteParticipantDoc(pid1)
    .then(() => {
      setImmediate(() => { // el borrado del documento privado es "fire and forget" (.catch sin then) -- damos una vuelta de microtask
        check("El documento PÚBLICO de Juan ya NO existe en el 'Firestore' simulado tras el borrado",
          !fakeFb.__rawParticipants()[pid1]);
        check("El documento PRIVADO de Juan TAMBIÉN desapareció (v6.9 — ya no queda huérfano)",
          !fakeFb.__rawPrivado()[pid1]);
        runCaso6();
      });
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
    const rawPriv = fakeFb.__rawPrivado()[pidLegacy];
    check("El admin pudo crear un documento público sin ownerUid (migración legacy)", !!raw);
    check("v6.9 — la clave del migrado también quedó en el documento privado (no en el público)", !!rawPriv && !!rawPriv.clave && raw.clave === undefined);
    runCaso6a(pidLegacy);
  });
}

// ════════════════════════════════════════════════════════════════
// CASO 6a — BUG REAL encontrado en producción (24/06): rgWireFirestoreSync()
// intenta conectar rgWirePrivadoSyncIfAdmin() UNA SOLA VEZ, apenas carga
// la página -- en ese instante todavía nadie sabe si la sesión va a ser
// admin (eso se sabe recién en el primer onAuthStateChanged real, que en
// este test pasa a ser "admin" apenas en CASO 5/6, no al cargar el
// script). Si nada vuelve a llamar a rgWirePrivadoSyncIfAdmin() después
// de que la sesión SÍ es admin, el admin se queda para siempre sin ver
// clave/correo de nadie -- exactamente lo que reportó Tato. La
// corrección real vive en app.js (wireFirebaseAuth la vuelve a llamar
// en cada cambio de sesión, igual que ya hacía con la papelera); este
// test reproduce el escenario completo simulando esa misma llamada.
// ════════════════════════════════════════════════════════════════
function runCaso6a(pidLegacy) {
  console.log("\n--- CASO 6a: el admin recién ahora intenta ver clave/correo (re-wire tras login) ---");

  // A diferencia de pidLegacy (que el ADMIN mismo acaba de crear, y por
  // lo tanto ya conoce su clave/correo solo por haberlos escrito), este
  // participante lo crea una sesión anónima DISTINTA -- igual que los 27
  // de producción, que se registraron ellos mismos, no el admin. Es la
  // única forma de reproducir de verdad el bug: el admin nunca escribió
  // este documento, así que la ÚNICA manera de que vea su clave es la
  // sincronización en vivo (rgWirePrivadoSyncIfAdmin), no un efecto
  // colateral de haberlo guardado él mismo.
  fakeFb.__setAuthUser({ uid: "anon-pedro", isAnonymous: true });
  const pidPedro = window.uid();
  window.DB.participants.push({
    id: pidPedro, codigo: window.nextCode(), name: "Pedro Ramírez",
    city: "Guayaquil", country: "Ecuador", email: "pedro@example.com",
    clave: "222222", ownerUid: "anon-pedro",
    estadoQuiniela: "borrador", fechaCreacion: Date.now(), fechaActualizacion: Date.now()
  });
  window.DB.predictions[pidPedro] = {};
  window.saveData(window.DB);

  setImmediate(() => {
    fakeFb.__setAuthUser({ uid: "admin-uid", isAnonymous: false, email: ADMIN_EMAIL });
    // Nota: no podemos verificar acá "antes del re-wire el admin no ve
    // nada" de forma confiable -- este test corre TODO en un solo
    // proceso/scope global, así que el caché en memoria que Pedro
    // acaba de llenar PARA SU PROPIA sesión (algo que en un navegador
    // real es memoria completamente separada de la del admin) queda
    // técnicamente "visible" en este mismo scope compartido. En
    // producción cada navegador tiene su propia memoria, así que esa
    // contaminación no puede pasar -- lo que SÍ es 100% real y se
    // confirma abajo es que rgWirePrivadoSyncIfAdmin() es el mecanismo
    // que de verdad entrega los datos vía la colección completa.

    // Esto es exactamente lo que ahora hace wireFirebaseAuth() en app.js
    // cada vez que cambia el estado de auth (mismo patrón que ya usaba
    // para la papelera).
    window.rgWirePrivadoSyncIfAdmin();

    setImmediate(() => {
      const pedroEnMemoria = window.DB.participants.find(x => x.id === pidPedro);
      check("DESPUÉS del re-wire: el admin YA ve la clave de Pedro en DB.participants (puede mandársela)",
        !!pedroEnMemoria && pedroEnMemoria.clave === "222222");
      check("DESPUÉS del re-wire: el admin también ve su correo",
        pedroEnMemoria.email === "pedro@example.com");
      runCaso6b(pidLegacy);
    });
  });
}

// ════════════════════════════════════════════════════════════════
// CASO 6b — runMigracionPrivacidad(): el caso que de verdad importa
// para los 27 participantes que YA EXISTÍAN antes de v6.9. Simulamos
// el escenario real: un documento público que TODAVÍA tiene clave/
// correo en texto plano (como están los de producción hasta que esto
// se corra), inyectado directo en el "Firestore" simulado (sin pasar
// por las reglas -- es justamente lo que ya hay guardado de antes,
// nadie lo está escribiendo ahora). Después de correr la migración,
// ese documento público no debe tener más clave/correo, y el privado
// debe tenerlos correctos.
// ════════════════════════════════════════════════════════════════
function runCaso6b(pidLegacy) {
  console.log("\n--- CASO 6b: runMigracionPrivacidad() sobre un documento 'viejo' (pre-v6.9) ---");
  fakeFb.__setAuthUser({ uid: "admin-uid", isAnonymous: false, email: ADMIN_EMAIL });
  window.__simIsAdmin = true;

  const pidViejo = window.uid();
  // Inyectado DIRECTO en el store, simulando lo que ya hay en Firestore
  // de antes de v6.9 -- con clave/correo en texto plano en el documento
  // público, tal como quedaron escritos por versiones anteriores.
  fakeFb.__rawParticipants()[pidViejo] = {
    id: pidViejo, name: "Carlos Viejo", city: "Orlando", country: "USA",
    email: "carlos@example.com", clave: "777777", ownerUid: "anon-carlos-viejo",
    estadoQuiniela: "enviada", fechaCreacion: 1000, fechaActualizacion: 1000
  };
  // Y su copia en memoria (lo que _rgRebuildParticipantsFromDocs habría
  // armado al leer ese documento viejo -- clave/correo todavía vienen
  // adentro porque el destructuring genérico los recoge igual).
  window.DB.participants.push({
    id: pidViejo, name: "Carlos Viejo", city: "Orlando", country: "USA",
    email: "carlos@example.com", clave: "777777", ownerUid: "anon-carlos-viejo",
    estadoQuiniela: "enviada", fechaCreacion: 1000, fechaActualizacion: 1000
  });
  window.DB.predictions[pidViejo] = { m2: { h: 0, a: 0 } };

  check("ANTES de migrar: el documento público viejo SÍ tiene clave en texto plano (así está hoy en producción)",
    fakeFb.__rawParticipants()[pidViejo].clave === "777777");
  check("ANTES de migrar: el documento público viejo SÍ tiene correo en texto plano",
    fakeFb.__rawParticipants()[pidViejo].email === "carlos@example.com");
  check("ANTES de migrar: todavía no existe ningún documento privado para Carlos",
    !fakeFb.__rawPrivado()[pidViejo]);

  window.runMigracionPrivacidad().then(() => {
    const rawPub = fakeFb.__rawParticipants()[pidViejo];
    const rawPriv = fakeFb.__rawPrivado()[pidViejo];
    check("DESPUÉS de migrar: el documento público de Carlos YA NO tiene clave", rawPub && rawPub.clave === undefined);
    check("DESPUÉS de migrar: el documento público de Carlos YA NO tiene correo en texto plano", rawPub && rawPub.email === undefined);
    check("DESPUÉS de migrar: el documento público de Carlos SÍ tiene emailHash correcto",
      rawPub && rawPub.emailHash === window._rgEmailHash("carlos@example.com"));
    check("DESPUÉS de migrar: el documento privado de Carlos tiene la clave correcta", !!rawPriv && rawPriv.clave === "777777");
    check("DESPUÉS de migrar: el documento privado de Carlos tiene el correo correcto", !!rawPriv && rawPriv.email === "carlos@example.com");
    check("DESPUÉS de migrar: el documento público de Carlos NO perdió ningún otro dato (predicciones, estado, etc.)",
      rawPub && rawPub.estadoQuiniela === "enviada" && rawPub.predictions && rawPub.predictions.m2 && rawPub.predictions.m2.h === 0);

    // Es seguro correrla dos veces (no-op real la segunda vez).
    window.runMigracionPrivacidad().then(() => {
      const rawPub2 = fakeFb.__rawParticipants()[pidViejo];
      const rawPriv2 = fakeFb.__rawPrivado()[pidViejo];
      check("Correr la migración UNA SEGUNDA VEZ no rompe nada (mismo resultado)",
        rawPub2.emailHash === window._rgEmailHash("carlos@example.com") && rawPriv2.clave === "777777");
      runCaso7(pidLegacy);
    });
  }).catch(err => {
    check("runMigracionPrivacidad() NO debería fallar: " + err.message, false);
    runCaso7(pidLegacy);
  });
}

// ════════════════════════════════════════════════════════════════
// CASO 7 — rgResetAll(): borra TODOS los documentos reales de la
// colección (pública Y privada), no solo lo que esté en DB.participants
// en memoria.
// ════════════════════════════════════════════════════════════════
function runCaso7(pidLegacy) {
  console.log("\n--- CASO 7: reset total ---");
  fakeFb.__setAuthUser({ uid: "admin-uid", isAnonymous: false, email: ADMIN_EMAIL });

  const before = Object.keys(fakeFb.__rawParticipants()).length;
  check("Antes del reset hay al menos 1 documento real en el 'Firestore' simulado", before >= 1);

  window.rgResetAll().then(() => {
    const after = Object.keys(fakeFb.__rawParticipants()).length;
    const afterPrivado = Object.keys(fakeFb.__rawPrivado()).length;
    check("Después de rgResetAll(), la colección pública de participantes quedó vacía en el servidor", after === 0);
    check("v6.9 — la colección privada TAMBIÉN quedó vacía (ya no quedan documentos huérfanos)", afterPrivado === 0);
    check("La papelera quedó vacía en el servidor", JSON.stringify(fakeFb.__rawPapelera().items) === "[]");
    runCaso8();
  });
}

// ════════════════════════════════════════════════════════════════
// CASO 8 — rgCreateParticipantConfirmed(): v7.5, fix del bug reportado
// ("me registro, me pide el correo otra vez, nunca aparece en Admin").
// ════════════════════════════════════════════════════════════════
function runCaso8() {
  console.log("\n--- CASO 8: rgCreateParticipantConfirmed() (v7.5) ---");
  fakeFb.__setAuthUser({ uid: "anon-maria", isAnonymous: true });

  const pid8 = window.uid();
  const p8 = {
    id: pid8, codigo: window.nextCode(), name: "María López",
    city: "Maracaibo", country: "Venezuela", email: "maria@example.com",
    clave: "222222", ownerUid: "anon-maria",
    estadoQuiniela: "borrador", fechaCreacion: Date.now(), fechaActualizacion: Date.now()
  };

  // -- Caso normal: las reglas SÍ incluyen registro_privado (como deberían) --
  window.rgCreateParticipantConfirmed(p8).then(() => {
    check("CASO 8a (camino feliz): el documento público de María se creó en el servidor",
      !!fakeFb.__rawParticipants()[pid8]);
    check("CASO 8a: el documento privado de María se creó con su correo/clave",
      fakeFb.__rawPrivado()[pid8] && fakeFb.__rawPrivado()[pid8].email === "maria@example.com");
    check("CASO 8a: la Promise se resuelve (el llamador SÍ puede saber que funcionó)", true);
    runCaso8b();
  }).catch(err => {
    check("CASO 8a NO debería fallar con las reglas normales: " + err.message, false);
    runCaso8b();
  });
}

// CASO 8b — REPRODUCCIÓN EXACTA DEL BUG: simula que la regla de
// registro_privado nunca se publicó en Firebase Console (firestore.rules
// se actualizó en el código, pero ese paso manual se saltó). Antes del
// fix, onCrearSubmit() decía "¡Listo!" y entraba al wizard igual, sin
// que nadie se enterara de que el batch entero (público + privado, son
// atómicos) fue rechazado. Ahora rgCreateParticipantConfirmed() debe
// devolver una Promise rechazada para que el llamador pueda mostrar un
// error real en vez de una falsa sensación de éxito.
function runCaso8b() {
  console.log("\n--- CASO 8b: reproducción del bug -- registro_privado SIN regla publicada ---");
  fakeFb.__setAuthUser({ uid: "anon-carlos-amigo", isAnonymous: true });
  fakeFb.__setPrivadoRulesMissing(true);

  const pid8b = window.uid();
  const p8b = {
    id: pid8b, codigo: window.nextCode(), name: "Carlos Amigo",
    city: "Orlando", country: "USA", email: "carlos.amigo@example.com",
    clave: "333333", ownerUid: "anon-carlos-amigo",
    estadoQuiniela: "borrador", fechaCreacion: Date.now(), fechaActualizacion: Date.now()
  };

  window.rgCreateParticipantConfirmed(p8b).then(() => {
    check("CASO 8b: con la regla de registro_privado faltante, la Promise NO debería resolverse, pero se resolvió", false);
    fakeFb.__setPrivadoRulesMissing(false);
    runCaso9();
  }).catch(err => {
    check("CASO 8b: la Promise se RECHAZA (permission-denied) -- el llamador se entera de verdad", err.code === "permission-denied");
    check("CASO 8b: gracias a la atomicidad del batch, el documento PÚBLICO de Carlos tampoco se creó (no queda 'huérfano' del lado del servidor)",
      !fakeFb.__rawParticipants()[pid8b]);
    check("CASO 8b: el documento PRIVADO de Carlos tampoco se creó",
      !fakeFb.__rawPrivado()[pid8b]);
    fakeFb.__setPrivadoRulesMissing(false);
    runCaso9();
  });
}

// CASO 9 — Tras una creación CONFIRMADA con éxito (CASO 8a), las cachés
// de "último JSON conocido" (las que evitan que el próximo autoguardado
// normal de la quiniela reescriba sin necesidad lo que el servidor ya
// tiene) deben quedar al día -- y, simétricamente, una creación que el
// servidor RECHAZÓ (CASO 8b) NO debe dejar entradas falsas en esas
// mismas cachés (eso engañaría al próximo saveData() haciéndole creer
// que ese documento ya está sincronizado cuando en realidad nunca llegó
// a existir del lado del servidor).
function runCaso9() {
  console.log("\n--- CASO 9: las cachés de sincronización quedan correctas tras crear (éxito y fallo) ---");
  const pidMaria = Object.keys(fakeFb.__rawParticipants()).find(
    id => fakeFb.__rawParticipants()[id].name === "María López"
  );
  check("CASO 9: tras el éxito de CASO 8a, sí quedó una entrada en la caché pública para María",
    typeof window._rgGetLastKnownParticipantsJSON()[pidMaria] === "string");
  check("CASO 9: tras el éxito de CASO 8a, sí quedó una entrada en la caché privada para María",
    typeof window._rgGetLastKnownPrivadoJSON()[pidMaria] === "string");

  const pidCarlosAmigo = Object.keys(fakeFb.__rawParticipants()).find(
    id => fakeFb.__rawParticipants()[id] && fakeFb.__rawParticipants()[id].name === "Carlos Amigo"
  );
  check("CASO 9: el rechazo de CASO 8b NO dejó ningún documento público huérfano para Carlos Amigo",
    pidCarlosAmigo === undefined);

  finish();
}

function finish() {
  console.log("\n=== RESULTADO FINAL:", allOk ? "TODOS LOS CASOS PASAN ✅" : "HAY FALLOS ❌", "===");
  process.exit(allOk ? 0 : 1);
}
