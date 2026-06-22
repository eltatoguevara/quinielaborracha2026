// Simulador MANUAL de la semántica de firestore.rules para
// /registro_participants/{pid}, /registro/meta y /registro/papelera.
//
// IMPORTANTE — esto NO es el emulador real de Firestore. En este entorno
// no se puede descargar el binario del emulador (requiere
// storage.googleapis.com, fuera de la lista blanca de red disponible).
// Este script reimplementa a mano, en JS, la MISMA lógica booleana que
// describen las reglas (resource.data, request.resource.data,
// request.auth.uid, diff().affectedKeys(), hasOnly(), etc.) para poder
// verificar que el razonamiento de cada regla es internamente consistente
// y cubre los casos reales del flujo de la app. Antes de publicar
// firestore.rules de verdad, igual hay que probarlo con el emulador real
// o con tráfico real controlado — esto es una red de seguridad adicional,
// no un sustituto.
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

function simAllowCreate(auth, newData) {
  if (!auth) return false;
  const isAdmin = auth.email === ADMIN_EMAIL;
  return newData.ownerUid === auth.uid || isAdmin;
}

function simAllowUpdate(auth, before, after) {
  if (!auth) return false;
  const isAdmin = auth.email === ADMIN_EMAIL;
  if (before.ownerUid === auth.uid) return true;
  if (isAdmin) return true;
  const affected = diffAffectedKeys(before, after);
  const onlyReclaimFields = hasOnly(affected, ['ownerUid', 'clave', 'fechaActualizacion']);
  const claveMatches = after.clave === before.clave;
  return onlyReclaimFields && claveMatches;
}

function simAllowDelete(auth, before) {
  if (!auth) return false;
  const isAdmin = auth.email === ADMIN_EMAIL;
  return before.ownerUid === auth.uid || isAdmin;
}

function simAllowMetaWrite(auth) {
  return !!auth;
}

function simAllowPapelera(auth) {
  return !!auth && auth.email === ADMIN_EMAIL;
}

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) { console.log("✅ " + label); pass++; }
  else { console.log("❌ " + label); fail++; }
}

console.log("=== CREATE ===");
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
const docDeJuan = { ownerUid: "anon-1", name: "Juan", clave: "123456", predictions: { m1: { h: 1, a: 0 } } };
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
  "El admin puede editar la quiniela de cualquiera (regenerar clave, nota interna) -> permitido",
  simAllowUpdate({ uid: "admin-uid", isAnonymous: false, email: ADMIN_EMAIL }, docDeJuan, { ...docDeJuan, clave: "999999" })
);

console.log("\n=== UPDATE (re-claim desde dispositivo nuevo) ===");
check(
  "Re-claim válido: solo cambia ownerUid+clave+fecha, Y la clave coincide con la guardada -> permitido",
  simAllowUpdate(
    { uid: "anon-NUEVO-DISPOSITIVO", isAnonymous: true },
    docDeJuan,
    { ...docDeJuan, ownerUid: "anon-NUEVO-DISPOSITIVO", clave: "123456", fechaActualizacion: 999 }
  )
);
check(
  "Re-claim CON CLAVE INCORRECTA (alguien manda una clave inventada igual a sí misma, pero distinta a la guardada) -> rechazado",
  !simAllowUpdate(
    { uid: "anon-ATACANTE", isAnonymous: true },
    docDeJuan,
    { ...docDeJuan, ownerUid: "anon-ATACANTE", clave: "000000", fechaActualizacion: 999 }
  )
);
check(
  "Re-claim que ADEMÁS intenta tocar las predicciones en la misma escritura -> rechazado (excede affectedKeys permitidas)",
  !simAllowUpdate(
    { uid: "anon-ATACANTE", isAnonymous: true },
    docDeJuan,
    { ...docDeJuan, ownerUid: "anon-ATACANTE", clave: "123456", fechaActualizacion: 999, predictions: { m1: { h: 9, a: 9 } } }
  )
);
check(
  "Re-claim que manda la clave CORRECTA pero de alguien que NO es dueño y NO es admin, sin tocar más nada -> permitido (caso legítimo de recuperación de acceso)",
  simAllowUpdate(
    { uid: "anon-DISPOSITIVO-NUEVO-LEGITIMO", isAnonymous: true },
    docDeJuan,
    { ...docDeJuan, ownerUid: "anon-DISPOSITIVO-NUEVO-LEGITIMO", clave: "123456", fechaActualizacion: 1000 }
  )
);

console.log("\n=== DELETE ===");
check(
  "El propio dueño puede borrar su documento (cancelar inscripción) -> permitido",
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

console.log("\n=== META ===");
check("Cualquier sesión autenticada (anónima incluida) puede escribir meta -> permitido",
  simAllowMetaWrite({ uid: "anon-1", isAnonymous: true }));
check("Sin sesión no puede escribir meta -> rechazado",
  !simAllowMetaWrite(null));

console.log("\n=== PAPELERA ===");
check("Solo el admin puede leer/escribir la papelera -> permitido para admin",
  simAllowPapelera({ uid: "admin-uid", isAnonymous: false, email: ADMIN_EMAIL }));
check("Un participante normal NO puede leer/escribir la papelera -> rechazado",
  !simAllowPapelera({ uid: "anon-1", isAnonymous: true }));

console.log(`\n=== RESULTADO: ${pass} pasaron, ${fail} fallaron ===`);
process.exit(fail === 0 ? 0 : 1);

// ── Caso adicional: ¿puede alguien "crear" un documento con el MISMO id
// de un participante que ya existe, para sobreescribirlo como si fuera
// nuevo, evadiendo las reglas de update? ──
console.log("\n=== CASO ADICIONAL: create sobre un pid que YA EXISTE ===");
// En Firestore real, si el documento YA EXISTE, la operación que el
// cliente haría con setDoc() sin {merge:true} se evalúa como "update" en
// las reglas (resource.data ya tiene contenido), NO como "create" --
// "create" solo aplica cuando el documento no existe todavía (resource
// == null). Confirmamos que nuestra función simAllowUpdate (no
// simAllowCreate) es la que de verdad protegería este caso, y que ya
// está cubierta arriba ("Otro participante... intenta editar... ->
// rechazado"). Documentamos esto explícitamente porque es un punto fácil
// de confundir al leer las reglas.
console.log("ℹ️  En Firestore, sobreescribir un doc existente siempre evalúa contra 'update', nunca 'create' (resource.data != null) -- ya cubierto arriba.");
