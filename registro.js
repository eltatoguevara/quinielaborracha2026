/* ════════════════════════════════════════════════════════════
   QUINIELA BORRACHA 2026 — Módulo REGISTRO (Fase 1, v6.0)
   Wizard de inscripción + bracket dinámico + panel admin, portado
   desde el prototipo registro-quiniela_1_0.html e integrado a la
   app principal:
     - Persistencia: Firestore (doc registro/estado) + caché local,
       mismo patrón que quiniela/estado en app.js.
     - Admin: reusa Firebase Auth + isAdmin() ya existentes (antes
       el panel admin de este prototipo no tenía autenticación).
     - Todo este archivo vive en su propio scope (IIFE) para no
       chocar con ningún global de app.js; no expone nada a window
       porque no lo necesita (los botones se conectan con
       addEventListener acá adentro, no con onclick= en el HTML).
     - Clases/ids con riesgo real de choque ya fueron renombrados:
       .tab→.rg-tab, #tabs→#rg-tabs, #content→#rg-content; el toast()
       local se eliminó para reusar el toast() global de app.js.
   ════════════════════════════════════════════════════════════ */
(function(){
/* ════════════════════════════════════════
   CONFIG — PARTIDOS
   GROUP_MATCHES: los 72 partidos reales de fase de grupos (id, grupo, equipos).
     -> el participante predice el marcador exacto.

   v0.2 — BRACKET DINÁMICO. Ya no hay llaves eliminatorias fijas. Los 32
   cruces de la fase eliminatoria (dieciseisavos -> final) se calculan en
   tiempo real a partir de los marcadores que el participante predijo en
   grupos: tabla de posiciones -> 24 (1°s y 2°s) + 8 mejores terceros ->
   cruce. Ver bloque "BRACKET DINÁMICO" más abajo para el detalle.
   ════════════════════════════════════════ */
const GROUP_MATCHES=[{"id":1,"g":"A","a":"México","b":"Sudáfrica"},{"id":2,"g":"A","a":"Corea del Sur","b":"República Checa"},{"id":3,"g":"B","a":"Canadá","b":"Bosnia y Herzegovina"},{"id":4,"g":"D","a":"Estados Unidos","b":"Paraguay"},{"id":5,"g":"C","a":"Haití","b":"Escocia"},{"id":6,"g":"D","a":"Australia","b":"Turquía"},{"id":7,"g":"C","a":"Brasil","b":"Marruecos"},{"id":8,"g":"B","a":"Catar","b":"Suiza"},{"id":9,"g":"E","a":"Costa de Marfil","b":"Ecuador"},{"id":10,"g":"E","a":"Alemania","b":"Curazao"},{"id":11,"g":"F","a":"Países Bajos","b":"Japón"},{"id":12,"g":"F","a":"Suecia","b":"Túnez"},{"id":13,"g":"H","a":"Arabia Saudita","b":"Uruguay"},{"id":14,"g":"H","a":"España","b":"Cabo Verde"},{"id":15,"g":"G","a":"Irán","b":"Nueva Zelanda"},{"id":16,"g":"G","a":"Bélgica","b":"Egipto"},{"id":17,"g":"I","a":"Francia","b":"Senegal"},{"id":18,"g":"I","a":"Irak","b":"Noruega"},{"id":19,"g":"J","a":"Argentina","b":"Argelia"},{"id":20,"g":"J","a":"Austria","b":"Jordania"},{"id":21,"g":"L","a":"Ghana","b":"Panamá"},{"id":22,"g":"L","a":"Inglaterra","b":"Croacia"},{"id":23,"g":"K","a":"Portugal","b":"RD Congo"},{"id":24,"g":"K","a":"Uzbekistán","b":"Colombia"},{"id":25,"g":"A","a":"República Checa","b":"Sudáfrica"},{"id":26,"g":"B","a":"Suiza","b":"Bosnia y Herzegovina"},{"id":27,"g":"B","a":"Canadá","b":"Catar"},{"id":28,"g":"A","a":"México","b":"Corea del Sur"},{"id":29,"g":"C","a":"Brasil","b":"Haití"},{"id":30,"g":"C","a":"Escocia","b":"Marruecos"},{"id":31,"g":"D","a":"Turquía","b":"Paraguay"},{"id":32,"g":"D","a":"Estados Unidos","b":"Australia"},{"id":33,"g":"E","a":"Alemania","b":"Costa de Marfil"},{"id":34,"g":"E","a":"Ecuador","b":"Curazao"},{"id":35,"g":"F","a":"Países Bajos","b":"Suecia"},{"id":36,"g":"F","a":"Túnez","b":"Japón"},{"id":37,"g":"H","a":"Uruguay","b":"Cabo Verde"},{"id":38,"g":"H","a":"España","b":"Arabia Saudita"},{"id":39,"g":"G","a":"Bélgica","b":"Irán"},{"id":40,"g":"G","a":"Nueva Zelanda","b":"Egipto"},{"id":41,"g":"I","a":"Noruega","b":"Senegal"},{"id":42,"g":"I","a":"Francia","b":"Irak"},{"id":43,"g":"J","a":"Argentina","b":"Austria"},{"id":44,"g":"J","a":"Jordania","b":"Argelia"},{"id":45,"g":"L","a":"Inglaterra","b":"Ghana"},{"id":46,"g":"L","a":"Panamá","b":"Croacia"},{"id":47,"g":"K","a":"Portugal","b":"Uzbekistán"},{"id":48,"g":"K","a":"Colombia","b":"RD Congo"},{"id":49,"g":"C","a":"Escocia","b":"Brasil"},{"id":50,"g":"C","a":"Marruecos","b":"Haití"},{"id":51,"g":"B","a":"Suiza","b":"Canadá"},{"id":52,"g":"B","a":"Bosnia y Herzegovina","b":"Catar"},{"id":53,"g":"A","a":"República Checa","b":"México"},{"id":54,"g":"A","a":"Sudáfrica","b":"Corea del Sur"},{"id":55,"g":"E","a":"Curazao","b":"Costa de Marfil"},{"id":56,"g":"E","a":"Ecuador","b":"Alemania"},{"id":57,"g":"F","a":"Japón","b":"Suecia"},{"id":58,"g":"F","a":"Túnez","b":"Países Bajos"},{"id":59,"g":"D","a":"Turquía","b":"Estados Unidos"},{"id":60,"g":"D","a":"Paraguay","b":"Australia"},{"id":61,"g":"I","a":"Noruega","b":"Francia"},{"id":62,"g":"I","a":"Senegal","b":"Irak"},{"id":63,"g":"G","a":"Egipto","b":"Irán"},{"id":64,"g":"G","a":"Nueva Zelanda","b":"Bélgica"},{"id":65,"g":"H","a":"Cabo Verde","b":"Arabia Saudita"},{"id":66,"g":"H","a":"Uruguay","b":"España"},{"id":67,"g":"L","a":"Panamá","b":"Inglaterra"},{"id":68,"g":"L","a":"Croacia","b":"Ghana"},{"id":69,"g":"J","a":"Argelia","b":"Austria"},{"id":70,"g":"J","a":"Jordania","b":"Argentina"},{"id":71,"g":"K","a":"Colombia","b":"Portugal"},{"id":72,"g":"K","a":"RD Congo","b":"Uzbekistán"}];
/* v0.4 — BANDERAS POR IMAGEN
   Antes se usaban emojis de bandera (TEAM_FLAG). Inglaterra y Escocia
   compartían el mismo emoji genérico (🏴) porque sus banderas reales usan
   secuencias Unicode "tag" con soporte muy inconsistente entre sistemas.
   Ahora se usa flagcdn.com (SVG, vectorial, con CORS abierto) por código
   ISO 3166-1 alpha-2; Inglaterra/Escocia/Gales usan los códigos especiales
   de flagcdn para las "home nations" del Reino Unido (gb-eng, gb-sct, gb-wls).
   Si una imagen falla al cargar, el onerror la sustituye por un SVG de
   respaldo inline (no depende de red), así nunca queda un hueco vacío. */
const TEAM_ISO={"Alemania":"de","Arabia Saudita":"sa","Argelia":"dz","Argentina":"ar","Australia":"au","Austria":"at","Bosnia y Herzegovina":"ba","Brasil":"br","Bélgica":"be","Cabo Verde":"cv","Canadá":"ca","Catar":"qa","Colombia":"co","Corea del Sur":"kr","Costa de Marfil":"ci","Croacia":"hr","Curazao":"cw","Ecuador":"ec","Egipto":"eg","Escocia":"gb-sct","España":"es","Estados Unidos":"us","Francia":"fr","Ghana":"gh","Haití":"ht","Inglaterra":"gb-eng","Irak":"iq","Irán":"ir","Japón":"jp","Jordania":"jo","Marruecos":"ma","México":"mx","Noruega":"no","Nueva Zelanda":"nz","Panamá":"pa","Paraguay":"py","Países Bajos":"nl","Portugal":"pt","RD Congo":"cd","República Checa":"cz","Senegal":"sn","Sudáfrica":"za","Suecia":"se","Suiza":"ch","Turquía":"tr","Túnez":"tn","Uruguay":"uy","Uzbekistán":"uz"};

// SVG de respaldo (inline, no depende de red) para cuando una bandera no
// existe en el mapeo o falla la carga desde flagcdn.com.
const FLAG_FALLBACK_SRC = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 14">'+
  '<rect width="20" height="14" rx="2" ry="2" fill="#1C2030"/>'+
  '<rect x="0.5" y="0.5" width="19" height="13" rx="1.5" ry="1.5" fill="none" stroke="#2E3448"/>'+
  '<text x="10" y="10.5" font-size="8" text-anchor="middle" font-family="sans-serif" fill="#6B7384">?</text>'+
  '</svg>'
);

// flagImgByIso() es la base real de todas las banderas (equipos y, desde
// v1.0, también países de residencia): un <img> de flagcdn.com (SVG) con
// respaldo inline si no existe el código o falla la carga.
function flagImgByIso(iso, h){
  h = h || 14;
  const w = Math.round(h*1.43);
  const src = iso ? `https://flagcdn.com/${iso}.svg` : FLAG_FALLBACK_SRC;
  return `<img class="flag-img" src="${src}" width="${w}" height="${h}" alt="" loading="lazy" crossorigin="anonymous" onerror="this.onerror=null;this.src='${FLAG_FALLBACK_SRC}'">`;
}
// flagOf() se mantiene (con el mismo nombre) por compatibilidad con todo el
// código existente (equipos del Mundial).
function flagOf(name, h){
  return flagImgByIso(TEAM_ISO[name], h);
}

// v1.0 — Lista de países reconocidos internacionalmente (los ~195 Estados
// miembros de la ONU + un puñado de casos comúnmente incluidos como el
// Vaticano), con su código ISO 3166-1 alpha-2 para la bandera y para
// guardar en la base de datos. Es la fuente del selector de País del
// formulario de registro.
const COUNTRY_LIST = [
  ["Afganistán","af"],["Albania","al"],["Alemania","de"],["Andorra","ad"],["Angola","ao"],
  ["Antigua y Barbuda","ag"],["Arabia Saudita","sa"],["Argelia","dz"],["Argentina","ar"],["Armenia","am"],
  ["Australia","au"],["Austria","at"],["Azerbaiyán","az"],["Bahamas","bs"],["Baréin","bh"],
  ["Bangladés","bd"],["Barbados","bb"],["Bélgica","be"],["Belice","bz"],["Benín","bj"],
  ["Bielorrusia","by"],["Bolivia","bo"],["Bosnia y Herzegovina","ba"],["Botsuana","bw"],["Brasil","br"],
  ["Brunéi","bn"],["Bulgaria","bg"],["Burkina Faso","bf"],["Burundi","bi"],["Bután","bt"],
  ["Cabo Verde","cv"],["Camboya","kh"],["Camerún","cm"],["Canadá","ca"],["Catar","qa"],
  ["Chad","td"],["Chile","cl"],["China","cn"],["Chipre","cy"],["Ciudad del Vaticano","va"],
  ["Colombia","co"],["Comoras","km"],["Corea del Norte","kp"],["Corea del Sur","kr"],["Costa de Marfil","ci"],
  ["Costa Rica","cr"],["Croacia","hr"],["Cuba","cu"],["Dinamarca","dk"],["Dominica","dm"],
  ["Ecuador","ec"],["Egipto","eg"],["El Salvador","sv"],["Emiratos Árabes Unidos","ae"],["Eritrea","er"],
  ["Eslovaquia","sk"],["Eslovenia","si"],["España","es"],["Estados Unidos","us"],["Estonia","ee"],
  ["Esuatini","sz"],["Etiopía","et"],["Filipinas","ph"],["Finlandia","fi"],["Fiyi","fj"],
  ["Francia","fr"],["Gabón","ga"],["Gambia","gm"],["Georgia","ge"],["Ghana","gh"],
  ["Granada","gd"],["Grecia","gr"],["Guatemala","gt"],["Guyana","gy"],["Guinea","gn"],
  ["Guinea-Bisáu","gw"],["Guinea Ecuatorial","gq"],["Haití","ht"],["Honduras","hn"],["Hungría","hu"],
  ["India","in"],["Indonesia","id"],["Irak","iq"],["Irán","ir"],["Irlanda","ie"],
  ["Islandia","is"],["Islas Marshall","mh"],["Islas Salomón","sb"],["Israel","il"],["Italia","it"],
  ["Jamaica","jm"],["Japón","jp"],["Jordania","jo"],["Kazajistán","kz"],["Kenia","ke"],
  ["Kirguistán","kg"],["Kiribati","ki"],["Kosovo","xk"],["Kuwait","kw"],["Laos","la"],
  ["Lesoto","ls"],["Letonia","lv"],["Líbano","lb"],["Liberia","lr"],["Libia","ly"],
  ["Liechtenstein","li"],["Lituania","lt"],["Luxemburgo","lu"],["Macedonia del Norte","mk"],["Madagascar","mg"],
  ["Malasia","my"],["Malaui","mw"],["Maldivas","mv"],["Mali","ml"],["Malta","mt"],
  ["Marruecos","ma"],["Mauricio","mu"],["Mauritania","mr"],["México","mx"],["Micronesia","fm"],
  ["Moldavia","md"],["Mónaco","mc"],["Mongolia","mn"],["Montenegro","me"],["Mozambique","mz"],
  ["Myanmar","mm"],["Namibia","na"],["Nauru","nr"],["Nepal","np"],["Nicaragua","ni"],
  ["Níger","ne"],["Nigeria","ng"],["Noruega","no"],["Nueva Zelanda","nz"],["Omán","om"],
  ["Países Bajos","nl"],["Pakistán","pk"],["Palaos","pw"],["Palestina","ps"],["Panamá","pa"],
  ["Papúa Nueva Guinea","pg"],["Paraguay","py"],["Perú","pe"],["Polonia","pl"],["Portugal","pt"],
  ["Reino Unido","gb"],["RD Congo","cd"],["República Centroafricana","cf"],["República Checa","cz"],["República del Congo","cg"],
  ["República Dominicana","do"],["Ruanda","rw"],["Rumania","ro"],["Rusia","ru"],["Samoa","ws"],
  ["San Cristóbal y Nieves","kn"],["San Marino","sm"],["San Vicente y las Granadinas","vc"],["Santa Lucía","lc"],["Santo Tomé y Príncipe","st"],
  ["Senegal","sn"],["Serbia","rs"],["Seychelles","sc"],["Sierra Leona","sl"],["Singapur","sg"],
  ["Siria","sy"],["Somalia","so"],["Sri Lanka","lk"],["Sudáfrica","za"],["Sudán","sd"],
  ["Sudán del Sur","ss"],["Suecia","se"],["Suiza","ch"],["Surinam","sr"],["Tailandia","th"],
  ["Tanzania","tz"],["Tayikistán","tj"],["Timor Oriental","tl"],["Togo","tg"],["Tonga","to"],
  ["Trinidad y Tobago","tt"],["Túnez","tn"],["Turkmenistán","tm"],["Turquía","tr"],["Tuvalu","tv"],
  ["Ucrania","ua"],["Uganda","ug"],["Uruguay","uy"],["Uzbekistán","uz"],["Vanuatu","vu"],
  ["Venezuela","ve"],["Vietnam","vn"],["Yemen","ye"],["Yibuti","dj"],["Zambia","zm"],["Zimbabue","zw"]
].map(([name,iso])=>({name,iso})).sort((a,b)=>a.name.localeCompare(b.name,'es'));

function findCountryByName(name){
  const n = norm(name);
  return COUNTRY_LIST.find(c=>norm(c.name)===n);
}

// Ciudades sugeridas para un país: no existe (ni puede embeberse offline)
// una base de datos mundial de ciudades, así que las sugerencias crecen
// solas a partir de lo que otros participantes de ese mismo país ya
// escribieron — sigue permitiendo texto libre para cualquier ciudad nueva.
function getCityOptionsForCountry(iso){
  const set = new Set();
  DB.participants.forEach(p=>{ if(p.countryIso===iso && p.city) set.add(p.city.trim()); });
  return [...set].sort((a,b)=>a.localeCompare(b,'es'));
}

const GROUP_LETTERS = [...new Set(GROUP_MATCHES.map(m=>m.g))].sort();
const ALL_TEAMS = Object.keys(TEAM_ISO).sort((a,b)=>a.localeCompare(b,'es'));

// IDs fijos de las 32 llaves eliminatorias (16+8+4+2+1+1). El equipo que
// ocupa cada llave SÍ cambia según los resultados de grupo, pero el ID
// del slot no — así la predicción se guarda por posición del bracket.
const KO_PHASES = [
  {key:'r32',   label:'Dieciseisavos de Final', n:16},
  {key:'r16',   label:'Octavos de Final',       n:8},
  {key:'qf',    label:'Cuartos de Final',       n:4},
  {key:'sf',    label:'Semifinales',            n:2},
  {key:'third', label:'Tercer lugar',           n:1},
  {key:'final', label:'Final',                  n:1},
];
const KO_SLOT_IDS = [
  ...Array.from({length:16},(_,i)=>`r32_${i+1}`),
  ...Array.from({length:8}, (_,i)=>`r16_${i+1}`),
  ...Array.from({length:4}, (_,i)=>`qf_${i+1}`),
  ...Array.from({length:2}, (_,i)=>`sf_${i+1}`),
  'third','final'
];

// Las 8 preguntas especiales, tal como existen en el proyecto principal
// (sección "Avanzado"). No se agregan ni se quitan preguntas.
const SPECIAL_QUESTIONS = [
  {id:'campeon',         label:'Campeón del Mundial',                  type:'team'},
  {id:'subcampeon',      label:'Subcampeón',                           type:'team'},
  {id:'tercer',          label:'Tercer lugar',                         type:'team'},
  {id:'goleador',        label:'Goleador del torneo',                  type:'text', placeholder:'Nombre del jugador'},
  {id:'goles_goleador',  label:'Goles del goleador (exactos)',         type:'number'},
  {id:'pais_goleador',   label:'País más goleador',                    type:'team'},
  {id:'goles_pais',      label:'Goles de ese país (exactos)',          type:'number'},
  {id:'pais_goleado',    label:'País más goleado en un partido',       type:'team'},
];

// v0.7 (Fase 4) — Campeón, Subcampeón y Tercer lugar ya NO son preguntas
// manuales: se "queman" siempre con el resultado del bracket (Final y
// partido por el Tercer lugar) y se recalculan solos si el usuario cambia
// una llave. computeAutoSpecial() es la única fuente de verdad para estos
// 3 campos en TODAS las vistas (paso de Preguntas especiales, Revisión,
// y el PDF) — la UI nunca los lee desde preds.special, para evitar que
// quede un valor manual "viejo" guardado de antes de este cambio.
//
// v6.4 — Aclaración importante: lo de arriba sigue siendo cierto para la
// UI, pero scoring.js (calcAdv, vía SPECIAL_FIELD_MAP_V62) SÍ lee estos 3
// campos desde preds.special — es el único lugar donde calcAdv() encuentra
// campeón/subcampeón/3er lugar para otorgar sus 15+10+8 pts. Por eso ahora
// el botón "Enviar predicciones" (ver renderQuinielaForm, paso 'review')
// los persiste ahí justo antes de marcar la quiniela como enviada. Quien
// ya había enviado su quiniela ANTES de este fix quedó con preds.special
// vacío en esos 3 campos — backfillAutoSpecialForAll() (botón en el panel
// Admin) corrige eso retroactivamente, sin tocar nada más de su quiniela.
const AUTO_SPECIAL_IDS = ['campeon', 'subcampeon', 'tercer'];
function computeAutoSpecial(bracket){
  const out = { campeon:'', subcampeon:'', tercer:'' };
  if(!bracket || !bracket.ready) return out;
  if(bracket.final && bracket.final.winner){
    out.campeon = bracket.final.winner;
    out.subcampeon = (bracket.final.winner===bracket.final.a) ? bracket.final.b : bracket.final.a;
  }
  if(bracket.third && bracket.third.winner){
    out.tercer = bracket.third.winner;
  }
  return out;
}

// v6.4 — Backfill retroactivo del bug de campeón/subcampeón/3er lugar no
// persistidos. Recorre a TODOS los participantes (no solo los "enviada",
// por si alguien tiene su bracket completo en borrador) y, para cada uno
// cuyo bracket ya esté listo (bracket.ready), escribe en preds.special los
// 3 campos auto-calculados — sin pisar ningún otro dato de su quiniela.
// Es seguro correrlo más de una vez: si el campo ya está correcto, se
// vuelve a escribir el mismo valor (no-op real). Descarga un backup
// automático antes de escribir, mismo patrón que runMigracionLegacy().
function backfillAutoSpecialForAll(){
  if(!isAdmin()){toast("🔒 Solo el admin puede ejecutar el backfill.",true);return;}
  const candidatos=[];
  (DB.participants||[]).forEach(p=>{
    const preds=DB.predictions[p.id];
    if(!preds) return;
    const bracket=computeBracket(preds);
    if(!bracket.ready) return; // sin bracket completo no hay nada que "quemar" todavía
    const autoSp=computeAutoSpecial(bracket);
    if(!autoSp.campeon && !autoSp.subcampeon && !autoSp.tercer) return; // bracket.ready pero sin ganador resuelto (no debería pasar, por si acaso)
    const sp=preds.special||{};
    const yaCorrecto = sp.campeon===autoSp.campeon && sp.subcampeon===autoSp.subcampeon && sp.tercer===autoSp.tercer;
    candidatos.push({p,preds,autoSp,yaCorrecto});
  });

  const aCorregir=candidatos.filter(c=>!c.yaCorrecto);
  if(!candidatos.length){
    toast("Nadie tiene su bracket completo todavía — nada que corregir.");
    return;
  }
  if(!aCorregir.length){
    toast(`✓ Los ${candidatos.length} participante(s) con bracket completo ya tienen campeón/subcampeón/3er lugar correctos.`);
    return;
  }
  if(!confirm(`Esto va a corregir campeón/subcampeón/3er lugar de ${aCorregir.length} participante(s) (de ${candidatos.length} con bracket completo). No toca ningún otro dato de su quiniela. Antes de escribir nada se descarga un backup. ¿Continuar?`)) return;

  // Backup descargable ANTES de tocar nada — mismo patrón que la migración legacy.
  const backup={
    tipo:"backup_pre_backfill_special_v64",
    fecha:new Date().toISOString(),
    dbAntesDelBackfill:JSON.parse(JSON.stringify(DB))
  };
  const blob=new Blob([JSON.stringify(backup,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download=`backup_pre_backfill_special_${Date.now()}.json`;
  document.body.appendChild(a);a.click();a.remove();
  URL.revokeObjectURL(url);

  aCorregir.forEach(({p,preds,autoSp})=>{
    preds.special = {...(preds.special||{}), ...autoSp};
    p.fechaActualizacion = Date.now();
  });

  saveData(DB);
  if(typeof rebuildDynamicData==="function")rebuildDynamicData();
  if(typeof renderRank==="function")renderRank();
  if(typeof renderBonosPanel==="function")renderBonosPanel();
  if(typeof renderStatCards==="function")renderStatCards();
  toast(`✓ ${aCorregir.length} participante(s) corregido(s). Se descargó un backup por si hay que volver atrás.`);
  if(CURRENT_TAB==='admin') renderAdmin();
}

/* ════════════════════════════════════════
   WIZARD — alpha 0.3
   10 pasos navegables. El paso "Enviar predicciones" del pedido original
   se resolvió como el botón de confirmación dentro del paso 10 (Revisión
   final), no como un paso independiente — así se acordó.
   ════════════════════════════════════════ */
const WIZARD_STEPS = [
  {key:'personal', label:'Datos personales',      icon:'👤'},
  {key:'groups',   label:'Fase de grupos',        icon:'⚽'},
  {key:'r32',      label:'Dieciseisavos',         icon:'🔥'},
  {key:'r16',      label:'Octavos',               icon:'🏆'},
  {key:'qf',       label:'Cuartos',                icon:'⭐'},
  {key:'sf',       label:'Semifinales',           icon:'🥇'},
  {key:'third',    label:'Tercer lugar',          icon:'🥉'},
  {key:'final',    label:'Final',                  icon:'🏆'},
  {key:'special',  label:'Preguntas especiales',  icon:'✨'},
  {key:'review',   label:'Revisión final',        icon:'📋'},
];

// Bloqueo: una quiniela enviada queda en solo lectura. La reapertura por
// admin (estado vuelve a "borrador") la libera de nuevo. v1.0 suma una
// segunda condición: el cierre automático global por fecha/hora — afecta
// a TODOS los participantes por igual (no hace falta que cada uno haya
// "enviado" su quiniela), pero el admin siempre puede seguir editando
// (ver ADMIN_OVERRIDE en renderQuinielaForm, que ya ignora isLocked()).
function getCierreTimestamp(){
  const fc = DB.configGlobal.fechaCierre;
  if(!fc) return null;
  const t = new Date(`${fc}T${DB.configGlobal.horaCierre || '23:59'}`).getTime();
  return isNaN(t) ? null : t;
}
function isGloballyClosed(){
  const t = getCierreTimestamp();
  return t!==null && Date.now() >= t;
}
function isLocked(p){
  return p.estadoQuiniela === 'enviada' || isGloballyClosed();
}

/* ════════════════════════════════════════
   BRACKET DINÁMICO — alpha 0.2
   El participante NUNCA escribe equipos a mano en la fase eliminatoria.
   A partir de los marcadores de grupo se calcula:
     1) Tabla de cada uno de los 12 grupos (puntos, DG, GF, enfrentamiento
        directo si el empate es entre exactamente 2 equipos; si no se puede
        resolver, queda el orden alfabético — es una simplificación
        consciente, no replica criterios FIFA como fair play).
     2) 24 clasificados directos (1°s y 2°s) + 8 mejores terceros = 32.
     3) Cruce de Dieciseisavos: simplificado y determinista (semilla 1
        contra semilla 32, semilla 2 contra semilla 31, etc.) — NO es el
        draw oficial de FIFA (ese depende de una tabla de contingencia
        completa según qué terceros clasifican, que no está disponible
        aquí). Acordado como aproximación válida para este prototipo.
     4) Octavos, Cuartos, Semis, Tercer lugar y Final se construyen
        encadenando los ganadores de la ronda anterior.
   Cada predicción eliminatoria guarda los nombres de los dos equipos con
   los que se hizo (_a/_b). Si después el usuario cambia un resultado de
   grupo y los equipos de ese cruce cambian, la predicción vieja se
   ignora automáticamente (no se "pega" a equipos que ya no aplican).
   ════════════════════════════════════════ */

function groupMatchResult(mid, preds){
  const v = preds[mid];
  if(!v || !Number.isInteger(v.h) || !Number.isInteger(v.a) || v.h<0 || v.a<0) return null;
  return v;
}
function allGroupsComplete(preds){
  return GROUP_MATCHES.every(m=>groupMatchResult(m.id, preds));
}

function rankGroup(g, preds){
  const matches = GROUP_MATCHES.filter(m=>m.g===g);
  const teamSet = new Set();
  matches.forEach(m=>{ teamSet.add(m.a); teamSet.add(m.b); });
  const teams = [...teamSet].sort((a,b)=>a.localeCompare(b,'es')); // base alfabética determinista
  const table = {};
  teams.forEach(t=> table[t] = {team:t, pts:0, gf:0, ga:0, gd:0, pj:0});
  matches.forEach(m=>{
    const r = groupMatchResult(m.id, preds);
    if(!r) return;
    const A = table[m.a], B = table[m.b];
    A.pj++; B.pj++;
    A.gf += r.h; A.ga += r.a;
    B.gf += r.a; B.ga += r.h;
    if(r.h > r.a) A.pts += 3;
    else if(r.a > r.h) B.pts += 3;
    else { A.pts += 1; B.pts += 1; }
  });
  teams.forEach(t=> table[t].gd = table[t].gf - table[t].ga);
  const arr = teams.map(t=>table[t]);
  arr.sort((x,y)=>{
    if(y.pts !== x.pts) return y.pts - x.pts;
    if(y.gd  !== x.gd)  return y.gd  - x.gd;
    if(y.gf  !== x.gf)  return y.gf  - x.gf;
    return 0; // empate total -> se resuelve abajo (head-to-head) o queda alfabético
  });
  // Desempate por enfrentamiento directo, solo cuando son EXACTAMENTE 2 equipos
  // empatados en puntos/DG/GF de forma consecutiva.
  let i = 0;
  while(i < arr.length){
    let j = i;
    while(j+1 < arr.length && arr[j+1].pts===arr[i].pts && arr[j+1].gd===arr[i].gd && arr[j+1].gf===arr[i].gf) j++;
    if(j === i+1){
      const A = arr[i], B = arr[j];
      const dm = matches.find(m=> (m.a===A.team && m.b===B.team) || (m.a===B.team && m.b===A.team));
      const r = dm ? groupMatchResult(dm.id, preds) : null;
      if(r){
        const aIsHome = dm.a === A.team;
        const golesA = aIsHome ? r.h : r.a;
        const golesB = aIsHome ? r.a : r.h;
        if(golesB > golesA){ arr[i]=B; arr[j]=A; }
      }
    }
    i = j+1;
  }
  return arr; // [1°, 2°, 3°, 4°]
}

function rankThirds(thirdsArr){
  const arr = thirdsArr.slice().sort((a,b)=>a.team.localeCompare(b.team,'es'));
  arr.sort((x,y)=>{
    if(y.pts !== x.pts) return y.pts - x.pts;
    if(y.gd  !== x.gd)  return y.gd  - x.gd;
    if(y.gf  !== x.gf)  return y.gf  - x.gf;
    return 0;
  });
  return arr;
}

function computeQualifiers(preds){
  const standings = {};
  GROUP_LETTERS.forEach(g=> standings[g] = rankGroup(g, preds));
  const winners    = GROUP_LETTERS.map(g=>standings[g][0]);
  const runnersUp   = GROUP_LETTERS.map(g=>standings[g][1]);
  const thirds      = GROUP_LETTERS.map(g=>standings[g][2]);
  const rankedThirds = rankThirds(thirds);
  const qualThirds  = rankedThirds.slice(0,8);
  const seeded      = [...winners, ...runnersUp, ...qualThirds].map(r=>r.team);
  return { standings, winners, runnersUp, thirds, rankedThirds, qualThirds, seeded };
}

function koWinner(pred, teamA, teamB){
  if(!pred || pred._a!==teamA || pred._b!==teamB) return null; // sin datos o "huella" obsoleta
  if(!Number.isInteger(pred.h) || !Number.isInteger(pred.a) || pred.h<0 || pred.a<0) return null;
  if(pred.h > pred.a) return teamA;
  if(pred.a > pred.h) return teamB;
  if(pred.pick===teamA || pred.pick===teamB) return pred.pick;
  return null; // empate sin definir quién avanza todavía
}
function koLoser(pred, teamA, teamB){
  const w = koWinner(pred, teamA, teamB);
  if(!w) return null;
  return w===teamA ? teamB : teamA;
}

function computeBracket(preds){
  if(!allGroupsComplete(preds)) return { ready:false };
  const q = computeQualifiers(preds);
  const seeded = q.seeded; // 32 nombres en orden de semilla (1°s, 2°s, mejores 3°s)
  const r32 = [];
  for(let i=0;i<16;i++){
    const slot = `r32_${i+1}`;
    const pred = preds[slot];
    // v6.2 — Datos migrados del sistema anterior: esas llaves se llenaron
    // a mano, libremente, no con la fórmula oficial de cruces — por eso
    // casi nunca coinciden con el sembrado que calcularíamos hoy desde sus
    // propios grupos. Para esos casos confiamos en el cruce que la persona
    // realmente predijo (marcado con _migrated), en vez de exigir que
    // coincida con el sembrado "oficial". Para cualquier predicción hecha
    // por el wizard normal, _migrated no existe y el comportamiento es
    // exactamente el de siempre (cruce = sembrado oficial).
    const a = (pred && pred._migrated) ? pred._a : seeded[i];
    const b = (pred && pred._migrated) ? pred._b : seeded[31-i];
    r32.push({ slot, a, b, winner: koWinner(pred, a, b) });
  }
  // v6.2 — Para una predicción migrada, cada ronda confía en SU PROPIO
  // cruce guardado (_a/_b), no en el encadenado ganador-anterior → ronda
  // siguiente. Motivo: el sistema viejo emparejaba las llaves con su
  // propio árbol (quién juega contra quién en Octavos, Cuartos, etc. no
  // necesariamente "ganador del partido 1 vs ganador del partido 2" en
  // orden, como sí asume el wizard nuevo) — encadenar created round
  // siguiendo el orden del wizard nuevo mezclaba equipos que en la
  // predicción original de esa persona nunca se enfrentaban entre sí.
  // Confiando en cada ronda por separado, la llave completa de cada
  // migrado queda igual de fiel a lo que esa persona predijo en su
  // momento, sin inventar ni mezclar cruces.
  function resolveRound(slot, fallbackA, fallbackB){
    const pred = preds[slot];
    if(pred && pred._migrated) return { a:pred._a, b:pred._b, winner:koWinner(pred, pred._a, pred._b) };
    const a=fallbackA, b=fallbackB;
    return { a, b, winner:(a&&b)?koWinner(pred,a,b):null };
  }
  const r16 = [];
  for(let i=0;i<8;i++){
    const slot = `r16_${i+1}`;
    const m1=r32[2*i], m2=r32[2*i+1];
    const r = resolveRound(slot, m1.winner, m2.winner);
    r16.push({ slot, a:r.a, b:r.b, from:[m1.slot,m2.slot], winner:r.winner });
  }
  const qf = [];
  for(let i=0;i<4;i++){
    const slot = `qf_${i+1}`;
    const m1=r16[2*i], m2=r16[2*i+1];
    const r = resolveRound(slot, m1.winner, m2.winner);
    qf.push({ slot, a:r.a, b:r.b, from:[m1.slot,m2.slot], winner:r.winner });
  }
  const sf = [];
  for(let i=0;i<2;i++){
    const slot = `sf_${i+1}`;
    const m1=qf[2*i], m2=qf[2*i+1];
    const r = resolveRound(slot, m1.winner, m2.winner);
    sf.push({ slot, a:r.a, b:r.b, from:[m1.slot,m2.slot], winner:r.winner });
  }
  const thirdFallbackA = (sf[0].a && sf[0].b) ? koLoser(preds[sf[0].slot], sf[0].a, sf[0].b) : null;
  const thirdFallbackB = (sf[1].a && sf[1].b) ? koLoser(preds[sf[1].slot], sf[1].a, sf[1].b) : null;
  const thirdR = resolveRound('third', thirdFallbackA, thirdFallbackB);
  const third = { slot:'third', a:thirdR.a, b:thirdR.b, winner:thirdR.winner };
  const finalR = resolveRound('final', sf[0].winner, sf[1].winner);
  const final = { slot:'final', a:finalR.a, b:finalR.b, winner:finalR.winner };
  return { ready:true, q, r32, r16, qf, sf, third, final };
}

function koSlotsOf(bracket, key){
  if(key==='r32') return bracket.r32;
  if(key==='r16') return bracket.r16;
  if(key==='qf')  return bracket.qf;
  if(key==='sf')  return bracket.sf;
  if(key==='third') return [bracket.third];
  if(key==='final') return [bracket.final];
  return [];
}

// v0.6 — separado de getCompletionStatus(pid) para poder evaluarlo también
// sobre DRAFT_PREDS (en memoria, en vivo) y no solo sobre DB.predictions[pid]
// (que solo refleja el último autoguardado, con hasta ~700ms de retraso).
// Esto es lo que permite que el bloqueo de avance entre pasos sea instantáneo.
function computeCompletionFromPreds(preds){
  preds = preds || {};
  const groupsAns = GROUP_MATCHES.filter(m=>groupMatchResult(m.id, preds)).length;
  const bracket = computeBracket(preds);
  const phases = [{key:'groups', label:'Fase de grupos', done:groupsAns, total:72}];
  KO_PHASES.forEach(ph=>{
    const slots = bracket.ready ? koSlotsOf(bracket, ph.key) : [];
    const done = slots.filter(m=>m.winner).length;
    phases.push({key:ph.key, label:ph.label, done, total:ph.n});
  });
  const autoSp = computeAutoSpecial(bracket);
  const specialAns = SPECIAL_QUESTIONS.filter(q=>{
    if(AUTO_SPECIAL_IDS.includes(q.id)) return !!(autoSp[q.id] && String(autoSp[q.id]).trim());
    const v = preds.special && preds.special[q.id];
    if(q.type==='number') return v!==undefined && v!==null && v!=='' && Number.isInteger(Number(v)) && Number(v)>=0;
    return !!(v && String(v).trim());
  }).length;
  phases.push({key:'special', label:'Preguntas especiales', done:specialAns, total:SPECIAL_QUESTIONS.length});
  const totalDone = phases.reduce((s,p)=>s+p.done,0);
  const totalAll  = phases.reduce((s,p)=>s+p.total,0);
  return { phases, totalDone, totalAll, bracket, complete: totalDone===totalAll };
}
function getCompletionStatus(pid){
  return computeCompletionFromPreds(DB.predictions[pid] || {});
}

// v0.6 — Bloqueo de avance: devuelve la lista de pasos anteriores a
// targetIdx que todavía están incompletos. Solo se usa para saltos hacia
// ADELANTE (volver hacia atrás siempre está permitido, sin restricción).
// "personal" se valida aparte (no son "resultados", son datos del
// formulario); "review" nunca bloquea porque es el último paso.
function getStepBlockers(targetIdx, p, personalMerged, preds){
  const blockers = [];
  const comp = computeCompletionFromPreds(preds);
  const phaseByKey = {};
  comp.phases.forEach(ph=> phaseByKey[ph.key]=ph);

  for(let i=0; i<targetIdx; i++){
    const key = WIZARD_STEPS[i].key;
    if(key==='personal'){
      const ok = !!(String(personalMerged.name||'').trim() && String(personalMerged.city||'').trim() &&
                    String(personalMerged.country||'').trim() && String(personalMerged.email||'').trim());
      if(!ok) blockers.push({idx:i, label: WIZARD_STEPS[i].label, detail:'Faltan datos personales obligatorios.'});
      continue;
    }
    if(key==='review') continue;
    const ph = phaseByKey[key];
    if(ph && ph.done < ph.total){
      blockers.push({idx:i, label: WIZARD_STEPS[i].label, detail:`Faltan ${ph.total-ph.done} de ${ph.total} resultado(s).`});
    }
  }
  return blockers;
}

/* ════════════════════════════════════════
   CAPA DE DATOS — localStorage
   v2 (alpha 0.1): se quita "contact" (mezcla email+teléfono) y el teléfono;
   se agrega país, código único de participante y los campos de sistema
   fechaCreacion / fechaEnvio / estadoQuiniela.
   v3 (alpha 0.4): "PIN" se renombra a "Clave" en todo el sistema (campo
   p.pin -> p.clave). Por ser un cambio de estructura se sube el
   identificador de almacenamiento (qbRegistroV2 -> V3): los datos de
   prueba anteriores quedan huérfanos en el navegador pero ya no se leen
   (mismo criterio que STORAGE_KEY en el proyecto principal).

   Estructura:
   { nextSeq: <contador para el código QB-2026-XXXX, nunca se reutiliza>,
     participants:[{
       id, codigo,                          // identificadores
       name, city, country, email, clave,
       estadoQuiniela,                      // "borrador" | "enviada"
       fechaCreacion, fechaActualizacion, fechaEnvio
     }],
     predictions: { [participantId]: { [matchId]: {h,a} | "TeamName" } } }
   ════════════════════════════════════════ */
// v6.2 — La capa de datos (DB, loadData/saveData, sincronización con
// Firestore, uid/nextCode/genClave) se movió a participantes.js, que
// carga antes que este archivo y antes que app.js — ambos la comparten
// como global, igual que ya se compartía isAdmin()/toast()/openLoginModal().
// Lo único que sigue siendo específico de este módulo es resincronizar el
// borrador en memoria del wizard cuando llega un cambio remoto, y volver a
// pintar esta pestaña — por eso nos registramos como listener.
// v6.5 — FIX (autoguardado pisado): antes, CUALQUIER cambio remoto en
// Firestore (de cualquier participante, o de la config global) pisaba
// aquí mismo el DRAFT_PREDS en memoria del wizard activo y forzaba un
// render() completo del paso actual. Eso reconstruye el <input> que el
// usuario tiene con foco en ese instante (innerHTML nuevo = elemento
// nuevo), perdiendo lo que acababa de escribir — sin importar si el
// snapshot remoto tenía algo que ver con su propia quiniela. Como el
// autoguardado tiene ~700ms de debounce, había una ventana real en la que
// "escribís un marcador" podía coincidir con "llega un snapshot de otra
// persona" y el valor se borraba solo.
//
// Mientras el usuario está dentro del wizard con cambios sin confirmar
// (WIZ_DIRTY), su copia en memoria manda: no se sobreescribe DRAFT_PREDS
// ni se re-renderiza el paso. Apenas no haya nada pendiente (recién entró,
// o ya hizo flush), sí se resincroniza normalmente.
onParticipantesChange(()=>{
  if(DRAFT_PID && WIZ_DIRTY) return; // hay tecleo sin guardar: no pisar ni re-renderizar
  if(DRAFT_PID){
    const p = DB.participants.find(x=>x.id===DRAFT_PID);
    if(p) DRAFT_PREDS = JSON.parse(JSON.stringify(DB.predictions[DRAFT_PID] || {}));
  }
  render();
});

// uid()/nextCode()/genClave() ahora viven en participantes.js (compartidos
// con la herramienta de migración de app.js). norm()/foldAccents() siguen
// aquí porque son específicos del buscador del wizard/admin.
function norm(s){ return (s||"").trim().toLowerCase().replace(/\s+/g,' '); }
// v1.0 — Solo para el buscador de país: "Panama" debe encontrar "Panamá".
// No se usa en norm() general (login/correo) para no tocar nada que ya
// funciona; acá es una mejora real de usabilidad, no solo cosmética.
function foldAccents(s){ return (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,''); }

// v0.9 (Fase 7) — Exportar correo+Clave de todos los participantes a un
// .csv descargable. Se construye a mano (sin SheetJS ni librerías
// externas) porque este prototipo es un único archivo HTML; un CSV con
// BOM UTF-8 abre correctamente acentos en Excel.
//
// v6.4 — Esta función no toca Firestore (solo lee DB.participants, ya en
// memoria del admin) así que no necesitó ningún cambio funcional con la
// nueva capa de seguridad. Vale aclarar igual: desde v6.4 la "Clave" que
// se exporta aquí ya NO es la barrera de seguridad real de la quiniela
// de nadie (eso ahora lo hace ownerUid + las reglas de Firestore) — sigue
// siendo sensible porque es lo que permite reclamar/recuperar acceso
// desde un dispositivo nuevo (ver renderLogin en este mismo archivo), así
// que el CSV exportado sigue mereciendo el mismo cuidado de siempre al
// compartirlo, solo que la razón de fondo cambió.
function exportarCorreosClaves(){
  if(!DB.participants.length){ toast('No hay participantes para exportar.', true); return; }
  const header = ['Nombre','Correo','Codigo','Clave','Estado'];
  const rows = DB.participants.slice()
    .sort((a,b)=> a.name.localeCompare(b.name))
    .map(p=> [p.name, p.email||'', p.codigo||'', p.clave||'', p.estadoQuiniela]);
  const csvEscape = (v)=> `"${String(v).replace(/"/g,'""')}"`;
  const csv = [header, ...rows].map(r=> r.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'quiniela_correos_claves.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast(`Listado exportado (${DB.participants.length} participantes).`);
}

function fmtDate(ts){
  if(!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString('es-VE',{day:'2-digit',month:'2-digit',year:'2-digit'}) +
    ' ' + d.toLocaleTimeString('es-VE',{hour:'2-digit',minute:'2-digit'});
}

function findByName(name){
  const n = norm(name);
  return DB.participants.find(p=>norm(p.name)===n);
}
function findByEmail(email){
  const e = norm(email);
  return DB.participants.find(p=>norm(p.email)===e);
}

function totalMatches(){ return 72 + KO_SLOT_IDS.length + SPECIAL_QUESTIONS.length; } // 72+32+8 = 112
function countAnswered(pid){ return getCompletionStatus(pid).totalDone; }

/* ════════════════════════════════════════
   UI helpers
   ════════════════════════════════════════ */
// v6.0 — Se eliminó el toast() local de este prototipo: ahora se reutiliza
// el toast() global de la app principal (app.js), ya cargado antes que este
// archivo. Mismo orden de parámetros (mensaje, esError), así que todas las
// llamadas existentes en este archivo siguen funcionando sin cambios.
function esc(s){
  return (s||"").replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
}

// Espera a que todas las <img> dentro de un contenedor terminen de cargar
// (o fallen, en cuyo caso ya disparó su propio onerror de respaldo) antes de
// continuar. html2canvas toma una "foto" del DOM tal como está en ese
// instante; si una bandera (imagen remota) todavía no cargó, saldría en
// blanco en el PDF — por eso se espera explícitamente.
function waitForImages(container, timeoutMs){
  // v6.4 — CAUSA RAÍZ del PDF que se quedaba colgado en "Generando...":
  // las banderas usan loading="lazy", y #pdfPoster vive PERMANENTEMENTE
  // fuera del viewport (left:-9999px) para que html2canvas lo capture
  // sin que se vea en pantalla. El navegador decide cuándo arrancar la
  // descarga de una imagen lazy según su distancia al viewport visible;
  // un elemento que nunca se acerca a ese viewport nunca cruza ese
  // umbral, así que la descarga JAMÁS arranca — ni load ni error se
  // disparan nunca — y este Promise.all (y por lo tanto todo
  // generarPDF) se queda esperando para siempre. Forzamos loading=eager
  // para que la descarga arranque ya mismo, sin importar la posición.
  //
  // Además, por si una bandera individual se cuelga en la red (conexión
  // lenta o intermitente), un timeout de seguridad garantiza que el PDF
  // se genere igual pasado ese tiempo, en vez de quedar bloqueado para
  // siempre por una sola imagen.
  timeoutMs = timeoutMs || 8000;
  const imgs = Array.from(container.querySelectorAll('img'));
  if(!imgs.length) return Promise.resolve();
  return Promise.all(imgs.map(img=>{
    if(img.loading === 'lazy') img.loading = 'eager';
    if(img.complete) return Promise.resolve();
    return new Promise(res=>{
      let timer;
      const done = ()=>{ clearTimeout(timer); res(); };
      img.addEventListener('load', done, {once:true});
      img.addEventListener('error', done, {once:true});
      timer = setTimeout(done, timeoutMs);
    });
  }));
}

let CURRENT_TAB = 'inicio';
let DRAFT_PID = null;       // participante activo en el formulario de quiniela
let DRAFT_PREDS = {};       // predicciones en edición (en memoria), sincronizadas por autoguardado
let DRAFT_PERSONAL = {};    // cambios pendientes de nombre/ciudad/país/correo (paso "Datos personales")
let WIZ_STEP = 0;           // paso actual del wizard (índice en WIZARD_STEPS)
let WIZ_DIRTY = false;      // hay cambios escritos que el autoguardado todavía no confirmó
let ADMIN_OVERRIDE = false; // el admin entró por el lápiz ✏️: puede editar aunque esté bloqueada
let PREVIEW_AS_PARTICIPANT = false; // el admin entró por 👁️ "Ver como participante" (vista idéntica, sin privilegios)
let AUTOSAVE_TIMER = null;
let INICIO_VIEW = 'choice'; // 'choice' | 'crear' | 'login' — sub-pantalla de la pestaña Inicio
let PREFILL_EMAIL = '';     // correo (o nombre) pre-llenado al ofrecer "¿deseas verla?" desde un duplicado
let MIGRAR_PID = null;      // v1.0 — participante que entró por nombre y debe registrar su correo antes de continuar
let ADMIN_SEARCH = '';      // texto del buscador administrativo (persiste entre refrescos de la tabla)
let ADMIN_FILTER = 'all';   // 'all' | 'completas' | 'incompletas' — filtro rápido (Fase 7)
let SHOW_PAPELERA = false;  // v6.1 — si la sección de Papelera está expandida o no
let DASH_TAB = 'perfil';    // v6.3 — sub-pestaña activa del Dashboard del participante (post-bloqueo)
let DASH_PRED_SUBTAB = 'grupos'; // v6.6 — sub-pestaña activa DENTRO de "Predicciones" (grupos/elim/avanzado)

function clearDraft(){
  DRAFT_PID = null;
  DRAFT_PREDS = {};
  DRAFT_PERSONAL = {};
  WIZ_STEP = 0;
  WIZ_DIRTY = false;
  ADMIN_OVERRIDE = false;
  PREVIEW_AS_PARTICIPANT = false;
  INICIO_VIEW = 'choice';
  MIGRAR_PID = null;
  DASH_TAB = 'perfil';
  DASH_PRED_SUBTAB = 'grupos';
  clearTimeout(AUTOSAVE_TIMER);
}

function switchToInicioTab(){
  document.querySelectorAll('.rg-tab').forEach(t=>t.classList.remove('on'));
  document.querySelector('.rg-tab[data-tab="inicio"]').classList.add('on');
  CURRENT_TAB = 'inicio';
  render();
}

// ---- Autoguardado (debounce) ----
// Cada cambio agenda un guardado a los ~700ms de inactividad. Al cambiar de
// paso o de pestaña se fuerza un guardado inmediato (flush). Mientras el
// guardado esté pendiente, WIZ_DIRTY queda en true y eso es lo que activa
// la advertencia al salir.
function scheduleAutosave(delay){
  WIZ_DIRTY = true;
  updateSaveIndicator('Editando…');
  clearTimeout(AUTOSAVE_TIMER);
  AUTOSAVE_TIMER = setTimeout(flushAutosave, delay||700);
}
function flushAutosave(){
  clearTimeout(AUTOSAVE_TIMER);
  if(!DRAFT_PID) return;
  const p = DB.participants.find(x=>x.id===DRAFT_PID);
  if(!p) return;
  ['name','city','country','countryIso','email'].forEach(f=>{
    if(DRAFT_PERSONAL[f] !== undefined) p[f] = DRAFT_PERSONAL[f];
  });
  const cleaned = {};
  Object.keys(DRAFT_PREDS).forEach(key=>{
    const v = DRAFT_PREDS[key];
    if(key === 'special'){ if(v && typeof v === 'object') cleaned.special = {...v}; return; }
    if(typeof v === 'string'){ cleaned[key] = v; return; }
    if(v && typeof v === 'object'){
      const obj = {};
      if(Number.isInteger(v.h)) obj.h = v.h;
      if(Number.isInteger(v.a)) obj.a = v.a;
      if(v.pick) obj.pick = v.pick;
      if(v._a) obj._a = v._a;
      if(v._b) obj._b = v._b;
      if(Object.keys(obj).length) cleaned[key] = obj;
    }
  });
  DB.predictions[DRAFT_PID] = cleaned;
  DRAFT_PREDS = JSON.parse(JSON.stringify(cleaned));
  p.lastStep = WIZ_STEP;
  p.fechaActualizacion = Date.now();
  saveData(DB);
  WIZ_DIRTY = false;
  updateSaveIndicator('Guardado ✓');
}
function updateSaveIndicator(text){
  const el = document.getElementById('wiz_save_indicator');
  if(el) el.textContent = text;
}

// ---- Modal de "cambios sin guardar" (para navegación dentro de la app) ----
// Para cerrar/recargar la pestaña del navegador, los navegadores modernos
// no permiten texto ni botones personalizados — solo su aviso genérico
// (ver listener de beforeunload más abajo). Este modal sí es 100% custom,
// pero solo aplica al cambiar de tab dentro de esta misma app.
let EXIT_MODAL_CALLBACK = null;
function showExitModal(onLeave){
  EXIT_MODAL_CALLBACK = onLeave;
  document.getElementById('exitModal').style.display = 'flex';
}
function hideExitModal(){
  document.getElementById('exitModal').style.display = 'none';
  EXIT_MODAL_CALLBACK = null;
}
document.getElementById('em_continue').addEventListener('click', hideExitModal);
document.getElementById('em_save_exit').addEventListener('click', ()=>{
  flushAutosave();
  const cb = EXIT_MODAL_CALLBACK;
  hideExitModal();
  if(cb) cb();
});
document.getElementById('em_discard').addEventListener('click', ()=>{
  clearTimeout(AUTOSAVE_TIMER);
  DRAFT_PREDS = JSON.parse(JSON.stringify(DB.predictions[DRAFT_PID] || {}));
  DRAFT_PERSONAL = {};
  WIZ_DIRTY = false;
  const cb = EXIT_MODAL_CALLBACK;
  hideExitModal();
  if(cb) cb();
});

// ---- Modal de "te faltan resultados" (bloqueo de avance entre pasos) ----
let BLOCK_MODAL_TARGET_IDX = null;
function showBlockModal(blockers){
  const text = 'Para avanzar necesitas completar primero:<br><br>' +
    blockers.map(b=>`• <b>${esc(b.label)}</b> — ${esc(b.detail)}`).join('<br>');
  document.getElementById('blockModalText').innerHTML = text;
  BLOCK_MODAL_TARGET_IDX = blockers.length ? blockers[0].idx : null;
  document.getElementById('blockModal').style.display = 'flex';
}
document.getElementById('block_ok').addEventListener('click', ()=>{
  document.getElementById('blockModal').style.display = 'none';
});
document.getElementById('block_goto').addEventListener('click', ()=>{
  document.getElementById('blockModal').style.display = 'none';
  if(BLOCK_MODAL_TARGET_IDX!==null) jumpToStepUnchecked(BLOCK_MODAL_TARGET_IDX);
});

// v0.9 (Fase 7) — "Ir al pendiente": salta directo a un paso SIN pasar por
// el bloqueo de avance (tiene sentido: por construcción, el paso al que
// salta es justo el primero que está incompleto, así que todos los pasos
// anteriores a él ya están completos). Además resalta brevemente la
// primera fila sin resultado para que sea fácil encontrarla.
function jumpToStepUnchecked(idx){
  WIZ_STEP = idx;
  flushAutosave();
  render();
  setTimeout(highlightFirstPendingRow, 30);
}
function highlightFirstPendingRow(){
  const c = document.getElementById('rg-content');
  if(!c) return;
  // Primer marcador vacío (grupos o eliminatoria) o, si no hay, el primer
  // <select>/input especial vacío.
  let target = [...c.querySelectorAll('.score-input')].find(inp=> inp.value==='');
  if(!target) target = [...c.querySelectorAll('.special-input')].find(inp=> !inp.value);
  if(!target) return;
  const row = target.closest('.match-row') || target.closest('.field') || target;
  row.scrollIntoView({behavior:'smooth', block:'center'});
  row.classList.add('pending-flash');
  setTimeout(()=> row.classList.remove('pending-flash'), 1800);
}

window.addEventListener('beforeunload', e=>{
  if(DRAFT_PID && WIZ_DIRTY){
    e.preventDefault();
    e.returnValue = '';
  }
});

document.getElementById('rg-tabs').addEventListener('click', e=>{
  const b = e.target.closest('.rg-tab');
  if(!b) return;
  const doSwitch = ()=>{
    document.querySelectorAll('.rg-tab').forEach(t=>t.classList.remove('on'));
    b.classList.add('on');
    CURRENT_TAB = b.dataset.tab;
    clearDraft();
    render();
  };
  if(DRAFT_PID && WIZ_DIRTY){ showExitModal(doSwitch); return; }
  doSwitch();
});

function render(){
  if(CURRENT_TAB==='inicio'){ renderInicio(); return; }
  // v6.0 — Antes el panel Admin de este prototipo no tenía autenticación
  // real ("sin autenticación (prototipo)"). Ahora reusamos el mismo
  // Firebase Auth + isAdmin() que ya protege el resto de la app principal.
  if(!isAdmin()){
    const c = document.getElementById('rg-content');
    if(c) c.innerHTML = `
      <div class="card center" style="padding:2rem 1rem">
        <div style="font-size:32px;margin-bottom:.5rem">🔒</div>
        <div class="card-title" style="justify-content:center">Acceso restringido</div>
        <div class="muted" style="margin-bottom:1rem">Esta sección es solo para el administrador de la quiniela.</div>
        <button class="rg-btn rg-btn-primary" onclick="openLoginModal()">🔑 Entrar como admin</button>
      </div>`;
    return;
  }
  renderAdmin();
}

/* ════════════════════════════════════════
   TAB: INICIO — v0.4 (Fase 2)
   Pantalla de entrada única. Si DB.configGlobal.modoConsultaHabilitado
   está activo, primero pregunta "¿Ya tienes una quiniela registrada?"
   (Ver mi quiniela / Crear nueva quiniela). Si está desactivado, entra
   directo al flujo de creación (sin pantalla de elección).
   ════════════════════════════════════════ */
// v6.5 — Defensa adicional: si CUALQUIER cosa dentro de renderInicio()
// lanza una excepción (datos inconsistentes, un elemento que no existe
// todavía, lo que sea), antes la pantalla se quedaba completamente en
// blanco y sin ningún rastro visible — el usuario veía los tabs pero
// "Mi Quiniela" mostraba un vacío total, sin pista de qué pasó. Ahora
// cualquier error queda atrapado, se muestra en consola para diagnóstico,
// y en pantalla aparece un mensaje claro con un botón para reintentar en
// vez de dejar el contenedor vacío.
function renderInicio(){
  try{
    renderInicioInner();
  }catch(err){
    console.error("Error al renderizar Mi Quiniela (renderInicio):", err);
    const c = document.getElementById('rg-content');
    if(c){
      c.innerHTML = `
        <div class="card center" style="padding:1.75rem 1rem">
          <div style="font-size:32px;margin-bottom:.5rem">⚠️</div>
          <div class="card-title" style="justify-content:center">Hubo un problema al cargar esta sección</div>
          <div class="muted" style="margin-bottom:1.1rem;font-size:13px">Intenta de nuevo. Si el problema sigue, avísale al admin con este detalle: <code style="word-break:break-all">${esc(String(err&&err.message||err))}</code></div>
          <button class="rg-btn rg-btn-primary rg-btn-block" id="ini_err_retry">🔄 Reintentar</button>
        </div>`;
      document.getElementById('ini_err_retry')?.addEventListener('click', ()=>{ render(); });
    }
  }
}
function renderInicioInner(){
  const c = document.getElementById('rg-content');
  if(DRAFT_PID){
    // v6.3 — Si la quiniela ya está bloqueada (enviada, o cerrado el plazo
    // global) y no es el admin editando por override (✏️), el participante
    // ya no aterriza en el wizard: entra directo al Dashboard post-bloqueo.
    // El admin en modo "Ver como participante" (👁️) también cae acá, porque
    // es exactamente lo que vería el participante real.
    const pDraft = DB.participants.find(x=>x.id===DRAFT_PID);
    if(pDraft && isLocked(pDraft) && !ADMIN_OVERRIDE){ renderParticipantDashboard(DRAFT_PID); return; }
    renderQuinielaForm(DRAFT_PID, 'inicio');
    return;
  }
  if(INICIO_VIEW==='migrar_correo'){ renderMigrarCorreo(c); return; }

  if(!DB.configGlobal.modoConsultaHabilitado){
    renderCrear(c);
    return;
  }
  if(INICIO_VIEW==='crear'){ renderCrear(c); return; }
  if(INICIO_VIEW==='login'){ renderLogin(c); return; }

  c.innerHTML = `
    <div class="card center" style="padding:1.75rem 1rem">
      <div style="font-size:38px;margin-bottom:.5rem">🍺</div>
      <div class="card-title" style="justify-content:center">Bienvenido a Quiniela Borracha 2026</div>
      <div class="muted" style="margin-bottom:1.1rem;font-size:13px">Demuestra que sabes de fútbol.<br>O al menos que adivinas mejor que tus amigos.</div>
      <div class="rg-btn-row" style="flex-direction:column">
        <button class="rg-btn rg-btn-gold rg-btn-block" id="ini_ver">🔑 Ver mi quiniela</button>
        <button class="rg-btn rg-btn-ghost rg-btn-block" id="ini_crear">📝 Crear nueva quiniela</button>
      </div>
    </div>
  `;
  document.getElementById('ini_ver').addEventListener('click', ()=>{ INICIO_VIEW='login'; render(); });
  document.getElementById('ini_crear').addEventListener('click', ()=>{ INICIO_VIEW='crear'; render(); });
}

/* ---- Sub-vista: Crear nueva quiniela (antes pestaña "Registrarme") ---- */
function renderCrear(c){
  const volverBtn = DB.configGlobal.modoConsultaHabilitado
    ? `<button class="rg-btn rg-btn-ghost" id="crear_back" style="margin-bottom:.75rem">← Volver</button>` : '';

  if(!DB.configGlobal.registroAbierto){
    c.innerHTML = `
      ${volverBtn}
      <div class="card">
        <div class="card-title">🔒 Registro cerrado</div>
        <div class="note" style="border-color:var(--qb-yellow);color:var(--qb-yellow)">El administrador cerró el registro de nuevas quinielas. Si ya te registraste antes, usa <b>Ver mi quiniela</b> para acceder con tu correo y tu Clave.</div>
      </div>
    `;
    document.getElementById('crear_back')?.addEventListener('click', ()=>{ INICIO_VIEW='choice'; render(); });
    return;
  }

  const prefill = PREFILL_EMAIL; PREFILL_EMAIL = '';
  c.innerHTML = `
    ${volverBtn}
    <div class="note">Este formulario crea un nuevo participante y de una vez te lleva a llenar tu quiniela. Si ya te registraste antes, usa <b>Ver mi quiniela</b>.</div>
    <div class="card">
      <div class="card-title">📝 Datos del participante</div>
      <div class="field">
        <label>Nombre completo *</label>
        <input id="r_name" type="text" placeholder="Ej. Juan Pérez" autocomplete="off">
      </div>
      ${buildCountryCityFieldsHtml('r', '', '', '')}
      <div class="row2">
        <div class="field">
          <label>Correo electrónico *</label>
          <input id="r_email" type="email" placeholder="correo@ejemplo.com" autocomplete="off" value="${esc(prefill)}">
        </div>
        <div class="field">
          <label>Confirmar correo *</label>
          <input id="r_email2" type="email" placeholder="correo@ejemplo.com" autocomplete="off">
        </div>
      </div>
      <div class="field-hint" style="margin:-6px 0 10px">Escribe el mismo correo en ambos campos; lo usaremos para identificarte.</div>
      <div class="row2">
        <div class="field">
          <label>Clave (6 dígitos) *</label>
          <input id="r_clave" type="password" inputmode="numeric" maxlength="6" placeholder="123456">
        </div>
        <div class="field">
          <label>Confirmar Clave *</label>
          <input id="r_clave2" type="password" inputmode="numeric" maxlength="6" placeholder="123456">
        </div>
      </div>
      <div class="field-hint" style="margin-top:-6px">La Clave te identifica para editar tu quiniela después. Guárdala, nadie más la verá.</div>
      <div id="r_err" class="err" style="display:none"></div>
      <div class="rg-btn-row">
        <button class="rg-btn rg-btn-primary rg-btn-block" id="r_submit">Crear mi quiniela</button>
      </div>
    </div>
  `;
  document.getElementById('crear_back')?.addEventListener('click', ()=>{ INICIO_VIEW='choice'; render(); });
  wireCountryCityFields('r');
  document.getElementById('r_submit').addEventListener('click', onCrearSubmit);
}

function onCrearSubmit(){
  const name = document.getElementById('r_name').value;
  const city = document.getElementById('r_city').value;
  const country = document.getElementById('r_country').value;
  const countryIso = document.getElementById('r_country_iso').value;
  const email = document.getElementById('r_email').value.trim();
  const email2 = document.getElementById('r_email2').value.trim();
  const clave = document.getElementById('r_clave').value.trim();
  const clave2 = document.getElementById('r_clave2').value.trim();
  const errEl = document.getElementById('r_err');
  const fail = (msg)=>{ errEl.textContent = msg; errEl.style.display='block'; };
  errEl.style.display='none';

  if(!name.trim()) return fail('El nombre es obligatorio.');
  // v1.0 — El país debe elegirse de la lista (no texto libre), para que
  // el código ISO (y por lo tanto la bandera y las estadísticas futuras)
  // sean siempre datos limpios y consistentes.
  if(!country.trim()) return fail('El país es obligatorio.');
  if(!countryIso) return fail('Elige tu país de la lista que aparece al escribir (no quedó seleccionado).');
  if(!city.trim()) return fail('La ciudad es obligatoria.');
  if(!email) return fail('El correo electrónico es obligatorio.');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('El correo electrónico no parece válido.');
  if(!email2) return fail('Debes confirmar tu correo electrónico.');
  if(email.toLowerCase() !== email2.toLowerCase()) return fail('Los dos correos electrónicos no coinciden.');
  if(!/^\d{6}$/.test(clave)) return fail('La Clave debe ser de exactamente 6 dígitos.');
  if(clave !== clave2) return fail('La Clave y su confirmación no coinciden.');

  // Identidad por correo (único) — pero desde la Fase 7 el nombre completo
  // también sirve para entrar ("login por nombre o correo"), así que el
  // nombre completo también debe ser único para que no quede ambiguo a
  // quién pertenece. Antes esto no se exigía porque solo se entraba por
  // correo (ej. los dos "Miguel" del proyecto real tienen apellidos
  // distintos, así que esto no les afecta).
  if(findByEmail(email)){
    errEl.innerHTML = 'Este correo ya tiene una quiniela registrada. ' +
      '<button type="button" class="rg-btn rg-btn-ghost" id="dup_ver_btn" style="margin-left:6px;padding:5px 11px;font-size:11px;vertical-align:middle">¿Deseas verla?</button>';
    errEl.style.display='block';
    document.getElementById('dup_ver_btn').addEventListener('click', ()=>{
      PREFILL_EMAIL = email;
      INICIO_VIEW = 'login';
      render();
    });
    return;
  }
  if(findByName(name)){
    errEl.innerHTML = 'Ya existe un participante registrado con ese nombre completo exacto. ' +
      '<button type="button" class="rg-btn rg-btn-ghost" id="dup_ver_btn2" style="margin-left:6px;padding:5px 11px;font-size:11px;vertical-align:middle">¿Deseas verla?</button> ' +
      'Si son dos personas distintas, agrega una inicial o el segundo apellido para diferenciarlos.';
    errEl.style.display='block';
    document.getElementById('dup_ver_btn2').addEventListener('click', ()=>{
      PREFILL_EMAIL = name;
      INICIO_VIEW = 'login';
      render();
    });
    return;
  }

  // v6.4 — Cada participante necesita un "dueño" (ownerUid = su sesión
  // actual de Firebase Auth Anónima) para que las reglas de Firestore
  // sepan que ESTE dispositivo puede escribir este documento de aquí en
  // adelante. wireFirebaseAuth() (en app.js) garantiza que SIEMPRE haya
  // alguna sesión activa (anónima como mínimo) antes de que el resto de
  // la app pueda interactuar, así que en la práctica este caso de "no
  // hay sesión todavía" solo pasaría si alguien logra hacer clic en
  // "Crear" en la fracción de segundo entre que carga la página y que
  // signInAnonymously() resuelve — por eso el mensaje pide reintentar en
  // vez de fallar en silencio o crear un participante "huérfano" sin
  // dueño (que las reglas de Firestore rechazarían de inmediato).
  const ownerUid = window.__fb && window.__fb.auth && window.__fb.auth.currentUser
    ? window.__fb.auth.currentUser.uid : null;
  if(!ownerUid) return fail('Todavía estamos preparando tu sesión — espera un segundo y vuelve a intentar.');

  const now = Date.now();
  const p = {
    id: uid(),
    codigo: nextCode(),
    name: name.trim(), city: city.trim(), country: country.trim(), countryIso,
    email: email,
    clave, ownerUid,
    estadoQuiniela: 'borrador',
    lastStep: 0,
    fechaCreacion: now, fechaActualizacion: now, fechaEnvio: null
  };
  DB.participants.push(p);
  DB.predictions[p.id] = {};
  saveData(DB);
  toast(`¡Listo! Tu código es ${p.codigo}. Ahora llena tu quiniela.`);
  enterWizardAs(p);
  render();
}

/* ---- Sub-vista: Ver mi quiniela (login por correo + Clave) ----
   Reemplaza la antigua búsqueda por nombre+PIN. Si la quiniela está en
   estado "enviada", entra de una vez al paso de Revisión (resumen
   completo de solo lectura + botón de PDF). Si sigue en "borrador",
   continúa el wizard exactamente en el paso donde quedó (p.lastStep). */
// v1.0 — Centraliza el "entrar al wizard como X", reutilizado por el
// login normal y por el flujo de migración de correo (antes estaba
// duplicado en cada punto de entrada).
function enterWizardAs(p, opts){
  opts = opts || {};
  DRAFT_PID = p.id;
  DRAFT_PREDS = JSON.parse(JSON.stringify(DB.predictions[p.id] || {}));
  DRAFT_PERSONAL = {};
  // v1.0 — isLocked(p) ya combina "enviada" Y "cerrado por fecha límite":
  // en cualquiera de los dos casos conviene aterrizar en Revisión (el
  // resumen completo + el botón de PDF), no a mitad del wizard.
  WIZ_STEP = (opts.override || !isLocked(p))
    ? Math.min(p.lastStep||0, WIZARD_STEPS.length-1)
    : WIZARD_STEPS.length-1;
  ADMIN_OVERRIDE = !!opts.override;
  PREVIEW_AS_PARTICIPANT = !!opts.preview;
  WIZ_DIRTY = false;
}

function renderLogin(c){
  const volverBtn = DB.configGlobal.modoConsultaHabilitado
    ? `<button class="rg-btn rg-btn-ghost" id="login_back" style="margin-bottom:.75rem">← Volver</button>` : '';
  const prefill = PREFILL_EMAIL; PREFILL_EMAIL = '';
  // v1.0 — El ingreso por nombre es un puente TEMPORAL (switch de admin)
  // para migrar participantes históricos sin correo. Con el switch
  // apagado, el campo de nombre desaparece del login por completo.
  const porNombre = DB.configGlobal.loginPorNombreHabilitado;
  const fieldLabel = porNombre ? 'Usuario o correo electrónico' : 'Correo electrónico';
  const fieldPlaceholder = porNombre ? 'Tu nombre completo o tu correo' : 'Con el que te registraste';

  c.innerHTML = `
    ${volverBtn}
    <div class="card">
      <div class="card-title">🔑 Ver mi quiniela</div>
      <div class="field">
        <label>${esc(fieldLabel)}</label>
        <input id="e_user" type="text" placeholder="${esc(fieldPlaceholder)}" autocomplete="off" value="${esc(prefill)}">
      </div>
      <div class="field">
        <label>Clave</label>
        <input id="e_clave" type="password" inputmode="numeric" maxlength="6" placeholder="123456">
      </div>
      <div id="e_err" class="err" style="display:none"></div>
      <div class="rg-btn-row">
        <button class="rg-btn rg-btn-primary rg-btn-block" id="e_submit">Entrar</button>
      </div>
    </div>
  `;
  document.getElementById('login_back')?.addEventListener('click', ()=>{ INICIO_VIEW='choice'; render(); });
  document.getElementById('e_submit').addEventListener('click', ()=>{
    const usuario = document.getElementById('e_user').value.trim();
    const clave = document.getElementById('e_clave').value.trim();
    const errEl = document.getElementById('e_err');
    const btn = document.getElementById('e_submit');
    const p = porNombre ? (findByEmail(usuario) || findByName(usuario)) : findByEmail(usuario);
    if(!p || p.clave !== clave){
      errEl.textContent = 'Usuario o Clave incorrectos.';
      errEl.style.display='block';
      return;
    }
    errEl.style.display='none';

    // v6.4 — Si esta persona ya está entrando desde el MISMO dispositivo
    // donde creó/editó su quiniela por última vez (lo normal, la inmensa
    // mayoría de las veces), su sesión anónima actual ya coincide con
    // p.ownerUid y no hace falta tocar Firestore para nada: seguimos de
    // inmediato, igual de rápido que antes de este cambio.
    //
    // Si entra desde un dispositivo NUEVO (otro navegador, celular
    // distinto, borró cookies...), su sesión anónima actual es distinta
    // a la que quedó guardada como dueña — como ya demostró conocer el
    // nombre/correo Y la clave correctos, "reclamamos" el documento para
    // este dispositivo (rgClaimOwnership), lo cual SÍ requiere una ida y
    // vuelta real a Firestore, así que deshabilitamos el botón mientras
    // se resuelve para evitar doble clic.
    const currentUid = window.__fb && window.__fb.auth && window.__fb.auth.currentUser
      ? window.__fb.auth.currentUser.uid : null;

    const continuar = ()=>{
      // v1.0 — Entró (por nombre, normalmente) y todavía no tiene correo
      // registrado: pantalla obligatoria antes de dejarlo seguir.
      if(!p.email || !p.email.trim()){
        MIGRAR_PID = p.id;
        INICIO_VIEW = 'migrar_correo';
        render();
        return;
      }
      enterWizardAs(p);
      render();
    };

    if(!currentUid){
      errEl.textContent = 'Todavía estamos preparando tu sesión — espera un segundo y vuelve a intentar.';
      errEl.style.display='block';
      return;
    }

    if(p.ownerUid === currentUid){
      continuar(); // ya somos el dueño en este dispositivo, no hace falta reclamar nada
      return;
    }

    btn.disabled = true; btn.textContent = 'Entrando...';
    rgClaimOwnership(p.id, currentUid, p.clave)
      .then(()=>{
        p.ownerUid = currentUid; // refleja el cambio de inmediato en memoria, sin esperar el eco de Firestore
        btn.disabled = false; btn.textContent = 'Entrar';
        continuar();
      })
      .catch(()=>{
        btn.disabled = false; btn.textContent = 'Entrar';
        errEl.textContent = 'No se pudo verificar tu acceso en este dispositivo. Revisa tu conexión e intenta de nuevo.';
        errEl.style.display='block';
      });
  });
}

/* ---- Sub-vista OBLIGATORIA: capturar correo al migrar desde login por
   nombre. No tiene atajo para saltársela; solo "Volver" cancela el
   intento de entrar (no se guarda nada hasta enviar el formulario). ---- */
function renderMigrarCorreo(c){
  const p = DB.participants.find(x=>x.id===MIGRAR_PID);
  if(!p){ MIGRAR_PID=null; INICIO_VIEW='choice'; render(); return; }
  c.innerHTML = `
    <button class="rg-btn rg-btn-ghost" id="migrar_back" style="margin-bottom:.75rem">← Volver</button>
    <div class="card">
      <div class="card-title">📧 Necesitamos actualizar tu información</div>
      <div class="note">Antes de continuar necesitamos registrar tu correo electrónico para futuras comunicaciones y recuperación de acceso.</div>
      <div class="field">
        <label>Correo electrónico</label>
        <input id="mc_email" type="email" placeholder="correo@ejemplo.com" autocomplete="off">
      </div>
      <div class="field">
        <label>Confirmar correo electrónico</label>
        <input id="mc_email2" type="email" placeholder="correo@ejemplo.com" autocomplete="off">
      </div>
      <div id="mc_err" class="err" style="display:none"></div>
      <div class="rg-btn-row">
        <button class="rg-btn rg-btn-primary rg-btn-block" id="mc_submit">Guardar y continuar</button>
      </div>
    </div>
  `;
  document.getElementById('migrar_back').addEventListener('click', ()=>{
    MIGRAR_PID = null;
    INICIO_VIEW = 'choice';
    render();
  });
  document.getElementById('mc_submit').addEventListener('click', ()=>{
    const email = document.getElementById('mc_email').value.trim();
    const email2 = document.getElementById('mc_email2').value.trim();
    const errEl = document.getElementById('mc_err');
    const fail = (msg)=>{ errEl.textContent = msg; errEl.style.display='block'; };
    errEl.style.display='none';
    if(!email) return fail('El correo electrónico es obligatorio.');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('El correo electrónico no parece válido.');
    if(!email2) return fail('Debes confirmar tu correo electrónico.');
    if(email.toLowerCase() !== email2.toLowerCase()) return fail('Los dos correos electrónicos no coinciden.');
    const dup = findByEmail(email);
    if(dup && dup.id!==p.id) return fail('Ese correo ya está registrado por otro participante.');

    p.email = email;
    p.migrado = true;
    p.fechaActualizacion = Date.now();
    saveData(DB);
    toast('¡Listo! Tu correo quedó registrado.');
    MIGRAR_PID = null;
    enterWizardAs(p);
    render();
  });
}

/* ════════════════════════════════════════
   FORMULARIO DE QUINIELA (compartido por Registro y Editar)
   ════════════════════════════════════════ */
/* ════════════════════════════════════════
   RENDER — bracket dinámico, preguntas especiales y estado de avance
   ════════════════════════════════════════ */

function renderKoRow(slot, teamA, teamB, preds, readOnly){
  if(!teamA || !teamB){
    return `<div class="match-row muted" style="opacity:.55">
        <div class="team"><span class="nm">${teamA?esc(teamA):'Pendiente'}</span></div>
        <span class="vs-sep">vs</span>
        <div class="team" style="justify-content:flex-end;text-align:right"><span class="nm">${teamB?esc(teamB):'Pendiente'}</span></div>
      </div>`;
  }
  const raw = preds[slot];
  const v = (raw && raw._a===teamA && raw._b===teamB) ? raw : null;
  const h = v && Number.isInteger(v.h) ? v.h : '';
  const a = v && Number.isInteger(v.a) ? v.a : '';
  const tied = v && Number.isInteger(v.h) && Number.isInteger(v.a) && v.h===v.a;
  const pick = v && v.pick;

  if(readOnly){
    const scoreTxt = (h!==''&&a!=='') ? `${h} : ${a}` : '— : —';
    const pickTxt = tied ? (pick ? `Avanza por penales: ${flagOf(pick)} ${esc(pick)}` : 'Empate sin definir quién avanza') : '';
    return `<div class="match-row">
        <div class="team"><span>${flagOf(teamA)}</span><span class="nm ro-text">${esc(teamA)}</span></div>
        <div class="ro-score">${scoreTxt}</div>
        <div class="team" style="justify-content:flex-end;text-align:right"><span class="nm ro-text">${esc(teamB)}</span><span>${flagOf(teamB)}</span></div>
      </div>${pickTxt?`<div class="field-hint" style="margin:-4px 0 8px">${pickTxt}</div>`:''}`;
  }

  let html = `<div class="match-row">
      <div class="team"><span>${flagOf(teamA)}</span><span class="nm">${esc(teamA)}</span></div>
      <input type="number" min="0" max="20" class="score-input" data-slot="${esc(slot)}" data-side="h" data-a="${esc(teamA)}" data-b="${esc(teamB)}" value="${h}">
      <span class="vs-sep">:</span>
      <input type="number" min="0" max="20" class="score-input" data-slot="${esc(slot)}" data-side="a" data-a="${esc(teamA)}" data-b="${esc(teamB)}" value="${a}">
      <div class="team" style="justify-content:flex-end;text-align:right"><span class="nm">${esc(teamB)}</span><span>${flagOf(teamB)}</span></div>
    </div>`;
  // v0.6 — el pick-row SIEMPRE se imprime en el DOM (oculto con display:none
  // si no hay empate). Así el listener de 'input' puede mostrarlo/ocultarlo
  // al instante con un simple toggle de estilo, sin re-renderizar todo el
  // paso (lo cual le haría perder el foco al campo que se está escribiendo).
  html += `<div class="pick-row" id="pickrow_${esc(slot)}" style="padding-top:0;display:${tied?'block':'none'}">
      <div class="pick-label">Empate — ¿quién avanza? (penales)</div>
      <div class="pick-btns">
        <button class="pick-btn ko-pick ${pick===teamA?'sel':''}" data-slot="${esc(slot)}" data-a="${esc(teamA)}" data-b="${esc(teamB)}" data-team="${esc(teamA)}">${flagOf(teamA)} ${esc(teamA)}</button>
        <button class="pick-btn ko-pick ${pick===teamB?'sel':''}" data-slot="${esc(slot)}" data-a="${esc(teamA)}" data-b="${esc(teamB)}" data-team="${esc(teamB)}">${flagOf(teamB)} ${esc(teamB)}</button>
      </div>
    </div>`;
  return html;
}

function groupRowHtml(m, preds, readOnly){
  const v = preds[m.id] || {};
  const h = (v.h===0||v.h>0) ? v.h : '';
  const a = (v.a===0||v.a>0) ? v.a : '';
  if(readOnly){
    const scoreTxt = (h!==''&&a!=='') ? `${h} : ${a}` : '— : —';
    return `<div class="match-row">
        <div class="team"><span>${flagOf(m.a)}</span><span class="nm ro-text">${esc(m.a)}</span></div>
        <div class="ro-score">${scoreTxt}</div>
        <div class="team" style="justify-content:flex-end;text-align:right"><span class="nm ro-text">${esc(m.b)}</span><span>${flagOf(m.b)}</span></div>
      </div>`;
  }
  return `<div class="match-row">
      <div class="team"><span>${flagOf(m.a)}</span><span class="nm">${esc(m.a)}</span></div>
      <input type="number" min="0" max="20" class="score-input" data-mid="${m.id}" data-side="h" value="${h}">
      <span class="vs-sep">:</span>
      <input type="number" min="0" max="20" class="score-input" data-mid="${m.id}" data-side="a" value="${a}">
      <div class="team" style="justify-content:flex-end;text-align:right"><span class="nm">${esc(m.b)}</span><span>${flagOf(m.b)}</span></div>
    </div>`;
}

function buildStatusCard(pid){
  const st = getCompletionStatus(pid);
  const rows = st.phases.map(ph=>{
    const ok = ph.done===ph.total;
    return `<div class="status-row">
        <span>${ok?'✅':'▫️'} ${esc(ph.label)}</span>
        <span class="badge ${ok?'badge-green':'badge-muted'}">${ph.done}/${ph.total}</span>
      </div>`;
  }).join('');
  const pct = Math.round((st.totalDone/st.totalAll)*100);
  const firstMissing = st.phases.find(ph=>ph.done<ph.total);
  const missing = st.phases.filter(ph=>ph.done<ph.total).map(ph=>`${ph.label} (faltan ${ph.total-ph.done})`);
  const gotoIdx = firstMissing ? WIZARD_STEPS.findIndex(s=>s.key===firstMissing.key) : -1;
  return `<div class="card">
      <div class="card-title">📋 Estado de tu quiniela <span class="badge ${st.complete?'badge-green':'badge-yellow'}">${pct}%</span></div>
      ${rows}
      ${missing.length
        ? `<div class="note" style="margin-top:.75rem">Falta completar: ${esc(missing.join(' · '))}.
            <button class="rg-btn rg-btn-gold" id="status_goto_pending" data-idx="${gotoIdx}" style="margin-top:.5rem;font-size:11.5px;padding:6px 12px;display:block">📍 Ir al pendiente</button></div>`
        : `<div class="note" style="margin-top:.75rem;border-color:var(--qb-green);color:var(--qb-green)">¡Tu quiniela está 100% completa!</div>`}
    </div>`;
}

/* ════════════════════════════════════════
   DASHBOARD DEL PARTICIPANTE (post-bloqueo) — v6.3, Fase 1
   Una vez que la quiniela queda bloqueada (enviada, o cerrado el plazo
   global — ver isLocked()), el participante ya no entra al wizard de
   edición: cae acá directo (ver el hook en renderInicio()). Reemplaza
   el viejo aterrizaje en el paso "Revisión final".

   4 sub-pestañas internas, mismo patrón visual .inner-tabs/.inner-tab
   que ya usan Predicciones/Estadísticas en el panel admin (app.js):
     - Mi Perfil      (Fase 1 — esta entrega)
     - Fase de Grupos (Fase 2 — pendiente)
     - Eliminatoria   (Fase 3 — pendiente)
     - Avanzado       (Fase 4 — pendiente; sin el bloque de resultados
                        reales que sí ve el admin en renderAdv())

   Reusa los cálculos de puntuación de app.js (calcPts/calcAdv/
   calcElimPts/calcBonos/getRank/sc/getRealElimTeams/elimPred) en vez de
   duplicarlos — son funciones globales porque app.js carga antes que
   este archivo (mismo patrón que ya se usa con toast()/isAdmin()).
   ════════════════════════════════════════ */
const DASH_TABS = [
  {key:'perfil',       label:'Mi Perfil',     icon:'👤'},
  {key:'predicciones', label:'Predicciones',  icon:'📝'},
  {key:'evolucion',    label:'Evolución',     icon:'📈'},
];

function renderParticipantDashboard(pid){
  const p = DB.participants.find(x=>x.id===pid);
  if(!p){ clearDraft(); render(); return; }
  const c = document.getElementById('rg-content');

  const previewBanner = PREVIEW_AS_PARTICIPANT
    ? `<div class="note" style="border-color:var(--qb-blue);color:var(--qb-blue);margin-bottom:.875rem">👁️ Vista previa de administrador — esto es exactamente lo que vería <b>${esc(p.name)}</b> al entrar con su correo y su Clave.</div>`
    : '';

  const tabsHtml = DASH_TABS.map(t=>
    `<button class="inner-tab ${DASH_TAB===t.key?'on':''}" data-dtab="${t.key}">${t.icon} ${esc(t.label)}</button>`
  ).join('');

  const activeLabel = (DASH_TABS.find(t=>t.key===DASH_TAB)||DASH_TABS[0]).label;
  const bodyHtml = DASH_TAB==='perfil' ? buildDashPerfilHtml(p)
    : DASH_TAB==='predicciones' ? buildDashPrediccionesHtml(p)
    : DASH_TAB==='evolucion' ? buildDashComingSoonHtml('Evolución') // v6.6 — Fase B
    : buildDashComingSoonHtml(activeLabel);

  c.innerHTML = `
    ${previewBanner}
    <div class="inner-tabs" id="dash-tabs">${tabsHtml}</div>
    <div id="dash-content">${bodyHtml}</div>
  `;

  document.getElementById('dash-tabs').addEventListener('click', e=>{
    const b = e.target.closest('.inner-tab'); if(!b) return;
    DASH_TAB = b.dataset.dtab;
    renderParticipantDashboard(pid);
  });
  // v6.6 — sub-navegación interna de "Predicciones" (Fase de Grupos / Eliminatoria / Avanzado).
  // Mismo patrón que #dash-tabs: cada clic vuelve a pintar el dashboard completo.
  document.getElementById('dash-pred-subtabs')?.addEventListener('click', e=>{
    const b = e.target.closest('.inner-tab'); if(!b) return;
    DASH_PRED_SUBTAB = b.dataset.predsub;
    renderParticipantDashboard(pid);
  });
  document.getElementById('dash_pdf_btn')?.addEventListener('click', ()=> generarPDF(p));
}

// ── Predicciones — agrupa Fase de Grupos / Eliminatoria / Avanzado bajo
// una sola pestaña del dashboard, con su propia sub-navegación (v6.6).
// Reusa las 3 funciones de build ya existentes, sin duplicar nada.
function buildDashPrediccionesHtml(p){
  const subtabs = [
    {key:'grupos',   label:'Fase de Grupos', icon:'⚽'},
    {key:'elim',     label:'Eliminatoria',   icon:'🏆'},
    {key:'avanzado', label:'Avanzado',       icon:'⭐'},
  ];
  const tabsHtml = subtabs.map(t=>
    `<button class="inner-tab ${DASH_PRED_SUBTAB===t.key?'on':''}" data-predsub="${t.key}">${t.icon} ${esc(t.label)}</button>`
  ).join('');
  const body = DASH_PRED_SUBTAB==='elim' ? buildDashElimHtml(p)
    : DASH_PRED_SUBTAB==='avanzado' ? buildDashAvanzadoHtml(p)
    : buildDashGruposHtml(p);
  return `
    <div class="inner-tabs" id="dash-pred-subtabs" style="margin-bottom:.75rem">${tabsHtml}</div>
    <div id="dash-pred-subcontent">${body}</div>
  `;
}

// ── Copys divertidos de Mi Perfil — v6.6 ──
// Tono según posición en el ranking: top 25% ("bien"), último lugar
// exacto ("ultimo"), y todo lo demás en medio ("regular"). Si hay 2+
// frases por categoría, se elige una al azar en cada render para que no
// se sienta repetitivo. No se muestra nada si todavía no hay ranking
// (pos/outOf inválidos) — evita un mensaje sin sentido antes de que
// arranque el torneo.
const MORALE_COPYS = {
  bien: [
    { emoji:'🔥', html:'Tu quiniela está tan encendida<br>que ya le están haciendo antidoping.' },
    { emoji:'🔮', html:'Tu bola de cristal está funcionando.<br>No la actualices.' },
  ],
  regular: [
    { emoji:'🍻', html:'No vas ganando...<br>pero tampoco estás explicando que fue culpa del árbitro.' },
    { emoji:'🍻', html:'La remontada empieza con un acierto.<br>O con tres cervezas.' },
  ],
  ultimo: [
    { emoji:'🪦', html:'Las buenas noticias: todavía no te han eliminado.<br>Las malas: estás usando la tabla al revés.' },
    { emoji:'🤔', html:'Tu quiniela está explorando nuevas formas<br>de interpretar el fútbol.' },
  ],
};
function getMoraleTier(pos, outOf){
  if(!pos || !outOf || outOf<2) return null;
  if(pos===outOf) return 'ultimo';
  const topCut = Math.max(1, Math.round(outOf*0.25));
  return pos<=topCut ? 'bien' : 'regular';
}
function buildMoraleCardHtml(pos, outOf){
  const tier = getMoraleTier(pos, outOf);
  if(!tier) return '';
  const opts = MORALE_COPYS[tier];
  const pick = opts[Math.floor(Math.random()*opts.length)];
  return `
    <div class="card center" style="padding:1rem 1rem .9rem">
      <div style="font-size:26px;margin-bottom:.3rem">${pick.emoji}</div>
      <div style="font-size:13px;color:var(--qb-muted2);line-height:1.55;font-weight:600">${pick.html}</div>
    </div>`;
}

// ── Mi Perfil — estado, código, fecha, próximo partido, puntos y posición ──
function buildDashPerfilHtml(p){
  const st = getCompletionStatus(p.id);
  const pct = Math.round((st.totalDone/st.totalAll)*100);
  const missing = st.phases.filter(ph=>ph.done<ph.total).map(ph=>`${ph.label} (faltan ${ph.total-ph.done})`);

  const stats = getDashStatsInfo(p);
  const posTxt = stats.pos ? `#${stats.pos} de ${stats.outOf}` : '—';
  const moraleHtml = buildMoraleCardHtml(stats.pos, stats.outOf);

  const next = getNextPendingMatchInfo(p);
  const nextBody = next
    ? `<div class="status-row"><span>${next.live ? '🔴 En vivo ahora' : esc(fmtMatchTime(next.ts))}</span><span class="ro-text">${esc(next.lbl)}</span></div>
       <div class="status-row"><span>Tu predicción</span><span class="badge badge-muted">${esc(next.predStr)}</span></div>`
    : `<div class="muted" style="padding:.5rem 0">No quedan más partidos pendientes en el calendario.</div>`;

  return `
    ${moraleHtml}
    <div class="card">
      <div class="card-title">🏅 Tu quiniela <span class="badge badge-green">${stats.total} pts</span></div>
      <div class="status-row"><span>Posición en el ranking</span><span class="ro-text">${esc(posTxt)}</span></div>
      <div class="status-row"><span>Código de participante</span><span class="ro-text">${esc(p.codigo)}</span></div>
      <div class="status-row"><span>Última actualización</span><span class="ro-text">${esc(fmtDate(p.fechaActualizacion))}</span></div>
    </div>

    <div class="card">
      <div class="card-title">⏰ Próximo partido</div>
      ${nextBody}
    </div>

    <div class="card">
      <div class="card-title">📋 Estado de tu quiniela <span class="badge ${st.complete?'badge-green':'badge-yellow'}">${pct}%</span></div>
      ${st.phases.map(ph=>{
        const ok = ph.done===ph.total;
        return `<div class="status-row"><span>${ok?'✅':'▫️'} ${esc(ph.label)}</span><span class="badge ${ok?'badge-green':'badge-muted'}">${ph.done}/${ph.total}</span></div>`;
      }).join('')}
      ${missing.length
        ? `<div class="note" style="margin-top:.75rem">Quedó sin completar: ${esc(missing.join(' · '))}.</div>`
        : ''}
    </div>

    <div class="rg-btn-row" style="margin-top:.75rem">
      <button class="rg-btn rg-btn-gold" id="dash_pdf_btn">📄 Descargar mi quiniela (PDF)</button>
    </div>
  `;
}

function buildDashComingSoonHtml(label){
  return `<div class="card center" style="padding:2rem 1rem">
      <div style="font-size:32px;margin-bottom:.5rem">🚧</div>
      <div class="card-title" style="justify-content:center">${esc(label)}</div>
      <div class="muted">Esta sección llega en la próxima fase.</div>
    </div>`;
}

// ── Fase de Grupos (graded) — v6.3, Fase 2 ──
// Mismo markup/clases que renderPred() en app.js (.pc/.pg2/.pm/.pmn, son
// clases globales, no scoped a #t-pred) para que se vea "igual" a lo que
// ve el admin — pero fijo a este participante (sin selector psel) y sin
// nada editable. Única diferencia a propósito: si falta una predicción
// (caso Miguel) NO se oculta la tarjeta como hace renderPred() — se
// muestra explícitamente "Sin predicción" en vez de desaparecer, para
// que sea obvio qué quedó incompleto.
function buildDashGruposHtml(p){
  const name = p.name;
  const pts = calcPts(name);

  const cards = MIDS.map(mid=>{
    const lbl = MD[mid]?.lbl || `Partido ${mid}`;
    const partes = lbl.split(' vs ');
    const hS = (partes[0]||'').trim();
    const aS = (partes[1]||'').trim();
    const pBadge = `<span style="font-size:8px;padding:1px 4px;border-radius:4px;background:var(--qb-surface);border:1px solid var(--qb-border);color:var(--qb-muted)">P${mid}</span>`;
    const pred = MD[mid]?.preds?.[name];
    const s = sc(mid);
    const played = !!s;

    if(!pred){
      return `<div class="pm" style="border:1px dashed var(--qb-border2);opacity:.75">
        <div class="pmn">${esc(hS)} vs ${esc(aS)} ${pBadge}</div>
        <div style="font-size:11px;color:var(--qb-muted)">Sin predicción${played?` · real ${s.h}–${s.a}`:''}</div>
      </div>`;
    }

    let pts2=0, hit=false;
    if(played){
      const rR = s.h>s.a?'H':s.h<s.a?'A':'D';
      const pR = pred.h>pred.a?'H':pred.h<pred.a?'A':'D';
      if(rR===pR){ pts2 += rR==='D'?3:2; hit=true; if(pred.h===s.h && pred.a===s.a) pts2+=3; }
    }
    const bdr = played ? (hit?'border:1px solid rgba(0,200,83,.5)':'border:1px solid rgba(212,0,26,.5)') : '';

    return `<div class="pm" style="${bdr}">
      <div class="pmn">${esc(hS)} vs ${esc(aS)} ${pBadge}${played?`<span style="float:right;font-family:var(--ff-display);font-size:10px;font-weight:700;color:${hit?'#4dde8c':'#ff8080'}">${pts2>0?'+'+pts2:''}</span>`:''}</div>
      <div style="display:flex;align-items:center;gap:4px">
        <span style="font-family:var(--ff-display);font-size:16px;font-weight:800;color:var(--qb-text);background:var(--qb-surface2);border:1px solid var(--qb-border2);border-radius:4px;padding:2px 7px;min-width:26px;text-align:center">${pred.h}</span>
        <span style="font-size:10px;color:var(--qb-muted)">–</span>
        <span style="font-family:var(--ff-display);font-size:16px;font-weight:800;color:var(--qb-text);background:var(--qb-surface2);border:1px solid var(--qb-border2);border-radius:4px;padding:2px 7px;min-width:26px;text-align:center">${pred.a}</span>
        ${played?`<span style="font-family:var(--ff-display);font-size:10px;font-weight:700;color:var(--qb-muted2);margin-left:3px;padding:2px 5px;border-radius:3px;background:var(--qb-surface3);border:1px solid var(--qb-border)">${s.h}–${s.a}</span>`:''}
      </div>
    </div>`;
  }).join('');

  return `
    <div class="ib" style="margin-bottom:.75rem">Verde = acertaste · Rojo = fallaste · Número = puntos del partido</div>
    <div class="pc">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.625rem">
        <span style="font-weight:700;font-size:13px;color:var(--qb-text)">⚽ Fase de Grupos</span>
        <span class="pill pb">${pts} pts</span>
      </div>
      <div class="pg2">${cards}</div>
    </div>`;
}

// ── Eliminatoria (graded) — v6.3, Fase 3 ──
// Mismo markup y mismos cálculos que renderBracket() en app.js
// (.brkt-summary/.bsum-item/.brkt-round/.brkt-round-title son clases
// globales, no scoped a #t-pred), fijo a este participante, sin selector
// (bsel) ni nada editable. La llave/cruce SIEMPRE se muestra con lo que
// el participante predijo (predTeams/predScore vía getElimTeams/elimPred),
// igual que en el admin — si su bracket se desvió de la realidad, abajo
// aparece el bloque "Real: ..." comparando contra lo que pasó de verdad.
function buildDashElimHtml(p){
  const name = p.name;

  let llaveOk=0, llaveTot=0, totalPts=0, partJugados=0, cruceOk=0;
  for(let pid=73; pid<=104; pid++){
    const scE = S.elimScores[pid]; if(!scE) continue;
    partJugados++; llaveTot++;
    if(isLlaveCorrecta(name,pid)) llaveOk++;
    else if(findCruceValido(name,pid)) cruceOk++;
    totalPts += calcElimMatchPts(name,pid);
  }
  const llavePtsTotal = (llaveOk+cruceOk)*2;
  let classifiedTotal = 0;
  BONUS_PHASES.forEach(ph=>{ if(ph.elimPhase) classifiedTotal += calcClassifiedPtsForPhase(name,ph); });

  let html = `<div class="brkt-summary">
    <div class="bsum-item"><div class="bsum-val">${totalPts}</div><div class="bsum-lbl">pts resultado</div></div>
    <div class="bsum-item"><div class="bsum-val" style="color:#6ab8f7">${llavePtsTotal}</div><div class="bsum-lbl">pts llaves</div></div>
    <div class="bsum-item"><div class="bsum-val" style="color:#4dde8c">${classifiedTotal}</div><div class="bsum-lbl">pts clasif.</div></div>
    <div class="bsum-item"><div class="bsum-val">${llaveOk}/${llaveTot}${cruceOk?` <span style="color:#6ab8f7;font-size:10px">(+${cruceOk} 🔀)</span>`:""}</div><div class="bsum-lbl">llaves ✓</div></div>
    <div class="bsum-item"><div class="bsum-val">${partJugados}/32</div><div class="bsum-lbl">jugados</div></div>
  </div>`;

  html += `<div style="display:flex;gap:8px;flex-wrap:wrap;font-size:10px;color:var(--qb-muted);margin-bottom:.625rem;padding:5px 9px;background:var(--qb-surface);border:1px solid var(--qb-border);border-radius:6px">
    <span><span style="display:inline-block;width:10px;height:10px;background:rgba(0,200,83,.1);border:1px solid rgba(0,200,83,.4);border-radius:2px;margin-right:3px"></span>Llave + resultado ✓</span>
    <span><span style="display:inline-block;width:10px;height:10px;background:rgba(245,166,35,.1);border:1px solid rgba(245,166,35,.4);border-radius:2px;margin-right:3px"></span>Llave ✓ resultado ✗</span>
    <span><span style="display:inline-block;width:10px;height:10px;background:rgba(106,184,247,.1);border:1px solid rgba(106,184,247,.4);border-radius:2px;margin-right:3px"></span>🔀 Cruce válido (mismo cruce, otra llave de la ronda)</span>
    <span><span style="display:inline-block;width:10px;height:10px;background:rgba(212,0,26,.1);border:1px solid rgba(212,0,26,.4);border-radius:2px;margin-right:3px"></span>Llave ✗</span>
    <span>⭐ = puntos de clasificado (en vivo, al cerrar la fase previa)</span>
  </div>`;

  ELIM_ROUNDS.forEach(round=>{
    html += `<div class="brkt-round"><div class="brkt-round-title">${round.lbl}</div>`;
    round.ids.forEach(pid=>{
      const predTeams = getElimTeams(name,pid);
      const predScore = elimPred(name,pid);
      const realTeams = getRealElimTeams(pid);
      const scE = S.elimScores[pid];

      const played = !!scE;
      const llave = isLlaveCorrecta(name,pid);
      const pts = calcElimMatchPts(name,pid);
      const cruce = !llave ? findCruceValido(name,pid) : null;
      const breakdown = calcElimMatchBreakdown(name,pid);

      const pH = predTeams ? predTeams.h : "⏳ Por resolver";
      const pA = predTeams ? predTeams.a : "⏳ Por resolver";
      const pScoreStr = predScore ? `${predScore.h}–${predScore.a}` : "?–?";

      const rH = realTeams ? realTeams.h : null;
      const rA = realTeams ? realTeams.a : null;
      const rScoreStr = scE ? `${scE.h}–${scE.a}` : null;

      let rowBg, borderCol;
      if(!played){ rowBg="var(--qb-surface)"; borderCol="var(--qb-border)"; }
      else if(llave && pts>0){ rowBg="rgba(0,200,83,.07)"; borderCol="rgba(0,200,83,.4)"; }
      else if(llave && pts===0){ rowBg="rgba(245,166,35,.07)"; borderCol="rgba(245,166,35,.4)"; }
      else if(cruce && pts>0){ rowBg="rgba(106,184,247,.08)"; borderCol="rgba(106,184,247,.45)"; }
      else{ rowBg="rgba(212,0,26,.07)"; borderCol="rgba(212,0,26,.4)"; }

      let badge;
      if(!played && !realTeams){ badge=`<span style="font-size:9px;color:var(--qb-muted)">⏳</span>`; }
      else if(!played && realTeams){ badge=`<span style="font-size:9px;color:var(--qb-yellow)">📅 sin result.</span>`; }
      else if(cruce){
        const tip=`Cruce válido: ${pH} vs ${pA} se enfrentaron realmente en P${cruce.pidReal} (misma ronda). Se reconoce el acierto aunque no quedó en tu llave exacta.`.replace(/"/g,"&quot;");
        badge=`<span title="${tip}" style="font-size:9px;color:#6ab8f7;font-weight:700;cursor:help">🔀 Cruce ${pts>0?`+${pts}pts`:""}</span>`;
      }
      else if(!llave){ badge=`<span style="font-size:9px;color:#ff8080;font-weight:600">✗ llave</span>`; }
      else if(pts>0){ badge=`<span style="font-size:9px;color:#4dde8c;font-weight:700">+${pts}pts</span>`; }
      else{ badge=`<span style="font-size:9px;color:var(--qb-yellow);font-weight:600">llave ✓</span>`; }

      let realBlock="";
      if(realTeams && (!predTeams || n(predTeams.h)!==n(realTeams.h) || n(predTeams.a)!==n(realTeams.a))){
        realBlock=`<div style="font-size:9px;color:var(--qb-muted);margin-top:2px;padding-top:2px;border-top:1px dashed var(--qb-border)">
          Real: <span style="color:var(--qb-text)">${rH}</span> vs <span style="color:var(--qb-text)">${rA}</span>
          ${rScoreStr?`· <strong style="color:var(--qb-text)">${rScoreStr}</strong>`:""}
        </div>`;
      } else if(realTeams && rScoreStr){
        realBlock=`<div style="font-size:9px;color:var(--qb-muted);margin-top:2px">Resultado real: <strong style="color:var(--qb-text)">${rScoreStr}</strong></div>`;
      }

      let breakdownBlock="";
      if(breakdown.length){
        const parts=breakdown.map(it=>`${it.pts}pts ${it.label}`).join(" + ");
        breakdownBlock=`<div style="font-size:9px;color:var(--qb-muted2);margin-top:2px">${parts} = <strong style="color:var(--qb-text)">+${pts}pts</strong></div>`;
      }

      const clsBadge = getClassifiedBadgeForPid(name,pid);
      let clsBlock="";
      if(clsBadge){
        const nextRoundName = {
          "r16":"Octavos","r8":"Cuartos","qf":"Semifinales","sf":"Final","final":"Campeón","third":"3er lugar"
        }[phaseForPid(pid)?.key] || "siguiente ronda";
        if(clsBadge.advanced){
          clsBlock=`<div style="display:flex;align-items:center;gap:5px;margin-top:5px;padding:4px 7px;background:rgba(0,200,83,.08);border:1px solid rgba(0,200,83,.3);border-radius:6px">
            <span style="font-size:13px">${clsBadge.flag}</span>
            <div style="flex:1;min-width:0">
              <span style="font-size:10px;font-weight:700;color:var(--qb-text)">${clsBadge.team}</span>
              <span style="font-size:9px;color:#4dde8c;margin-left:3px">clasificó a ${nextRoundName} ✓</span>
            </div>
            <span style="font-size:11px;font-weight:800;color:#4dde8c;white-space:nowrap">+${clsBadge.pts}pts</span>
          </div>`;
        } else {
          clsBlock=`<div style="display:flex;align-items:center;gap:5px;margin-top:5px;padding:4px 7px;background:rgba(212,0,26,.06);border:1px solid rgba(212,0,26,.2);border-radius:6px">
            <span style="font-size:13px">${clsBadge.flag}</span>
            <div style="flex:1;min-width:0">
              <span style="font-size:10px;font-weight:700;color:var(--qb-text)">${clsBadge.team}</span>
              <span style="font-size:9px;color:#ff8080;margin-left:3px">no clasificó ✗</span>
            </div>
            <span style="font-size:11px;font-weight:800;color:#ff8080;white-space:nowrap">0pts</span>
          </div>`;
        }
      }

      html += `<div style="display:grid;grid-template-columns:1fr auto;align-items:start;gap:6px;padding:7px 9px;border:1px solid ${borderCol};border-radius:8px;margin-bottom:5px;background:${rowBg}">
        <div>
          <div style="display:flex;align-items:center;gap:5px;margin-bottom:1px">
            <span style="font-size:11px;font-weight:600;color:var(--qb-text)">${pH}</span>
            <span style="font-size:10px;color:var(--qb-muted)">vs</span>
            <span style="font-size:11px;font-weight:600;color:var(--qb-text)">${pA}</span>
          </div>
          <div style="font-size:10px;color:var(--qb-muted)">Predicción: <strong style="color:var(--qb-muted2)">${pScoreStr}</strong> · P${pid}</div>
          ${realBlock}
          ${breakdownBlock}
          ${clsBlock}
        </div>
        <div style="font-size:10px;color:var(--qb-muted);text-align:center;padding-top:2px">${badge}</div>
      </div>`;
    });
    html += "</div>";
  });

  return html;
}

// ── Avanzado (graded, SIN el bloque de resultados reales) — v6.3, Fase 4 ──
// Mismo cálculo y mismo markup de specItems/specHtml que renderAdv() en
// app.js, reusando calcAdv()/getDynamicSpec() tal cual (cero lógica de
// puntuación duplicada) — pero a propósito SIN el bloque "ri" (resultados
// reales del torneo, editable: campeón/goleador/etc.) que sí ve el admin.
// Acá el participante solo ve SUS predicciones y cuánto le rindieron.
function buildDashAvanzadoHtml(p){
  const name = p.name;
  const r = S.reality;
  const ap = calcAdv(name);
  const spec = getDynamicSpec(name) || {};

  const scorerMatch = n(spec.scorer||'') && n(r.topScorer) && n(spec.scorer)===n(r.topScorer);
  const countryMatch = n(spec.topCountry||'') && n(r.topCountry) && n(spec.topCountry)===n(r.topCountry);

  const specItems = [
    {l:"🥇 Campeón",                       val:spec.champ,          pts:15, real:r.champ,            locked:false},
    {l:"🥈 Subcampeón",                     val:spec.runner,         pts:10, real:r.runner,           locked:false},
    {l:"🥉 3er lugar",                      val:spec.third,          pts:8,  real:r.third,            locked:false},
    {l:"⚽ Goleador del torneo",             val:spec.scorer,         pts:12, real:r.topScorer,        locked:false},
    {l:"⚽ Goles del goleador",              val:spec.scorerGoals,    pts:8,  real:r.topScorerGoals,   locked:!scorerMatch,  lockReason:"requiere acertar el goleador"},
    {l:"🌍 País más goleador",              val:spec.topCountry,     pts:8,  real:r.topCountry,       locked:false},
    {l:"🌍 Goles de ese país",              val:spec.topCountryGoals,pts:10, real:r.topCountryGoals,  locked:!countryMatch, lockReason:"requiere acertar el país"},
    {l:"😬 País más goleado (1 juego)",      val:spec.mostConceded,   pts:8,  real:r.mostConceded,     locked:false},
  ];

  const specHtml = specItems.map(it=>{
    const matched = !it.locked && it.real && n(String(it.val||'')) === n(String(it.real));
    const hasReal = !!it.real;
    let bg, bc;
    if(it.locked && hasReal){ bg="var(--qb-surface2)"; bc="var(--qb-border)"; }
    else if(hasReal && matched){ bg="rgba(0,200,83,.07)"; bc="rgba(0,200,83,.4)"; }
    else if(hasReal && !matched){ bg="rgba(212,0,26,.07)"; bc="rgba(212,0,26,.4)"; }
    else{ bg="var(--qb-surface2)"; bc="var(--qb-border)"; }
    let badge;
    if(it.locked && hasReal){
      badge = `<span style="font-size:9px;color:var(--qb-muted);font-style:italic">🔒 ${it.lockReason}</span>`;
    } else if(hasReal){
      badge = matched
        ? `<span style="color:#4dde8c;font-weight:700;font-size:10px">+${it.pts}pts</span>`
        : `<span style="color:#ff8080;font-size:10px">✗ ${esc(String(it.real))}</span>`;
    } else {
      badge = `<span style="color:var(--qb-muted);font-size:10px">⏳</span>`;
    }
    return `<div style="display:flex;align-items:center;gap:8px;padding:6px 9px;border:1px solid ${bc};border-radius:8px;margin-bottom:3px;background:${bg}${it.locked?'opacity:.7;':''}">
      <div style="flex:1;font-size:11px;color:${it.locked?'var(--qb-muted)':'var(--qb-text)'}">${it.l}</div>
      <div style="font-family:var(--ff-display);font-size:14px;font-weight:800;color:${it.locked?'var(--qb-muted)':'var(--qb-text)'}">${esc(String(it.val||'—'))}</div>
      <div style="font-size:10px;min-width:50px;text-align:right">${badge}</div>
    </div>`;
  }).join('');

  return `<div style="border:1px solid var(--qb-border);border-radius:12px;padding:.75rem .875rem;background:var(--qb-surface)">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.625rem">
      <span style="font-weight:700;font-size:13px;color:var(--qb-text)">⭐ Avanzado</span>
      <span class="pill pg">${ap} pts</span>
    </div>
    <div style="margin-bottom:.5rem;font-size:10px;color:var(--qb-muted);letter-spacing:.04em;text-transform:uppercase;font-family:var(--ff-display);font-weight:700">Tus predicciones especiales</div>
    ${specHtml}
  </div>`;
}

// Puntos totales + posición en el ranking público (excluye ocultos, igual
// que ya hace renderRank() para quien no es admin). Si el propio
// participante está oculto (S.hiddenPL), no aparece en esa lista — se
// muestra el total igual, pero sin posición.
function getDashStatsInfo(p){
  const name = p.name;
  const total = calcPts(name) + calcAdv(name) + calcElimPts(name) + calcBonos(name);
  const visibles = getRank().filter(r=>!r.hidden);
  const idx = visibles.findIndex(r=>r.name===name);
  return { total, pos: idx>=0 ? idx+1 : null, outOf: visibles.length };
}

// Siguiente partido REAL (grupos o eliminatoria) que todavía no terminó,
// junto con la predicción que este participante hizo para ese cruce.
// "No terminó" = sin resultado real guardado, o resultado marcado como
// "live" (partido en curso, cuenta como el destacado actual). Si no hay
// ningún partido con hora programada que cumpla esto, devuelve null
// (torneo sin fixture cargado todavía, o ya terminado por completo).
function getNextPendingMatchInfo(p){
  const name = p.name;
  let best = null;

  MIDS.forEach(mid=>{
    const t = S.matchTimes && S.matchTimes[mid]; if(!t) return;
    const ts = new Date(t).getTime(); if(isNaN(ts)) return;
    const real = sc(mid);
    if(real && !real.live) return; // ya jugado y terminado
    if(best && ts >= best.ts) return;
    const pred = MD[mid]?.preds?.[name];
    best = {
      ts, live: !!(real && real.live),
      lbl: MD[mid]?.lbl || `Partido ${mid}`,
      predStr: pred ? `${pred.h}-${pred.a}` : 'Sin predicción'
    };
  });

  for(let pid=73; pid<=104; pid++){
    const t = S.elimTimes && S.elimTimes[pid]; if(!t) continue;
    const ts = new Date(t).getTime(); if(isNaN(ts)) continue;
    const real = S.elimScores[pid] || S.elimScores[String(pid)];
    if(real && !real.live) continue;
    if(best && ts >= best.ts) continue;
    const teams = getRealElimTeams(pid);
    const pred = elimPred(name, pid);
    best = {
      ts, live: !!(real && real.live),
      lbl: teams ? `${teams.h} vs ${teams.a}` : `Eliminatoria #${pid}`,
      predStr: pred ? `${pred.h}-${pred.a}` : 'Sin predicción'
    };
  }
  return best;
}

function fmtMatchTime(ts){
  const d = new Date(ts);
  const dia = d.toLocaleDateString('es',{weekday:'short',day:'2-digit',month:'short'}).replace(/\./g,'');
  const hora = d.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'});
  return `${dia} · ${hora}`;
}

/* ════════════════════════════════════════
   PASOS DEL WIZARD — cada uno tiene variante editable y solo-lectura
   ════════════════════════════════════════ */
// v1.0 — Campos País (buscador con bandera) + Ciudad (sugerencias que
// dependen del país elegido). idPrefix permite reusar este mismo widget
// en el registro inicial ("r") y al editar el paso "Datos personales"
// más adelante ("pp"), sin que choquen los ids.
function buildCountryCityFieldsHtml(idPrefix, country, countryIso, city){
  const cid = `${idPrefix}_country`, ctyid = `${idPrefix}_city`;
  return `
    <div class="row2">
      <div class="field">
        <label>País donde vives</label>
        <div class="combo-wrap">
          <input type="text" id="${cid}" autocomplete="off" placeholder="Escribe para buscar tu país..." value="${esc(country||'')}">
          <input type="hidden" id="${cid}_iso" value="${esc(countryIso||'')}">
          <div class="combo-dropdown" id="${cid}_dd" style="display:none"></div>
        </div>
      </div>
      <div class="field">
        <label>Ciudad</label>
        <input type="text" id="${ctyid}" list="${ctyid}_list" autocomplete="off" placeholder="Escribe tu ciudad..." value="${esc(city||'')}">
        <datalist id="${ctyid}_list"></datalist>
      </div>
    </div>`;
}

function wireCountryCityFields(idPrefix, onChange){
  const cid = `${idPrefix}_country`, ctyid = `${idPrefix}_city`;
  const input = document.getElementById(cid);
  const isoInput = document.getElementById(`${cid}_iso`);
  const dd = document.getElementById(`${cid}_dd`);
  const cityInput = document.getElementById(ctyid);
  const cityList = document.getElementById(`${ctyid}_list`);

  function refreshCityOptions(){
    cityList.innerHTML = getCityOptionsForCountry(isoInput.value).map(c=>`<option value="${esc(c)}"></option>`).join('');
  }
  refreshCityOptions();

  function renderDropdown(){
    const q = foldAccents(norm(input.value));
    const matches = (q ? COUNTRY_LIST.filter(c=>foldAccents(norm(c.name)).includes(q)) : COUNTRY_LIST).slice(0,8);
    dd.innerHTML = matches.length
      ? matches.map(c=>`<div class="combo-option" data-iso="${c.iso}" data-name="${esc(c.name)}">${flagImgByIso(c.iso,13)}<span>${esc(c.name)}</span></div>`).join('')
      : `<div class="combo-empty">No se encontraron países.</div>`;
    dd.style.display = 'block';
    dd.querySelectorAll('.combo-option').forEach(opt=>{
      // mousedown (no click): se dispara ANTES del blur del input, así el
      // dropdown no se cierra solo antes de registrar la elección.
      opt.addEventListener('mousedown', (e)=>{
        e.preventDefault();
        input.value = opt.dataset.name;
        isoInput.value = opt.dataset.iso;
        dd.style.display = 'none';
        refreshCityOptions();
        if(onChange) onChange();
      });
    });
  }

  input.addEventListener('focus', renderDropdown);
  input.addEventListener('input', ()=>{
    isoInput.value = ''; // el ISO queda inválido hasta que se elija de nuevo de la lista
    renderDropdown();
    if(onChange) onChange();
  });
  input.addEventListener('blur', ()=>{ setTimeout(()=>{ dd.style.display='none'; }, 120); });
  cityInput.addEventListener('input', ()=>{ if(onChange) onChange(); });
}

function buildPersonalStepHtml(p, readOnly){
  if(readOnly){
    return `
      <div class="field"><label>Nombre completo</label><div class="ro-text">${esc(p.name)}</div></div>
      <div class="row2">
        <div class="field"><label>País</label><div class="ro-text" style="display:flex;align-items:center;gap:6px">${flagImgByIso(p.countryIso,14)}<span>${esc(p.country)}</span></div></div>
        <div class="field"><label>Ciudad</label><div class="ro-text">${esc(p.city)}</div></div>
      </div>
      <div class="field"><label>Correo electrónico</label><div class="ro-text">${esc(p.email)}</div></div>
      <div class="field-hint">Código: <b>${esc(p.codigo)}</b></div>`;
  }
  return `
    <div class="field"><label>Nombre completo</label><input type="text" class="wiz-input" data-field="name" value="${esc(p.name)}"></div>
    ${buildCountryCityFieldsHtml('pp', p.country, p.countryIso, p.city)}
    <div class="field"><label>Correo electrónico</label><input type="email" class="wiz-input" data-field="email" value="${esc(p.email)}"></div>
    <div class="field-hint">Tu código <b>${esc(p.codigo)}</b> y tu Clave no se cambian aquí.</div>`;
}

function buildGroupsStepHtml(preds, readOnly){
  const groups = {};
  GROUP_MATCHES.forEach(m=>{ (groups[m.g]=groups[m.g]||[]).push(m); });
  return Object.keys(groups).sort().map(g=>{
    const rows = groups[g].map(m=>groupRowHtml(m, preds, readOnly)).join('');
    return `<div class="group-head">Grupo ${g}</div>${rows}`;
  }).join('');
}

function buildKoStepHtml(key, bracket, preds, readOnly){
  if(!bracket.ready){
    const groupsAnswered = GROUP_MATCHES.filter(m=>groupMatchResult(m.id,preds)).length;
    return `<div class="note">Los cruces se calculan automáticamente cuando termines la Fase de grupos. Te faltan <b>${72-groupsAnswered}</b> partido(s) de grupos.</div>`;
  }
  const slots = koSlotsOf(bracket, key);
  let extra = '';
  if(key==='r32'){
    extra = `<div class="note" style="margin-bottom:.75rem">🏅 <b>Clasificados</b> (24 directos + 8 mejores terceros, calculados de tus resultados de grupo):<br><br>` +
      bracket.q.seeded.map(t=>`${flagOf(t)} ${esc(t)}`).join(' &nbsp;·&nbsp; ') + `</div>`;
  }
  const tag = key==='r32' ? `<div class="note" style="margin-top:-.4rem;margin-bottom:.75rem"><span class="badge badge-yellow">cruce simplificado</span> no es el draw oficial de FIFA.</div>` : '';
  return tag + extra + slots.map(m=>renderKoRow(m.slot, m.a, m.b, preds, readOnly)).join('');
}

function buildSpecialStepHtml(preds, readOnly, bracket){
  const sp = preds.special || {};
  const auto = computeAutoSpecial(bracket);
  return SPECIAL_QUESTIONS.map(q=>{
    const isAuto = AUTO_SPECIAL_IDS.includes(q.id);

    if(isAuto){
      // v0.7 (Fase 4): "quemado" — siempre de solo lectura, en todos los
      // casos (editable o no), porque el valor sale del bracket, no de una
      // elección del usuario. Nunca se imprime un <select> para estos 3.
      const val = auto[q.id] || '';
      const hint = q.id==='tercer'
        ? 'Se completa solo, según tu resultado del partido por el Tercer lugar.'
        : 'Se completa solo, según tu resultado de la Final.';
      const tag = `<span class="badge badge-muted" style="margin-left:6px;font-size:9px">auto</span>`;
      if(val){
        return `<div class="field">
            <label>${esc(q.label)}${tag}</label>
            <div class="ro-text" style="display:flex;align-items:center;gap:6px">${flagOf(val)}<span>${esc(val)}</span></div>
            <div class="field-hint">${hint}</div>
          </div>`;
      }
      return `<div class="field">
          <label>${esc(q.label)}${tag}</label>
          <div class="ro-text muted">Pendiente</div>
          <div class="field-hint">${hint}</div>
        </div>`;
    }

    const val = sp[q.id] !== undefined ? sp[q.id] : '';
    if(readOnly){
      if(q.type==='team' && val){
        return `<div class="field"><label>${esc(q.label)}</label><div class="ro-text" style="display:flex;align-items:center;gap:6px">${flagOf(val)}<span>${esc(val)}</span></div></div>`;
      }
      const shown = val;
      return `<div class="field"><label>${esc(q.label)}</label><div class="ro-text">${shown!==''?esc(String(shown)):'—'}</div></div>`;
    }
    if(q.type==='team'){
      // Nota: un <option> nativo solo admite texto (no puede contener <img>),
      // así que aquí se muestra el nombre del equipo sin bandera. La bandera
      // sí aparece en todas las filas visuales (grupos, llaves, PDF, resumen).
      const opts = `<option value="">— elegir equipo —</option>` +
        ALL_TEAMS.map(t=>`<option value="${esc(t)}" ${val===t?'selected':''}>${esc(t)}</option>`).join('');
      return `<div class="field"><label>${esc(q.label)}</label><select class="special-input" data-qid="${q.id}">${opts}</select></div>`;
    }
    if(q.type==='number'){
      return `<div class="field"><label>${esc(q.label)}</label><input type="number" min="0" max="99" class="special-input score-input" style="width:100%;text-align:left" data-qid="${q.id}" value="${val===''?'':val}"></div>`;
    }
    return `<div class="field"><label>${esc(q.label)}</label><input type="text" class="special-input" data-qid="${q.id}" value="${esc(String(val))}" placeholder="${esc(q.placeholder||'')}"></div>`;
  }).join('');
}

function buildReviewSummaryHtml(p, preds, bracket){
  // v6.5 — Antes esta tarjeta repetía, partido por partido, toda la fase
  // de grupos + eliminatoria + preguntas especiales (con sus bullets y
  // "pendiente, vuelve a revisar"). Quedó como una lista enorme justo antes
  // de enviar, que no aportaba nada nuevo (ya se revisó paso a paso en el
  // wizard) y solo generaba fricción. Ahora la confirmación se limita a los
  // datos del participante; buildStatusCard() (arriba) ya resume el avance
  // por fase con su botón "Ir al pendiente" si algo falta.
  return `<div class="card">
      <div class="card-title">👤 Participante</div>
      <div class="status-row"><span>Nombre</span><span class="ro-text">${esc(p.name)}</span></div>
      <div class="status-row"><span>Código</span><span class="ro-text">${esc(p.codigo)}</span></div>
      <div class="status-row"><span>Ciudad / País</span><span class="ro-text">${esc(p.city)}, ${esc(p.country)}</span></div>
      <div class="status-row"><span>Correo</span><span class="ro-text">${esc(p.email)}</span></div>
    </div>`;
}

function buildReviewStepHtml(pid, p, preds, bracket, readOnly){
  const status = getCompletionStatus(pid);
  let html = buildStatusCard(pid) + buildReviewSummaryHtml(p, preds, bracket);

  if(p.estadoQuiniela==='enviada'){
    // v1.0 — Una vez enviada, el botón cambia para siempre a "generar
    // copia": ya no envía ni modifica nada, solo abre el PDF de nuevo.
    html += `<div class="locked-banner">✅ <b>Quiniela enviada</b> el ${fmtDate(p.fechaEnvio)}. Quedó bloqueada para edición. Si necesitas corregir algo, contacta al administrador para que la reabra.</div>
      <div class="rg-btn-row"><button class="rg-btn rg-btn-gold rg-btn-block" id="btn_pdf_copy">📄 Generar copia en PDF de mi Quiniela</button></div>`;
  }else if(readOnly){
    // Cerrado por fecha límite (isGloballyClosed), pero nunca llegó a
    // enviarse oficialmente — distinto del caso "enviada" de arriba.
    html += `<div class="locked-banner" style="border-color:var(--qb-yellow);color:var(--qb-yellow);background:var(--qb-gold-dim)">🔒 Las inscripciones y modificaciones han sido cerradas. Ya no es posible enviar esta quiniela.</div>
      <div class="rg-btn-row"><button class="rg-btn rg-btn-ghost rg-btn-block" id="btn_pdf_copy">📄 Generar PDF de mi Quiniela (sin enviar)</button></div>`;
  }else{
    // v1.0 — Un solo botón principal: "Enviar mi Quiniela y Generar PDF".
    // Antes existían dos botones separados (Enviar / Generar PDF) y eso
    // generaba confusión sobre cuál de los dos "contaba" como el envío
    // real; ahora es una sola acción atómica.
    const missing = status.phases.filter(ph=>ph.done<ph.total).map(ph=>`${ph.label} (faltan ${ph.total-ph.done})`);
    html += `<div class="card">
        <div class="card-title">📨 Enviar mi quiniela</div>
        ${missing.length
          ? `<div class="note">Aún falta: ${esc(missing.join(' · '))}.</div>`
          : `<div class="note" style="border-color:var(--qb-green);color:var(--qb-green)">¡Todo listo para enviar!</div>`}
        <label class="confirm-check">
          <input type="checkbox" id="confirm_check" ${status.complete?'':'disabled'}>
          <span>Confirmo que mis predicciones son correctas y deseo enviarlas.</span>
        </label>
        <button class="rg-btn rg-btn-primary rg-btn-block" id="btn_submit" disabled>📨 Enviar mi Quiniela y Generar PDF</button>
      </div>`;
  }
  return html;
}

function buildStepperHtml(idx){
  const dots = WIZARD_STEPS.map((s,i)=>{
    const cls = i===idx ? 'on' : (i<idx ? 'done' : '');
    return `<div class="step-dot ${cls}" data-step="${i}" title="${esc(s.label)}">${i+1}</div>`;
  }).join('<div class="step-line"></div>');
  return `<div class="stepper">${dots}</div>
    <div class="stepper-label">Paso ${idx+1} de ${WIZARD_STEPS.length}: <b>${WIZARD_STEPS[idx].icon} ${esc(WIZARD_STEPS[idx].label)}</b></div>`;
}

/* ════════════════════════════════════════
   CONTROLADOR DEL WIZARD (sustituye al formulario plano de v0.2)
   ════════════════════════════════════════ */
function renderQuinielaForm(pid, originTab){
  const p = DB.participants.find(x=>x.id===pid);
  if(!p){ clearDraft(); render(); return; }
  const c = document.getElementById('rg-content');
  const readOnly = isLocked(p) && !ADMIN_OVERRIDE;
  const step = WIZARD_STEPS[WIZ_STEP];
  const bracket = computeBracket(DRAFT_PREDS);

  let bodyHtml;
  if(step.key==='personal') bodyHtml = buildPersonalStepHtml({...p, ...DRAFT_PERSONAL}, readOnly);
  else if(step.key==='groups') bodyHtml = buildGroupsStepHtml(DRAFT_PREDS, readOnly);
  else if(step.key==='special') bodyHtml = buildSpecialStepHtml(DRAFT_PREDS, readOnly, bracket);
  else if(step.key==='review') bodyHtml = buildReviewStepHtml(pid, p, DRAFT_PREDS, bracket, readOnly);
  else bodyHtml = buildKoStepHtml(step.key, bracket, DRAFT_PREDS, readOnly);

  const isFirst = WIZ_STEP===0, isLast = WIZ_STEP===WIZARD_STEPS.length-1;
  // v0.9 (Fase 7) — Los 3 botones de navegación van en una sola fila con
  // grid de 3 columnas (1fr / auto / 1fr): "Guardar y continuar después"
  // siempre cae en la columna del medio (centrada), y Anterior/Siguiente
  // se estiran en sus columnas laterales — se usa un <span> vacío cuando
  // alguno de los tres no aplica (primer paso, último paso, o solo
  // lectura), así el del medio nunca se descentra.
  const leftBtn  = !isFirst ? `<button class="rg-btn rg-btn-ghost" id="wiz_prev">← Anterior</button>` : `<span></span>`;
  const midBtn   = !readOnly ? `<button class="rg-btn rg-btn-ghost" id="wiz_save_exit" style="font-size:11.5px;padding:7px 14px;white-space:nowrap">💾 Guardar</button>` : `<span></span>`;
  const rightBtn = !isLast ? `<button class="rg-btn rg-btn-primary" id="wiz_next">Siguiente →</button>` : `<span></span>`;
  const navHtml = `
    <div class="wiz-nav-row" style="position:sticky;bottom:0;background:var(--qb-black);padding:.75rem 0">
      ${leftBtn}${midBtn}${rightBtn}
    </div>`;

  const adminBanner = (ADMIN_OVERRIDE && isLocked(p)) ? `<div class="note" style="border-color:var(--qb-yellow);color:var(--qb-yellow)">Estás editando como administrador (override): esta quiniela está enviada, pero puedes corregirla igual.</div>` : '';
  const previewBanner = PREVIEW_AS_PARTICIPANT ? `<div class="note" style="border-color:var(--qb-blue);color:var(--qb-blue)">👁️ Vista previa de administrador — esto es exactamente lo que vería <b>${esc(p.name)}</b> al entrar con su correo y su Clave.</div>` : '';
  const closedByDeadline = isGloballyClosed() && p.estadoQuiniela!=='enviada';
  const lockedTopBanner = (readOnly && step.key!=='review')
    ? (closedByDeadline
        ? `<div class="locked-banner" style="border-color:var(--qb-yellow);color:var(--qb-yellow);background:var(--qb-gold-dim)">🔒 Las inscripciones y modificaciones han sido cerradas.</div>`
        : `<div class="locked-banner">✅ Quiniela enviada el ${fmtDate(p.fechaEnvio)} — solo lectura.</div>`)
    : '';

  c.innerHTML = `
    <div class="card">
      ${buildStepperHtml(WIZ_STEP)}
      <div id="wiz_save_indicator" class="save-indicator">&nbsp;</div>
      ${adminBanner}
      ${previewBanner}
      ${lockedTopBanner}
      <div class="card-title">${step.icon} ${esc(step.label)}</div>
      ${bodyHtml}
    </div>
    ${navHtml}
    ${(!readOnly && step.key==='personal') ? `<div class="rg-btn-row"><button class="rg-btn rg-btn-danger" id="q_delete">Eliminar mi registro</button></div>` : ''}
  `;

  if(!readOnly){
    if(step.key==='personal'){
      c.querySelectorAll('.wiz-input').forEach(inp=>{
        inp.addEventListener('input', ()=>{ DRAFT_PERSONAL[inp.dataset.field] = inp.value; scheduleAutosave(); });
      });
      wireCountryCityFields('pp', ()=>{
        DRAFT_PERSONAL.country = document.getElementById('pp_country').value;
        DRAFT_PERSONAL.countryIso = document.getElementById('pp_country_iso').value;
        DRAFT_PERSONAL.city = document.getElementById('pp_city').value;
        scheduleAutosave();
      });
    }
    if(step.key==='groups'){
      c.querySelectorAll('.score-input[data-mid]').forEach(inp=>{
        inp.addEventListener('input', ()=>{
          const mid = inp.dataset.mid, side = inp.dataset.side;
          const val = inp.value === '' ? null : Math.max(0, Math.min(20, parseInt(inp.value,10)||0));
          DRAFT_PREDS[mid] = DRAFT_PREDS[mid] || {};
          DRAFT_PREDS[mid][side] = val;
          scheduleAutosave();
        });
      });
    }
    if(['r32','r16','qf','sf','third','final'].includes(step.key)){
      c.querySelectorAll('.score-input[data-slot]').forEach(inp=>{
        inp.addEventListener('input', ()=>{
          const slot=inp.dataset.slot, side=inp.dataset.side, ta=inp.dataset.a, tb=inp.dataset.b;
          const val = inp.value==='' ? null : Math.max(0, Math.min(20, parseInt(inp.value,10)||0));
          DRAFT_PREDS[slot] = DRAFT_PREDS[slot] || {};
          DRAFT_PREDS[slot][side] = val;
          DRAFT_PREDS[slot]._a = ta; DRAFT_PREDS[slot]._b = tb;
          scheduleAutosave();

          // Reactivo: aparece/desaparece al instante, sin esperar a cambiar
          // de paso y sin perder el foco (no se re-renderiza el paso entero).
          const pr = DRAFT_PREDS[slot];
          const tiedNow = Number.isInteger(pr.h) && Number.isInteger(pr.a) && pr.h===pr.a;
          const pickRow = document.getElementById('pickrow_'+slot);
          if(pickRow) pickRow.style.display = tiedNow ? 'block' : 'none';
          if(!tiedNow && pr.pick){ delete pr.pick; } // ya no aplica el penal elegido para el empate anterior
        });
      });
      c.querySelectorAll('.ko-pick').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const slot=btn.dataset.slot, ta=btn.dataset.a, tb=btn.dataset.b, team=btn.dataset.team;
          DRAFT_PREDS[slot] = DRAFT_PREDS[slot] || {};
          DRAFT_PREDS[slot].pick = team; DRAFT_PREDS[slot]._a=ta; DRAFT_PREDS[slot]._b=tb;
          c.querySelectorAll(`.ko-pick[data-slot="${slot}"]`).forEach(x=>x.classList.toggle('sel', x===btn));
          scheduleAutosave(50);
        });
      });
    }
    if(step.key==='special'){
      c.querySelectorAll('.special-input').forEach(inp=>{
        const handler = ()=>{
          const qid = inp.dataset.qid;
          DRAFT_PREDS.special = DRAFT_PREDS.special || {};
          if(inp.tagName==='SELECT' || inp.type==='text'){
            DRAFT_PREDS.special[qid] = inp.value;
          }else{
            DRAFT_PREDS.special[qid] = inp.value==='' ? '' : Math.max(0, Math.min(99, parseInt(inp.value,10)||0));
          }
          scheduleAutosave();
        };
        inp.addEventListener('input', handler);
        inp.addEventListener('change', handler);
      });
    }
    if(step.key==='review'){
      const chk = document.getElementById('confirm_check');
      const btn = document.getElementById('btn_submit');
      if(chk && btn) chk.addEventListener('change', ()=>{ btn.disabled = !chk.checked; });
      if(btn) btn.addEventListener('click', ()=>{
        flushAutosave();
        const st = getCompletionStatus(pid);
        if(!st.complete){ toast('Faltan elementos por completar.', true); return; }
        // v6.4 — Antes de marcar como enviada, "quemamos" campeón/subcampeón/
        // 3er lugar dentro de preds.special. computeAutoSpecial() ya los
        // calculaba para mostrarlos en pantalla (Especiales y Revisión), pero
        // nunca se persistían — scoring.js (calcAdv) los necesita ahí adentro
        // para otorgar los 15+10+8 pts. Sin esto, todo participante que entra
        // por el wizard (no migrado del sistema legacy) pierde esos puntos
        // silenciosamente. Ver backfillAutoSpecialForAll() para los que ya
        // enviaron su quiniela antes de este fix.
        const finalBracket = computeBracket(DRAFT_PREDS);
        const autoSp = computeAutoSpecial(finalBracket);
        DRAFT_PREDS.special = {...(DRAFT_PREDS.special||{}), ...autoSp};
        flushAutosave();
        p.estadoQuiniela = 'enviada';
        p.fechaEnvio = Date.now();
        p.fechaActualizacion = Date.now();
        saveData(DB);
        toast('Tu quiniela fue enviada correctamente.');
        render();
        generarPDF(p); // se dispara después de pintar el nuevo estado "enviada"
      });
    }
  }

  const goToStep = (idx)=>{
    if(idx > WIZ_STEP && !ADMIN_OVERRIDE){
      const personalMerged = {...p, ...DRAFT_PERSONAL};
      const blockers = getStepBlockers(idx, p, personalMerged, DRAFT_PREDS);
      if(blockers.length){ showBlockModal(blockers); return; }
    }
    WIZ_STEP = idx; flushAutosave(); render();
  };
  document.getElementById('wiz_prev')?.addEventListener('click', ()=> goToStep(WIZ_STEP-1));
  document.getElementById('wiz_next')?.addEventListener('click', ()=> goToStep(WIZ_STEP+1));
  c.querySelectorAll('.step-dot').forEach(dot=>{
    dot.addEventListener('click', ()=> goToStep(parseInt(dot.dataset.step,10)));
  });

  // v1.0 — "Generar copia en PDF" se muestra tanto si ya está enviada
  // como si quedó cerrada por fecha límite sin enviar (ambos casos son
  // readOnly), así que se conecta FUERA del bloque if(!readOnly) de arriba.
  document.getElementById('btn_pdf_copy')?.addEventListener('click', ()=> generarPDF(p));
  document.getElementById('status_goto_pending')?.addEventListener('click', (e)=>{
    const idx = parseInt(e.currentTarget.dataset.idx, 10);
    if(!isNaN(idx) && idx>=0) jumpToStepUnchecked(idx);
  });

  document.getElementById('wiz_save_exit')?.addEventListener('click', ()=>{
    flushAutosave();
    toast('Guardado.');
  });

  document.getElementById('q_delete')?.addEventListener('click', ()=>{
    if(!confirm(`¿Seguro que quieres eliminar el registro de "${p.name}"? Esto borra también su quiniela y no se puede deshacer.`)) return;
    DB.participants = DB.participants.filter(x=>x.id!==p.id);
    delete DB.predictions[p.id];
    // v6.4 — saveData(DB) por sí solo nunca borra documentos en Firestore
    // (el diff genérico solo agrega/actualiza lo que sigue en la lista),
    // así que el documento de ESTE participante necesita su propio
    // borrado explícito — permitido por la regla de Firestore porque
    // quien ejecuta esto es su propio dueño (ownerUid coincide).
    rgDeleteParticipantDoc(p.id);
    clearDraft();
    toast('Registro eliminado.');
    render();
  });
}

/* ════════════════════════════════════════
   FUNCIONES AUXILIARES DEL PANEL ADMIN — v0.8 (Fase 5)
   Separadas de renderAdmin() para poder refrescar solo la tabla de
   participantes (buscador, regenerar clave, cambiar estado, eliminar) sin
   re-renderizar TODA la pestaña — así el campo de búsqueda nunca pierde
   el foco mientras se escribe.
   ════════════════════════════════════════ */
function buildStatsHtml(){
  const total = totalMatches();
  const totalP = DB.participants.length;
  const enviadas = DB.participants.filter(p=>p.estadoQuiniela==='enviada').length;
  const borradores = totalP - enviadas;
  const completas = DB.participants.filter(p=> countAnswered(p.id)===total).length;
  const incompletas = totalP - completas;
  const stats = [
    ['Total participantes', totalP],
    ['Quinielas enviadas', enviadas],
    ['Quinielas en borrador', borradores],
    ['Quinielas completadas', completas],
    ['Quinielas incompletas', incompletas]
  ];
  return `<div class="stat-grid">` + stats.map(([label,val])=>`
    <div class="stat-box">
      <div class="stat-num">${val}</div>
      <div class="stat-label">${label}</div>
    </div>`).join('') + `</div>`;
}

// Buscador: por nombre, correo, código de participante o Clave (todo
// insensible a mayúsculas/acentos básicos, vía la misma norm() del login).
function matchesAdminSearch(p, q){
  if(!q || !q.trim()) return true;
  const needle = norm(q);
  return norm(p.name).includes(needle) ||
    norm(p.email||'').includes(needle) ||
    norm(p.codigo||'').includes(needle) ||
    norm(p.clave||'').includes(needle);
}

// v0.9 (Fase 7) — Filtro rápido por estado de avance, combinado (AND) con
// el texto del buscador.
function matchesAdminFilter(p, mode, total){
  if(mode==='completas') return countAnswered(p.id)===total;
  if(mode==='incompletas') return countAnswered(p.id)<total;
  return true; // 'all'
}

function buildParticipantsRowsHtml(filterText, filterMode){
  const total = totalMatches();
  const list = DB.participants
    .filter(p=>matchesAdminSearch(p, filterText) && matchesAdminFilter(p, filterMode||'all', total))
    .slice()
    .sort((a,b)=> a.name.localeCompare(b.name));

  if(!list.length){
    const msg = DB.participants.length
      ? 'Ningún participante coincide con la búsqueda/filtro.'
      : 'Aún no hay participantes registrados.';
    return `<div class="muted center" style="padding:1.5rem 0">${msg}</div>`;
  }

  const rows = list.map(p=>{
    const ans = countAnswered(p.id);
    const pct = Math.round((ans/total)*100);
    const cls = pct===100 ? 'badge-green' : (pct>0 ? 'badge-yellow' : 'badge-muted');
    const estadoCls = p.estadoQuiniela==='enviada' ? 'badge-green' : 'badge-muted';
    const hasNota = p.notaAdmin && p.notaAdmin.trim();
    return `
      <tr>
        <td class="muted">${esc(p.codigo||'—')}</td>
        <td class="admin-name-cell">${esc(p.name)}</td>
        <td class="muted">${esc(p.email||'—')}</td>
        <td class="muted">${esc(p.city)}, ${esc(p.country)}</td>
        <td class="muted">${esc(p.clave||'—')}</td>
        <td class="muted">${fmtDate(p.fechaCreacion)}</td>
        <td class="muted">${fmtDate(p.fechaEnvio)}</td>
        <td><span class="badge ${estadoCls}" data-act="toggle-estado" data-id="${p.id}" style="cursor:pointer" title="Click para reabrir (si está enviada) o marcar como enviada (si está en borrador)">${esc(p.estadoQuiniela)}</span></td>
        <td><span class="badge ${cls}">${pct}%</span></td>
        <td style="white-space:nowrap">
          <button class="icon-btn" data-act="edit" data-id="${p.id}" title="Editar (modo administrador)">✏️</button>
          <button class="icon-btn" data-act="preview" data-id="${p.id}" title="Ver como participante">👁️</button>
          <button class="icon-btn" data-act="pdf" data-id="${p.id}" title="Generar PDF">📄</button>
          <button class="icon-btn" data-act="regen-clave" data-id="${p.id}" title="Regenerar clave">🔑</button>
          <button class="icon-btn ${hasNota?'icon-btn-has-note':''}" data-act="nota" data-id="${p.id}" title="${hasNota?esc(p.notaAdmin):'Agregar nota interna'}">${hasNota?'🗒️':'📝'}</button>
          <button class="icon-btn" data-act="del" data-id="${p.id}" title="Eliminar">🗑️</button>
        </td>
      </tr>`;
  }).join('');

  return `<div style="overflow-x:auto">
      <table class="admin">
        <thead><tr>
          <th>Código</th><th>Nombre</th><th>Correo</th><th>Ubicación</th><th>Clave</th>
          <th>Creado</th><th>Enviado</th><th>Estado</th><th>Avance</th><th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// Refresca solo la tabla + estadísticas + contador del título (no toda la
// pestaña Admin), para no perder el foco del buscador mientras se escribe.
function refreshAdminTable(){
  const tableWrap = document.getElementById('admin_table_wrap');
  if(tableWrap){ tableWrap.innerHTML = buildParticipantsRowsHtml(ADMIN_SEARCH, ADMIN_FILTER); wireParticipantsTable(); }
  const statsWrap = document.getElementById('admin_stats_wrap');
  if(statsWrap) statsWrap.innerHTML = buildStatsHtml();
  const badge = document.getElementById('admin_total_badge');
  if(badge) badge.textContent = DB.participants.length;
}

function wireParticipantsTable(){
  document.getElementById('admin_table_wrap').querySelectorAll('[data-act]').forEach(el=>{
    el.addEventListener('click', ()=>{
      const id = el.dataset.id;
      const p = DB.participants.find(x=>x.id===id);
      if(!p) return;

      if(el.dataset.act==='edit'){
        DRAFT_PID = id;
        ADMIN_OVERRIDE = true;
        PREVIEW_AS_PARTICIPANT = false;
        DRAFT_PREDS = JSON.parse(JSON.stringify(DB.predictions[id] || {}));
        DRAFT_PERSONAL = {};
        WIZ_STEP = 0;
        WIZ_DIRTY = false;
        switchToInicioTab();

      }else if(el.dataset.act==='preview'){
        // "Ver como participante" — exactamente la misma vista que vería el
        // jugador al entrar con su correo y su Clave (sin privilegios de
        // administrador: respeta el bloqueo de avance y el solo-lectura si
        // ya está enviada o si el cierre automático ya pasó).
        enterWizardAs(p, {preview:true});
        switchToInicioTab();

      }else if(el.dataset.act==='pdf'){
        generarPDF(p);

      }else if(el.dataset.act==='regen-clave'){
        if(!confirm(`¿Regenerar la clave de "${p.name}"? La clave anterior dejará de funcionar de inmediato.`)) return;
        const nueva = genClave();
        p.clave = nueva;
        p.fechaActualizacion = Date.now();
        saveData(DB);
        toast(`Nueva clave de ${p.name}: ${nueva}`);
        refreshAdminTable();

      }else if(el.dataset.act==='nota'){
        // v0.9 (Fase 7) — Nota interna, NUNCA visible para el participante.
        const actual = p.notaAdmin || '';
        const nueva = prompt(`Nota interna sobre "${p.name}" (solo la ve el administrador):`, actual);
        if(nueva===null) return; // canceló
        p.notaAdmin = nueva.trim();
        p.fechaActualizacion = Date.now();
        saveData(DB);
        toast(p.notaAdmin ? 'Nota guardada.' : 'Nota eliminada.');
        refreshAdminTable();

      }else if(el.dataset.act==='del'){
        if(!confirm(`¿Eliminar a "${p.name}" y toda su quiniela? (queda en la Papelera, se puede restaurar después)`)) return;
        DB.papelera = DB.papelera || [];
        DB.papelera.push({
          participant: JSON.parse(JSON.stringify(p)),
          predictions: JSON.parse(JSON.stringify(DB.predictions[id] || {})),
          fechaEliminado: Date.now()
        });
        DB.participants = DB.participants.filter(x=>x.id!==id);
        delete DB.predictions[id];
        // v6.4 — La papelera ahora vive en su propio documento de
        // solo-admin (rgSavePapelera), separado de los participantes
        // activos. Además, el documento público de ESTE participante en
        // registro_participants tiene que desaparecer de verdad
        // (rgDeleteParticipantDoc) para que ya no aparezca en el Ranking
        // — saveData(DB) por sí solo nunca borra documentos, solo agrega
        // o actualiza los que siguen en DB.participants.
        rgSavePapelera(DB.papelera);
        rgDeleteParticipantDoc(id);
        toast('Participante movido a la papelera.');
        refreshAdminTable();
        refreshPapeleraTable();

      }else if(el.dataset.act==='toggle-estado'){
        if(p.estadoQuiniela==='enviada'){
          p.estadoQuiniela = 'borrador';
          p.fechaEnvio = null;
        }else{
          p.estadoQuiniela = 'enviada';
          p.fechaEnvio = Date.now();
        }
        p.fechaActualizacion = Date.now();
        saveData(DB);
        refreshAdminTable();
      }
    });
  });
}

/* ════════════════════════════════════════
   PAPELERA — v6.1
   Quien se elimina desde la tabla de participantes no se borra de
   verdad: queda guardado acá completo (perfil + predicciones) hasta que
   el admin decida Restaurar o Eliminar definitivamente. Misma idea que
   ya existe en el tab Integridad de la app principal (no perder datos
   por error), aplicada también a Mi Quiniela.
   ════════════════════════════════════════ */
function buildPapeleraRowsHtml(){
  if(!DB.papelera || !DB.papelera.length){
    return `<div class="muted center" style="padding:1.5rem 0">La papelera está vacía.</div>`;
  }
  const rows = DB.papelera.slice().sort((a,b)=>b.fechaEliminado-a.fechaEliminado).map(entry=>{
    const p = entry.participant;
    return `
      <tr>
        <td class="muted">${esc(p.codigo||'—')}</td>
        <td class="admin-name-cell">${esc(p.name)}</td>
        <td class="muted">${esc(p.email||'—')}</td>
        <td class="muted">${esc(p.city)}, ${esc(p.country)}</td>
        <td class="muted">${fmtDate(entry.fechaEliminado)}</td>
        <td style="white-space:nowrap">
          <button class="icon-btn" data-pact="restore" data-pid="${p.id}" title="Restaurar">♻️</button>
          <button class="icon-btn" data-pact="purge" data-pid="${p.id}" title="Eliminar para siempre">🗑️</button>
        </td>
      </tr>`;
  }).join('');
  return `<div style="overflow-x:auto">
      <table class="admin">
        <thead><tr><th>Código</th><th>Nombre</th><th>Correo</th><th>Ubicación</th><th>Eliminado</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function wirePapeleraTable(){
  const wrap = document.getElementById('papelera_wrap');
  if(!wrap) return;
  wrap.querySelectorAll('[data-pact]').forEach(el=>{
    el.addEventListener('click', ()=>{
      const pid = el.dataset.pid;
      const idx = (DB.papelera||[]).findIndex(e=>e.participant.id===pid);
      if(idx===-1) return;
      const entry = DB.papelera[idx];

      if(el.dataset.pact==='restore'){
        const correoEnUso = entry.participant.email && DB.participants.some(x=>norm(x.email||'')===norm(entry.participant.email));
        if(correoEnUso && !confirm(`Ya hay un participante activo con el correo "${entry.participant.email}". ¿Restaurar igual? (quedarían dos con el mismo correo)`)) return;
        DB.participants.push(entry.participant);
        DB.predictions[entry.participant.id] = entry.predictions || {};
        DB.papelera.splice(idx,1);
        // v6.4 — saveData(DB) sí vuelve a crear el documento del
        // participante restaurado (porque ahora aparece de nuevo en
        // DB.participants), usando el camino de admin de la regla de
        // Firestore (este participante restaurado puede no tener
        // ownerUid, o tener uno de un dispositivo viejo). La papelera
        // (que ya no lo incluye) se guarda aparte con rgSavePapelera.
        saveData(DB);
        rgSavePapelera(DB.papelera);
        toast(`"${entry.participant.name}" restaurado.`);
        refreshAdminTable();
        refreshPapeleraTable();

      }else if(el.dataset.pact==='purge'){
        if(!confirm(`¿Eliminar definitivamente a "${entry.participant.name}"? Esto ya no se puede deshacer ni restaurar.`)) return;
        DB.papelera.splice(idx,1);
        rgSavePapelera(DB.papelera);
        toast('Eliminado definitivamente.');
        refreshPapeleraTable();
      }
    });
  });
}


// Refresca solo la sección de papelera (tabla + contador del botón que la
// abre/cierra), sin tocar el resto del panel Admin.
function refreshPapeleraTable(){
  const wrap = document.getElementById('papelera_wrap');
  if(wrap){ wrap.innerHTML = buildPapeleraRowsHtml(); wirePapeleraTable(); }
  const toggleBtn = document.getElementById('a_toggle_papelera');
  if(toggleBtn) toggleBtn.textContent = `🗑️ Papelera (${(DB.papelera||[]).length})`;
}

/* ════════════════════════════════════════
   TAB: ADMIN
   Nota: sin autenticación en este prototipo. Al integrar con el proyecto
   principal, esta vista se protege igual que el resto del panel admin
   (Firebase Auth + email fijo de administrador).
   ════════════════════════════════════════ */
function renderAdmin(){
  const c = document.getElementById('rg-content');
  const ct = getCierreTimestamp();
  const cierreStatusText = !ct
    ? 'Sin fecha de cierre configurada — las inscripciones quedan abiertas indefinidamente.'
    : (isGloballyClosed()
        ? `🔒 <b>Cerrado</b> desde el ${fmtDate(ct)}.`
        : `Se cerrará el ${fmtDate(ct)}.`);

  c.innerHTML = `
    <div class="note">Panel administrativo sin autenticación (prototipo). El badge de <b>Estado</b> reabre una quiniela enviada (vuelve a borrador, habilita edición) o la marca como enviada manualmente. El lápiz ✏️ edita en modo administrador; el ojo 👁️ muestra exactamente la vista del participante (sin privilegios).</div>

    <div class="card">
      <div class="card-title">⚙️ Configuración</div>
      <div class="switch-row">
        <div>
          <div style="font-weight:700">Modo consulta ("¿Ya tienes una quiniela?")</div>
          <div class="muted" style="font-size:11.5px">${DB.configGlobal.modoConsultaHabilitado ? 'Inicio muestra la pantalla de elección (Ver mi quiniela / Crear nueva).' : 'Inicio entra directo al formulario de creación, sin pantalla de elección.'}</div>
        </div>
        <div class="switch ${DB.configGlobal.modoConsultaHabilitado?'on':''}" id="a_switch_consulta"><div class="switch-knob"></div></div>
      </div>
      <div class="switch-row">
        <div>
          <div style="font-weight:700">Registro de nuevas quinielas</div>
          <div class="muted" style="font-size:11.5px">${DB.configGlobal.registroAbierto ? 'Cualquiera puede crear un nuevo participante.' : 'Cerrado — solo se puede editar quinielas ya existentes.'}</div>
        </div>
        <div class="switch ${DB.configGlobal.registroAbierto?'on':''}" id="a_switch_registro"><div class="switch-knob"></div></div>
      </div>
      <div class="switch-row">
        <div>
          <div style="font-weight:700">Permitir ingreso utilizando nombre</div>
          <div class="muted" style="font-size:11.5px">${DB.configGlobal.loginPorNombreHabilitado ? 'Puente temporal: quien no tenga correo puede entrar con su nombre completo (y luego se le pide registrar uno).' : 'Desactivado — solo se puede entrar con correo + Clave. El campo de nombre ya no aparece en el login.'}</div>
        </div>
        <div class="switch ${DB.configGlobal.loginPorNombreHabilitado?'on':''}" id="a_switch_nombre"><div class="switch-knob"></div></div>
      </div>
      <div class="switch-row">
        <div>
          <div style="font-weight:700">🏠 Usar "Mi Quiniela" como página inicial</div>
          <div class="muted" style="font-size:11.5px">${DB.configGlobal.usarMiQuinielaComoInicio ? 'La app abre directo en "Mi Quiniela" en vez de en el Ranking.' : 'La app abre en el Ranking, como siempre.'}</div>
        </div>
        <div class="switch ${DB.configGlobal.usarMiQuinielaComoInicio?'on':''}" id="a_switch_inicio_mq"><div class="switch-knob"></div></div>
      </div>
      <div class="switch-row" style="border-bottom:none;align-items:flex-start">
        <div style="width:100%">
          <div style="font-weight:700;margin-bottom:4px">⏰ Cierre automático de inscripciones</div>
          <div class="muted" style="font-size:11.5px;margin-bottom:10px">${cierreStatusText}</div>
          <div class="row2">
            <div class="field"><label>Fecha de cierre</label><input type="date" id="a_fecha_cierre" value="${esc(DB.configGlobal.fechaCierre||'')}"></div>
            <div class="field"><label>Hora de cierre</label><input type="time" id="a_hora_cierre" value="${esc(DB.configGlobal.horaCierre||'23:59')}"></div>
          </div>
          <div class="rg-btn-row">
            <button class="rg-btn rg-btn-primary" id="a_guardar_cierre">Guardar cierre</button>
            <button class="rg-btn rg-btn-ghost" id="a_quitar_cierre">Quitar cierre</button>
          </div>
        </div>
      </div>
    </div>

    <div class="card" id="migracion_card">
      <div class="card-title">🔄 Migración del sistema anterior</div>
      <div class="note">Trae a los 27 participantes del sistema anterior (los que predijeron por Excel/PDF antes de que existiera este formulario) para que aparezcan acá, en el Ranking y en Estadísticas — sin tocar ni un punto de lo que ya tienen ganado. Es seguro correrlo más de una vez: a quien todavía no esté, lo crea; a quien ya esté, le refresca las predicciones (útil si alguna vez corrijo algo de la migración). Descarga un backup automático antes de escribir nada.</div>
      <button class="rg-btn rg-btn-primary" id="a_migrar_legacy">🔄 Migrar los 27 antiguos a Mi Quiniela</button>
    </div>

    <div class="card" id="backfill_special_card">
      <div class="card-title">🛠️ Corregir Campeón/Subcampeón/3er lugar</div>
      <div class="note">Corrige un bug de versiones anteriores: a quien registró su quiniela por este formulario (no por la migración del sistema anterior) nunca se le guardaban Campeón, Subcampeón ni 3er lugar como predicción, aunque en pantalla siempre se vieran bien — así que esos 33 puntos posibles no se le estaban contando en el Ranking. Esto los corrige para todos los que ya tengan su llave completa hasta la Final, sin tocar ningún otro dato de su quiniela. Es seguro correrlo más de una vez. Descarga un backup automático antes de escribir nada.</div>
      <button class="rg-btn rg-btn-primary" id="a_backfill_special">🛠️ Corregir Campeón/Subcampeón/3er lugar</button>
    </div>

    <div class="card">
      <div class="card-title">📊 Estadísticas rápidas</div>
      <div id="admin_stats_wrap">${buildStatsHtml()}</div>
    </div>

    <div class="card">
      <div class="card-title">📋 Participantes registrados <span class="badge badge-muted" id="admin_total_badge">${DB.participants.length}</span></div>
      <div class="field" style="margin-bottom:.6rem">
        <label>🔍 Buscar</label>
        <input id="admin_search" type="text" placeholder="Nombre, correo, código o clave..." value="${esc(ADMIN_SEARCH)}" autocomplete="off">
      </div>
      <div class="filter-chips" style="margin-bottom:.85rem">
        <button class="filter-chip ${ADMIN_FILTER==='all'?'on':''}" data-filter="all">Todas</button>
        <button class="filter-chip ${ADMIN_FILTER==='completas'?'on':''}" data-filter="completas">✅ Completas</button>
        <button class="filter-chip ${ADMIN_FILTER==='incompletas'?'on':''}" data-filter="incompletas">▫️ Incompletas</button>
      </div>
      <div id="admin_table_wrap">${buildParticipantsRowsHtml(ADMIN_SEARCH, ADMIN_FILTER)}</div>
      <div class="rg-btn-row" style="margin-top:.75rem">
        <button class="rg-btn rg-btn-ghost" id="a_gen_claves" title="Genera una clave nueva solo a quien no tenga ninguna">🔑 Generar claves faltantes</button>
        <button class="rg-btn rg-btn-ghost" id="a_export_claves" title="Descarga un .csv con nombre, correo, código y clave de todos">⬇️ Exportar correos y claves</button>
        <button class="rg-btn rg-btn-ghost" id="a_toggle_papelera">🗑️ Papelera (${(DB.papelera||[]).length})</button>
        <button class="rg-btn rg-btn-danger" id="a_reset">Borrar todos los datos de prueba</button>
      </div>
    </div>

    <div class="card" id="papelera_card" style="display:${SHOW_PAPELERA?'block':'none'}">
      <div class="card-title">🗑️ Papelera</div>
      <div class="note">Los participantes eliminados quedan acá con toda su quiniela hasta que los restaures o los borres para siempre — eliminar desde la tabla de arriba ya no es instantáneo ni definitivo.</div>
      <div id="papelera_wrap">${buildPapeleraRowsHtml()}</div>
    </div>
  `;

  wireParticipantsTable();

  document.getElementById('admin_search').addEventListener('input', (e)=>{
    ADMIN_SEARCH = e.target.value;
    const tableWrap = document.getElementById('admin_table_wrap');
    tableWrap.innerHTML = buildParticipantsRowsHtml(ADMIN_SEARCH, ADMIN_FILTER);
    wireParticipantsTable();
  });

  document.querySelectorAll('.filter-chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      ADMIN_FILTER = chip.dataset.filter;
      document.querySelectorAll('.filter-chip').forEach(c=>c.classList.toggle('on', c===chip));
      const tableWrap = document.getElementById('admin_table_wrap');
      tableWrap.innerHTML = buildParticipantsRowsHtml(ADMIN_SEARCH, ADMIN_FILTER);
      wireParticipantsTable();
    });
  });

  document.getElementById('a_export_claves').addEventListener('click', exportarCorreosClaves);
  document.getElementById('a_migrar_legacy').addEventListener('click', runMigracionLegacy);
  document.getElementById('a_backfill_special').addEventListener('click', backfillAutoSpecialForAll);

  document.getElementById('a_toggle_papelera').addEventListener('click', ()=>{
    SHOW_PAPELERA = !SHOW_PAPELERA;
    const card = document.getElementById('papelera_card');
    if(card) card.style.display = SHOW_PAPELERA ? 'block' : 'none';
  });
  wirePapeleraTable();

  document.getElementById('a_gen_claves').addEventListener('click', ()=>{
    let count = 0;
    DB.participants.forEach(p=>{
      if(!p.clave || !String(p.clave).trim()){
        p.clave = genClave();
        p.fechaActualizacion = Date.now();
        count++;
      }
    });
    if(count===0){ toast('Todos los participantes ya tienen una Clave. No se sobrescribió ninguna.'); return; }
    saveData(DB);
    toast(`Se generaron ${count} clave(s) nueva(s). Las que ya existían no se tocaron.`);
    refreshAdminTable();
  });

  document.getElementById('a_switch_consulta').addEventListener('click', ()=>{
    DB.configGlobal.modoConsultaHabilitado = !DB.configGlobal.modoConsultaHabilitado;
    saveData(DB);
    toast(`Modo consulta ${DB.configGlobal.modoConsultaHabilitado?'activado':'desactivado'}.`);
    render();
  });
  document.getElementById('a_switch_registro').addEventListener('click', ()=>{
    DB.configGlobal.registroAbierto = !DB.configGlobal.registroAbierto;
    saveData(DB);
    toast(`Registro de nuevas quinielas ${DB.configGlobal.registroAbierto?'abierto':'cerrado'}.`);
    render();
  });
  document.getElementById('a_switch_nombre').addEventListener('click', ()=>{
    DB.configGlobal.loginPorNombreHabilitado = !DB.configGlobal.loginPorNombreHabilitado;
    saveData(DB);
    toast(`Ingreso por nombre ${DB.configGlobal.loginPorNombreHabilitado?'activado':'desactivado'}.`);
    render();
  });
  document.getElementById('a_switch_inicio_mq').addEventListener('click', ()=>{
    DB.configGlobal.usarMiQuinielaComoInicio = !DB.configGlobal.usarMiQuinielaComoInicio;
    saveData(DB);
    toast(`Página inicial: ${DB.configGlobal.usarMiQuinielaComoInicio?'Mi Quiniela':'Ranking'}.`);
    render();
  });
  document.getElementById('a_guardar_cierre').addEventListener('click', ()=>{
    const fecha = document.getElementById('a_fecha_cierre').value;
    const hora = document.getElementById('a_hora_cierre').value || '23:59';
    if(!fecha){ toast('Elegí una fecha de cierre primero.', true); return; }
    DB.configGlobal.fechaCierre = fecha;
    DB.configGlobal.horaCierre = hora;
    saveData(DB);
    toast(`Cierre automático configurado: ${fecha} ${hora}.`);
    render();
  });
  document.getElementById('a_quitar_cierre').addEventListener('click', ()=>{
    DB.configGlobal.fechaCierre = '';
    saveData(DB);
    toast('Cierre automático quitado — las inscripciones quedan abiertas.');
    render();
  });

  document.getElementById('a_reset').addEventListener('click', ()=>{
    // v6.0 — ¡OJO! Ya no es un reset solo-local: esto sobreescribe el doc
    // compartido registro/estado en Firestore, afectando a TODOS los
    // dispositivos conectados (no solo este navegador). Doble confirmación
    // a propósito por ser ahora una acción realmente destructiva y compartida.
    if(!confirm('⚠️ Esto borra TODOS los participantes y predicciones de Mi Quiniela para TODOS (no solo en este navegador — se sincroniza por Firestore), incluyendo la Papelera. ¿Continuar?')) return;
    if(!confirm('Última confirmación: se perderán todas las quinielas registradas hasta ahora, sin posibilidad de restaurar nada. ¿Seguro?')) return;
    DB = {participants:[], predictions:{}, papelera:[], nextSeq:1, configGlobal:{modoConsultaHabilitado:true, registroAbierto:true, loginPorNombreHabilitado:true, fechaCierre:'', horaCierre:'23:59', usarMiQuinielaComoInicio:false}};
    ADMIN_SEARCH = '';
    ADMIN_FILTER = 'all';
    SHOW_PAPELERA = false;
    try{ localStorage.setItem(STORE_KEY, JSON.stringify(DB)); }catch(e){}
    // v6.4 — saveData(DB) ya no basta: con la colección por-participante,
    // vaciar DB.participants en memoria nunca borra los documentos que ya
    // existían en Firestore (el diff genérico solo agrega/actualiza lo
    // que sigue en la lista). rgResetAll() borra de verdad cada documento
    // de la colección, resetea meta y vacía la papelera en el servidor.
    rgResetAll();
    toast('Datos de Mi Quiniela borrados (en todos los dispositivos).');
    render();
  });
}


/* ════════════════════════════════════════
   GENERAR PDF — html2canvas + jsPDF
   ════════════════════════════════════════ */
/* ════════════════════════════════════════
   GENERAR PDF — html2canvas + jsPDF
   v0.8 (Fase 6) — Rediseño completo: paleta LIGHT, 2 columnas (grupos a la
   izquierda en 2 sub-columnas de 6 grupos; eliminatoria a la derecha en
   6 bloques apilados), preguntas especiales en una franja horizontal
   abajo, y página fijada a tamaño Oficio horizontal real (330 x 216mm —
   la medida de "Oficio" varía algo según el país; si en la impresora real
   queda corrido, era un ajuste de una sola línea — ver nota v1.1 abajo).
   v1.1 — Cambiado a Carta horizontal (279.4 x 215.9mm / 11x8.5in): Oficio
   dejaba mucho espacio en blanco a los lados porque el contenido nunca
   necesitó los 330mm de ancho. Carta tiene el mismo alto (~216mm) y solo
   recorta el ancho — no se tocó ningún font-size, el contenido se ve
   exactamente igual, solo con menos margen vacío. La franja de preguntas
   especiales también se movió: ahora va arriba, sobre las 2 columnas de
   grupos/eliminatoria (antes iba abajo, después de las columnas).
   ════════════════════════════════════════ */
const CARTA_MM = { w: 279.4, h: 215.9 }; // Carta horizontal (11x8.5in)

function buildPosterGroupsHtml(preds){
  const groups = {};
  GROUP_MATCHES.forEach(m=>{ (groups[m.g]=groups[m.g]||[]).push(m); });
  const letters = Object.keys(groups).sort();
  const mid = Math.ceil(letters.length/2);
  const subcols = [letters.slice(0,mid), letters.slice(mid)];

  const rowHtml = (m)=>{
    const v = preds[m.id];
    const h = v && Number.isInteger(v.h) ? v.h : '-';
    const a = v && Number.isInteger(v.a) ? v.a : '-';
    return `<div class="pp-match-row">
        <span class="pp-team">${flagOf(m.a,11)}<span>${esc(m.a)}</span></span>
        <span class="pp-score">${h}:${a}</span>
        <span class="pp-team pp-team-r"><span>${esc(m.b)}</span>${flagOf(m.b,11)}</span>
      </div>`;
  };
  const boxHtml = (g)=> `<div class="pp-group-box">
      <div class="pp-group-name">Grupo ${esc(g)}</div>
      ${groups[g].map(rowHtml).join('')}
    </div>`;

  return `<div class="pp-groups-grid">` +
    subcols.map(ls=>`<div class="pp-groups-subcol">${ls.map(boxHtml).join('')}</div>`).join('') +
    `</div>`;
}

function buildPosterElimHtml(preds, bracket){
  if(!bracket.ready){
    return `<div class="pp-phase-block">
        <div class="pp-phase-name">Pendiente</div>
        <div class="pp-match-row"><span class="pp-team">Completa la fase de grupos para ver los cruces.</span></div>
      </div>`;
  }
  return KO_PHASES.map(ph=>{
    const slots = koSlotsOf(bracket, ph.key);
    const rows = slots.map(m=>{
      if(!m.a || !m.b){
        return `<div class="pp-match-row"><span class="pp-team">Pendiente</span></div>`;
      }
      const raw = preds[m.slot];
      const v = (raw && raw._a===m.a && raw._b===m.b) ? raw : null;
      const h = v && Number.isInteger(v.h) ? v.h : '-';
      const a = v && Number.isInteger(v.a) ? v.a : '-';
      return `<div class="pp-match-row">
          <span class="pp-team">${flagOf(m.a,11)}<span>${esc(m.a)}</span></span>
          <span class="pp-score">${h}:${a}</span>
          <span class="pp-team pp-team-r"><span>${esc(m.b)}</span>${flagOf(m.b,11)}</span>
        </div>`;
    }).join('');
    return `<div class="pp-phase-block">
        <div class="pp-phase-name">${esc(ph.label)}</div>
        ${rows}
      </div>`;
  }).join('');
}

function buildPosterSpecialHtml(preds, bracket){
  const autoSp = computeAutoSpecial(bracket);
  const sp = preds.special || {};
  return SPECIAL_QUESTIONS.map(q=>{
    const isAuto = AUTO_SPECIAL_IDS.includes(q.id);
    const raw = isAuto ? autoSp[q.id] : sp[q.id];
    const val = (raw!==undefined && raw!=='') ? raw : '—';
    return `<div class="pp-special-item">
        <div class="pp-special-label">${esc(q.label)}</div>
        <div class="pp-special-val">${esc(String(val))}</div>
      </div>`;
  }).join('');
}

function generarPDF(p){
  // v6.3 — Antes, si window.jspdf no existía (ej. la librería no cargó),
  // el código explotaba en silencio DESPUÉS de que html2canvas terminaba
  // de capturar la imagen, dejando el toast "Generando PDF..." pegado
  // para siempre sin avisar nada. Esta validación corta ANTES de
  // arrancar y avisa con un mensaje claro.
  if(typeof html2canvas !== 'function' || !window.jspdf || !window.jspdf.jsPDF){
    toast('No se pudo cargar el generador de PDF — revisa tu conexión e intenta de nuevo.', true);
    return;
  }
  const preds = DB.predictions[p.id] || {};
  const bracket = computeBracket(preds);
  const estadoLabel = p.estadoQuiniela==='enviada' ? 'Enviada' : 'Borrador';

  const poster = document.getElementById('pdfPoster');
  poster.innerHTML = `
    <div class="pp-header">
      <div>
        <div class="pp-title">⚔️ Quiniela Borracha 2026</div>
        <div class="pp-subtitle">${esc(p.name)}</div>
      </div>
      <div class="pp-meta-grid">
        <div><span class="pp-meta-label">Ciudad</span><span class="pp-meta-val">${esc(p.city)}</span></div>
        <div><span class="pp-meta-label">País</span><span class="pp-meta-val">${esc(p.country)}</span></div>
        <div><span class="pp-meta-label">Código</span><span class="pp-meta-val">${esc(p.codigo||'—')}</span></div>
        <div><span class="pp-meta-label">Creado</span><span class="pp-meta-val">${fmtDate(p.fechaCreacion)}</span></div>
        <div><span class="pp-meta-label">Enviado</span><span class="pp-meta-val">${p.fechaEnvio?fmtDate(p.fechaEnvio):'—'}</span></div>
        <div><span class="pp-meta-label">Estado</span><span class="pp-meta-val pp-estado-${p.estadoQuiniela}">${esc(estadoLabel)}</span></div>
      </div>
    </div>
    <div class="pp-special">
      <div class="pp-col-title">Preguntas especiales</div>
      <div class="pp-special-grid">${buildPosterSpecialHtml(preds, bracket)}</div>
    </div>
    <div class="pp-body">
      <div class="pp-col-groups">
        <div class="pp-col-title">Fase de grupos</div>
        ${buildPosterGroupsHtml(preds)}
      </div>
      <div class="pp-col-elim">
        <div class="pp-col-title">Fase eliminatoria</div>
        ${buildPosterElimHtml(preds, bracket)}
      </div>
    </div>
    <div class="pp-footer">Quiniela Borracha 2026 &middot; Código ${esc(p.codigo||'—')} &middot; Generado el ${new Date().toLocaleDateString('es-VE')}</div>
  `;

  toast('Generando PDF...');
  waitForImages(poster).then(()=>{
    return html2canvas(poster, {scale:2, backgroundColor:'#FFFFFF', useCORS:true});
  }).then(canvas=>{
    const imgData = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    // Página fijada a Carta horizontal real (no al tamaño del canvas): si el
    // contenido terminó un poco más alto/bajo de lo calculado, la imagen se
    // estira para llenar igual la hoja completa, en vez de cortarse.
    const pdf = new jsPDF({ orientation:'l', unit:'mm', format:[CARTA_MM.w, CARTA_MM.h] });
    pdf.addImage(imgData, 'PNG', 0, 0, CARTA_MM.w, CARTA_MM.h);
    const safeName = (p.name||'quiniela').toLowerCase().replace(/[^a-z0-9]+/g,'_');
    pdf.save(`quiniela_${safeName}.pdf`);
    toast('PDF descargado.');
  }).catch(()=>{
    toast('No se pudo generar el PDF.', true);
  });
}

// v1.0 — Revisa cada 30s si el cierre automático recién se cumplió
// mientras la página está abierta (para no depender de que alguien
// recargue). Solo re-renderiza en el INSTANTE en que el estado realmente
// cambia (no en cada chequeo), para no interrumpir a alguien que esté
// escribiendo en pleno — exactamente lo que se busca: el bloqueo se nota
// justo cuando ocurre, ni antes ni después.
let LAST_KNOWN_CLOSED = isGloballyClosed();
setInterval(()=>{
  const nowClosed = isGloballyClosed();
  if(nowClosed !== LAST_KNOWN_CLOSED){
    LAST_KNOWN_CLOSED = nowClosed;
    if(DRAFT_PID) render();
  }
}, 30000);

render();

// v6.2 — La conexión a Firestore (rgWireFirestoreSync) ahora la dispara
// participantes.js, que carga antes que este archivo y es compartida con
// app.js. No hace falta repetirla aquí.

/* ════════════════════════════════════════
   NOTA DE SEGURIDAD (v6.0, Fase 1) — LEER ANTES DE USAR EN PRODUCCIÓN
   ════════════════════════════════════════
   Este módulo escribe en Firestore en el documento registro/estado SIN
   pasar por Firebase Auth (a diferencia de quiniela/estado, que solo
   escribe el admin autenticado). Esto es necesario para que cualquier
   participante pueda registrar/editar su propia quiniela sin tener que
   iniciar sesión como admin.

   Para que esto funcione, las reglas de seguridad de Firestore deben
   permitir escritura pública en esa ruta específica, por ejemplo:

     match /registro/estado {
       allow read: if true;
       allow write: if true;
     }

   (mientras que quiniela/estado sigue restringido solo al admin, como ya
   está hoy). Mientras esa regla no se agregue en la consola de Firebase,
   los intentos de escritura fallarán con "permission-denied": el formulario
   seguirá funcionando con la caché local (localStorage) de cada navegador,
   pero NO se sincronizará entre dispositivos hasta que se actualice la regla.

   Esto es un nivel de seguridad equivalente al que ya tenía el prototipo
   original (panel admin "sin autenticación"), solo que ahora el panel
   Admin SÍ exige isAdmin() en la interfaz. La protección a nivel de datos
   (que solo el dueño real de una quiniela pueda editarla) requeriría
   Firebase Auth por participante o Cloud Functions de validación — fuera
   de alcance de esta Fase 1, documentado como pendiente para Fase 2.
   ════════════════════════════════════════ */

})();
