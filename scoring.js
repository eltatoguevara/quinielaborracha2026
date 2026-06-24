/* ════════════════════════════════════════════════════════════
   SCORING — cálculo de puntos, standings y bracket (v6.3, Punto 2)
   ════════════════════════════════════════════════════════════
   39 funciones extraídas de app.js: todo el motor de puntaje (básicos,
   avanzado, eliminatoria, bonos, batallas, cierre de fases, standings
   de grupo, desempates, bracket). Cero acceso a document/DOM directo,
   pero SÍ leen y escriben estado global mutable (S, DB, MD, PL,
   BONUS_PHASES, etc.) que vive en app.js, y llaman a funciones que se
   quedaron en app.js (toast(), save()) — eso funciona bien porque para
   cuando estas funciones se INVOCAN (nunca al cargar el script, solo
   en respuesta a eventos o al renderRank() final de app.js), ya está
   todo cargado.

   Se carga ANTES de app.js en index.html. Ver nota de orden en utils.js.
   ════════════════════════════════════════════════════════════ */

function calcPts(name){
  let pts=0;
  MIDS.forEach(mid=>{
    const s=sc(mid);if(!s)return;
    const p=MD[mid]?.preds[name];if(!p)return;
    const rR=s.h>s.a?"H":s.h<s.a?"A":"D";
    const pR=p.h>p.a?"H":p.h<p.a?"A":"D";
    if(rR===pR){pts+=rR==="D"?3:2;if(p.h===s.h&&p.a===s.a)pts+=3;}
  });return pts;
}

function getDynamicSpec(name){
  const person=(DB.participants||[]).find(p=>p.name===name);
  if(!person)return null;
  const raw=(DB.predictions[person.id]||{}).special;
  if(!raw)return null;
  const out={};
  Object.entries(SPECIAL_FIELD_MAP_V62).forEach(([newKey,oldKey])=>{
    if(raw[newKey]!==undefined&&raw[newKey]!=='') out[oldKey]=raw[newKey];
  });
  return out;
}

function calcAdv(name){
  const r=S.reality;
  const spec=getDynamicSpec(name)||{};
  const a=Object.keys(spec).length?spec:(S.adv[name]||{});
  const nn=s=>(s||"").trim().toLowerCase();
  let ap=0;
  if(nn(a.champ)&&nn(a.champ)===nn(r.champ))ap+=15;
  if(nn(a.runner)&&nn(a.runner)===nn(r.runner))ap+=10;
  if(nn(a.third)&&nn(a.third)===nn(r.third))ap+=8;
  // Scorer: must match scorer first to get goals bonus
  const scorerMatch=nn(a.scorer)&&nn(r.topScorer)&&nn(a.scorer)===nn(r.topScorer);
  if(scorerMatch){
    ap+=12;
    if(r.topScorerGoals>0&&parseInt(a.scorerGoals)===parseInt(r.topScorerGoals))ap+=8;
  }
  // Top country: must match country first to get goals bonus
  const countryMatch=nn(a.topCountry)&&nn(r.topCountry)&&nn(a.topCountry)===nn(r.topCountry);
  if(countryMatch){
    ap+=8;
    if(r.topCountryGoals>0&&parseInt(a.topCountryGoals)===parseInt(r.topCountryGoals))ap+=10;
  }
  if(nn(a.mostConceded)&&nn(a.mostConceded)===nn(r.mostConceded))ap+=8;
  return ap;
}

function elimPred(name,pid){
  const person=(DB.participants||[]).find(p=>p.name===name);
  if(!person)return null;
  const slot=PID_TO_SLOT[pid];if(!slot)return null;
  const rec=(DB.predictions[person.id]||{})[slot];
  if(!rec)return null;
  return{h:rec.h,a:rec.a};
}

function getElimTeams(name,pid){
  const person=(DB.participants||[]).find(p=>p.name===name);
  if(!person)return null;
  const slot=PID_TO_SLOT[pid];if(!slot)return null;
  const rec=(DB.predictions[person.id]||{})[slot];
  if(!rec||!rec._a||!rec._b||rec._a==="?")return null;
  return{h:rec._a,a:rec._b};
}

function getPredWinner(name,pid,wantLoser=false){
  const teams=getElimTeams(name,pid);if(!teams)return null;
  const pred=elimPred(name,pid);if(!pred)return null;
  let winner,loser;
  if(pred.h>pred.a){winner=teams.h;loser=teams.a;}
  else if(pred.a>pred.h){winner=teams.a;loser=teams.h;}
  else{winner=teams.h;loser=teams.a;} // empate → locales avanzan por defecto (penales)
  return wantLoser?loser:winner;
}

function getRealElimTeams(pid){
  if(ELIM_1_16_IDS.includes(pid)){
    const t=S.elimTeams[pid];
    if(!t||!t.h||!t.a)return null;
    return{h:t.h,a:t.a};
  }
  const node=ELIM_TREE[pid];if(!node)return null;
  const teamH=getRealWinner(node.parentH,node.useLoserH);
  const teamA=getRealWinner(node.parentA,node.useLoserA);
  if(!teamH||!teamA)return null;
  return{h:teamH,a:teamA};
}

function getRealWinner(pid,wantLoser=false){
  const sc=S.elimScores[pid];if(!sc)return null;
  const teams=getRealElimTeams(pid);if(!teams)return null;
  let winner,loser;
  if(sc.h>sc.a){winner=teams.h;loser=teams.a;}
  else if(sc.a>sc.h){winner=teams.a;loser=teams.h;}
  else{
    // Empate: usar tieBreaker definido por admin, si no hay → local avanza
    const tb=S.tieBreakers[pid];
    if(tb==="a"){winner=teams.a;loser=teams.h;}
    else{winner=teams.h;loser=teams.a;}
  }
  return wantLoser?loser:winner;
}

function isLlaveCorrecta(name,pid){
  const pred=getElimTeams(name,pid);
  const real=getRealElimTeams(pid);
  if(!pred||!real)return false;
  const ps=new Set([n(pred.h),n(pred.a)]);
  const rs=new Set([n(real.h),n(real.a)]);
  return [...ps].every(x=>rs.has(x));
}

// ── Cruce válido (criterio ampliado de llave) ──────────────────────
// Si la llave EXACTA de "pid" falló (equipos predichos ≠ equipos reales
// de ESE pid), igual reconocemos el acierto si ese mismo cruce (los 2
// países, sin importar local/visitante) ocurrió REALMENTE en otro pid
// DENTRO DE LA MISMA RONDA (ELIM_ROUNDS). Es un consuelo exclusivo:
// solo se evalúa cuando isLlaveCorrecta(name,pid) ya es false — si la
// llave exacta es correcta, este camino ni se intenta (y de hecho dos
// países no pueden cruzarse 2 veces reales en la misma ronda, así que
// no hay forma de que ambos caminos den true a la vez para pids
// distintos).
//
// Devuelve null si no hay cruce válido, o {pidReal, real, swapped} si
// lo hay: pidReal = el pid donde realmente ocurrió el cruce, real = el
// marcador real EN ESE pid, swapped = true si el local/visitante real
// está invertido respecto a como el participante predijo (para poder
// realinear el marcador antes de comparar ganador/empate/exacto).
function findCruceValido(name,pid){
  const pred=getElimTeams(name,pid);
  if(!pred)return null;
  if(isLlaveCorrecta(name,pid))return null; // consuelo exclusivo
  const round=ELIM_ROUNDS.find(r=>r.ids.includes(pid));
  if(!round)return null;
  const ps=new Set([n(pred.h),n(pred.a)]);
  for(const pid2 of round.ids){
    if(pid2===pid)continue;
    const sc2=S.elimScores[pid2]||S.elimScores[String(pid2)];
    if(!sc2)continue; // ese cruce todavía no tiene resultado real
    const real2=getRealElimTeams(pid2);
    if(!real2)continue;
    const rs=new Set([n(real2.h),n(real2.a)]);
    if(ps.size!==rs.size)continue;
    if(![...ps].every(x=>rs.has(x)))continue;
    // Mismo par de países encontrado en otra llave de la ronda.
    // ¿Está invertido el orden h/a respecto a la predicción?
    const swapped=n(pred.h)!==n(real2.h);
    return{pidReal:pid2,real:sc2,swapped};
  }
  return null;
}

function phaseForPid(pid){
  return BONUS_PHASES.find(p=>p.elimPhase&&p.mids.includes(pid))||null;
}

// Desglose detallado de los puntos de una llave eliminatoria para un
// participante: de dónde viene cada punto (llave exacta o por cruce,
// ganador/empate, marcador exacto), para mostrarlo en la UI en vez de
// solo el total. calcElimMatchPts() usa esto y suma el total, así hay
// una sola fuente de verdad y no se pueden desincronizar.
//
// Devuelve un array de items: [{label, pts}, ...] — vacío si no hay
// ningún punto otorgado (llave fallida sin cruce, sin resultado, etc).
function calcElimMatchBreakdown(name,pid){
  const phase=phaseForPid(pid);
  if(!phase)return[];
  if(!isPrevPhaseClosed(phase))return[];
  const items=[];
  const llaveOk=isLlaveCorrecta(name,pid);
  const sc=S.elimScores[pid]||S.elimScores[String(pid)];

  if(llaveOk){
    items.push({label:"Llave",pts:2});
    if(sc){
      const pred=elimPred(name,pid);
      if(pred){
        const rR=sc.h>sc.a?"H":sc.h<sc.a?"A":"D";
        const pR=pred.h>pred.a?"H":pred.h<pred.a?"A":"D";
        if(rR===pR){
          items.push({label:rR==="D"?"Empate":"Ganador",pts:rR==="D"?3:2});
          if(pred.h===sc.h&&pred.a===sc.a)items.push({label:"Marcador exacto",pts:3});
        }
      }
    }
  } else {
    const cruce=findCruceValido(name,pid);
    if(cruce){
      items.push({label:"Cruce",pts:2});
      const pred=elimPred(name,pid);
      if(pred){
        const realH=cruce.swapped?cruce.real.a:cruce.real.h;
        const realA=cruce.swapped?cruce.real.h:cruce.real.a;
        const rR=realH>realA?"H":realH<realA?"A":"D";
        const pR=pred.h>pred.a?"H":pred.h<pred.a?"A":"D";
        if(rR===pR){
          items.push({label:rR==="D"?"Empate":"Ganador",pts:rR==="D"?3:2});
          if(pred.h===realH&&pred.a===realA)items.push({label:"Marcador exacto",pts:3});
        }
      }
    }
  }
  return items;
}

function calcElimMatchPts(name,pid){
  return calcElimMatchBreakdown(name,pid).reduce((sum,item)=>sum+item.pts,0);
}

function calcClassifiedPtsForPhase(name,phase){
  if(!phase.classifiedPts)return 0;
  if(!isPrevPhaseClosed(phase))return 0;
  if(!phase.elimPhase)return 0;
  // Build set of real advancers from this phase
  const realAdvancers=getRealAdvancers(phase);
  let pts=0;
  // For each match in this phase, check predicted winner
  phase.mids.forEach(pid=>{
    const predTeams=getElimTeams(name,pid);if(!predTeams)return;
    const pred=elimPred(name,pid);if(!pred)return;
    let predWinner;
    if(pred.h>pred.a)predWinner=predTeams.h;
    else if(pred.a>pred.h)predWinner=predTeams.a;
    else predWinner=predTeams.h;
    // Check if predWinner is in real advancers (team, not llave)
    if(predWinner&&realAdvancers.has(n(predWinner)))pts+=phase.classifiedPts;
  });
  return pts;
}

function calcElimPts(name){
  let pts=0;
  // Match pts
  for(let pid=73;pid<=104;pid++)pts+=calcElimMatchPts(name,pid);
  // Classified pts — en vivo por fase (gated por isPrevPhaseClosed)
  BONUS_PHASES.forEach(phase=>{
    if(phase.elimPhase)pts+=calcClassifiedPtsForPhase(name,phase);
  });
  return pts;
}

function isPrevPhaseClosed(phase){
  if(!phase.prevPhase)return true; // grupos has no prereq
  return !!(S.bonos.closed?.[phase.prevPhase]);
}

function getPhaseByKey(key){return BONUS_PHASES.find(p=>p.key===key)||null;}

function calcBonos(name){
  let pts=0;
  Object.values(S.bonos.lastPlace||{}).forEach(lp=>{
    if(lp&&lp.name===name)pts+=lp.pts;
  });
  return pts;
}

function getTodaysMatchIds(){
  const now=new Date();
  const y=now.getFullYear(),m=now.getMonth(),d=now.getDate();
  const isToday=(ts)=>{
    if(!ts)return false;
    const dt=new Date(ts);
    return dt.getFullYear()===y&&dt.getMonth()===m&&dt.getDate()===d;
  };
  const groupMids=MIDS.filter(mid=>isToday(S.matchTimes[mid]));
  const elimMids=[];
  for(let pid=73;pid<=104;pid++){if(isToday(S.elimTimes[pid]))elimMids.push(pid);}
  return{groupMids,elimMids};
}

function calcBattlePts(name,groupMids,elimMids){
  let pts=0;
  groupMids.forEach(mid=>{
    const s=sc(mid);if(!s)return;
    const p=MD[mid]?.preds[name];if(!p)return;
    const rR=s.h>s.a?"H":s.h<s.a?"A":"D";
    const pR=p.h>p.a?"H":p.h<p.a?"A":"D";
    if(rR===pR){pts+=rR==="D"?3:2;if(p.h===s.h&&p.a===s.a)pts+=3;}
  });
  elimMids.forEach(pid=>{pts+=calcElimMatchPts(name,pid);});
  return pts;
}

function areTodaysMatchesDone(groupMids,elimMids){
  const gDone=groupMids.every(mid=>{const s=sc(mid);return!!s&&!s.live;});
  const eDone=elimMids.every(pid=>{const s=S.elimScores[pid]||S.elimScores[String(pid)];return!!s&&!s.live;});
  return gDone&&eDone;
}

function isPhaseComplete(phase){
  if(!phase.elimPhase){
    // JSON coerces numeric keys to strings on parse, so check both
    return phase.mids.every(mid=>!!(S.scores[mid]||S.scores[String(mid)]));
  }else{
    return phase.mids.every(pid=>!!(S.elimScores[pid]||S.elimScores[String(pid)]));
  }
}

function calcTotalAtCut(name,phaseKey){
  const b=calcPts(name);
  const av=calcAdv(name);
  const elim=calcElimPts(name); // incluye fase actual (en vivo), no la siguiente
  // Last place bonuses from PREVIOUS phases only
  let prevLastBonos=0;
  Object.entries(S.bonos.lastPlace||{}).forEach(([k,lp])=>{
    if(k!==phaseKey&&lp&&lp.name===name)prevLastBonos+=lp.pts;
  });
  return b+av+elim+prevLastBonos;
}

function calcClassifiedPts(name,phase){
  if(!phase.classifiedPts||phase.classifiedPts===0)return 0;
  let pts=0;
  // Los clasificados REALES son los ganadores de los partidos de esta fase
  const realWinners=new Set();
  phase.mids.forEach(pid=>{
    const sc=S.elimScores[pid];if(!sc)return;
    const teams=getRealElimTeams(pid);if(!teams)return;
    let winner;
    if(sc.h>sc.a)winner=teams.h;
    else if(sc.a>sc.h)winner=teams.a;
    else winner=teams.h; // empate → local (penales)
    if(winner)realWinners.add(n(winner));
  });
  // Los clasificados PREDICHOS por el participante = ganadores que predijo en esta fase
  phase.mids.forEach(pid=>{
    const predTeams=getElimTeams(name,pid);if(!predTeams)return;
    const pred=elimPred(name,pid);if(!pred)return;
    let predWinner;
    if(pred.h>pred.a)predWinner=predTeams.h;
    else if(pred.a>pred.h)predWinner=predTeams.a;
    else predWinner=predTeams.h;
    if(predWinner&&realWinners.has(n(predWinner)))pts+=phase.classifiedPts;
  });
  return pts;
}

function calcLlavePts(name,phase){
  if(!phase.llavePts||phase.llavePts===0)return 0;
  let pts=0;
  phase.mids.forEach(pid=>{
    // Solo si el partido tiene resultado (la llave es real)
    const hasSc=phase.elimPhase?!!S.elimScores[pid]:!!S.scores[pid];
    if(!hasSc)return;
    // Verificar si la llave predicha coincide con la real
    if(isLlaveCorrecta(name,pid))pts+=phase.llavePts;
  });
  return pts;
}

function closePhase(phaseKey){
  const phase=BONUS_PHASES.find(p=>p.key===phaseKey);
  if(!phase){toast("Fase no encontrada",true);return;}
  if(!isPhaseComplete(phase)){toast("Faltan resultados en esta fase",true);return;}
  if(S.bonos.closed?.[phaseKey]){toast("Esta fase ya está cerrada",true);return;}
  // Check prereq: prev phase must be closed first
  if(phase.prevPhase&&!S.bonos.closed?.[phase.prevPhase]){
    const prev=getPhaseByKey(phase.prevPhase);
    toast(`Primero debes cerrar: ${prev?.label||phase.prevPhase}`,true);return;
  }

  // PASO 1: Adjudicar bono de último lugar
  if(phase.lastPts>0){
    const ranking=PL.map(name=>({name,total:calcTotalAtCut(name,phaseKey)}))
                    .sort((a,b)=>a.total-b.total);
    const last=ranking[0];
    if(last){
      if(!S.bonos.lastPlace)S.bonos.lastPlace={};
      S.bonos.lastPlace[phaseKey]={name:last.name,pts:phase.lastPts,total:last.total,phase:phase.label};
    }
  }

  // Marcar fase como cerrada (esto activa llaves+clasificados en calcElimPts)
  if(!S.bonos.closed)S.bonos.closed={};
  S.bonos.closed[phaseKey]=true;

  save();renderRank();renderBonosPanel();

  // Show who got last place bonus
  const lp=S.bonos.lastPlace?.[phaseKey];
  const msg=lp&&phase.lastPts>0
    ?`✓ ${phase.label} cerrada · 🚑 Último: ${sn(lp.name)} +${lp.pts}pts`
    :`✓ ${phase.label} cerrada`;
  toast(msg);
}

function checkAndAwardBonos(){
  // FIX: antes esta función devolvía `false` siempre, sin importar lo que
  // hiciera autoCloseCompletedPhases() — por eso runBonosCheck() (el botón
  // "🎁 revisar bonos") decía "Sin fases nuevas completadas" incluso cuando
  // el cierre automático SÍ había cerrado una fase un segundo antes. Ahora
  // se propaga el resultado real de autoCloseCompletedPhases().
  if(S.autoClose)return autoCloseCompletedPhases();
  return false;
}

function autoCloseCompletedPhases(){
  // FIX: antes devolvía undefined (sin return explícito) — ahora devuelve
  // si efectivamente cerró algo, para que checkAndAwardBonos() pueda
  // informarlo correctamente.
  if(!S.autoClose)return false;
  let any=false;
  // Process in order so prereqs are satisfied
  BONUS_PHASES.forEach(phase=>{
    if(S.bonos.closed?.[phase.key])return;
    if(!isPhaseComplete(phase))return;
    if(!isPrevPhaseClosed(phase))return; // respect chain
    // Adjudicate last place
    if(phase.lastPts>0){
      const ranking=PL.map(name=>({name,total:calcTotalAtCut(name,phase.key)})).sort((a,b)=>a.total-b.total);
      const last=ranking[0];
      if(last){
        if(!S.bonos.lastPlace)S.bonos.lastPlace={};
        S.bonos.lastPlace[phase.key]={name:last.name,pts:phase.lastPts,total:last.total,phase:phase.label};
      }
    }
    if(!S.bonos.closed)S.bonos.closed={};
    S.bonos.closed[phase.key]=true;
    any=true;
    const lp=S.bonos.lastPlace?.[phase.key];
    toast(`✓ Auto-cerrada: ${phase.label}${lp&&phase.lastPts>0?" · 🚑 "+sn(lp.name)+" +"+lp.pts+"pts":""}`);
  });
  if(any){save();renderRank();renderBonosPanel();}
  return any;
}

function reopenPhase(key){
  if(!confirm(`¿Reabrir fase "${key}"? Se borrarán los bonos adjudicados para esa fase.`))return;
  if(S.bonos.closed)delete S.bonos.closed[key];
  if(S.bonos.lastPlace)delete S.bonos.lastPlace[key];
  if(S.bonos.classified)delete S.bonos.classified[key];
  if(S.bonos.llaves)delete S.bonos.llaves[key];
  save();renderRank();renderBonosPanel();
  toast(`✓ Fase ${key} reabierta`);
}

function runBonosCheck(){
  const awarded=checkAndAwardBonos();
  if(!awarded)toast("Sin fases nuevas completadas");
  renderBonosPanel();
}

function clearAllBonos(){
  if(!confirm("¿Limpiar TODOS los bonos adjudicados? Esto reabre todas las fases."))return;
  S.bonos={lastPlace:{},classified:{},llaves:{},closed:{}};
  save();renderRank();renderBonosPanel();
  toast("✓ Bonos limpiados");
}

function calcGroupStandings() {
  // teams[group][teamName] = {pts, gf, ga, gd, played, w, d, l, fairPlay}
  const teams = {};
  // Inicializar todos los equipos en sus grupos
  const groupTeams = {}; // group → [teamNames]
  Object.entries(GES).forEach(([g, arr]) => {
    groupTeams[g] = arr.map(x => x.replace(/^\S+\s/, "").trim());
    teams[g] = {};
    groupTeams[g].forEach(t => {
      teams[g][t] = {pts:0, gf:0, ga:0, gd:0, played:0, w:0, d:0, l:0, fp:0, name:t};
    });
  });

  // Procesar todos los partidos de grupos (P1–P72)
  for (let mid = 1; mid <= 72; mid++) {
    const sc = S.scores[mid]; if (!sc) continue;
    const g = MGMAP[mid]; if (!g) continue;
    const abbrs = MID_ABBRS[mid]; if (!abbrs) continue;
    const [ha, aa] = abbrs.split("|");
    const hName = abbr2name(ha);
    const aName = abbr2name(aa);
    const ht = teams[g]?.[hName];
    const at = teams[g]?.[aName];
    if (!ht || !at) continue;

    ht.gf += sc.h; ht.ga += sc.a; ht.gd += (sc.h - sc.a); ht.played++;
    at.gf += sc.a; at.ga += sc.h; at.gd += (sc.a - sc.h); at.played++;

    if (sc.h > sc.a) { ht.pts += 3; ht.w++; at.l++; }
    else if (sc.a > sc.h) { at.pts += 3; at.w++; ht.l++; }
    else { ht.pts += 1; at.pts += 1; ht.d++; at.d++; }
  }

  // Ordenar cada grupo: pts → gd → gf → h2h pts → h2h gd → h2h gf → fairPlay
  const sorted = {};
  Object.entries(teams).forEach(([g, ts]) => {
    const arr = Object.values(ts);
    // H2H for tiebreaks between exactly-tied teams
    arr.sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.gd !== a.gd) return b.gd - a.gd;
      if (b.gf !== a.gf) return b.gf - a.gf;
      // h2h: find the match between a and b
      const h2h = calcH2H(g, a.name, b.name);
      if (h2h.aPts !== h2h.bPts) return h2h.bPts - h2h.aPts; // b=a, a=b in sort context
      if (h2h.aGd !== h2h.bGd) return h2h.bGd - h2h.aGd;
      if (h2h.aGf !== h2h.bGf) return h2h.bGf - h2h.aGf;
      return 0;
    });
    sorted[g] = arr;
  });
  return sorted;
}

function calcH2H(g, nameA, nameB) {
  let aPts=0, bPts=0, aGf=0, bGf=0;
  for (let mid = 1; mid <= 72; mid++) {
    if (MGMAP[mid] !== g) continue;
    const sc = S.scores[mid]; if (!sc) continue;
    const abbrs = MID_ABBRS[mid]; if (!abbrs) continue;
    const [ha, aa] = abbrs.split("|");
    const hName = abbr2name(ha);
    const aName2 = abbr2name(aa);
    const involved = (hName === nameA && aName2 === nameB) || (hName === nameB && aName2 === nameA);
    if (!involved) continue;
    const hIsA = hName === nameA;
    const aG = hIsA ? sc.h : sc.a;
    const bG = hIsA ? sc.a : sc.h;
    aGf += aG; bGf += bG;
    if (aG > bG) aPts += 3;
    else if (bG > aG) bPts += 3;
    else { aPts++; bPts++; }
  }
  return { aPts, bPts, aGd: aGf-bGf, bGd: bGf-aGf, aGf, bGf };
}

function getBest3rds(standings) {
  const thirds = [];
  Object.entries(standings).forEach(([g, arr]) => {
    if (arr.length >= 3) {
      thirds.push({ ...arr[2], group: g });
    }
  });
  // Ordenar los 12 terceros: pts → gd → gf → fairplay
  thirds.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.gd !== a.gd) return b.gd - a.gd;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return 0;
  });
  return thirds.slice(0, 8); // top 8
}

function annexCLookup(groups8) {
  // groups8 = array de 8 letras de grupo, ej ["B","C","D","E","F","G","H","I"]
  const key = [...groups8].sort().join("");
  const row = ANNEX_C[key];
  if (!row || row === "SKIP") return null;
  // row = [vs1A, vs1B, vs1D, vs1E, vs1G, vs1I, vs1K, vs1L]
  // Match IDs that have 3rd place opponents:
  // P74: 1E vs 3rd, P77: 1I vs 3rd, P79: 1A vs 3rd
  // P80: 1L vs 3rd, P81: 1D vs 3rd, P82: 1G vs 3rd
  // P85: 1B vs 3rd, P87: 1K vs 3rd
  return {
    P79: row[0], // 1A vs 3rd-row[0]
    P85: row[1], // 1B vs 3rd-row[1]
    P81: row[2], // 1D vs 3rd-row[2]
    P74: row[3], // 1E vs 3rd-row[3]
    P82: row[4], // 1G vs 3rd-row[4]
    P77: row[5], // 1I vs 3rd-row[5]
    P87: row[6], // 1K vs 3rd-row[6]
    P80: row[7], // 1L vs 3rd-row[7]
  };
}

function allGroupsComplete() {
  for (let mid = 1; mid <= 72; mid++) {
    if (!S.scores[mid] && !S.scores[String(mid)]) return false;
  }
  return true;
}

function getFirstBlockedElimPhase(){
  for(const phase of BONUS_PHASES){
    if(!phase.elimPhase)continue;
    if(!phase.prevPhase)continue;
    // Only block if this phase has at least some teams loaded (is active)
    const hasTeams=phase.mids.some(pid=>getRealElimTeams(pid));
    if(!hasTeams)continue;
    if(!S.bonos.closed?.[phase.prevPhase])return phase;
  }
  return null;
}

function getRealAdvancers(phase){
  const winners=new Set();
  if(!phase.elimPhase)return winners;
  phase.mids.forEach(pid=>{
    const sc=S.elimScores[pid]||S.elimScores[String(pid)];if(!sc)return;
    const teams=getRealElimTeams(pid);if(!teams)return;
    let w;
    if(sc.h>sc.a)w=teams.h;
    else if(sc.a>sc.h)w=teams.a;
    else{const tb=S.tieBreakers[pid];w=tb==="a"?teams.a:teams.h;}
    if(w)winners.add(n(w));
  });
  return winners;
}

function getClassifiedBadgeForPid(playerName, pid){
  const phase=phaseForPid(pid);
  if(!phase||!phase.classifiedPts||!isPrevPhaseClosed(phase))return null;

  // Who did this player predict to win this match?
  const predTeams=getElimTeams(playerName,pid);
  const pred=elimPred(playerName,pid);
  if(!predTeams||!pred)return null;

  let predWinner;
  if(pred.h>pred.a)predWinner=predTeams.h;
  else if(pred.a>pred.h)predWinner=predTeams.a;
  else predWinner=predTeams.h; // draw → home

  if(!predWinner)return null;

  // Did this predicted winner actually advance from this phase?
  const realAdvancers=getRealAdvancers(phase);
  const advanced=realAdvancers.has(n(predWinner));

  // Flag emoji for the team
  const flag=ALL_FLAGS[predWinner]||"⚽";

  return{team:predWinner,flag,advanced,pts:phase.classifiedPts};
}

function getRank(){
  // S.hiddenPL = set of hidden participant names
  if(!S.hiddenPL)S.hiddenPL=new Set();
  return PL.map(name=>{
    const m=PM[name]||{};
    const b=calcPts(name);
    const av=calcAdv(name);
    const elim=calcElimPts(name);
    const bon=calcBonos(name);
    const hidden=S.hiddenPL instanceof Set?S.hiddenPL.has(name):!!(S.hiddenPL?.[name]);
    return{name,b,av,elim,bon,total:b+av+elim+bon,hidden,...m};
  }).sort((a,x)=>x.total-a.total);
}

function getMovement(name,pos){
  const snap=getActiveSnapshot();
  if(!snap||!snap.positions)return "";
  const prev=snap.positions[name];
  if(!prev)return "";
  const diff=prev-pos; // positivo = subió
  if(diff===0)return `<span style="font-size:10px;color:var(--qb-muted)">—</span>`;
  if(diff>0)return `<span style="font-size:10px;font-weight:800;color:#4dde8c">↑${diff}</span>`;
  return `<span style="font-size:10px;font-weight:800;color:#ef4444">↓${Math.abs(diff)}</span>`;
}

/* ════════════════════════════════════════════════════════════
   EVOLUCIÓN — v6.6 (Fase B). Panel "Mi Quiniela → Evolución".

   Idea central: en vez de guardar snapshots nuevos en Firestore (que
   habría que ir empujando manualmente o con Cloud Functions — no
   disponibles en el plan Spark), TODO se reconstruye al vuelo a partir
   de datos que YA existen: cada partido jugado (grupos o eliminatoria)
   trae una fecha real (S.matchTimes/S.elimTimes, las mismas que ya usa
   getTodaysMatchIds() para Batallas). "Reproduciendo" el torneo en orden
   cronológico con esas fechas, se puede calcular la posición de cada
   participante en CUALQUIER punto del pasado, sin haber guardado nada
   en ese momento.

   Límite a propósito: el replay solo suma puntos "Básicos" (grupos:
   ganador/empate + marcador exacto) y los 3 ítems por-partido de
   eliminatoria (Llave o Cruce + Ganador/Empate + Marcador exacto) — la
   MISMA cuenta que ya hacen calcPts()/calcElimMatchPts(). Quedan AFUERA
   del replay histórico: Clasificados (classifiedPts), Avanzado (calcAdv)
   y Bonos de último lugar — esos se otorgan al cerrar una fase completa,
   no en la fecha de un partido puntual, así que no hay fecha real a la
   que atribuirlos sin inventarla. Para que el extremo "HOY" del gráfico
   nunca quede desalineado con el Ranking real, todas las tarjetas usan
   el total OFICIAL de getRank() para "ahora" y solo usan el replay para
   el resto de la línea de tiempo (el pasado).
   ════════════════════════════════════════════════════════════ */

// Puntos de UN solo partido de fase de grupos — misma cuenta que calcPts()
// pero aislada a un mid puntual, para poder sumarla en orden cronológico.
function calcBasicMatchPts(name,mid){
  const s=sc(mid);if(!s)return 0;
  const p=MD[mid]?.preds[name];if(!p)return 0;
  const rR=s.h>s.a?"H":s.h<s.a?"A":"D";
  const pR=p.h>p.a?"H":p.h<p.a?"A":"D";
  if(rR!==pR)return 0;
  let pts=rR==="D"?3:2;
  if(p.h===s.h&&p.a===s.a)pts+=3;
  return pts;
}

// ¿Acertó este participante el RESULTADO (ganador/empate, no
// necesariamente el marcador) de este partido puntual? Devuelve null si
// no hay una predicción válida sobre la que evaluar (nunca jugó ese
// cruce, o el partido todavía no tiene marcador) — null se trata distinto
// de false en la racha de aciertos y en la Tendencia: un partido sin
// datos no debe contar como fallo.
function isMatchHit(name,type,id){
  if(type==='group'){
    const s=sc(id);if(!s)return null;
    const p=MD[id]?.preds[name];if(!p)return null;
    const rR=s.h>s.a?"H":s.h<s.a?"A":"D";
    const pR=p.h>p.a?"H":p.h<p.a?"A":"D";
    return rR===pR;
  }
  const llaveOk=isLlaveCorrecta(name,id);
  const cruceOk=!llaveOk&&!!findCruceValido(name,id);
  if(!llaveOk&&!cruceOk)return null;
  const items=calcElimMatchBreakdown(name,id);
  return items.some(it=>it.label==='Ganador'||it.label==='Empate');
}

// ¿Hubo marcador EXACTO en este partido puntual para este participante?
function isMatchExacto(name,type,id){
  if(type==='group'){
    const s=sc(id);if(!s)return false;
    const p=MD[id]?.preds[name];if(!p)return false;
    return p.h===s.h&&p.a===s.a;
  }
  return calcElimMatchBreakdown(name,id).some(it=>it.label==='Marcador exacto');
}

// Lista cronológica de TODOS los partidos (grupos + eliminatoria) que ya
// tienen marcador real cargado, ordenados por fecha real de juego. Si un
// partido tiene marcador pero nunca se le registró fecha (ESPN no la
// trajo a tiempo, o el admin lo cargó a mano), se ubica "ahora" para no
// perder esos puntos del total — queda al final de la línea de tiempo en
// vez de en una fecha inventada.
function getChronoMatchEvents(){
  const events=[];
  MIDS.forEach(mid=>{
    const s=sc(mid);if(!s)return;
    events.push({ts:S.matchTimes[mid]||Date.now(),type:'group',id:mid});
  });
  for(let pid=73;pid<=104;pid++){
    const s=S.elimScores[pid]||S.elimScores[String(pid)];if(!s)continue;
    events.push({ts:S.elimTimes[pid]||Date.now(),type:'elim',id:pid});
  }
  events.sort((a,b)=>a.ts-b.ts);
  return events;
}

// El corazón del replay: por cada partido jugado, en orden cronológico,
// cuánto va sumando cada participante, y qué posición ocupa cada uno
// justo después de ese partido. Un snapshot por partido (no por
// participante) — los 27 comparten la misma línea de tiempo de eventos.
// v6.6 — Los participantes ocultos (S.hiddenPL) NO ocupan un puesto del
// ranking histórico, igual que ya hace getDashStatsInfo() con el ranking
// actual — si no, la posición de Evolución no coincidiría con la que el
// participante ya ve en la tarjeta de Mi Perfil.
function buildHistoricalSnapshots(events){
  events=events||getChronoMatchEvents();
  const isHidden=name=>{
    if(!S.hiddenPL)return false;
    return S.hiddenPL instanceof Set?S.hiddenPL.has(name):!!(S.hiddenPL?.[name]);
  };
  const visibleNames=PL.filter(name=>!isHidden(name));
  const cum={};PL.forEach(name=>cum[name]=0);
  return events.map(ev=>{
    PL.forEach(name=>{
      cum[name]+=ev.type==='group'?calcBasicMatchPts(name,ev.id):calcElimMatchPts(name,ev.id);
    });
    const ranked=visibleNames.slice().sort((a,b)=>cum[b]-cum[a]);
    const ranks={};ranked.forEach((name,idx)=>{ranks[name]=idx+1;});
    return{ts:ev.ts,totals:{...cum},ranks};
  });
}

// Agrupa los snapshots por DÍA CALENDARIO (1 "jornada" = 1 fecha real con
// al menos un partido jugado). Para cada jornada guarda el acumulado de
// puntos al EMPEZAR el día (startCum, = el acumulado al cerrar el día
// anterior) y al TERMINAR el día (endCum, = el último snapshot del día) —
// la diferencia es cuánto sumó cada participante ESE día puntual.
function groupSnapshotsByJornada(snapshots){
  const days=[];
  let prevCum={};PL.forEach(name=>prevCum[name]=0);
  let cur=null;
  snapshots.forEach(snap=>{
    const d=new Date(snap.ts);
    const dayKey=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    if(!cur||cur.dayKey!==dayKey){
      if(cur)days.push(cur);
      cur={dayKey,ts:snap.ts,startCum:{...prevCum},endCum:null,ranks:null};
    }
    cur.ts=snap.ts; // se queda con la fecha del ÚLTIMO partido del día
    cur.endCum=snap.totals;
    cur.ranks=snap.ranks;
    prevCum=snap.totals;
  });
  if(cur)days.push(cur);
  return days;
}

// Historial puntual (partido por partido, no por jornada) de aciertos de
// UN participante, filtrando los partidos donde nunca llegó a tener una
// predicción válida (no cuentan ni como acierto ni como fallo). Cada
// entrada lleva también la posición en el ranking justo después de ese
// partido (del replay), para que la Tendencia pueda comparar "antes" vs
// "ahora" sin tener que recorrer todo de nuevo.
function getParticipantMatchHistory(name,events,snapshots){
  const hist=[];
  events.forEach((ev,idx)=>{
    const hit=isMatchHit(name,ev.type,ev.id);
    if(hit===null)return;
    hist.push({ts:ev.ts,hit,rank:snapshots[idx].ranks[name]});
  });
  return hist;
}

// 📈 Tendencia — compara los últimos N partidos con los N anteriores a
// esos (N=20, o menos si todavía no se jugaron suficientes). Devuelve
// available:false si hay muy pocos partidos jugados para que la
// comparación tenga sentido (mínimo 10 en cada ventana).
function getTendenciaStats(name,events,snapshots,rankNow){
  const hist=getParticipantMatchHistory(name,events,snapshots);
  const winSize=Math.min(20,Math.floor(hist.length/2));
  if(winSize<5)return{available:false,totalPlayed:hist.length};
  const last=hist.slice(-winSize);
  const prev=hist.slice(-winSize*2,-winSize);
  const hitRate=arr=>arr.length?Math.round(100*arr.filter(h=>h.hit).length/arr.length):null;
  const precAhora=hitRate(last);
  const precAntes=hitRate(prev.length?prev:last);
  const rankAntes=hist[hist.length-winSize].rank;
  let trend='estable';
  if(precAhora>precAntes||(precAhora===precAntes&&rankNow<rankAntes))trend='mejorando';
  else if(precAhora<precAntes||(precAhora===precAntes&&rankNow>rankAntes))trend='empeorando';
  return{available:true,winSize,precAntes,precAhora,rankAntes,rankNow,trend};
}

// 🎯 Logros — umbrales fijos acordados: Top 15/10/5/3, Primer marcador
// exacto, y 10 aciertos consecutivos. bestPos es la MEJOR posición que
// el participante alcanzó en cualquier momento (incluyendo hoy, con el
// total oficial) — una vez alcanzado un umbral, el logro queda para
// siempre, aunque después bajen posiciones.
function getLogrosStats(name,events,days,rankNow){
  let exactoAlguna=false;
  events.forEach(ev=>{ if(isMatchExacto(name,ev.type,ev.id))exactoAlguna=true; });

  let bestStreak=0,cur=0;
  events.forEach(ev=>{
    const hit=isMatchHit(name,ev.type,ev.id);
    if(hit===null)return; // no rompe la racha: simplemente no hay dato
    if(hit){cur++;bestStreak=Math.max(bestStreak,cur);}else cur=0;
  });

  const histPositions=days.map(d=>d.ranks[name]).filter(Boolean);
  const bestPos=Math.min(rankNow,...(histPositions.length?histPositions:[rankNow]));

  const TIERS=[15,10,5,3];
  const unlockedTiers=TIERS.filter(t=>bestPos<=t);
  const nextTier=TIERS.find(t=>bestPos>t)||null;

  return{exactoAlguna,bestStreak,racha10:bestStreak>=10,bestPos,unlockedTiers,nextTier};
}