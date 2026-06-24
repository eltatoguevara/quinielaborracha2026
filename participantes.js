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

let _rgSuppressEcho = false;
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
let _rgLastKnownMetaJSON = null;

function _rgParticipantJSON(p, preds){
  return JSON.stringify({ ...p, predictions: preds || {} });
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

  (d.participants||[]).forEach(p=>{
    const preds = d.predictions[p.id] || {};
    const json = _rgParticipantJSON(p, preds);
    if(_rgLastKnownParticipantsJSON[p.id] === json) return;
    const docRef = fb.doc(fb.PARTICIPANTS_COL, p.id);
    batch.set(docRef, { ...p, predictions: preds, updatedAt: fb.serverTimestamp() });
    hasWrites = true;
  });

  const metaPayload = { nextSeq: d.nextSeq, configGlobal: d.configGlobal };
  const metaJSON = JSON.stringify(metaPayload);
  if(metaJSON !== _rgLastKnownMetaJSON){
    batch.set(fb.REGISTRO_META_DOC, { ...metaPayload, updatedAt: fb.serverTimestamp() });
    hasWrites = true;
  }

  if(!hasWrites) return;

  _rgSuppressEcho = true;
  batch.commit()
    .then(()=>{
      (d.participants||[]).forEach(p=>{
        _rgLastKnownParticipantsJSON[p.id] = _rgParticipantJSON(p, d.predictions[p.id]||{});
      });
      _rgLastKnownMetaJSON = metaJSON;
    })
    .catch(err=>{
      _rgSuppressEcho = false;
      console.error("Error al sincronizar participantes con Firebase:", err);
      if(err && err.code === 'permission-denied'){
        toast('⚠️ No se pudo guardar en el servidor (permiso denegado). Tus cambios quedaron solo en este dispositivo por ahora.', true);
      }
    });
}

function rgClaimOwnership(participantId, newUid, claveActual){
  const fb = window.__fb;
  if(!fb || !fb.PARTICIPANTS_COL) return Promise.reject(new Error("Firebase no está listo todavía."));
  const docRef = fb.doc(fb.PARTICIPANTS_COL, participantId);
  _rgSuppressEcho = true;
  return fb.setDoc(docRef, { ownerUid:newUid, clave:claveActual, fechaActualizacion: Date.now() }, { merge:true })
    .then(()=>{
      const p = (DB.participants||[]).find(x=>x.id===participantId);
      if(p) _rgLastKnownParticipantsJSON[participantId] = _rgParticipantJSON(p, DB.predictions[participantId]||{});
    })
    .catch(err=>{
      _rgSuppressEcho = false;
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

function _rgApplyCombinedSnapshot(){
  if(!_rgGotParticipants || !_rgGotMeta) return;
  if(_rgSuppressEcho){ _rgSuppressEcho = false; return; }

  DB.participants = _rgLatestParticipants;
  DB.predictions = _rgLatestPredictions;
  DB.nextSeq = (_rgLatestMeta && _rgLatestMeta.nextSeq) || 1;
  DB.configGlobal = { ...RG_DEFAULT_CONFIG, ...((_rgLatestMeta && _rgLatestMeta.configGlobal) || {}) };

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
  const docRef = fb.doc(fb.PARTICIPANTS_COL, participantId);
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
    });
    _rgLastKnownParticipantsJSON = {};
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

if(window.__fb){
  rgWireFirestoreSync();
}else{
  window.addEventListener("firebase-ready", rgWireFirestoreSync, {once:true});
}

/* ════════════════════════════════════════
   NOTA DE SEGURIDAD (v6.4) — LEER ANTES DE TOCAR ESTE ARCHIVO
   ════════════════════════════════════════
   Este archivo asume que existen las reglas de Firestore entregadas
   aparte en firestore.rules (hay que pegarlas en la consola de Firebase,
   en Firestore Database -> Reglas, y publicar):

     match /registro_participants/{pid} {
       allow read: if true;
       allow create: if request.auth != null
                     && (
                          request.resource.data.ownerUid == request.auth.uid
                          ||
                          // El admin puede crear documentos "a nombre de"
                          // alguien más (migración del sistema legacy,
                          // restaurar desde la papelera) sin necesitar el
                          // UID anónimo de esa persona, que nunca tuvo.
                          request.auth.token.email == "agustingb23@gmail.com"
                        );
       allow update: if request.auth != null
                     && (
                          resource.data.ownerUid == request.auth.uid
                          ||
                          request.auth.token.email == "agustingb23@gmail.com"
                          ||
                          (
                            request.resource.data.diff(resource.data).affectedKeys()
                              .hasOnly(['ownerUid','clave','fechaActualizacion'])
                            && request.resource.data.clave == resource.data.clave
                          )
                        );
       allow delete: if request.auth != null
                     && (
                          resource.data.ownerUid == request.auth.uid
                          ||
                          request.auth.token.email == "agustingb23@gmail.com"
                        );
     }
     match /registro/meta {
       allow read: if true;
       allow write: if request.auth != null;
     }
     match /registro/papelera {
       allow read, write: if request.auth != null
                           && request.auth.token.email == "agustingb23@gmail.com";
     }

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

   La regla "update" tiene tres caminos: el normal (ya eres el dueño), el
   de admin (de arriba), y el de re-claim (solo tocas ownerUid/clave/fecha,
   sin cambiar nada más, Y la clave que mandas coincide con la que YA
   estaba guardada). Esto último es lo que permite que renderLogin() en
   registro.js reclame un documento desde un dispositivo nuevo cuando
   nombre/correo + clave coinciden, sin necesitar un backend que valide la
   clave por fuera de las reglas.

   "delete" lo puede hacer el propio dueño (cancelar su propia inscripción
   desde el botón "Eliminar mi registro" del wizard, ver q_delete en
   registro.js) o el admin (mover a alguien a la papelera desde su panel,
   ver rgDeleteParticipantDoc()). En ambos casos el borrado real en
   Firestore va acompañado de quitar también ese id de DB.participants/
   predictions en memoria — ver los call-sites de rgDeleteParticipantDoc()
   en registro.js para los dos casos.

   Esto reemplaza la nota de seguridad que existía hasta v6.3 (documento
   único "registro/estado" con escritura pública sin ninguna validación
   de servidor) — ese documento ya NO se usa para escribir ni leer nada
   nuevo a partir de esta versión.
   ════════════════════════════════════════ */
