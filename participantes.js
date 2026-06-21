/* ════════════════════════════════════════════════════════════
   PARTICIPANTES — capa de datos compartida (v6.2, Fase "Unificación")
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

   Forma de DB (sin cambios respecto a v6.0/v6.1):
     { participants:[{
         id, codigo,                          // identificadores
         name, city, country, email, clave,
         estadoQuiniela,                      // "borrador" | "enviada"
         fechaCreacion, fechaActualizacion, fechaEnvio
       }],
       predictions: {
         [participantId]: {
           [matchId 1-72]: {h,a},                          // grupos
           [koSlot r32_1..final]: {h,a,_a,_b},              // eliminatoria
           special: {campeon,subcampeon,tercer,goleador,
                     goles_goleador,pais_goleador,goles_pais,
                     pais_goleado}
         }
       },
       papelera:[{participant,predictions,fechaEliminado}],
       nextSeq, configGlobal }

   Sincroniza con Firestore en registro/estado (doc único, escritura
   pública — ver nota de seguridad en registro.js). quiniela/estado
   (resultados reales, bonos, batallas) sigue totalmente separado y
   sin cambios; sigue siendo de escritura exclusiva del admin.
   ════════════════════════════════════════════════════════════ */
const STORE_KEY = "qbRegistroV3";
const CODE_YEAR = 2026;
const RG_DEFAULT_CONFIG = {
  modoConsultaHabilitado:true, registroAbierto:true,
  loginPorNombreHabilitado:true,
  fechaCierre:'', horaCierre:'23:59'
};

function rgEmptyDB(){
  return {participants:[], predictions:{}, papelera:[], nextSeq:1, configGlobal:{...RG_DEFAULT_CONFIG}};
}

// Lee solo la CACHÉ local (instantáneo). El estado real y compartido
// entre dispositivos llega por Firestore vía rgWireFirestoreSync() unos
// instantes después de cargar la página.
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

// Código único QB-2026-0001. Usa un contador propio (DB.nextSeq) que
// nunca se reutiliza, ni siquiera si se elimina un participante.
function nextCode(){
  const seq = DB.nextSeq || 1;
  DB.nextSeq = seq + 1;
  return `QB-${CODE_YEAR}-${String(seq).padStart(4,'0')}`;
}

function genClave(){
  return String(Math.floor(100000 + Math.random()*900000));
}

// ══════════════════════════════════════════════════════════════
// SINCRONIZACIÓN EN VIVO — Firestore
// Doc único registro/estado. A diferencia de quiniela/estado (solo
// admin), aquí escribe cualquier participante guardando su propia
// quiniela — por eso el push NO está condicionado a isAdmin().
// ══════════════════════════════════════════════════════════════
let _rgSuppressEcho = false;
let _rgSyncWired = false;

// Quien necesite reaccionar cuando DB cambia (Mi Quiniela, Ranking,
// Estadísticas...) se registra aquí — esta capa no necesita conocer
// de antemano quién la consume.
const DB_LISTENERS = [];
function onParticipantesChange(fn){ DB_LISTENERS.push(fn); }
function notifyParticipantesChange(){
  DB_LISTENERS.forEach(fn=>{
    try{ fn(DB); }
    catch(e){ console.error("Error en listener de participantes:", e); }
  });
}

function saveData(d){
  try{ localStorage.setItem(STORE_KEY, JSON.stringify(d)); }catch(e){}
  rgPushToFirestore(d);
}

function rgPushToFirestore(d){
  const fb = window.__fb;
  if(!fb || !fb.REGISTRO_DOC) return; // Firebase aún no listo: queda solo en caché local por ahora
  _rgSuppressEcho = true;
  fb.setDoc(fb.REGISTRO_DOC, {json: JSON.stringify(d), updatedAt: fb.serverTimestamp()})
    .catch(err=>{
      _rgSuppressEcho = false;
      console.error("Error al sincronizar participantes con Firebase:", err);
      if(err && err.code === 'permission-denied'){
        toast('⚠️ Firestore aún no permite escritura pública en /registro — los cambios quedaron guardados solo en este dispositivo. Avisa al admin.', true);
      }
    });
}

function rgApplyRemote(d){
  if(!d) return;
  DB = d;
  if(!DB.participants) DB.participants=[];
  if(!DB.predictions) DB.predictions={};
  if(!DB.papelera) DB.papelera=[];
  if(!DB.nextSeq) DB.nextSeq=1;
  DB.configGlobal = {...RG_DEFAULT_CONFIG, ...(DB.configGlobal||{})};
  try{ localStorage.setItem(STORE_KEY, JSON.stringify(DB)); }catch(e){}
  notifyParticipantesChange();
}

function rgWireFirestoreSync(){
  if(_rgSyncWired) return;
  const fb = window.__fb;
  if(!fb || !fb.REGISTRO_DOC){ setTimeout(rgWireFirestoreSync, 400); return; }
  _rgSyncWired = true;
  fb.onSnapshot(fb.REGISTRO_DOC, (snap)=>{
    if(_rgSuppressEcho){ _rgSuppressEcho = false; return; }
    if(!snap.exists()) return;
    const data = snap.data();
    if(!data || !data.json) return;
    try{ rgApplyRemote(JSON.parse(data.json)); }
    catch(e){ console.error("Error al aplicar participantes remoto:", e); }
  }, (err)=>{ console.error("Error de sincronización Firestore (participantes):", err); });
}

if(window.__fb){
  rgWireFirestoreSync();
}else{
  window.addEventListener("firebase-ready", rgWireFirestoreSync, {once:true});
}
