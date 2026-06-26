// Simulador MANUAL de la semántica de firestore.rules para
// /registro_participants/{pid}, /registro_privado/{pid}, /registro/meta
// y /registro/papelera.
//
// IMPORTANTE — esto NO es el emulador real de Firestore. En este entorno
// no se puede descargar el binario del emulador (requiere
// storage.googleapis.com, fuera de la lista blanca de red disponible).
// Este script reimplementa a mano, en JS, la MISMA lógica booleana que
// describen las reglas (resource.data, request.resource.data,
// request.auth.uid, diff().affectedKeys(), hasOnly(), get(), etc.) para
// poder verificar que el razonamiento de cada regla es internamente
// consistente y cubre los casos reales del flujo de la app. Antes de
// publicar firestore.rules de verdad, igual hay que probarlo con el
// emulador real o con tráfico real controlado — esto es una red de
// seguridad adicional, no un sustituto.
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
function hasOnly(affectedKeys, allowed) {
  return affectedKeys.every(k => allowed.includes(k));
}

// ════════════════════════════════════════════════════════════════
// registro_participants/{pid} — v6.9: SIN clave/correo (ver registro_privado)
// ════════════════════════════════════════════════════════════════
function simAllowCreate(auth, newData) {
  if (!auth) return false;
  const isAdmin = auth.email === ADMIN_EMAIL;
  return newData.ownerUid === auth.uid || isAdmin;
}

// ctx.pastDeadline simula isPastDeadline(); ctx.privadoOwnerUid simula
// get(/registro_privado/{pid}).data.ownerUid -- es decir, lo que YA
// quedó guardado en el documento hermano al momento de evaluar esta
// regla (el re-claim real son DOS escrituras secuenciales: primero se
// confirma en registro_privado, y solo entonces se intenta este update).
function simAllowUpdate(auth, before, after, ctx) {
  if (!auth) return false;
  const isAdmin = auth.email === ADMIN_EMAIL;
  if (before.ownerUid === auth.uid) {
    const pastDeadline = !!(ctx && ctx.pastDeadline);
    return before.estadoQuiniela !== 'enviada' && !pastDeadline;
  }
  if (isAdmin) return true;
  // v6.9 — el re-claim del documento público ya NO compara una clave
  // (no vive acá desde la Fase de Privacidad). En su lugar exige que el
  // documento hermano en registro_privado YA tenga el ownerUid nuevo.
  const affected = diffAffectedKeys(before, after);
  const onlyOwnerFields = hasOnly(affected, ['ownerUid', 'fechaActualizacion']);
  const privadoYaReclamado = !!(ctx && ctx.privadoOwnerUid === auth.uid);
  return onlyOwnerFields && privadoYaReclamado;
}

function simAllowDelete(auth, before) {
  if (!auth) return false;
  const isAdmin = auth.email === ADMIN_EMAIL;
  return before.ownerUid === auth.uid || isAdmin;
}

// ════════════════════════════════════════════════════════════════
// registro_privado/{pid} — v6.9, NUEVO: clave + correo, dueño/admin only
// ════════════════════════════════════════════════════════════════
function simAllowPrivadoRead(auth, before) {
  if (!auth || !before) return false;
  const isAdmin = auth.email === ADMIN_EMAIL;
  return before.ownerUid === auth.uid || isAdmin;
}
function simAllowPrivadoCreate(auth, newData) {
  if (!auth) return false;
  const isAdmin = auth.email === ADMIN_EMAIL;
  return newData.ownerUid === auth.uid || isAdmin;
}
function simAllowPrivadoUpdate(auth, before, after) {
  if (!auth) return false;
  const isAdmin = auth.email === ADMIN_EMAIL;
  if (before.ownerUid === auth.uid) return true;
  if (isAdmin) return true;
  // Re-claim propiamente dicho: solo ownerUid+clave, Y la clave que se
  // manda coincide EXACTAMENTE con la que ya estaba guardada.
  const affected = diffAffectedKeys(before, after);
  return hasOnly(affected, ['ownerUid', 'clave']) && after.clave === before.clave;
}
function simAllowPrivadoDelete(auth, before) {
  if (!auth || !before) return false;
  const isAdmin = auth.email === ADMIN_EMAIL;
  return before.ownerUid === auth.uid || isAdmin;
}

function simAllowMetaWrite(auth, before, after) {
  if (!auth) return false;
  const isAdmin = auth.email === ADMIN_EMAIL;
  if (isAdmin) return true;
  if (before === null) return true; // primera escritura del documento (no pasa hoy en producción, pero la regla lo cubre)
  const affected = diffAffectedKeys(before, after);
  return hasOnly(affected, ['nextSeq', 'updatedAt']);
}

function simAllowPapelera(auth) {
  return !!auth && auth.email === ADMIN_EMAIL;
}

// ════════════════════════════════════════════════════════════════
// registro/admin2fa (v7.1) — mismo patrón que papelera: solo admin
// ════════════════════════════════════════════════════════════════
function simAllowAdmin2fa(auth) {
  return !!auth && auth.email === ADMIN_EMAIL;
}

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) { console.log("✅ " + label); pass++; }
  else { console.log("❌ " + label); fail++; }
}

console.log("=== CREATE (registro_participants) ===");
check(
  "Participante anónimo crea su propio documento (ownerUid = su uid) -> permitido",
  simAllowCreate({ uid: "anon-1", isAnonymous: true }, { ownerUid: "anon-1", name: "Juan" })
);
check(
  "Participante anónimo intenta crear un documento con ownerUid de OTRO uid -> rechazado",
  !simAllowCreate({ uid: "anon-1", isAnonymous: true }, { ownerUid: "anon-2", name: "Juan" })
);
check(
  "Sin sesión (auth null) no puede crear nada -> rechazado",
  !simAllowCreate(null, { ownerUid: "anon-1", name: "Juan" })
);
check(
  "Admin crea un documento SIN ownerUid (migración legacy) -> permitido",
  simAllowCreate({ uid: "admin-uid", isAnonymous: false, email: ADMIN_EMAIL }, { name: "Migrado Histórico" })
);
check(
  "Admin crea un documento con ownerUid de otra persona (restaurar de papelera) -> permitido",
  simAllowCreate({ uid: "admin-uid", isAnonymous: false, email: ADMIN_EMAIL }, { ownerUid: "viejo-uid-de-otro-dispositivo", name: "Restaurado" })
);

console.log("\n=== UPDATE (caso normal: el dueño edita su propia quiniela) ===");
// v6.9 — docDeJuan YA NO tiene clave (vive en registro_privado).
const docDeJuan = { ownerUid: "anon-1", name: "Juan", emailHash: "abc123", predictions: { m1: { h: 1, a: 0 } } };
const privadoDeJuan = { ownerUid: "anon-1", clave: "123456", email: "juan@example.com" };
check(
  "El dueño real edita sus predicciones -> permitido",
  simAllowUpdate({ uid: "anon-1", isAnonymous: true }, docDeJuan, { ...docDeJuan, predictions: { m1: { h: 2, a: 0 } } })
);
check(
  "Otro participante (distinto uid) intenta editar la quiniela de Juan -> rechazado",
  !simAllowUpdate({ uid: "anon-2", isAnonymous: true }, docDeJuan, { ...docDeJuan, predictions: { m1: { h: 9, a: 9 } } })
);
check(
  "Sin sesión, nadie puede editar nada -> rechazado",
  !simAllowUpdate(null, docDeJuan, { ...docDeJuan, name: "Hackeado" })
);
check(
  "El admin puede editar la quiniela de cualquiera (cambiar estado, nota interna) -> permitido",
  simAllowUpdate({ uid: "admin-uid", isAnonymous: false, email: ADMIN_EMAIL }, docDeJuan, { ...docDeJuan, notaAdmin: "x" })
);

console.log("\n=== RE-CLAIM v6.9 — paso 1: registro_privado (acá SÍ se compara la clave) ===");
check(
  "Re-claim en privado, clave CORRECTA -> permitido",
  simAllowPrivadoUpdate(
    { uid: "anon-NUEVO-DISPOSITIVO", isAnonymous: true },
    privadoDeJuan,
    { ...privadoDeJuan, ownerUid: "anon-NUEVO-DISPOSITIVO", clave: "123456" }
  )
);
check(
  "Re-claim en privado, clave INCORRECTA (inventada, coincide con sí misma pero no con la guardada) -> rechazado",
  !simAllowPrivadoUpdate(
    { uid: "anon-ATACANTE", isAnonymous: true },
    privadoDeJuan,
    { ...privadoDeJuan, ownerUid: "anon-ATACANTE", clave: "000000" }
  )
);
check(
  "Re-claim en privado que ADEMÁS intenta tocar el correo en la misma escritura -> rechazado (excede affectedKeys permitidas)",
  !simAllowPrivadoUpdate(
    { uid: "anon-ATACANTE", isAnonymous: true },
    privadoDeJuan,
    { ...privadoDeJuan, ownerUid: "anon-ATACANTE", clave: "123456", email: "atacante@evil.com" }
  )
);
check(
  "Un participante CUALQUIERA (sin ser dueño ni admin) NO puede leer el documento privado de Juan -> rechazado",
  !simAllowPrivadoRead({ uid: "anon-OTRO-PARTICIPANTE", isAnonymous: true }, privadoDeJuan)
);
check(
  "El propio dueño SÍ puede leer su documento privado -> permitido",
  simAllowPrivadoRead({ uid: "anon-1", isAnonymous: true }, privadoDeJuan)
);
check(
  "El admin SÍ puede leer cualquier documento privado -> permitido",
  simAllowPrivadoRead({ uid: "admin-uid", isAnonymous: false, email: ADMIN_EMAIL }, privadoDeJuan)
);

console.log("\n=== RE-CLAIM v6.9 — paso 2: registro_participants (ya NO compara clave, depende del paso 1) ===");
check(
  "Tras un paso-1 exitoso (privadoOwnerUid ya es el nuevo uid), el paso-2 (ownerUid público) -> permitido",
  simAllowUpdate(
    { uid: "anon-NUEVO-DISPOSITIVO", isAnonymous: true },
    docDeJuan,
    { ...docDeJuan, ownerUid: "anon-NUEVO-DISPOSITIVO", fechaActualizacion: 999 },
    { privadoOwnerUid: "anon-NUEVO-DISPOSITIVO" }
  )
);
check(
  "SIN haber pasado primero por el paso-1 (privadoOwnerUid sigue siendo el viejo dueño), el paso-2 -> rechazado",
  !simAllowUpdate(
    { uid: "anon-ATACANTE", isAnonymous: true },
    docDeJuan,
    { ...docDeJuan, ownerUid: "anon-ATACANTE", fechaActualizacion: 999 },
    { privadoOwnerUid: "anon-1" } // el privado TODAVÍA dice que el dueño es Juan -- el atacante nunca lo reclamó
  )
);
check(
  "Paso-2 que ADEMÁS intenta tocar las predicciones en la misma escritura -> rechazado (excede affectedKeys permitidas)",
  !simAllowUpdate(
    { uid: "anon-NUEVO-DISPOSITIVO", isAnonymous: true },
    docDeJuan,
    { ...docDeJuan, ownerUid: "anon-NUEVO-DISPOSITIVO", fechaActualizacion: 999, predictions: { m1: { h: 9, a: 9 } } },
    { privadoOwnerUid: "anon-NUEVO-DISPOSITIVO" }
  )
);

console.log("\n=== DELETE (registro_participants + registro_privado) ===");
check(
  "El propio dueño puede borrar su documento público (cancelar inscripción) -> permitido",
  simAllowDelete({ uid: "anon-1", isAnonymous: true }, docDeJuan)
);
check(
  "Otro participante NO puede borrar el documento de Juan -> rechazado",
  !simAllowDelete({ uid: "anon-2", isAnonymous: true }, docDeJuan)
);
check(
  "El admin puede borrar el documento de cualquiera (mover a papelera) -> permitido",
  simAllowDelete({ uid: "admin-uid", isAnonymous: false, email: ADMIN_EMAIL }, docDeJuan)
);
check(
  "Sin sesión, nadie puede borrar nada -> rechazado",
  !simAllowDelete(null, docDeJuan)
);
check(
  "El propio dueño también puede borrar su documento PRIVADO -> permitido",
  simAllowPrivadoDelete({ uid: "anon-1", isAnonymous: true }, privadoDeJuan)
);
check(
  "Otro participante NO puede borrar el documento privado de Juan -> rechazado",
  !simAllowPrivadoDelete({ uid: "anon-2", isAnonymous: true }, privadoDeJuan)
);

console.log("\n=== META (v6.8 — ahora solo nextSeq es libre para cualquiera) ===");
const metaActual = { nextSeq: 5, configGlobal: { fechaCierre: "2026-06-27", horaCierre: "23:59", registroAbierto: true } };
check("Participante anónimo solo cambia nextSeq -> permitido",
  simAllowMetaWrite({ uid: "anon-1", isAnonymous: true }, metaActual, { ...metaActual, nextSeq: 6 }));
check("Participante anónimo intenta cambiar configGlobal (ej. fechaCierre) -> rechazado",
  !simAllowMetaWrite({ uid: "anon-1", isAnonymous: true }, metaActual, { ...metaActual, configGlobal: { ...metaActual.configGlobal, fechaCierre: "2099-01-01" } }));
check("Participante anónimo manda nextSeq Y configGlobal modificado en la misma escritura -> rechazado completo",
  !simAllowMetaWrite({ uid: "anon-1", isAnonymous: true }, metaActual, { nextSeq: 6, configGlobal: { ...metaActual.configGlobal, registroAbierto: false } }));
check("El admin SÍ puede cambiar configGlobal (ej. mover la fecha de cierre real) -> permitido",
  simAllowMetaWrite({ uid: "admin-uid", isAnonymous: false, email: ADMIN_EMAIL }, metaActual, { ...metaActual, configGlobal: { ...metaActual.configGlobal, fechaCierre: "2026-06-28" } }));
check("Sin sesión no puede escribir meta -> rechazado",
  !simAllowMetaWrite(null, metaActual, { ...metaActual, nextSeq: 6 }));

console.log("\n=== UPDATE — cierre por fecha y por 'enviada' (v6.8) ===");
check(
  "Dueño edita sus predicciones ANTES del cierre y sin haber enviado -> permitido",
  simAllowUpdate({ uid: "anon-1", isAnonymous: true }, docDeJuan, { ...docDeJuan, predictions: { m1: { h: 3, a: 1 } } }, { pastDeadline: false })
);
check(
  "Dueño intenta editar DESPUÉS del plazo global de cierre -> rechazado",
  !simAllowUpdate({ uid: "anon-1", isAnonymous: true }, docDeJuan, { ...docDeJuan, predictions: { m1: { h: 3, a: 1 } } }, { pastDeadline: true })
);
check(
  "Dueño intenta editar una quiniela que YA está 'enviada' (aunque el plazo global no haya pasado) -> rechazado",
  !simAllowUpdate({ uid: "anon-1", isAnonymous: true }, { ...docDeJuan, estadoQuiniela: "enviada" }, { ...docDeJuan, estadoQuiniela: "enviada", predictions: { m1: { h: 3, a: 1 } } }, { pastDeadline: false })
);
check(
  "El admin SIGUE pudiendo editar aunque esté enviada o pasado el cierre (override) -> permitido",
  simAllowUpdate({ uid: "admin-uid", isAnonymous: false, email: ADMIN_EMAIL }, { ...docDeJuan, estadoQuiniela: "enviada" }, { ...docDeJuan, estadoQuiniela: "enviada", predictions: { m1: { h: 3, a: 1 } } }, { pastDeadline: true })
);
check(
  "El re-claim (paso 2) SIGUE funcionando aunque haya pasado el cierre (recuperar acceso, no es editar predicciones) -> permitido",
  simAllowUpdate(
    { uid: "anon-DISPOSITIVO-NUEVO-LEGITIMO", isAnonymous: true },
    { ...docDeJuan, estadoQuiniela: "enviada" },
    { ...docDeJuan, estadoQuiniela: "enviada", ownerUid: "anon-DISPOSITIVO-NUEVO-LEGITIMO", fechaActualizacion: 1000 },
    { pastDeadline: true, privadoOwnerUid: "anon-DISPOSITIVO-NUEVO-LEGITIMO" }
  )
);

console.log("\n=== PAPELERA ===");
check("Solo el admin puede leer/escribir la papelera -> permitido para admin",
  simAllowPapelera({ uid: "admin-uid", isAnonymous: false, email: ADMIN_EMAIL }));
check("Un participante normal NO puede leer/escribir la papelera -> rechazado",
  !simAllowPapelera({ uid: "anon-1", isAnonymous: true }));

console.log("\n=== ADMIN2FA (v7.1) — secreto TOTP + navegadores de confianza ===");
check("El admin puede leer/escribir su propio secreto 2FA -> permitido",
  simAllowAdmin2fa({ uid: "admin-uid", isAnonymous: false, email: ADMIN_EMAIL }));
check("Un participante anónimo NO puede leer el secreto 2FA -> rechazado",
  !simAllowAdmin2fa({ uid: "anon-1", isAnonymous: true }));
check("Alguien autenticado con OTRO correo (no el admin) NO puede leer el secreto 2FA -> rechazado",
  !simAllowAdmin2fa({ uid: "otro-uid", isAnonymous: false, email: "otro@example.com" }));
check("Sin sesión, nadie puede leer/escribir el secreto 2FA -> rechazado",
  !simAllowAdmin2fa(null));

console.log(`\n=== RESULTADO: ${pass} pasaron, ${fail} fallaron ===`);
process.exit(fail === 0 ? 0 : 1);
