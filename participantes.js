/* ════════════════════════════════════════════════════════════
   PARTICIPANTES — capa de datos compartida (v6.4, Fase de Seguridad)
   ════════════════════════════════════════════════════════════
   Hasta la v6.1 esto vivía privado dentro de registro.js. Se separa
   a propósito porque ahora DOS cosas necesitan leer exactamente los
   mismos participantes y predicciones:
     - "Mi Quiniela" (registro.js) — wizard, admin, PDF.
     - Ranking/Estadísticas/Predicciones (app.js) — antes leían
       constantes fijas en el código (PL/PM/RAW/ELIM_PRED_TEAMS/
       ELIMRAW/ELIM_SPEC); ahora leen de aquí.

   Por eso este archivo se carga ANTES que app.js y que registro.js
   en index.html — ambos lo usan como global (no es un módulo ES,
   es un script normal, igual que el resto del proyecto).

   ── CAMBIO DE FONDO EN v6.4 — POR QUÉ ───────────────────────────
   Hasta v6.3, TODO (los participantes + sus predicciones + sus
   "claves" de 6 dígitos en texto plano) vivía en un ÚNICO documento
   de Firestore (registro/estado) con escritura pública sin ninguna
   validación de servidor: cualquiera con las devtools abiertas podía
   leer la clave de cualquier participante y reescribir la quiniela
   de cualquiera, no solo la suya. La app exigía la clave correcta en
   su PROPIA interfaz, pero eso no protegía nada a nivel de Firestore
   — alguien podía ignorar la interfaz por completo y escribir
   directamente al documento.

   No usamos Cloud Functions para resolver esto (requieren el plan
   Blaze de pago; este proyecto corre en el plan Spark gratuito). En
   su lugar:
     1) Cada visitante obtiene una identidad anónima de Firebase
        (signInAnonymously(), disparado desde app.js::wireFirebaseAuth)
        con un UID estable mientras no borre cookies/datos del sitio.
     2) Cada participante es su PROPIO documento, en la colección
        "registro_participants" (ya no un array dentro de un doc
        único), con un campo ownerUid = el UID anónimo de quien lo creó.
     3) Las reglas de Firestore (entregadas aparte en firestore.rules)
        exigen que request.auth.uid === ownerUid para poder escribir
        ese documento. Ya no es la app la que decide si la clave es
        correcta de cara a Firestore — es Firestore mismo quien lo exige,
        sin que el cliente pueda saltarse esa validación.
     4) La "Clave" de 6 dígitos sigue existiendo, pero cambia de rol: ya
        no es la barrera de seguridad real (eso ahora lo hace el UID),
        sino el mecanismo de RECUPERACIÓN para entrar desde un
        dispositivo nuevo (ver renderLogin en registro.js): si el
        nombre/correo + clave coinciden, se "reclama" el documento
        actualizando ownerUid al UID del dispositivo actual — las
        reglas de Firestore permiten ese único caso de re-claim de
        forma controlada y acotada (ver firestore.rules).

   La papelera (que conserva la clave de quien se elimina, en texto
   plano) se separó a su propio documento de solo-admin (registro/
   papelera) — antes vivía en el mismo documento público que todo lo
   demás, lo cual exponía esas claves también.

   Forma de DB en memoria (en lo posible SIN CAMBIOS respecto a
   v6.0-v6.3 — esto es intencional: todo el resto de la app, en
   especial registro.js y app.js, sigue leyendo/escribiendo el mismo
   objeto DB de siempre; lo que cambia es SOLO cómo este archivo lo
   sincroniza con Firestore por debajo, no la forma del objeto en sí.
   Único campo nuevo: p.ownerUid):
     { participants:[{
         id, codigo,                          // identificadores
         name, city, country, email, clave, ownerUid,
         estadoQuiniela,                      // "borrador" | "enviada"
         fechaCreacion, fechaActualizacion, fechaEnvio
       }],
       predictions: {
         [participantId]: { ... }             // igual que siempre
       },
       papelera:[{participant,predictions,fechaEliminado}],
       nextSeq, configGlobal }
   ════════════════════════════════════════════════════════════ */
const STORE_KEY = "qbRegistroV4";
const CODE_YEAR = 2026;
const RG_DEFAULT_CONFIG = {
  modoConsultaHabilitado:true, registroAbierto:true,
  loginPorNombreHabilitado:true,
  fechaCierre:'', horaCierre:'23:59',
  usarMiQuinielaComoInicio:false // v6.6 — si true, la app abre en "Mi Quiniela" en vez de en el Ranking
};

function rgEmptyDB(){
  return {participants:[], predictions:{}, papelera:[], nextSeq:1, configGlobal:{...RG_DEFAULT_CONFIG}};
}

function loadData(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if(!raw) return rgEmptyDB();
    const d = JSON.parse(raw);
    if(!d.participants) d.participants=[];
    if(!d.predictions) d.predictions={};
    if(!d.papelera) d.papelera=[];
    if(!d.nextSeq) d.nextSeq=1;
    d.configGlobal = {...RG_DEFAULT_CONFIG, ...(d.configGlobal||{})};
    return d;
  }catch(e){ return rgEmptyDB(); }
}

let DB = loadData();

function uid(){ return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8); }

function nextCode(){
  const seq = DB.nextSeq || 1;
  DB.nextSeq = seq + 1;
  return `QB-${CODE_YEAR}-${String(seq).padStart(4,'0')}`;
}

function genClave(){
  return String(Math.floor(100000 + Math.random()*900000));
}

// ── v6.9, Fase de Privacidad — separación público/privado ───────────
// clave y correo dejan de viajar dentro del documento público de
// registro_participants (ver la nota de seguridad al final del
// archivo). En memoria (DB.participants) cada participante SIGUE
// teniendo .clave/.email como siempre — estas dos funciones son las
// únicas que deciden qué le toca a cada colección de Firestore al
// momento de sincronizar.
//
// _rgEmailHash(): no es para "seguridad" en el sentido criptográfico
// (es CRC32, no SHA-256 — reversible por fuerza bruta si alguien se lo
// propone en serio), es para que el chequeo de "¿este correo ya está
// registrado?" (findByEmail en registro.js) pueda seguir funcionando
// SIN que el documento público tenga que cargar el correo en texto
// plano. Para un grupo cerrado de 27 amigos esto es proporcional: para
// el visitante casual con las devtools abiertas, ya no hay nada legible.
function _rgEmailHash(email){
  const norm = String(email||'').trim().toLowerCase();
  return norm ? crc32(norm) : '';
}
function _rgPublicFieldsOf(p){
  const { clave, email, ...rest } = p;
  return { ...rest, emailHash: _rgEmailHash(email) };
}
function _rgPrivadoFieldsOf(p){
  return { ownerUid: p.ownerUid || null, clave: p.clave || '', email: p.email || '' };
}

let _rgSyncWired = false;

const DB_LISTENERS = [];
function onParticipantesChange(fn){ DB_LISTENERS.push(fn); }
function notifyParticipantesChange(){
  DB_LISTENERS.forEach(fn=>{
    try{ fn(DB); }
    catch(e){ console.error("Error en listener de participantes:", e); }
  });
}

let _rgLastKnownParticipantsJSON = {};
let _rgLastKnownPrivadoJSON = {};
let _rgLastKnownMetaJSON = null;

// JSON de lo que le toca a registro_participants (público) -- ya SIN
// clave/email, con emailHash en su lugar.
function _rgParticipantJSON(p, preds){
  return JSON.stringify({ ..._rgPublicFieldsOf(p), predictions: preds || {} });
}
// JSON de lo que le toca a registro_privado (dueño/admin) -- solo
// ownerUid/clave/email.
function _rgPrivadoJSON(p){
  return JSON.stringify(_rgPrivadoFieldsOf(p));
}

function saveData(d){
  try{ localStorage.setItem(STORE_KEY, JSON.stringify(d)); }catch(e){}
  rgPushToFirestore(d);
}

function rgPushToFirestore(d, _retryCount){
  const fb = window.__fb;
  if(!fb || !fb.PARTICIPANTS_COL){ return; }
  if(!fb.auth.currentUser){
    const tries = (_retryCount||0) + 1;
    if(tries > 30) return;
    setTimeout(()=> rgPushToFirestore(d, tries), 300);
    return;
  }

  const batch = fb.writeBatch(fb.db);
  let hasWrites = false;
  const touchedPrivadoIds = [];

  (d.participants||[]).forEach(p=>{
    const preds = d.predictions[p.id] || {};
    const json = _rgParticipantJSON(p, preds);
    if(_rgLastKnownParticipantsJSON[p.id] !== json){
      const docRef = fb.doc(fb.PARTICIPANTS_COL, p.id);
      batch.set(docRef, { ..._rgPublicFieldsOf(p), predictions: preds, updatedAt: fb.serverTimestamp() });
      hasWrites = true;
    }
    // v6.9 — clave/email viajan aparte, a su propio documento de
    // lectura restringida (registro_privado). Solo se reescribe si
    // cambió, igual que el documento público (evita pushes vacíos).
    const privadoJson = _rgPrivadoJSON(p);
    if(_rgLastKnownPrivadoJSON[p.id] !== privadoJson){
      const privadoRef = fb.doc(fb.PRIVADO_COL, p.id);
      batch.set(privadoRef, _rgPrivadoFieldsOf(p));
      hasWrites = true;
      touchedPrivadoIds.push(p.id);
      // v6.9 — se actualiza el caché compartido YA, en el mismo tick
      // (no en el .then() de más abajo): notifyParticipants()/
      // notifyMeta() pueden disparar _rgApplyCombinedSnapshot() de forma
      // SÍNCRONA dentro de batch.commit(), antes de que cualquier
      // callback async llegue a ejecutarse -- si este caché se llenara
      // recién en el .then(), la reconstrucción correría primero, sin
      // nada todavía para remezclar, y borraría clave/correo de la
      // memoria de quien recién los guardó.
      _rgLatestPrivadoByOwner[p.id] = _rgPrivadoFieldsOf(p);
    }
  });

  const metaPayload = { nextSeq: d.nextSeq, configGlobal: d.configGlobal };
  const metaJSON = JSON.stringify(metaPayload);
  if(metaJSON !== _rgLastKnownMetaJSON){
    batch.set(fb.REGISTRO_META_DOC, { ...metaPayload, updatedAt: fb.serverTimestamp() });
    hasWrites = true;
  }

  if(!hasWrites) return;

  batch.commit()
    .then(()=>{
      (d.participants||[]).forEach(p=>{
        _rgLastKnownParticipantsJSON[p.id] = _rgParticipantJSON(p, d.predictions[p.id]||{});
      });
      touchedPrivadoIds.forEach(id=>{
        const p = (d.participants||[]).find(x=>x.id===id);
        if(p) _rgLastKnownPrivadoJSON[id] = _rgPrivadoJSON(p);
      });
      _rgLastKnownMetaJSON = metaJSON;
    })
    .catch(err=>{
      console.error("Error al sincronizar participantes con Firebase:", err);
      if(err && err.code === 'permission-denied'){
        toast('⚠️ No se pudo guardar en el servidor (permiso denegado). Tus cambios quedaron solo en este dispositivo por ahora.', true);
      }
    });
}

// v6.9 — Fase de Privacidad: el reclamo ahora son DOS escrituras
// SECUENCIALES (no un batch atómico, a propósito):
//   1) registro_privado/{pid}: se manda la clave que la persona ESCRIBIÓ
//      (no la que ya sabíamos -- ya no la sabemos, dejó de ser pública).
//      Firestore la compara contra la guardada; si no coincide, esta
//      escritura es rechazada (permission-denied) y ahí termina todo,
//      sin tocar el documento público.
//   2) Solo si (1) salió bien: registro_participants/{pid} (ownerUid).
//      La regla de ESTE documento exige que registro_privado/{pid} YA
//      tenga el ownerUid nuevo -- como (1) ya se confirmó en el servidor
//      antes de intentar (2), get() ve el valor correcto.
// Si falla el paso 1, el error que se propaga tiene code
// "permission-denied", igual que antes -- el llamador (renderLogin en
// registro.js) no necesita saber que ahora son dos pasos.
function rgClaimOwnership(participantId, newUid, claveEscrita){
  const fb = window.__fb;
  if(!fb || !fb.PRIVADO_COL || !fb.PARTICIPANTS_COL) return Promise.reject(new Error("Firebase no está listo todavía."));
  const privadoRef = fb.doc(fb.PRIVADO_COL, participantId);
  const publicRef = fb.doc(fb.PARTICIPANTS_COL, participantId);

  return fb.setDoc(privadoRef, { ownerUid:newUid, clave:claveEscrita }, { merge:true })
    .then(()=>{
      // v6.9 — ya sabemos que la clave fue aceptada (si no, hubiéramos
      // caído al .catch de abajo): actualizamos el caché compartido YA,
      // ANTES de la segunda escritura. El eco síncrono de esa segunda
      // escritura puede disparar una reconstrucción de DB.participants
      // -- sin el caché ya actualizado en este punto, ese instante
      // dejaría a este dispositivo sin clave/correo en memoria justo
      // después de haberlos reclamado.
      const pCache = (DB.participants||[]).find(x=>x.id===participantId);
      _rgLatestPrivadoByOwner[participantId] = { ownerUid:newUid, clave:claveEscrita, email:(pCache && pCache.email) || '' };
      return fb.setDoc(publicRef, { ownerUid:newUid, fechaActualizacion: Date.now() }, { merge:true });
    })
    .then(()=> fb.getDoc(privadoRef))
    .then(snap=>{
      const priv = (snap.exists() && snap.data()) || {};
      const p = (DB.participants||[]).find(x=>x.id===participantId);
      if(p){
        p.ownerUid = newUid;
        p.clave = priv.clave || claveEscrita;
        p.email = priv.email || p.email || '';
        _rgLastKnownParticipantsJSON[participantId] = _rgParticipantJSON(p, DB.predictions[participantId]||{});
        _rgLastKnownPrivadoJSON[participantId] = JSON.stringify(_rgPrivadoFieldsOf(p));
        // Valor definitivo, ya confirmado por el servidor (reemplaza el
        // optimista de arriba, que podía no traer todavía el correo).
        _rgLatestPrivadoByOwner[participantId] = _rgPrivadoFieldsOf(p);
      }
      return priv;
    })
    .catch(err=>{
      console.error("Error al reclamar dueño del participante:", err);
      throw err;
    });
}

function _rgRebuildParticipantsFromDocs(docs){
  const participants = [];
  const predictions = {};
  docs.forEach(docSnap=>{
    const data = docSnap.data() || {};
    const { predictions: preds, updatedAt, ...p } = data;
    p.id = docSnap.id;
    participants.push(p);
    predictions[docSnap.id] = preds || {};
  });
  return { participants, predictions };
}

let _rgGotParticipants = false, _rgGotMeta = false;
let _rgLatestParticipants = [], _rgLatestPredictions = {};
let _rgLatestMeta = null;
// v6.9 — Fase de Privacidad: clave/correo CONOCIDOS en este dispositivo,
// id por id. Para un admin esto tiene los 27 (rgWirePrivadoSyncIfAdmin,
// más abajo, escucha la colección completa). Para un participante
// normal tiene como máximo UNO: el propio (lo llenan rgPushToFirestore,
// rgClaimOwnership y rgHydrateOwnPrivado, cada uno solo para su propio
// id -- las reglas de Firestore impiden que sea de otra forma). En
// ningún caso esto es una fuga de datos: lo que entra acá ya pasó por
// la regla de lectura/escritura correspondiente.
let _rgLatestPrivadoByOwner = {};

// Mezcla clave/correo conocidos (_rgLatestPrivadoByOwner) dentro de cada
// DB.participants[i] correspondiente, EN MEMORIA -- nunca se vuelve a
// escribir a Firestore solo por haberse mezclado (por eso también
// actualiza _rgLastKnownPrivadoJSON con el mismo valor recién leído, así
// rgPushToFirestore no lo interpreta como "cambió" y lo re-envía solo).
// v6.9 — ya NO depende de isAdmin(): el caché en sí ya está
// correctamente acotado a "lo que esta sesión tiene legítimo derecho a
// conocer" (ver el comentario de arriba), así que mezclarlo siempre que
// haya algo que mezclar es seguro tanto para admin como para un
// participante normal mirando su propio registro.
function _rgMergeKnownPrivadoFields(){
  if(!Object.keys(_rgLatestPrivadoByOwner).length) return;
  DB.participants.forEach(p=>{
    const priv = _rgLatestPrivadoByOwner[p.id];
    if(!priv) return;
    p.clave = priv.clave || '';
    p.email = priv.email || '';
    _rgLastKnownPrivadoJSON[p.id] = JSON.stringify(priv);
  });
}

// v6.9 — Fase de Estabilización (continuación): ESTE archivo tenía el
// MISMO problema que ya se corrigió en app.js (Fase 1) para
// quiniela/estado -- una sola bandera booleana (_rgSuppressEcho) para
// "no te apliques a ti mismo el eco de tu propio guardado", que se
// rompe en cuanto UN SOLO guardado dispara más de un onSnapshot (ej.
// registrarse nuevo dispara a la vez el listener de participantes Y el
// de registro/meta, porque ambos documentos cambiaron en el mismo
// batch) -- el primer listener "consume" la bandera, y el segundo ya no
// la ve activa, así que SÍ reconstruye DB.participants desde el
// documento público (que desde v6.9 ya no tiene clave/correo), borrando
// de la memoria de quien recién se acaba de registrar su propio correo.
// Se sacó la bandera por completo: ahora SIEMPRE se reconstruye desde
// el snapshot combinado, y SIEMPRE se vuelve a mezclar lo que ya se
// conocía (_rgMergeKnownPrivadoFields) inmediatamente después -- así que
// ya no importa cuántas veces se dispare esto por el mismo guardado, el
// resultado final es siempre el correcto.
function _rgApplyCombinedSnapshot(){
  if(!_rgGotParticipants || !_rgGotMeta) return;

  DB.participants = _rgLatestParticipants;
  DB.predictions = _rgLatestPredictions;
  DB.nextSeq = (_rgLatestMeta && _rgLatestMeta.nextSeq) || 1;
  DB.configGlobal = { ...RG_DEFAULT_CONFIG, ...((_rgLatestMeta && _rgLatestMeta.configGlobal) || {}) };

  _rgMergeKnownPrivadoFields();

  try{ localStorage.setItem(STORE_KEY, JSON.stringify(DB)); }catch(e){}

  _rgLastKnownParticipantsJSON = {};
  DB.participants.forEach(p=>{
    _rgLastKnownParticipantsJSON[p.id] = _rgParticipantJSON(p, DB.predictions[p.id]||{});
  });
  _rgLastKnownMetaJSON = JSON.stringify({ nextSeq: DB.nextSeq, configGlobal: DB.configGlobal });

  notifyParticipantesChange();
}

function rgWireFirestoreSync(){
  if(_rgSyncWired) return;
  const fb = window.__fb;
  if(!fb || !fb.PARTICIPANTS_COL){ setTimeout(rgWireFirestoreSync, 400); return; }
  _rgSyncWired = true;

  fb.onSnapshot(fb.PARTICIPANTS_COL, (snap)=>{
    const { participants, predictions } = _rgRebuildParticipantsFromDocs(snap.docs);
    _rgLatestParticipants = participants;
    _rgLatestPredictions = predictions;
    _rgGotParticipants = true;
    _rgApplyCombinedSnapshot();
  }, (err)=>{ console.error("Error de sincronización Firestore (participantes):", err); });

  fb.onSnapshot(fb.REGISTRO_META_DOC, (snap)=>{
    _rgLatestMeta = snap.exists() ? snap.data() : null;
    _rgGotMeta = true;
    _rgApplyCombinedSnapshot();
  }, (err)=>{ console.error("Error de sincronización Firestore (meta):", err); });

  rgWirePapeleraSyncIfAdmin();
  rgWirePrivadoSyncIfAdmin();
}

// v6.9 — Fase de Privacidad: el admin (y SOLO el admin) escucha la
// colección COMPLETA registro_privado en vivo, para que el panel Admin
// (buscador, tabla, exportar correos/claves, regenerar clave) sigan
// funcionando exactamente igual que antes -- la diferencia es que un
// participante normal jamás recibe este snapshot (la regla de Firestore
// rechazaría una lectura sin filtro de alguien que no sea admin; ver
// firestore.rules). Mismo patrón de "se puede reintentar más tarde" que
// rgWirePapeleraSyncIfAdmin: si todavía no es admin cuando se llama, NO
// marca el flag de "ya wireado", así que se vuelve a intentar la próxima
// vez que cambie el estado de auth (ver wireFirebaseAuth en app.js).
let _rgPrivadoSyncWired = false;
function rgWirePrivadoSyncIfAdmin(){
  if(_rgPrivadoSyncWired) return;
  if(typeof isAdmin !== "function" || !isAdmin()) return;
  const fb = window.__fb;
  if(!fb || !fb.PRIVADO_COL) return;
  _rgPrivadoSyncWired = true;
  fb.onSnapshot(fb.PRIVADO_COL, (snap)=>{
    const byOwner = {};
    snap.docs.forEach(d=>{ byOwner[d.id] = d.data() || {}; });
    _rgLatestPrivadoByOwner = byOwner;
    _rgMergeKnownPrivadoFields();
    try{ localStorage.setItem(STORE_KEY, JSON.stringify(DB)); }catch(e){}
    notifyParticipantesChange();
  }, (err)=>{ console.error("Error de sincronización Firestore (privado/admin):", err); });
}

// v6.9 — Fase de Privacidad: trae clave+correo de UN solo participante
// (el propio dueño de esta sesión) con una lectura puntual, no un
// listener en vivo -- alcanza y sobra, porque clave/correo casi nunca
// cambian mientras la persona ya está adentro de su propia sesión (y si
// cambian por acción del admin, se van a ver la próxima vez que entre).
// Hace falta para: (1) que "Mi Quiniela" pueda mostrar/editar el correo
// del propio dueño, ya que el documento público ya no lo trae, y (2)
// que tryAutoLoginByOwnerUid()/renderLogin (registro.js) puedan saber si
// ya tiene correo registrado (migración desde login por nombre). Se
// resuelve con null (sin reventar) si todavía no hay sesión, si el
// documento no existe, o si Firestore lo rechaza -- el llamador decide
// qué hacer en ese caso (normalmente: seguir igual, sin correo/clave
// locales, en vez de bloquear toda la pantalla por esto).
function rgHydrateOwnPrivado(pid){
  const fb = window.__fb;
  if(!fb || !fb.PRIVADO_COL) return Promise.resolve(null);
  const docRef = fb.doc(fb.PRIVADO_COL, pid);
  return fb.getDoc(docRef)
    .then(snap=>{
      if(!snap.exists()) return null;
      const priv = snap.data() || {};
      const p = (DB.participants||[]).find(x=>x.id===pid);
      if(p){
        p.clave = priv.clave || '';
        p.email = priv.email || '';
        _rgLastKnownPrivadoJSON[pid] = JSON.stringify(_rgPrivadoFieldsOf(p));
        // v6.9 — igual que en rgPushToFirestore/rgClaimOwnership: este
        // registro tiene que sobrevivir a cualquier reconstrucción
        // futura de DB.participants (otro documento cambiando, una
        // reconexión, etc.), o el correo desaparecería de "Mi Quiniela"
        // en el primer re-render que no pase por acá.
        _rgLatestPrivadoByOwner[pid] = _rgPrivadoFieldsOf(p);
      }
      return priv;
    })
    .catch(err=>{
      console.error("Error al leer datos privados del propio participante:", err);
      return null;
    });
}

let _rgPapeleraSyncWired = false;
function rgWirePapeleraSyncIfAdmin(){
  if(_rgPapeleraSyncWired) return;
  if(typeof isAdmin !== "function" || !isAdmin()) return;
  const fb = window.__fb;
  if(!fb || !fb.REGISTRO_PAPELERA_DOC) return;
  _rgPapeleraSyncWired = true;
  fb.onSnapshot(fb.REGISTRO_PAPELERA_DOC, (snap)=>{
    const items = (snap.exists() && snap.data() && snap.data().items) || [];
    DB.papelera = items;
    try{ localStorage.setItem(STORE_KEY, JSON.stringify(DB)); }catch(e){}
    notifyParticipantesChange();
  }, (err)=>{ console.error("Error de sincronización Firestore (papelera):", err); });
}

let _rgLastKnownPapeleraJSON = null;
function rgSavePapelera(papelera){
  DB.papelera = papelera;
  try{ localStorage.setItem(STORE_KEY, JSON.stringify(DB)); }catch(e){}
  const fb = window.__fb;
  if(!fb || !fb.REGISTRO_PAPELERA_DOC) return;
  const json = JSON.stringify(papelera);
  if(json === _rgLastKnownPapeleraJSON) return;
  fb.setDoc(fb.REGISTRO_PAPELERA_DOC, { items: papelera, updatedAt: fb.serverTimestamp() })
    .then(()=>{ _rgLastKnownPapeleraJSON = json; })
    .catch(err=>{
      console.error("Error al sincronizar papelera:", err);
      if(err && err.code === 'permission-denied'){
        toast('⚠️ No se pudo guardar la papelera en el servidor (permiso denegado).', true);
      }
    });
}

// v6.4 — Cuando el admin mueve a alguien a la papelera, su documento debe
// desaparecer de la colección PÚBLICA registro_participants (ya no debe
// aparecer en el Ranking ni en ningún listado). El diff genérico de
// rgPushToFirestore() nunca detecta "ausencias" (solo agrega/actualiza lo
// que sigue en DB.participants), así que este caso necesita una llamada
// explícita y separada. Solo el admin puede borrar (ver regla "delete" en
// la nota de seguridad más abajo) — el flujo normal de "mover a la
// papelera" ya vive exclusivamente dentro del panel Admin, así que esto
// no le quita ninguna capacidad real a nadie.
function rgDeleteParticipantDoc(participantId){
  const fb = window.__fb;
  if(!fb || !fb.PARTICIPANTS_COL) return Promise.resolve();
  delete _rgLastKnownParticipantsJSON[participantId];
  delete _rgLastKnownPrivadoJSON[participantId];
  const docRef = fb.doc(fb.PARTICIPANTS_COL, participantId);
  // v6.9 — Fase de Privacidad: el documento hermano de clave/correo
  // (registro_privado) también tiene que desaparecer, o quedaría
  // huérfano en el servidor para siempre (sin uso, pero sin sentido
  // dejarlo). Se borra en paralelo -- si esta segunda parte falla (por
  // ejemplo, ya no existía), no bloquea el borrado del documento
  // público, que es el que de verdad importa para el Ranking.
  if(fb.PRIVADO_COL){
    fb.deleteDoc(fb.doc(fb.PRIVADO_COL, participantId)).catch(()=>{});
  }
  return fb.deleteDoc(docRef).catch(err=>{
    console.error("Error al borrar documento de participante:", err);
    if(err && err.code === 'permission-denied'){
      toast('⚠️ No se pudo retirar del servidor (permiso denegado). Puede seguir apareciendo en otros dispositivos hasta que se sincronice.', true);
    }
  });
}

// v6.4 — Reset completo del sistema (botón "Borrar TODO" del panel
// Admin). Mismo problema de fondo que rgDeleteParticipantDoc: vaciar
// DB.participants/predictions en memoria y llamar a saveData(DB) NUNCA
// borra los documentos que ya existían en Firestore (el diff genérico
// solo agrega/actualiza lo que sigue en la lista, nunca detecta
// ausencias) — así que sin esta función, un "reset total" dejaría los
// 27+ documentos de participantes huérfanos en el servidor, visibles
// para cualquiera que vuelva a sincronizar, contradiciendo justo lo que
// el botón promete. Recorre _rgLatestParticipants (el último snapshot
// REAL de la colección, no DB.participants — que el caller ya pudo
// haber vaciado en memoria antes de llamar a esto) y los borra todos en
// un solo writeBatch, además de resetear meta y vaciar la papelera.
function rgResetAll(){
  const fb = window.__fb;
  const promesas = [];

  if(fb && fb.PARTICIPANTS_COL && _rgLatestParticipants.length){
    const batch = fb.writeBatch(fb.db);
    _rgLatestParticipants.forEach(p=>{
      batch.delete(fb.doc(fb.PARTICIPANTS_COL, p.id));
      // v6.9 — Fase de Privacidad: también hay que borrar el documento
      // hermano de clave/correo de cada uno, o un "reset total" dejaría
      // 27+ documentos privados huérfanos en el servidor.
      if(fb.PRIVADO_COL) batch.delete(fb.doc(fb.PRIVADO_COL, p.id));
    });
    _rgLastKnownParticipantsJSON = {};
    _rgLastKnownPrivadoJSON = {};
    promesas.push(batch.commit().catch(err=>{
      console.error("Error al borrar todos los participantes:", err);
      if(err && err.code === 'permission-denied'){
        toast('⚠️ No se pudo borrar a todos en el servidor (permiso denegado). Pueden seguir apareciendo en otros dispositivos.', true);
      }
    }));
  }

  if(fb && fb.REGISTRO_META_DOC){
    const metaPayload = { nextSeq:1, configGlobal:{...RG_DEFAULT_CONFIG} };
    _rgLastKnownMetaJSON = JSON.stringify(metaPayload);
    promesas.push(fb.setDoc(fb.REGISTRO_META_DOC, { ...metaPayload, updatedAt: fb.serverTimestamp() })
      .catch(err=> console.error("Error al resetear meta:", err)));
  }

  // La papelera se vacía con su propia función (documento separado de
  // solo-admin) en vez del batch de arriba.
  rgSavePapelera([]);

  return Promise.all(promesas);
}

// v6.9 — Fase de Privacidad: migración de UNA SOLA VEZ para los
// participantes que YA EXISTÍAN antes de este cambio. rgPushToFirestore
// (de ahora en más) ya separa clave/correo al documento privado en
// cada guardado normal -- pero ESE camino solo reescribe el documento
// público cuando su propio diff detecta un cambio, y como el diff se
// calcula sobre la versión YA SIN clave/correo, un participante que no
// vuelva a tocar su quiniela (ej. ya la envió y no la edita más) nunca
// dispara una reescritura real, y sus clave/correo viejos seguirían
// public en el servidor para siempre. Esta función fuerza una
// reescritura COMPLETA (sin depender del diff) del documento público de
// TODOS los participantes -- de ahí en más, el documento público de
// cada uno ya no contiene clave ni correo, hayan vuelto a tocar su
// quiniela o no.
//
// Mismo patrón de seguridad que runMigracionLegacy()/
// backfillAutoSpecialForAll(): descarga un backup JSON completo antes
// de escribir nada, y es seguro correrlo más de una vez (si alguien ya
// fue migrado, se vuelve a escribir el mismo valor -- no-op real).
function runMigracionPrivacidad(){
  if(typeof isAdmin !== "function" || !isAdmin()){
    if(typeof toast === "function") toast("🔒 Solo el admin puede ejecutar esta migración.", true);
    return Promise.resolve();
  }
  const fb = window.__fb;
  if(!fb || !fb.PARTICIPANTS_COL || !fb.PRIVADO_COL) return Promise.resolve();

  const participants = DB.participants || [];
  if(!participants.length){
    if(typeof toast === "function") toast("No hay participantes para migrar.");
    return Promise.resolve();
  }

  // Backup descargable ANTES de tocar nada — mismo patrón que las
  // demás migraciones del proyecto.
  const backup = {
    tipo: "backup_pre_migracion_privacidad_v69",
    fecha: new Date().toISOString(),
    dbAntesDeLaMigracion: JSON.parse(JSON.stringify(DB))
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `backup_pre_migracion_privacidad_${Date.now()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);

  const batch = fb.writeBatch(fb.db);
  participants.forEach(p=>{
    const preds = (DB.predictions && DB.predictions[p.id]) || {};
    // Documento público: set() COMPLETO (no merge, no depende del diff)
    // para garantizar que clave/correo desaparecen del servidor aunque
    // el documento viejo todavía los tuviera.
    batch.set(fb.doc(fb.PARTICIPANTS_COL, p.id), { ..._rgPublicFieldsOf(p), predictions: preds, updatedAt: fb.serverTimestamp() });
    // Documento privado: se crea (o se reafirma) con lo que ya hay en memoria.
    batch.set(fb.doc(fb.PRIVADO_COL, p.id), _rgPrivadoFieldsOf(p));
    // v6.9 — se actualiza el caché compartido YA (no en el .then() de
    // más abajo): el propio eco de este batch puede disparar
    // _rgApplyCombinedSnapshot() de forma SÍNCRONA dentro de
    // batch.commit(), antes de que cualquier callback async corra.
    _rgLatestPrivadoByOwner[p.id] = _rgPrivadoFieldsOf(p);
  });

  return batch.commit()
    .then(()=>{
      participants.forEach(p=>{
        _rgLastKnownParticipantsJSON[p.id] = _rgParticipantJSON(p, (DB.predictions && DB.predictions[p.id]) || {});
        _rgLastKnownPrivadoJSON[p.id] = _rgPrivadoJSON(p);
      });
      if(typeof toast === "function"){
        toast(`✓ Migración de privacidad completa: ${participants.length} participante(s). Clave/correo ya no están en el documento público. Se descargó un backup por si hay que volver atrás.`);
      }
    })
    .catch(err=>{
      console.error("Error en la migración de privacidad:", err);
      if(typeof toast === "function"){
        toast("⚠️ Error al migrar — revisá la consola. No se perdió nada (el backup ya se descargó).", true);
      }
      throw err;
    });
}

if(window.__fb){
  rgWireFirestoreSync();
}else{
  window.addEventListener("firebase-ready", rgWireFirestoreSync, {once:true});
}

/* ════════════════════════════════════════
   NOTA DE SEGURIDAD (v6.9) — LEER ANTES DE TOCAR ESTE ARCHIVO
   ════════════════════════════════════════
   Este archivo asume que existen las reglas de Firestore entregadas
   aparte en firestore.rules (hay que pegarlas en la consola de Firebase,
   en Firestore Database -> Reglas, y publicar). Resumen (ver el archivo
   real para los comentarios completos y el helper isPastDeadline()):

     match /registro_participants/{pid} {
       allow read: if true;
       allow create: if request.auth != null
                     && (request.resource.data.ownerUid == request.auth.uid
                         || request.auth.token.email == "agustingb23@gmail.com");
       allow update: if request.auth != null
                     && (
                          (resource.data.ownerUid == request.auth.uid
                            && resource.data.estadoQuiniela != 'enviada'
                            && !isPastDeadline())
                          || request.auth.token.email == "agustingb23@gmail.com"
                          || (request.resource.data.diff(resource.data).affectedKeys().hasOnly(['ownerUid','fechaActualizacion'])
                              && get(/databases/$(database)/documents/registro_privado/$(pid)).data.ownerUid == request.auth.uid)
                        );
       allow delete: if request.auth != null
                     && (resource.data.ownerUid == request.auth.uid
                         || request.auth.token.email == "agustingb23@gmail.com");
     }
     match /registro_privado/{pid} {     // v6.9 — clave + correo, acá y SOLO acá
       allow read: if request.auth != null
                   && (resource.data.ownerUid == request.auth.uid
                       || request.auth.token.email == "agustingb23@gmail.com");
       allow create: if request.auth != null
                     && (request.resource.data.ownerUid == request.auth.uid
                         || request.auth.token.email == "agustingb23@gmail.com");
       allow update: if request.auth != null
                     && (resource.data.ownerUid == request.auth.uid
                         || request.auth.token.email == "agustingb23@gmail.com"
                         || (request.resource.data.diff(resource.data).affectedKeys().hasOnly(['ownerUid','clave'])
                             && request.resource.data.clave == resource.data.clave));
       allow delete: if request.auth != null
                     && (resource.data.ownerUid == request.auth.uid
                         || request.auth.token.email == "agustingb23@gmail.com");
     }
     match /registro/meta {
       allow read: if true;
       allow write: if request.auth != null
                    && (request.auth.token.email == "agustingb23@gmail.com"
                        || resource == null
                        || request.resource.data.diff(resource.data).affectedKeys().hasOnly(['nextSeq','updatedAt']));
     }
     match /registro/papelera {
       allow read, write: if request.auth != null
                           && request.auth.token.email == "agustingb23@gmail.com";
     }

   ── v6.9, Fase de Privacidad — POR QUÉ SE SEPARÓ clave/correo ──────
   Hasta v6.8, registro_participants era de lectura pública (allow read:
   if true) Y contenía clave+correo en texto plano. Como además este
   archivo sincroniza la colección COMPLETA con un solo onSnapshot sin
   filtro (ver rgWireFirestoreSync), CUALQUIER visitante — sin sesión,
   sin saber nada de Firestore — descargaba automáticamente la clave y
   el correo de los 27 participantes solo con abrir la página. Con la
   clave en mano, "reclamar" la cuenta de cualquiera era trivial (la
   regla de re-claim de entonces solo comparaba la clave ENVIADA contra
   la guardada, sin exigir que nadie demuestre haberla LEÍDO de forma
   legítima). Firestore no permite ocultar un campo dentro de un
   documento que sigue siendo público para los demás campos (las reglas
   solo deciden documento completo sí/no) — por eso clave y correo se
   movieron a su propia colección (registro_privado), de lectura
   restringida a dueño/admin, dejando registro_participants exactamente
   igual de público que antes para todo lo que SÍ necesita serlo
   (nombre, código, predicciones, estado de envío — el Ranking y la
   verificación de nombre duplicado siguen funcionando sin tocar nada).

   El correo SIGUE teniendo un residuo público: emailHash (CRC32 del
   correo normalizado) viaja en registro_participants para que
   findByEmail() (registro.js) pueda seguir detectando duplicados sin
   leer el correo de nadie. CRC32 no es criptográficamente seguro —es
   reversible por fuerza bruta si alguien se lo propone en serio—, pero
   para un grupo cerrado de 27 personas es una barrera proporcional: ya
   no hay nada legible para quien simplemente abre las devtools.

   El reclamo desde un dispositivo nuevo (renderLogin en registro.js)
   pasó de UNA escritura a DOS, secuenciales (no un batch atómico, a
   propósito):
     1) registro_privado/{pid}: se manda la clave que la persona
        ESCRIBIÓ. Firestore la compara contra la guardada; si no
        coincide, esta escritura se rechaza (permission-denied) y ahí
        termina todo, sin tocar nada del documento público.
     2) Solo si (1) salió bien: registro_participants/{pid} actualiza
        ownerUid. La regla de ESTE documento exige que registro_privado/
        {pid} YA tenga el ownerUid nuevo — como (1) ya quedó confirmado
        en el servidor antes de intentar (2), el get() de la regla ve el
        valor correcto. Ver rgClaimOwnership() más arriba.
   Quien ya es dueño en el MISMO dispositivo (ownerUid ya coincide) ya
   NO necesita escribir la clave correcta para entrar por este formulario
   — exactamente igual que tryAutoLoginByOwnerUid(), que nunca pidió
   clave: el UID anónimo del propio dispositivo ya es la prueba.

   ── v6.8, Fase de Estabilización — candado de fecha de cierre ──────
   El camino del dueño en "update" ya no alcanza con ownerUid==auth.uid:
   además exige que la quiniela no esté "enviada" Y que el plazo global
   (registro/meta.configGlobal.fechaCierre/horaCierre) no haya pasado —
   antes esto SOLO lo decidía isLocked() en registro.js (100% cliente),
   así que cualquiera con la consola del navegador abierta podía seguir
   editando predicciones después del cierre sin que Firestore lo notara.
   El camino de admin y el de re-claim no se tocan por este candado.

   El camino "request.auth.token.email == admin" en create/update existe
   porque hay operaciones legítimas donde el admin escribe a nombre de
   alguien que nunca tuvo (o ya no tiene) un ownerUid propio: la migración
   del sistema legacy (runMigracionLegacy en legacy-migracion.js, que crea
   participantes históricos sin sesión anónima asociada) y restaurar a
   alguien desde la papelera (donde quedó guardado tal cual estaba, sin
   reasignarle un ownerUid nuevo). Fuera de esos dos casos, el admin sigue
   usando "Mi Quiniela" exactamente igual que cualquier otro: si entra con
   su propia sesión anónima como participante normal, esa sesión no es
   self.auth.token.email del admin (porque ESA sesión es anónima), así que
   este camino no le da ningún atajo extra sobre su PROPIA quiniela personal
   si la tuviera — solo le permite tocar la de otros desde el panel Admin.

   "delete" lo puede hacer el propio dueño (cancelar su propia inscripción
   desde el botón "Eliminar mi registro" del wizard, ver q_delete en
   registro.js) o el admin (mover a alguien a la papelera desde su panel,
   ver rgDeleteParticipantDoc()). En ambos casos el borrado real en
   Firestore va acompañado de quitar también ese id de DB.participants/
   predictions en memoria, Y de borrar el documento hermano en
   registro_privado (ver rgDeleteParticipantDoc()) — ver los call-sites
   en registro.js para los dos casos.

   ── Migración de datos ya existentes ────────────────────────────────
   Las reglas y el código nuevo NO retroactivamente limpian los
   documentos que ya existían antes de v6.9 — Firestore no borra campos
   solo porque una regla cambió. Hace falta correr UNA VEZ
   runMigracionPrivacidad() (botón "🔐 Migrar clave/correo a privado" en
   el panel Admin) para que los participantes que ya existían queden con
   su clave/correo realmente fuera del documento público. Es seguro
   correrla más de una vez (no-op si ya está migrado) y descarga un
   backup automático antes de escribir nada.

   Esto reemplaza la nota de seguridad que existía hasta v6.8.
   ════════════════════════════════════════ */
