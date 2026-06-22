/* ════════════════════════════════════════════════════════════
   CÓDIGO LEGACY — Migración de los 27 participantes (v6.2)
   ════════════════════════════════════════════════════════════
   Este archivo contiene TODAS las constantes y funciones relacionadas
   con la migración de los 27 participantes originales (v0-v5.x) hacia
   el nuevo sistema dinámico basado en Firestore (v6.0+).

   SE CARGA ANTES DE app.js en index.html para que runMigracionLegacy()
   esté disponible cuando app.js lo necesite (botón admin).

   CONTENIDO:
   - LEGACY_PL, LEGACY_RAW, LEGACY_MID_LABELS: predicciones de grupos
   - LEGACY_PM: perfiles (ciudad, país, links)
   - LEGACY_ELIM_PRED_TEAMS, LEGACY_ELIMRAW, LEGACY_ELIM_SPEC: eliminatoria
   - legacyElimPred/legacyGetElimTeams/legacyGetPredWinner: lógica de lectura
   - legacyMigrateOnePerson: convierte un participante a nuevo formato
   - runMigracionLegacy: dispara la migración en el panel admin

   NOTA: Este bloque es COMPLETO e INDEPENDIENTE. Se puede mover, remover
   o volver a cargar sin afectar el resto de app.js. La única dependencia
   externa es la función global isAdmin() que viene de app.js.
   ════════════════════════════════════════════════════════════ */

const LEGACY_PL=["ALEJANDRO MARCELLETTI","CESAR EL GOCHO","COCO PARRA","DAISY MARIANA","DAVID RODRIGUEZ","EDGAR EDUARDO GIL","EDWIN GUARDADO","EL PROFE URDANETA","EURO GUERRERO","FITA GOMEZ","GERARDO ANDARA","GUSTAVO TOVAR","JOLDAN","JOSUE TOVAR","MARIA GUEVARA","MIGUEL GUTIERREZ","MIGUEL TELLECHEA","MITRI","OTTO GAMBOA","PICH URDANETA","RAFAEL SOTO","RAFITA AREVALO","RIGO GARCIA","ROBERT SAN MIGUEL","SERGIO AREVALO","TATO GUEVARA","VANE Y ZAIDA BALLESTEROS"];

// v6.2 — LEGACY_RAW ya no se usa en vivo; solo es el dato de entrada para
// runMigracionLegacy() (ver más abajo, junto al resto de constantes LEGACY_*).
const LEGACY_RAW=[[1,"México vs Sudáfrica","2-0","2-1","2-1","2-1","2-0","2-0","2-1","2-0","1-0","2-1","2-0","2-1","2-1","2-1","2-0","2-1","1-0","2-1","2-0","2-0","2-1","2-0","3-0","1-1","2-0","2-0","2-0"],[2,"Corea del Sur vs República Checa","1-1","1-0","2-1","1-1","1-2","1-1","1-1","1-2","2-1","2-0","2-1","2-2","1-1","1-1","1-1","1-2","2-2","1-1","3-2","1-1","0-1","1-1","1-1","0-0","1-1","1-1","0-2"],[3,"Canadá vs Bosnia y Herzegovina","1-2","1-0","2-1","2-1","3-0","1-1","2-1","0-0","1-2","2-1","2-1","1-1","1-1","2-0","1-1","1-0","0-1","1-1","2-1","1-1","2-0","2-0","1-1","2-0","2-1","1-1","1-0"],[4,"Estados Unidos vs Paraguay","1-0","1-0","2-1","3-1","2-1","1-1","2-0","2-1","1-3","3-2","2-1","2-2","2-2","1-1","2-1","0-1","1-0","1-2","2-0","1-2","1-1","1-1","1-1","1-1","2-1","1-1","2-1"],[5,"Haití vs Escocia","0-2","1-3","1-2","1-2","1-2","0-0","1-2","1-3","0-3","2-3","0-2","1-2","0-2","0-2","1-2","1-2","0-2","0-2","0-2","0-3","0-2","0-2","1-2","0-2","0-2","1-2","0-2"],[6,"Australia vs Turquía","1-3","0-1","1-2","1-2","1-2","1-2","1-2","1-2","1-3","1-2","1-2","1-1","1-2","0-2","1-1","0-2","1-3","0-2","1-2","1-1","1-3","2-0","1-2","1-2","0-2","1-3","2-1"],[7,"Brasil vs Marruecos","3-2","3-1","3-0","2-2","2-2","3-1","1-1","3-2","3-2","2-1","2-1","3-1","2-0","3-0","3-1","2-1","2-1","2-1","3-2","2-1","3-1","1-1","1-1","1-1","2-1","2-2","3-0"],[8,"Catar vs Suiza","0-2","0-1","1-2","1-2","1-3","1-2","0-3","3-1","0-3","1-2","0-3","1-4","1-2","1-2","0-2","0-3","1-2","0-2","1-1","1-2","0-2","0-2","0-3","1-3","0-2","1-2","0-2"],[9,"Costa de Marfil vs Ecuador","1-1","1-2","2-2","1-1","1-2","1-0","0-1","1-0","1-2","1-2","1-2","0-2","1-2","1-2","1-1","1-2","1-3","0-1","1-2","1-1","1-2","2-1","0-0","2-2","1-1","1-2","1-0"],[10,"Alemania vs Curazao","4-0","2-0","3-0","2-1","6-0","4-0","3-0","4-0","4-0","3-1","5-0","3-0","4-0","3-0","3-0","6-0","2-0","4-0","3-0","5-0","3-0","4-0","5-0","4-0","3-0","3-0","2-0"],[11,"Países Bajos vs Japón","2-1","2-1","2-2","2-1","2-2","1-1","2-1","2-2","2-1","3-2","2-1","1-1","2-2","2-1","2-1","0-1","1-0","2-1","3-2","2-1","1-2","1-1","1-1","2-2","1-1","2-1","3-1"],[12,"Suecia vs Túnez","2-1","2-1","3-1","2-2","2-2","1-0","1-0","1-4","2-1","4-2","2-1","3-2","2-2","2-2","1-1","0-1","1-2","1-0","2-1","2-0","1-0","1-0","2-0","0-0","1-0","2-1","2-1"],[13,"Arabia Saudita vs Uruguay","2-2","1-2","2-3","1-0","1-2","1-0","0-2","0-1","1-2","1-2","0-2","0-2","1-2","1-2","0-1","1-0","1-1","0-1","1-2","1-2","1-3","1-2","1-2","1-2","0-2","1-1","1-1"],[14,"España vs Cabo Verde","5-0","2-0","3-0","1-0","4-0","3-0","3-0","3-0","4-0","3-0","4-0","3-1","3-0","3-0","2-0","6-1","2-1","1-1","3-0","4-0","4-0","5-0","5-0","4-0","3-0","1-1","3-0"],[15,"Irán vs Nueva Zelanda","2-0","1-1","1-0","0-1","2-0","0-0","2-0","1-0","1-0","1-3","0-0","1-1","1-0","1-0","2-0","1-1","1-0","1-1","0-1","1-0","1-0","1-1","1-0","1-1","1-0","1-0","1-0"],[16,"Bélgica vs Egipto","2-1","2-0","1-0","1-1","3-1","3-0","1-1","1-0","2-1","3-1","3-1","3-2","0-1","1-0","2-0","3-1","1-0","2-1","2-1","2-0","1-0","3-0","2-1","1-1","2-1","1-0","1-0"],[17,"Francia vs Senegal","3-1","1-0","1-2","2-1","2-1","2-1","2-0","2-1","2-1","4-1","3-1","2-1","3-1","3-1","2-1","4-2","1-1","2-0","3-1","2-1","3-0","3-1","3-1","2-2","2-1","2-1","3-1"],[18,"Irak vs Noruega","0-3","0-1","0-2","0-1","0-3","0-3","0-3","0-1","0-3","1-2","0-4","0-3","0-2","0-3","0-2","1-4","0-1","0-4","0-2","0-2","0-2","0-2","0-2","0-1","0-2","0-2","0-1"],[19,"Argentina vs Argelia","3-1","3-1","3-0","2-0","3-0","3-0","2-0","3-0","2-0","3-0","3-0","4-0","3-0","3-1","3-0","3-0","3-0","3-0","3-0","3-0","2-0","4-0","2-0","3-0","2-0","2-0","3-0"],[20,"Austria vs Jordania","2-1","1-0","2-1","1-1","1-0","1-1","1-1","1-1","2-1","1-1","2-0","1-1","1-1","1-0","2-0","1-0","2-1","2-0","2-1","1-0","2-1","2-0","2-1","1-1","2-0","1-1","1-1"],[21,"Ghana vs Panamá","2-1","0-1","2-1","1-1","1-2","2-0","2-1","1-2","2-1","1-3","2-0","1-1","2-1","2-1","1-1","0-1","2-0","3-2","1-2","2-1","2-1","2-0","2-1","1-0","2-0","2-1","1-2"],[22,"Inglaterra vs Croacia","3-2","2-1","2-1","1-2","2-1","2-0","2-0","1-1","2-1","3-1","2-1","2-1","1-1","2-0","2-1","1-2","1-0","2-2","3-2","2-1","2-1","1-1","1-1","2-2","3-2","1-1","2-2"],[23,"Portugal vs RD Congo","4-0","2-0","2-1","2-1","3-0","3-1","2-0","3-1","3-0","4-1","4-0","2-0","3-0","3-1","2-0","4-1","2-0","3-1","3-1","2-1","4-1","2-0","4-0","4-0","2-0","2-0","3-0"],[24,"Uzbekistán vs Colombia","0-1","0-1","1-2","1-2","1-3","0-2","0-2","1-2","0-3","2-5","0-2","1-2","1-2","1-2","1-2","0-4","0-1","1-3","0-2","1-2","1-3","0-3","1-3","0-2","0-2","1-2","1-2"],[25,"República Checa vs Sudáfrica","3-1","0-1","1-2","2-2","3-1","3-1","2-1","2-1","2-1","2-1","2-1","3-1","2-1","2-0","2-1","3-2","1-1","2-1","1-1","2-0","2-0","2-1","2-1","0-2","2-0","1-0","3-2"],[26,"Suiza vs Bosnia y Herzegovina","2-1","2-1","3-1","2-1","2-1","1-1","2-1","1-1","2-1","2-1","2-1","3-3","2-1","2-1","2-1","2-1","1-1","3-1","2-1","1-0","1-0","3-0","1-0","1-0","2-1","2-1","2-1"],[27,"Canadá vs Catar","1-0","2-0","2-1","2-1","3-0","1-0","2-0","0-2","1-0","2-2","3-1","2-0","1-1","3-1","2-0","2-0","2-0","2-1","3-2","1-0","2-1","2-0","2-0","1-0","2-0","2-0","1-0"],[28,"México vs Corea del Sur","2-2","1-1","1-2","2-1","1-0","1-2","2-0","2-0","1-2","1-2","2-1","1-2","2-1","1-0","2-1","2-0","1-2","0-2","2-1","2-1","1-0","1-1","1-1","2-1","1-1","1-1","2-1"],[29,"Brasil vs Haití","4-0","4-1","3-0","2-0","4-0","4-0","3-0","3-0","4-0","3-0","4-0","4-0","4-0","2-0","3-0","4-0","2-0","4-0","4-1","5-0","5-0","5-0","4-0","4-0","4-0","3-0","2-0"],[30,"Escocia vs Marruecos","1-3","1-0","2-1","1-2","1-3","1-2","0-2","1-1","1-2","1-1","1-2","1-3","1-2","1-2","1-1","0-2","1-3","1-3","1-3","1-2","0-2","0-3","1-3","1-3","1-2","1-2","3-1"],[31,"Turquía vs Paraguay","1-1","2-1","0-2","1-2","1-2","1-1","1-1","0-2","1-2","2-1","0-1","2-2","1-1","0-2","1-2","2-2","2-1","2-2","3-0","1-2","2-0","0-2","1-2","0-1","1-1","2-2","2-1"],[32,"Estados Unidos vs Australia","2-0","2-1","2-0","2-1","2-0","2-0","2-1","1-0","1-0","2-1","2-0","3-1","1-0","2-0","2-0","1-0","2-1","1-0","2-0","2-1","1-0","1-2","1-0","2-0","1-0","2-0","1-0"],[33,"Alemania vs Costa de Marfil","2-1","3-0","2-0","1-0","2-0","1-1","2-1","2-0","3-1","6-0","3-1","1-1","2-0","1-1","2-1","3-0","2-1","2-2","3-2","2-1","1-0","1-1","3-0","3-1","2-1","1-1","1-0"],[34,"Ecuador vs Curazao","2-0","1-0","2-0","1-1","3-0","2-0","2-0","2-1","3-0","2-1","3-0","2-0","2-0","1-0","2-0","3-1","2-0","2-0","2-1","3-0","3-0","3-0","3-0","2-0","2-0","2-0","2-0"],[35,"Países Bajos vs Suecia","3-2","2-1","1-2","2-1","3-1","2-1","2-1","2-4","3-1","2-1","2-0","2-0","2-1","3-1","2-1","2-0","2-0","2-0","3-2","2-2","3-1","2-0","3-1","2-0","2-1","3-1","2-0"],[36,"Túnez vs Japón","1-2","0-2","2-3","1-2","0-2","1-3","0-2","2-3","0-1","1-3","0-2","1-2","1-3","2-3","1-2","0-2","0-2","1-3","1-3","0-2","1-1","0-2","1-3","0-1","0-1","1-2","0-3"],[37,"Uruguay vs Cabo Verde","2-0","2-0","2-0","1-2","2-0","2-0","2-0","2-1","3-0","4-2","2-0","0-0","3-1","2-0","1-1","2-0","1-0","1-1","2-0","2-0","2-0","3-0","2-0","2-1","2-1","1-0","2-0"],[38,"España vs Arabia Saudita","3-1","2-1","3-0","2-1","2-0","1-0","2-0","2-2","2-0","3-0","3-0","4-0","2-1","2-1","2-0","4-0","2-1","4-1","3-1","3-1","3-1","3-1","3-0","3-0","2-0","3-1","2-0"],[39,"Bélgica vs Irán","3-1","2-0","1-1","1-1","2-0","2-1","1-2","0-1","3-1","2-1","3-0","2-0","2-1","2-1","2-1","4-1","3-0","5-0","2-0","2-1","3-1","2-0","3-1","2-0","1-1","3-1","1-0"],[40,"Nueva Zelanda vs Egipto","0-2","1-0","2-1","0-1","0-2","1-1","0-3","1-1","0-2","2-1","1-3","0-0","1-1","0-1","1-1","0-2","1-2","0-2","1-2","1-2","1-1","3-1","1-2","1-1","0-1","1-2","0-1"],[41,"Noruega vs Senegal","3-2","0-0","1-2","0-1","3-2","3-1","0-1","0-1","1-1","2-1","2-2","2-2","1-1","2-1","1-3","2-1","2-1","3-1","2-1","1-2","2-0","1-1","2-1","1-1","1-1","1-1","0-1"],[42,"Francia vs Irak","3-0","2-1","3-0","1-0","3-0","2-0","3-0","2-0","4-0","3-1","4-0","4-1","2-0","3-0","2-0","5-0","3-0","3-1","3-0","3-0","2-0","2-0","4-0","3-0","3-0","3-1","2-0"],[43,"Argentina vs Austria","2-1","2-1","3-0","2-1","2-1","2-1","1-1","1-1","2-1","4-1","3-1","2-0","2-1","2-1","2-1","2-0","2-0","1-1","3-1","2-1","2-0","1-1","3-1","2-1","2-1","2-1","2-0"],[44,"Jordania vs Argelia","1-1","0-1","2-1","1-2","1-1","0-1","1-2","3-1","1-2","3-1","0-3","1-1","1-2","1-1","2-1","1-0","1-2","0-1","2-3","1-1","0-1","0-1","3-1","3-1","1-2","1-1","3-1"],[45,"Inglaterra vs Ghana","2-1","3-0","2-1","3-2","2-0","3-1","2-0","3-2","3-2","1-1","3-1","3-1","3-1","3-2","2-0","3-0","3-2","2-1","3-1","2-1","2-0","3-0","3-0","3-1","2-0","3-1","1-0"],[46,"Panamá vs Croacia","0-1","1-2","1-2","1-1","1-2","0-3","1-2","1-2","0-3","2-2","0-2","1-1","0-1","1-2","1-1","0-4","1-1","0-2","1-2","0-3","1-3","0-4","1-2","1-2","0-3","0-2","2-1"],[47,"Portugal vs Uzbekistán","3-1","2-0","3-1","2-1","3-0","2-1","2-0","1-1","4-0","4-1","3-0","2-0","2-1","2-0","2-0","5-1","2-1","2-0","3-0","2-0","3-1","3-0","3-0","3-0","4-0","2-0","3-0"],[48,"Colombia vs RD Congo","2-0","2-1","2-2","3-1","3-0","1-1","2-1","2-1","2-0","3-1","2-0","2-1","3-1","2-1","1-0","3-0","2-1","2-1","2-1","2-1","2-0","2-0","3-0","2-1","3-1","2-1","2-1"],[49,"Escocia vs Brasil","1-3","2-3","1-3","1-2","1-3","1-2","0-2","1-2","1-3","1-2","1-3","1-2","1-3","1-2","1-2","1-3","0-2","0-2","1-3","0-2","1-2","0-3","1-3","1-2","0-2","1-2","1-2"],[50,"Marruecos vs Haití","3-1","2-1","2-1","1-1","3-0","1-0","3-1","1-1","3-0","2-1","3-0","2-0","3-0","3-1","2-1","4-0","2-1","4-1","3-0","3-0","3-1","3-0","3-1","2-0","3-0","3-0","1-0"],[51,"Suiza vs Canadá","3-1","2-1","2-0","1-0","2-1","1-1","1-1","2-1","2-1","2-1","2-1","2-0","2-2","2-2","2-1","1-0","0-1","1-1","1-2","2-1","0-1","2-2","0-0","2-1","2-1","1-1","2-1"],[52,"Bosnia y Herzegovina vs Catar","2-1","1-0","0-1","2-1","1-2","2-0","1-0","1-2","3-1","2-1","2-0","2-1","2-2","2-0","2-1","2-0","0-2","1-0","3-2","2-2","0-1","0-2","2-0","3-2","2-1","3-1","3-2"],[53,"República Checa vs México","1-1","0-2","1-2","2-1","1-2","1-1","1-2","2-1","2-1","1-2","1-1","1-1","2-1","1-2","1-1","2-2","1-2","1-1","1-2","1-1","0-1","2-1","1-1","0-1","1-1","1-1","1-1"],[54,"Sudáfrica vs Corea del Sur","1-2","1-2","2-2","1-2","2-2","1-2","1-2","0-0","1-2","1-2","1-2","1-2","1-2","1-1","0-2","1-2","1-1","1-2","0-2","0-2","1-2","0-1","0-2","0-0","1-2","1-2","1-2"],[55,"Curazao vs Costa de Marfil","1-2","0-0","0-2","1-2","0-2","1-1","0-2","1-2","0-2","1-2","0-3","0-2","1-2","1-2","0-1","1-2","1-2","1-3","1-2","0-3","0-2","0-5","1-3","0-0","0-2","1-1","0-2"],[56,"Ecuador vs Alemania","1-1","1-2","2-2","0-2","1-1","1-3","1-1","1-2","1-1","1-3","1-1","1-2","1-2","1-1","1-1","1-1","2-0","0-2","1-2","1-3","2-1","2-2","1-2","1-1","2-1","1-0","1-3"],[57,"Japón vs Suecia","2-2","2-1","2-2","2-1","2-1","1-1","2-1","3-2","1-1","2-3","2-1","1-2","2-0","2-1","1-1","2-1","2-1","2-1","3-2","1-1","1-1","2-2","2-2","2-0","2-1","2-1","2-2"],[58,"Túnez vs Países Bajos","1-3","0-2","0-2","1-2","0-2","0-3","0-1","2-1","1-3","1-2","0-2","0-2","1-2","1-1","0-2","0-2","0-2","0-3","2-4","1-2","0-2","0-2","0-2","1-3","0-3","1-2","1-3"],[59,"Turquía vs Estados Unidos","2-2","1-1","1-2","0-1","1-2","0-1","1-1","0-1","2-1","2-1","2-1","2-1","0-2","0-1","1-1","2-1","2-1","3-1","0-1","1-1","1-0","0-1","1-1","0-1","1-1","1-1","1-2"],[60,"Paraguay vs Australia","1-0","1-0","3-0","0-1","2-0","2-1","1-0","0-1","3-0","0-1","2-1","1-1","1-2","2-3","2-0","3-2","1-0","2-1","1-1","1-0","2-0","0-1","1-0","2-0","1-0","1-1","0-1"],[61,"Noruega vs Francia","2-2","0-1","0-2","1-1","0-1","2-1","1-2","0-1","1-2","2-2","2-3","2-2","1-2","2-2","1-1","2-3","1-1","2-2","2-2","0-2","1-2","0-2","0-2","1-3","1-2","0-2","0-1"],[62,"Senegal vs Irak","2-1","0-1","3-1","2-1","2-1","2-0","2-1","2-1","2-0","3-1","2-0","2-1","2-1","2-1","2-0","2-1","2-1","2-1","2-1","2-0","1-1","2-1","2-0","2-1","2-0","2-1","2-0"],[63,"Egipto vs Irán","2-2","0-1","2-2","1-2","1-1","3-2","1-0","1-2","1-0","2-1","2-0","2-0","0-2","2-2","1-1","2-0","2-0","2-0","3-2","2-2","1-0","1-2","2-2","2-1","1-1","1-1","1-2"],[64,"Nueva Zelanda vs Bélgica","1-4","1-2","1-2","1-2","1-3","1-3","0-2","1-3","0-3","1-3","1-3","1-2","1-3","1-3","0-2","0-5","1-3","0-3","1-2","1-3","1-3","1-3","1-4","1-3","0-2","0-4","1-3"],[65,"Cabo Verde vs Arabia Saudita","0-2","0-1","1-2","1-1","1-3","0-2","0-1","2-1","1-2","1-1","0-1","2-2","2-1","1-1","0-2","0-1","2-1","2-1","1-2","1-3","1-1","0-2","1-1","1-2","1-1","0-1","1-1"],[66,"Uruguay vs España","1-2","2-2","2-3","1-2","1-2","1-1","1-2","1-2","1-2","2-3","1-2","1-2","1-2","1-2","1-1","0-3","1-1","1-2","1-2","1-2","1-2","1-1","0-0","2-3","1-1","1-1","1-2"],[67,"Panamá vs Inglaterra","1-4","1-4","0-2","1-3","1-2","1-4","0-3","1-4","0-4","1-3","0-2","1-4","0-2","1-2","1-2","1-1","1-3","1-4","1-4","0-4","0-2","0-5","0-3","0-3","0-4","0-4","1-2"],[68,"Croacia vs Ghana","2-2","2-1","0-1","1-0","2-0","1-0","2-1","1-0","1-0","2-1","1-0","2-1","3-0","1-0","2-1","3-0","1-0","2-1","2-0","1-1","2-1","3-0","2-0","1-0","1-1","1-0","1-0"],[69,"Argelia vs Austria","1-1","0-1","1-2","0-2","1-2","1-0","0-1","1-2","2-2","1-2","1-2","1-2","1-2","1-2","1-2","1-2","1-0","1-2","0-2","0-1","1-2","1-2","1-1","1-2","1-1","1-2","1-2"],[70,"Jordania vs Argentina","0-2","1-4","1-4","1-3","0-3","0-3","0-3","1-3","0-4","1-3","0-4","1-3","1-3","1-3","1-3","0-4","0-2","0-3","0-3","0-2","1-4","1-3","0-2","1-3","0-3","0-3","1-3"],[71,"Colombia vs Portugal","1-2","1-2","2-3","2-1","1-1","1-1","2-2","2-2","2-2","3-2","1-1","1-1","1-1","2-3","1-1","2-1","1-1","1-2","2-3","2-1","1-3","1-1","1-1","2-3","1-1","1-3","0-4"],[72,"RD Congo vs Uzbekistán","1-1","1-1","2-1","1-2","0-1","2-0","1-1","2-1","2-1","2-1","0-1","1-1","1-2","2-1","1-1","0-0","0-0","1-1","0-1","1-0","1-3","2-1","1-2","2-1","1-1","2-1","2-1"]];

// Los labels ("México vs Sudáfrica") no dependen de quién predice, son
// fijos por partido — se pueden seguir sacando de LEGACY_RAW sin problema,
// es la única parte de esa constante que sigue en uso activo.
const LEGACY_MID_LABELS={};
LEGACY_RAW.forEach(r=>{ LEGACY_MID_LABELS[r[0]]=r[1]; });

const LEGACY_PM={"ALEJANDRO MARCELLETTI":{city:"Orlando, USA",country:"Portugal",link:"https://docs.google.com/spreadsheets/d/1HDqNfxTuUCkVyDkXQNmCTJtKseMSWBN5hV9iX1aG-0Y/edit"},"CESAR EL GOCHO":{city:"Orlando, USA",country:"Argentina",link:"https://docs.google.com/spreadsheets/d/1IM9iPcD1hlf1I2VlrvbnP87wm99j2qmobUSBXHUFZcU/edit"},"COCO PARRA":{city:"Maracaibo, Venezuela",country:"Brasil",link:"https://docs.google.com/spreadsheets/d/15YgfYW7yQaZ3wNCHknY75xlidukt0b3DLNaWBx3Gzig/edit"},"DAISY MARIANA":{city:"Maracaibo, Venezuela",country:"Portugal",link:"https://docs.google.com/spreadsheets/d/1ohL3F97JYUzEbbE2KW-69eeZWR6qk131Gipv1LuCgrU/edit"},"DAVID RODRIGUEZ":{city:"Barcelona, España",country:"Portugal",link:"https://docs.google.com/spreadsheets/d/1JIBlwYdowcGvC-cCkR9kTP1DOohYnmphTWWlQyi3mVg/edit"},"EDGAR EDUARDO GIL":{city:"Miami, USA",country:"Brasil",link:"https://docs.google.com/spreadsheets/d/1GoGiA9512gU7oOeslzLBK8rVr1bmxvx4BCAVOQyKeKc/edit"},"EDWIN GUARDADO":{city:"Ciudad de Panamá",country:"Francia",link:"https://docs.google.com/spreadsheets/d/1RQKMg2OKZfhWdeyUJ7B9o7KNUUuGV8qSbTUNIcz5T6U/edit"},"EL PROFE URDANETA":{city:"Burleson, Texas",country:"Argentina",link:"https://docs.google.com/spreadsheets/d/1vj7YcWYxL2dpsX9Pg7UMErwTn1prwTWhFrsGOda9kmk/edit"},"EURO GUERRERO":{city:"Ciudad de México",country:"España",link:"https://docs.google.com/spreadsheets/d/102zMn6v1YYl5dCnbTIj1ZVEF1Mz0bmmg5eqxJBDZCNI/edit"},"FITA GOMEZ":{city:"Ciudad de Panamá",country:"Argentina",link:"https://docs.google.com/spreadsheets/d/1TX0tD7pZCzgD1E3MjHg0-0oooOH443YspGZkQ-nQXL8/edit"},"GERARDO ANDARA":{city:"Atlanta, USA",country:"Argentina",link:"https://docs.google.com/spreadsheets/d/1pWjJKl7uMwqtG7z5nPlioOS1wmwlVuGpaa4rtcpQz7k/edit"},"GUSTAVO TOVAR":{city:"Ciudad de Panamá",country:"Brasil",link:"https://docs.google.com/spreadsheets/d/1R8YhntCwK26vIlrl81IMwGZlHX5ZDbHcU2y-dJvgSYU/edit"},"JOLDAN":{city:"Guayaquil, Ecuador",country:"España",link:"https://docs.google.com/spreadsheets/d/1zQ4qQnlsGT469C8Av0QIEVZKdG4-dvlJw0fOcCkxGi0/edit"},"JOSUE TOVAR":{city:"Maracaibo, Venezuela",country:"Brasil",link:"https://docs.google.com/spreadsheets/d/1oV0DMis5A1lNcBDRF31Iesx_TyzYZP3kikT66ekIb7E/edit"},"MARIA GUEVARA":{city:"Maracaibo, Venezuela",country:"Argentina",link:"https://docs.google.com/spreadsheets/d/1h4bxVhZOKIqKBCKVHLIN9BfKAf5Ee2hxqg8DywB1XTY/edit"},"MIGUEL GUTIERREZ":{city:"San Carlos, Panamá",country:"Francia",link:"https://docs.google.com/spreadsheets/d/1NWNLhNp0kOi-wpjpj6e-MEA5lM6jTnAC8HN_gjhPXlc/edit"},"MIGUEL TELLECHEA":{city:"Ciudad de Panamá",country:"Paises Bajos",link:"https://docs.google.com/spreadsheets/d/1iU_VYr4tu5IfxadIHBRPqp1GxKTkmebS70YKwDgZfRQ/edit"},"MITRI":{city:"Ciudad de Panamá",country:"Portugal",link:"https://docs.google.com/spreadsheets/d/1IYMNbcMNQgkfhRPkow81urO4AlXN0N5bMd4jRXx59bc/edit"},"OTTO GAMBOA":{city:"Ciudad de Panamá",country:"España",link:"https://docs.google.com/spreadsheets/d/1G0gdROiNdEX3g82F8j7jLR6IHzEraIpzcwLLRV_L5tc/edit"},"PICH URDANETA":{city:"Ciudad de Panamá",country:"Argentina",link:"https://docs.google.com/spreadsheets/d/1oDwOyUVfMsc6z7I3Hl6fYjWJTXkucSVkQXJA0aN5RCM/edit"},"RAFAEL SOTO":{city:"Orlando, USA",country:"Portugal",link:"https://docs.google.com/spreadsheets/d/1gFk8ayfO3QJVln5MskgF2Vz5-6-N_yoeriQaNwANvEM/edit"},"RAFITA AREVALO":{city:"Orlando, USA",country:"Francia",link:"https://docs.google.com/spreadsheets/d/1iNUTCOlhnilga7lOz_pZZu3jC5esq5EKeQZA_1GBzPs/edit"},"RIGO GARCIA":{city:"Buenos Aires, Argentina",country:"España",link:"https://docs.google.com/spreadsheets/d/1zX-xgs7Tq3H9qyH6_5zMnVD0kzqloYvza_jbj8GfWQM/edit"},"ROBERT SAN MIGUEL":{city:"Orlando, USA",country:"Argentina",link:"https://docs.google.com/spreadsheets/d/1NdQW6YioL-cSKFs7YBsaJNnCPD5k1aPTMmevd3ykh8k/edit"},"SERGIO AREVALO":{city:"Orlando, USA",country:"Inglaterra",link:"https://docs.google.com/spreadsheets/d/1mcymdU5QrkR9Wxu3uxJiXc31WznjqKsD_kWc1sYshBo/edit"},"TATO GUEVARA":{city:"Ciudad de Panamá",country:"España",link:"https://docs.google.com/spreadsheets/d/1PRvrc9ocYovg4joV4j7nyiGaNSEFVrsJANmqc2SmWnM/edit"},"VANE Y ZAIDA BALLESTEROS":{city:"Burleson, Texas",country:"Francia",link:"https://docs.google.com/spreadsheets/d/1houH8ci5tuM6iR9tti-XHUWcssp3-secWsCZxxcdvcY/edit"}};

const LEGACY_ELIM_PRED_TEAMS={
"ALEJANDRO MARCELLETTI":{73:{h:"Corea del Sur",a:"Bosnia y Herzegovina"},74:{h:"Alemania",a:"Paraguay"},75:{h:"Países Bajos",a:"Marruecos"},76:{h:"Brasil",a:"Suecia"},77:{h:"Francia",a:"Japón"},78:{h:"Ecuador",a:"Noruega"},79:{h:"México",a:"Arabia Saudita"},80:{h:"Inglaterra",a:"Senegal"},81:{h:"Estados Unidos",a:"Costa de Marfil"},82:{h:"Bélgica",a:"República Checa"},83:{h:"Colombia",a:"Croacia"},84:{h:"España",a:"Austria"},85:{h:"Suiza",a:"Irán"},86:{h:"Argentina",a:"Uruguay"},87:{h:"Portugal",a:"Ghana"},88:{h:"Turquía",a:"Egipto"}},
"CESAR EL GOCHO":{73:{h:"Corea del Sur",a:"Canadá"},74:{h:"Alemania",a:"Marruecos"},75:{h:"Países Bajos",a:"Escocia"},76:{h:"Brasil",a:"Japón"},77:{h:"Francia",a:"Suecia"},78:{h:"Ecuador",a:"Noruega"},79:{h:"México",a:"Arabia Saudita"},80:{h:"Inglaterra",a:"Irak"},81:{h:"Estados Unidos",a:"Bosnia y Herzegovina"},82:{h:"Bélgica",a:"Sudáfrica"},83:{h:"Colombia",a:"Croacia"},84:{h:"España",a:"Austria"},85:{h:"Suiza",a:"Irán"},86:{h:"Argentina",a:"Uruguay"},87:{h:"Portugal",a:"Paraguay"},88:{h:"Turquía",a:"Nueva Zelanda"}},
"COCO PARRA":{73:{h:"México",a:"Canadá"},74:{h:"Alemania",a:"Sudáfrica"},75:{h:"Suecia",a:"Escocia"},76:{h:"Brasil",a:"Japón"},77:{h:"Senegal",a:"Países Bajos"},78:{h:"Ecuador",a:"Francia"},79:{h:"Corea del Sur",a:"Costa de Marfil"},80:{h:"Inglaterra",a:"RD Congo"},81:{h:"Estados Unidos",a:"Catar"},82:{h:"Bélgica",a:"Noruega"},83:{h:"Colombia",a:"Ghana"},84:{h:"España",a:"Austria"},85:{h:"Suiza",a:"Nueva Zelanda"},86:{h:"Argentina",a:"Uruguay"},87:{h:"Portugal",a:"Croacia"},88:{h:"Paraguay",a:"Irán"}},
"DAISY MARIANA":{73:{h:"República Checa",a:"Canadá"},74:{h:"Alemania",a:"Escocia"},75:{h:"Países Bajos",a:"Marruecos"},76:{h:"Brasil",a:"Japón"},77:{h:"Francia",a:"Australia"},78:{h:"Costa de Marfil",a:"Senegal"},79:{h:"México",a:"Arabia Saudita"},80:{h:"Croacia",a:"Uzbekistán"},81:{h:"Estados Unidos",a:"Bosnia y Herzegovina"},82:{h:"Bélgica",a:"Corea del Sur"},83:{h:"Portugal",a:"Inglaterra"},84:{h:"España",a:"Austria"},85:{h:"Suiza",a:"Egipto"},86:{h:"Argentina",a:"Cabo Verde"},87:{h:"Colombia",a:"Noruega"},88:{h:"Turquía",a:"Irán"}},
"DAVID RODRIGUEZ":{73:{h:"República Checa",a:"Canadá"},74:{h:"Alemania",a:"Escocia"},75:{h:"Países Bajos",a:"Marruecos"},76:{h:"Brasil",a:"Japón"},77:{h:"Francia",a:"Turquía"},78:{h:"Ecuador",a:"Noruega"},79:{h:"México",a:"Costa de Marfil"},80:{h:"Inglaterra",a:"Senegal"},81:{h:"Estados Unidos",a:"Catar"},82:{h:"Bélgica",a:"Arabia Saudita"},83:{h:"Colombia",a:"Croacia"},84:{h:"España",a:"Austria"},85:{h:"Suiza",a:"Irán"},86:{h:"Argentina",a:"Uruguay"},87:{h:"Portugal",a:"Panamá"},88:{h:"Paraguay",a:"Egipto"}},
"EDGAR EDUARDO GIL":{73:{h:"República Checa",a:"Suiza"},74:{h:"Alemania",a:"Turquía"},75:{h:"Países Bajos",a:"Marruecos"},76:{h:"Brasil",a:"Japón"},77:{h:"Noruega",a:"Suecia"},78:{h:"Costa de Marfil",a:"Francia"},79:{h:"Corea del Sur",a:"Uruguay"},80:{h:"Inglaterra",a:"RD Congo"},81:{h:"Estados Unidos",a:"Canadá"},82:{h:"Bélgica",a:"México"},83:{h:"Colombia",a:"Croacia"},84:{h:"España",a:"Argelia"},85:{h:"Bosnia y Herzegovina",a:"Ecuador"},86:{h:"Argentina",a:"Arabia Saudita"},87:{h:"Portugal",a:"Senegal"},88:{h:"Paraguay",a:"Egipto"}},
"EDWIN GUARDADO":{73:{h:"República Checa",a:"Canadá"},74:{h:"Alemania",a:"Paraguay"},75:{h:"Países Bajos",a:"Marruecos"},76:{h:"Brasil",a:"Japón"},77:{h:"Francia",a:"Suecia"},78:{h:"Ecuador",a:"Senegal"},79:{h:"México",a:"Costa de Marfil"},80:{h:"Inglaterra",a:"Noruega"},81:{h:"Estados Unidos",a:"Bosnia y Herzegovina"},82:{h:"Egipto",a:"Corea del Sur"},83:{h:"Colombia",a:"Croacia"},84:{h:"España",a:"Austria"},85:{h:"Suiza",a:"Bélgica"},86:{h:"Argentina",a:"Uruguay"},87:{h:"Portugal",a:"Ghana"},88:{h:"Turquía",a:"Irán"}},
"EL PROFE URDANETA":{73:{h:"México",a:"Suiza"},74:{h:"Alemania",a:"Australia"},75:{h:"Japón",a:"Escocia"},76:{h:"Brasil",a:"Túnez"},77:{h:"Francia",a:"Suecia"},78:{h:"Costa de Marfil",a:"Senegal"},79:{h:"República Checa",a:"Ecuador"},80:{h:"Inglaterra",a:"RD Congo"},81:{h:"Estados Unidos",a:"Noruega"},82:{h:"Irán",a:"Cabo Verde"},83:{h:"Portugal",a:"Croacia"},84:{h:"España",a:"Austria"},85:{h:"Catar",a:"Jordania"},86:{h:"Argentina",a:"Uruguay"},87:{h:"Colombia",a:"Panamá"},88:{h:"Paraguay",a:"Bélgica"}},
"EURO GUERRERO":{73:{h:"República Checa",a:"Bosnia y Herzegovina"},74:{h:"Alemania",a:"Escocia"},75:{h:"Países Bajos",a:"Marruecos"},76:{h:"Brasil",a:"Japón"},77:{h:"Francia",a:"Suecia"},78:{h:"Ecuador",a:"Noruega"},79:{h:"Corea del Sur",a:"Costa de Marfil"},80:{h:"Inglaterra",a:"Senegal"},81:{h:"Paraguay",a:"Canadá"},82:{h:"Bélgica",a:"México"},83:{h:"Colombia",a:"Croacia"},84:{h:"España",a:"Austria"},85:{h:"Suiza",a:"Argelia"},86:{h:"Argentina",a:"Uruguay"},87:{h:"Portugal",a:"Ghana"},88:{h:"Turquía",a:"Egipto"}},
"FITA GOMEZ":{73:{h:"México",a:"Canadá"},74:{h:"Alemania",a:"Australia"},75:{h:"Países Bajos",a:"Escocia"},76:{h:"Brasil",a:"Suecia"},77:{h:"Francia",a:"Japón"},78:{h:"Ecuador",a:"Noruega"},79:{h:"Corea del Sur",a:"Marruecos"},80:{h:"Inglaterra",a:"Senegal"},81:{h:"Turquía",a:"Bosnia y Herzegovina"},82:{h:"Bélgica",a:"Austria"},83:{h:"Portugal",a:"Panamá"},84:{h:"España",a:"Jordania"},85:{h:"Suiza",a:"Egipto"},86:{h:"Argentina",a:"Uruguay"},87:{h:"Colombia",a:"Croacia"},88:{h:"Estados Unidos",a:"Nueva Zelanda"}},
"GERARDO ANDARA":{73:{h:"Corea del Sur",a:"Canadá"},74:{h:"Alemania",a:"Escocia"},75:{h:"Países Bajos",a:"Marruecos"},76:{h:"Brasil",a:"Japón"},77:{h:"Francia",a:"Turquía"},78:{h:"Ecuador",a:"Noruega"},79:{h:"México",a:"Costa de Marfil"},80:{h:"Inglaterra",a:"Senegal"},81:{h:"Estados Unidos",a:"Bosnia y Herzegovina"},82:{h:"Bélgica",a:"República Checa"},83:{h:"Colombia",a:"Croacia"},84:{h:"España",a:"Austria"},85:{h:"Suiza",a:"Argelia"},86:{h:"Argentina",a:"Uruguay"},87:{h:"Portugal",a:"Ghana"},88:{h:"Paraguay",a:"Egipto"}},
"GUSTAVO TOVAR":{73:{h:"República Checa",a:"Bosnia y Herzegovina"},74:{h:"Alemania",a:"Paraguay"},75:{h:"Países Bajos",a:"Marruecos"},76:{h:"Brasil",a:"Suecia"},77:{h:"Francia",a:"Japón"},78:{h:"Ecuador",a:"Noruega"},79:{h:"Corea del Sur",a:"Escocia"},80:{h:"Inglaterra",a:"Senegal"},81:{h:"Turquía",a:"Canadá"},82:{h:"Bélgica",a:"México"},83:{h:"Colombia",a:"Croacia"},84:{h:"España",a:"Austria"},85:{h:"Suiza",a:"Nueva Zelanda"},86:{h:"Argentina",a:"Uruguay"},87:{h:"Portugal",a:"Costa de Marfil"},88:{h:"Estados Unidos",a:"Egipto"}},
"JOLDAN":{73:{h:"México",a:"Canadá"},74:{h:"Alemania",a:"Escocia"},75:{h:"Japón",a:"Marruecos"},76:{h:"Brasil",a:"Países Bajos"},77:{h:"Francia",a:"Australia"},78:{h:"Ecuador",a:"Noruega"},79:{h:"República Checa",a:"Costa de Marfil"},80:{h:"Inglaterra",a:"Uzbekistán"},81:{h:"Estados Unidos",a:"Argelia"},82:{h:"Bélgica",a:"Corea del Sur"},83:{h:"Colombia",a:"Croacia"},84:{h:"España",a:"Austria"},85:{h:"Suiza",a:"Egipto"},86:{h:"Argentina",a:"Uruguay"},87:{h:"Portugal",a:"Senegal"},88:{h:"Turquía",a:"Irán"}},
"JOSUE TOVAR":{73:{h:"República Checa",a:"Suiza"},74:{h:"Ecuador",a:"Escocia"},75:{h:"Países Bajos",a:"Marruecos"},76:{h:"Brasil",a:"Japón"},77:{h:"Francia",a:"Turquía"},78:{h:"Alemania",a:"Noruega"},79:{h:"México",a:"Costa de Marfil"},80:{h:"Inglaterra",a:"RD Congo"},81:{h:"Estados Unidos",a:"Bosnia y Herzegovina"},82:{h:"Bélgica",a:"Senegal"},83:{h:"Colombia",a:"Croacia"},84:{h:"España",a:"Austria"},85:{h:"Canadá",a:"Egipto"},86:{h:"Argentina",a:"Uruguay"},87:{h:"Portugal",a:"Ghana"},88:{h:"Paraguay",a:"Irán"}},
"MARIA GUEVARA":{73:{h:"República Checa",a:"Canadá"},74:{h:"Alemania",a:"Marruecos"},75:{h:"Países Bajos",a:"Escocia"},76:{h:"Brasil",a:"Japón"},77:{h:"Francia",a:"Arabia Saudita"},78:{h:"Ecuador",a:"Senegal"},79:{h:"México",a:"Costa de Marfil"},80:{h:"Inglaterra",a:"Noruega"},81:{h:"Estados Unidos",a:"Bosnia y Herzegovina"},82:{h:"Bélgica",a:"Corea del Sur"},83:{h:"Colombia",a:"Croacia"},84:{h:"España",a:"Austria"},85:{h:"Suiza",a:"Jordania"},86:{h:"Argentina",a:"Uruguay"},87:{h:"Portugal",a:"Panamá"},88:{h:"Paraguay",a:"Irán"}},
"MIGUEL GUTIERREZ":{73:{h:"República Checa",a:"Canadá"},74:{h:"Alemania",a:"Escocia"},75:{h:"Japón",a:"Marruecos"},76:{h:"Brasil",a:"Países Bajos"},77:{h:"Francia",a:"Estados Unidos"},78:{h:"Ecuador",a:"Noruega"},79:{h:"México",a:"Uruguay"},80:{h:"Croacia",a:"Senegal"},81:{h:"Turquía",a:"Bosnia y Herzegovina"},82:{h:"Bélgica",a:"Corea del Sur"},83:{h:"Portugal",a:"Inglaterra"},84:{h:"España",a:"Austria"},85:{h:"Suiza",a:"Costa de Marfil"},86:{h:"Argentina",a:"Arabia Saudita"},87:{h:"Colombia",a:"Panamá"},88:{h:"Paraguay",a:"Egipto"}},
"MIGUEL TELLECHEA":{73:{h:"Corea del Sur",a:"Suiza"},74:{h:"Ecuador",a:"Escocia"},75:{h:"Países Bajos",a:"Marruecos"},76:{h:"Brasil",a:"Japón"},77:{h:"Noruega",a:"Paraguay"},78:{h:"Alemania",a:"Francia"},79:{h:"México",a:"Costa de Marfil"},80:{h:"Inglaterra",a:"Senegal"},81:{h:"Turquía",a:"Bosnia y Herzegovina"},82:{h:"Bélgica",a:"Cabo Verde"},83:{h:"Colombia",a:"Croacia"},84:{h:"España",a:"Argelia"},85:{h:"Canadá",a:"Austria"},86:{h:"Argentina",a:"Uruguay"},87:{h:"Portugal",a:"Ghana"},88:{h:"Estados Unidos",a:"Egipto"}},
"MITRI":{73:{h:"República Checa",a:"Canadá"},74:{h:"Alemania",a:"Escocia"},75:{h:"Países Bajos",a:"Marruecos"},76:{h:"Brasil",a:"Japón"},77:{h:"Noruega",a:"Estados Unidos"},78:{h:"Ecuador",a:"Francia"},79:{h:"Corea del Sur",a:"Uruguay"},80:{h:"Inglaterra",a:"Costa de Marfil"},81:{h:"Turquía",a:"Bosnia y Herzegovina"},82:{h:"Bélgica",a:"México"},83:{h:"Colombia",a:"Croacia"},84:{h:"España",a:"Austria"},85:{h:"Suiza",a:"Suecia"},86:{h:"Argentina",a:"Cabo Verde"},87:{h:"Portugal",a:"Ghana"},88:{h:"Paraguay",a:"Egipto"}},
"OTTO GAMBOA":{73:{h:"Corea del Sur",a:"Suiza"},74:{h:"Alemania",a:"Escocia"},75:{h:"Países Bajos",a:"Marruecos"},76:{h:"Brasil",a:"Japón"},77:{h:"Francia",a:"Suecia"},78:{h:"Ecuador",a:"Noruega"},79:{h:"México",a:"Costa de Marfil"},80:{h:"Inglaterra",a:"Senegal"},81:{h:"Estados Unidos",a:"Bosnia y Herzegovina"},82:{h:"Bélgica",a:"Arabia Saudita"},83:{h:"Colombia",a:"Croacia"},84:{h:"España",a:"Austria"},85:{h:"Canadá",a:"Nueva Zelanda"},86:{h:"Argentina",a:"Uruguay"},87:{h:"Portugal",a:"Panamá"},88:{h:"Turquía",a:"Egipto"}},
"PICH URDANETA":{73:{h:"República Checa",a:"Canadá"},74:{h:"Alemania",a:"Escocia"},75:{h:"Países Bajos",a:"Marruecos"},76:{h:"Brasil",a:"Suecia"},77:{h:"Francia",a:"Japón"},78:{h:"Costa de Marfil",a:"Senegal"},79:{h:"México",a:"Arabia Saudita"},80:{h:"Inglaterra",a:"Noruega"},81:{h:"Paraguay",a:"Ecuador"},82:{h:"Bélgica",a:"Corea del Sur"},83:{h:"Portugal",a:"Croacia"},84:{h:"España",a:"Austria"},85:{h:"Suiza",a:"Egipto"},86:{h:"Argentina",a:"Uruguay"},87:{h:"Colombia",a:"Ghana"},88:{h:"Estados Unidos",a:"Irán"}},
"RAFAEL SOTO":{73:{h:"República Checa",a:"Suiza"},74:{h:"Ecuador",a:"Estados Unidos"},75:{h:"Países Bajos",a:"Marruecos"},76:{h:"Brasil",a:"Japón"},77:{h:"Francia",a:"Suecia"},78:{h:"Alemania",a:"Noruega"},79:{h:"México",a:"Escocia"},80:{h:"Inglaterra",a:"Uzbekistán"},81:{h:"Turquía",a:"Costa de Marfil"},82:{h:"Bélgica",a:"Corea del Sur"},83:{h:"Colombia",a:"Croacia"},84:{h:"España",a:"Austria"},85:{h:"Canadá",a:"Argelia"},86:{h:"Argentina",a:"Uruguay"},87:{h:"Portugal",a:"Ghana"},88:{h:"Paraguay",a:"Egipto"}},
"RAFITA AREVALO":{73:{h:"Corea del Sur",a:"Canadá"},74:{h:"Costa de Marfil",a:"Estados Unidos"},75:{h:"Países Bajos",a:"Marruecos"},76:{h:"Brasil",a:"Japón"},77:{h:"Francia",a:"Suecia"},78:{h:"Alemania",a:"Noruega"},79:{h:"República Checa",a:"Arabia Saudita"},80:{h:"Inglaterra",a:"Senegal"},81:{h:"Australia",a:"Catar"},82:{h:"Bélgica",a:"México"},83:{h:"Colombia",a:"Croacia"},84:{h:"España",a:"Austria"},85:{h:"Suiza",a:"Irán"},86:{h:"Argentina",a:"Uruguay"},87:{h:"Portugal",a:"Ecuador"},88:{h:"Paraguay",a:"Nueva Zelanda"}},
"RIGO GARCIA":{73:{h:"Corea del Sur",a:"Canadá"},74:{h:"Alemania",a:"Turquía"},75:{h:"Países Bajos",a:"Marruecos"},76:{h:"Brasil",a:"Japón"},77:{h:"Francia",a:"Suecia"},78:{h:"Ecuador",a:"Noruega"},79:{h:"México",a:"Costa de Marfil"},80:{h:"Inglaterra",a:"Jordania"},81:{h:"Paraguay",a:"Bosnia y Herzegovina"},82:{h:"Bélgica",a:"República Checa"},83:{h:"Colombia",a:"Croacia"},84:{h:"España",a:"Austria"},85:{h:"Suiza",a:"Irán"},86:{h:"Argentina",a:"Uruguay"},87:{h:"Portugal",a:"Senegal"},88:{h:"Estados Unidos",a:"Egipto"}},
"ROBERT SAN MIGUEL":{73:{h:"Sudáfrica",a:"Canadá"},74:{h:"Alemania",a:"Escocia"},75:{h:"Países Bajos",a:"Marruecos"},76:{h:"Brasil",a:"Japón"},77:{h:"Francia",a:"Turquía"},78:{h:"Ecuador",a:"Senegal"},79:{h:"México",a:"Arabia Saudita"},80:{h:"Inglaterra",a:"RD Congo"},81:{h:"Estados Unidos",a:"Bosnia y Herzegovina"},82:{h:"Bélgica",a:"Noruega"},83:{h:"Colombia",a:"Croacia"},84:{h:"España",a:"Jordania"},85:{h:"Suiza",a:"Austria"},86:{h:"Argentina",a:"Uruguay"},87:{h:"Portugal",a:"Ghana"},88:{h:"Paraguay",a:"Egipto"}},
"SERGIO AREVALO":{73:{h:"República Checa",a:"Canadá"},74:{h:"Ecuador",a:"Paraguay"},75:{h:"Países Bajos",a:"Marruecos"},76:{h:"Brasil",a:"Japón"},77:{h:"Francia",a:"Egipto"},78:{h:"Alemania",a:"Senegal"},79:{h:"México",a:"Costa de Marfil"},80:{h:"Inglaterra",a:"Noruega"},81:{h:"Estados Unidos",a:"Bosnia y Herzegovina"},82:{h:"Bélgica",a:"Corea del Sur"},83:{h:"Colombia",a:"Croacia"},84:{h:"España",a:"Austria"},85:{h:"Suiza",a:"Argelia"},86:{h:"Argentina",a:"Uruguay"},87:{h:"Portugal",a:"Ghana"},88:{h:"Turquía",a:"Irán"}},
"TATO GUEVARA":{73:{h:"Corea del Sur",a:"Canadá"},74:{h:"Ecuador",a:"Escocia"},75:{h:"Países Bajos",a:"Marruecos"},76:{h:"Brasil",a:"Japón"},77:{h:"Francia",a:"Suecia"},78:{h:"Alemania",a:"Senegal"},79:{h:"México",a:"Arabia Saudita"},80:{h:"Inglaterra",a:"Noruega"},81:{h:"Turquía",a:"Bosnia y Herzegovina"},82:{h:"Bélgica",a:"República Checa"},83:{h:"Colombia",a:"Croacia"},84:{h:"España",a:"Austria"},85:{h:"Suiza",a:"Irán"},86:{h:"Argentina",a:"Uruguay"},87:{h:"Portugal",a:"Paraguay"},88:{h:"Estados Unidos",a:"Egipto"}},
"VANE Y ZAIDA BALLESTEROS":{73:{h:"México",a:"Canadá"},74:{h:"Alemania",a:"Turquía"},75:{h:"Países Bajos",a:"Escocia"},76:{h:"Brasil",a:"Japón"},77:{h:"Francia",a:"Suecia"},78:{h:"Costa de Marfil",a:"Senegal"},79:{h:"República Checa",a:"Ecuador"},80:{h:"Inglaterra",a:"Noruega"},81:{h:"Estados Unidos",a:"Bosnia y Herzegovina"},82:{h:"Bélgica",a:"Austria"},83:{h:"Colombia",a:"Panamá"},84:{h:"España",a:"Jordania"},85:{h:"Suiza",a:"Egipto"},86:{h:"Argentina",a:"Uruguay"},87:{h:"Portugal",a:"Croacia"},88:{h:"Australia",a:"Irán"}},
};

// Predicciones del bracket — CSV del Drive (P73-P104, H y A)
// Formato: [p73h,p73a, p74h,p74a, ... p104h,p104a]
const LEGACY_ELIMRAW={
"ALEJANDRO MARCELLETTI":[1,1,2,1,2,1,3,1,3,1,0,1,1,2,3,1,2,2,2,1,2,1,3,1,2,1,2,1,3,1,1,1,0,1,1,2,2,1,1,3,1,2,0,2,3,1,0,2,2,2,1,0,1,1,1,2,1,1,0,1,2,1,1,2],
"CESAR EL GOCHO":[1,2,3,1,2,1,3,2,2,1,1,2,2,0,3,1,2,0,2,1,2,1,2,1,1,0,3,2,2,1,1,2,3,1,2,1,2,1,1,3,1,3,1,0,3,1,1,2,2,1,2,1,1,3,3,2,3,2,2,3,1,2,1,2],
"COCO PARRA":[2,1,3,1,2,4,3,1,2,1,2,2,1,1,3,0,2,2,1,2,2,2,3,1,2,1,3,2,2,1,2,1,2,2,2,1,3,2,1,2,2,2,3,1,2,1,1,3,2,1,2,1,2,1,2,2,2,1,3,2,2,2,2,2],
"DAISY MARIANA":[2,2,3,1,0,1,2,1,2,1,1,2,1,1,2,1,2,1,2,1,2,1,3,2,1,1,3,2,2,0,2,1,1,2,1,2,3,1,1,2,3,2,2,1,2,1,1,2,0,1,1,0,2,1,2,1,1,2,2,3,1,2,2,0],
"DAVID RODRIGUEZ":[2,1,2,0,1,2,2,1,2,0,2,2,1,2,1,0,2,0,2,0,1,0,2,0,2,1,2,1,2,0,3,1,0,1,1,2,1,0,1,1,1,3,0,2,3,1,0,2,2,2,1,0,2,1,1,1,1,2,0,1,1,2,0,1],
"EDGAR EDUARDO GIL":[1,0,2,0,2,1,3,2,2,0,1,3,1,1,2,0,2,2,2,1,2,1,3,1,0,1,3,0,1,0,1,0,1,2,1,1,2,1,0,1,1,3,1,1,2,1,1,2,1,1,3,2,2,1,1,3,1,2,3,2,2,1,2,2],
"EDWIN GUARDADO":[2,1,3,0,2,2,3,1,3,1,1,2,1,1,2,1,2,1,1,2,2,1,3,2,0,1,3,2,2,1,2,0,1,2,1,2,2,0,1,2,1,3,2,1,2,0,1,2,2,1,3,0,2,1,2,1,1,0,2,3,1,2,2,1],
"EL PROFE URDANETA":[1,2,3,2,2,2,1,2,3,0,2,1,1,1,2,1,2,2,2,1,2,1,2,1,2,1,3,1,2,1,2,1,2,1,0,2,2,3,2,1,1,3,2,1,2,1,1,2,2,1,1,0,2,1,3,1,1,2,2,3,2,1,2,3],
"EURO GUERRERO":[1,1,2,0,3,2,3,1,3,0,2,1,1,1,2,1,3,1,2,1,2,1,2,0,1,0,2,2,3,1,2,1,1,2,0,2,2,2,1,3,2,3,2,1,2,1,0,2,2,2,2,0,2,1,1,1,2,3,3,2,2,1,2,1],
"FITA GOMEZ":[1,2,3,1,4,2,2,2,3,2,2,2,1,2,2,1,2,0,2,1,1,2,3,1,2,1,3,1,2,1,1,2,3,2,1,2,3,1,1,2,1,3,1,2,5,1,1,2,2,1,3,1,1,3,3,2,1,2,2,3,2,1,2,3],
"GERARDO ANDARA":[1,2,2,1,2,1,3,1,3,1,2,1,2,1,2,1,2,1,2,1,2,1,3,1,2,1,3,1,2,1,2,1,1,2,0,2,2,0,1,3,1,3,0,2,2,1,1,2,1,2,2,1,2,1,3,1,0,2,1,2,1,2,1,2],
"GUSTAVO TOVAR":[2,1,3,1,2,3,3,1,4,2,1,2,3,1,4,1,2,0,3,1,2,2,4,1,2,0,1,1,3,1,1,1,1,2,2,2,3,1,2,1,2,2,1,2,2,1,1,2,2,1,2,2,3,1,2,2,1,2,2,1,3,1,2,2],
"JOLDAN":[2,1,3,1,2,1,2,1,3,1,2,1,1,1,2,1,2,1,2,2,2,2,3,1,2,1,2,1,3,1,2,1,2,2,1,2,2,1,2,2,1,3,1,2,2,1,1,2,2,1,2,0,2,1,2,1,1,2,2,2,1,2,2,0],
"JOSUE TOVAR":[1,2,2,1,2,1,3,1,3,1,2,3,1,1,2,1,2,1,2,1,2,1,3,0,2,1,3,1,2,1,2,1,1,3,0,2,3,1,1,3,2,3,2,1,2,1,0,2,2,1,2,0,2,1,1,2,1,2,3,2,1,2,2,3],
"MARIA GUEVARA":[2,1,2,1,3,1,2,1,2,0,2,2,1,1,2,1,2,1,2,1,1,2,2,1,2,0,3,1,2,1,1,2,1,2,1,2,2,1,1,2,1,3,1,2,2,0,1,2,2,1,1,1,2,1,2,1,2,1,1,2,1,2,1,2],
"MIGUEL GUTIERREZ":[1,2,3,0,0,2,2,0,3,0,0,2,1,1,2,1,2,0,2,0,2,1,4,0,2,0,3,0,5,1,1,2,0,2,1,2,2,2,1,2,0,2,0,2,2,1,1,2,2,1,1,0,2,1,1,2,1,0,3,2,1,2,2,0],
"MIGUEL TELLECHEA":[1,0,3,1,3,2,1,2,2,1,2,2,2,1,2,1,2,1,2,0,2,1,3,1,2,1,3,1,2,1,2,1,1,2,1,2,2,1,1,2,1,3,2,1,2,1,1,2,1,2,2,0,1,1,1,2,1,1,1,2,1,0,2,1],
"MITRI":[1,1,2,0,3,3,2,1,3,0,1,2,1,1,2,1,2,1,2,0,3,2,3,2,2,1,3,1,2,1,1,1,2,2,1,2,0,1,1,3,2,3,2,2,2,1,0,1,0,2,1,0,2,1,2,2,1,0,2,3,4,3,1,2],
"OTTO GAMBOA":[1,2,2,0,2,2,3,2,3,1,0,2,1,1,3,1,2,1,2,1,2,2,3,1,2,1,3,1,3,1,2,2,1,2,1,2,2,2,1,2,1,3,2,1,2,1,1,2,2,1,2,1,2,2,3,3,1,1,1,2,2,1,2,1],
"PICH URDANETA":[1,1,2,0,1,2,2,1,2,1,1,2,1,1,2,1,2,2,2,1,2,2,3,1,2,0,2,1,2,1,2,1,1,2,0,1,2,1,1,2,1,3,1,1,4,1,1,2,2,1,2,0,1,2,1,1,2,1,1,2,2,1,2,2],
"RAFAEL SOTO":[1,1,3,1,0,2,4,2,3,0,1,2,1,1,3,1,1,1,2,1,2,1,3,0,2,0,1,0,3,1,1,0,1,2,0,1,2,0,0,2,1,3,1,2,2,1,1,3,3,1,2,0,2,1,1,2,1,3,1,1,2,1,0,2],
"RAFITA AREVALO":[1,2,2,1,1,1,2,0,2,0,2,0,1,0,2,1,2,0,2,1,1,0,3,2,2,1,1,1,2,1,2,1,1,2,0,1,2,1,0,2,1,1,0,1,2,0,0,2,2,1,1,0,2,1,1,3,1,0,3,2,1,2,2,0],
"RIGO GARCIA":[2,1,4,0,2,1,3,1,3,1,0,0,2,1,3,0,2,0,2,0,2,1,3,1,2,1,2,1,2,0,1,1,1,2,1,2,2,1,1,3,1,2,1,1,3,0,1,2,2,1,2,0,2,1,2,1,1,1,1,3,1,2,2,1],
"ROBERT SAN MIGUEL":[1,2,2,0,1,0,1,2,3,1,2,2,1,1,2,1,2,2,2,1,1,1,1,0,2,1,3,1,2,1,2,1,1,2,1,2,3,1,1,2,0,2,2,2,2,0,1,2,2,1,1,0,2,1,4,2,3,2,2,3,3,1,2,4],
"SERGIO AREVALO":[2,1,3,1,1,1,2,0,4,0,2,1,1,1,3,1,2,1,2,0,2,2,2,0,3,2,1,1,2,0,2,2,1,2,1,3,2,2,1,3,1,1,0,2,2,1,1,2,2,2,2,1,1,1,1,2,1,1,2,2,2,1,1,1],
"TATO GUEVARA":[2,1,2,0,2,2,3,1,3,1,2,2,1,1,3,1,1,1,2,0,1,2,3,1,1,0,2,1,2,1,1,0,1,2,0,2,2,1,1,1,1,3,1,2,2,0,1,2,2,2,2,0,1,2,1,3,1,2,1,2,1,0,2,0],
"VANE Y ZAIDA BALLESTEROS":[1,2,2,3,2,1,3,1,3,2,2,2,1,1,2,1,2,2,2,1,1,2,3,0,2,1,3,0,2,0,2,1,1,2,1,2,3,1,2,1,1,3,2,1,2,1,1,2,2,1,1,0,2,1,1,3,1,0,3,2,1,2,2,0],
};

// Predicciones especiales de eliminatoria (del Drive)
const LEGACY_ELIM_SPEC={
"ALEJANDRO MARCELLETTI":{champ:"Portugal",runner:"España",third:"Francia",scorer:"Kylian Mbappe",scorerGoals:7,topCountry:"España",topCountryGoals:17,mostConceded:"Cabo Verde"},
"CESAR EL GOCHO":{champ:"Argentina",runner:"Alemania",third:"Inglaterra",scorer:"Kylian Mbappe",scorerGoals:9,topCountry:"Inglaterra",topCountryGoals:16,mostConceded:"Ghana"},
"COCO PARRA":{champ:"Brasil",runner:"Alemania",third:"Colombia",scorer:"Lamine Yamal",scorerGoals:10,topCountry:"Brasil",topCountryGoals:20,mostConceded:"Uzbekistan"},
"DAISY MARIANA":{champ:"Portugal",runner:"Argentina",third:"Brasil",scorer:"Kylian Mbappe",scorerGoals:6,topCountry:"Brasil",topCountryGoals:17,mostConceded:"Haití"},
"DAVID RODRIGUEZ":{champ:"Portugal",runner:"España",third:"Brasil",scorer:"Julian Alvarez",scorerGoals:7,topCountry:"España",topCountryGoals:15,mostConceded:"Curacao"},
"EDGAR EDUARDO GIL":{champ:"Brasil",runner:"España",third:"Noruega",scorer:"Erling Halaand",scorerGoals:7,topCountry:"Brasil",topCountryGoals:17,mostConceded:"Nueva Zelanda"},
"EDWIN GUARDADO":{champ:"Francia",runner:"Argentina",third:"Brasil",scorer:"Kylian Mbappe",scorerGoals:11,topCountry:"Francia",topCountryGoals:17,mostConceded:"Cabo Verde"},
"EL PROFE URDANETA":{champ:"Argentina",runner:"España",third:"Alemania",scorer:"Lamine Yamal",scorerGoals:5,topCountry:"Inglaterra",topCountryGoals:8,mostConceded:"Panamá"},
"EURO GUERRERO":{champ:"España",runner:"Brasil",third:"Francia",scorer:"Kylian Mbappe",scorerGoals:8,topCountry:"España",topCountryGoals:15,mostConceded:"Curacao"},
"FITA GOMEZ":{champ:"Argentina",runner:"España",third:"Alemania",scorer:"Lionel Messi",scorerGoals:6,topCountry:"Alemania",topCountryGoals:20,mostConceded:"Costa de Marfil"},
"GERARDO ANDARA":{champ:"Argentina",runner:"España",third:"Brasil",scorer:"Oyarzabal",scorerGoals:6,topCountry:"España",topCountryGoals:15,mostConceded:"Curacao"},
"GUSTAVO TOVAR":{champ:"Brasil",runner:"España",third:"Francia",scorer:"Lionel Messi",scorerGoals:9,topCountry:"Brasil",topCountryGoals:22,mostConceded:"Haití"},
"JOLDAN":{champ:"España",runner:"Brasil",third:"Argentina",scorer:"Kylian Mbappe",scorerGoals:8,topCountry:"España",topCountryGoals:19,mostConceded:"Haití"},
"JOSUE TOVAR":{champ:"Brasil",runner:"España",third:"Portugal",scorer:"Kylian Mbappe",scorerGoals:8,topCountry:"Brasil",topCountryGoals:17,mostConceded:"Irak"},
"MARIA GUEVARA":{champ:"Argentina",runner:"Francia",third:"Brasil",scorer:"Kylian Mbappe",scorerGoals:9,topCountry:"Argentina",topCountryGoals:19,mostConceded:"Curacao"},
"MIGUEL GUTIERREZ":{champ:"Francia",runner:"Brasil",third:"Colombia",scorer:"Michael Olise",scorerGoals:8,topCountry:"Francia",topCountryGoals:21,mostConceded:"Curacao"},
"MIGUEL TELLECHEA":{champ:"Países Bajos",runner:"Portugal",third:"España",scorer:"Erling Haaland",scorerGoals:8,topCountry:"Portugal",topCountryGoals:17,mostConceded:""},
"MITRI":{champ:"Portugal",runner:"Países Bajos",third:"España",scorer:"Erling Haaland",scorerGoals:6,topCountry:"Noruega",topCountryGoals:18,mostConceded:"Nueva Zelanda"},
"OTTO GAMBOA":{champ:"España",runner:"Argentina",third:"Francia",scorer:"Kylian Mbappe",scorerGoals:6,topCountry:"Francia",topCountryGoals:18,mostConceded:"Haití"},
"PICH URDANETA":{champ:"Argentina",runner:"Francia",third:"España",scorer:"Kylian Mbappe",scorerGoals:6,topCountry:"España",topCountryGoals:15,mostConceded:"Curacao"},
"RAFAEL SOTO":{champ:"Portugal",runner:"España",third:"Francia",scorer:"Endrick",scorerGoals:7,topCountry:"Portugal",topCountryGoals:17,mostConceded:"Haití"},
"RAFITA AREVALO":{champ:"Francia",runner:"Brasil",third:"Portugal",scorer:"Luis Diaz",scorerGoals:6,topCountry:"Francia",topCountryGoals:15,mostConceded:"Curacao"},
"RIGO GARCIA":{champ:"España",runner:"Argentina",third:"Brasil",scorer:"Kylian Mbappe",scorerGoals:8,topCountry:"Alemania",topCountryGoals:15,mostConceded:"Curacao"},
"ROBERT SAN MIGUEL":{champ:"Argentina",runner:"Francia",third:"España",scorer:"Julian Alvarez",scorerGoals:9,topCountry:"Colombia",topCountryGoals:21,mostConceded:"Cabo Verde"},
"SERGIO AREVALO":{champ:"Inglaterra",runner:"España",third:"Francia",scorer:"Harry Kane",scorerGoals:7,topCountry:"España",topCountryGoals:15,mostConceded:"Panamá"},
"TATO GUEVARA":{champ:"España",runner:"Portugal",third:"Países Bajos",scorer:"Harry Kane",scorerGoals:6,topCountry:"España",topCountryGoals:17,mostConceded:"Nueva Zelanda"},
"VANE Y ZAIDA BALLESTEROS":{champ:"Francia",runner:"Brasil",third:"Portugal",scorer:"Lionel Messi",scorerGoals:6,topCountry:"Portugal",topCountryGoals:17,mostConceded:"República Del Congo"},
};

/* ════════════════════════════════════════════════════════════
   MIGRACIÓN — los 27 antiguos → DB dinámico (v6.2, Fase "Unificación")
   Esto es la ÚNICA parte del código que todavía lee LEGACY_PL/LEGACY_PM/
   LEGACY_RAW/LEGACY_ELIM_PRED_TEAMS/LEGACY_ELIMRAW/LEGACY_ELIM_SPEC.
   legacyGetElimTeams/legacyElimPred/legacyGetPredWinner son una copia
   exacta de cómo funcionaban getElimTeams/elimPred/getPredWinner ANTES
   de este cambio (recorriendo ELIM_TREE recursivamente) — necesaria acá
   porque las versiones "en vivo" de esas funciones ya leen de DB, no de
   las constantes LEGACY_. Se verificó por separado (con Node, fuera de
   la app) que esta migración reproduce exactamente los mismos 3,024
   valores (27 personas × 112 partidos/preguntas) que las tablas viejas
   — cero diferencias.
   ════════════════════════════════════════════════════════════ */
function legacyElimPred(name,pid){
  const arr=LEGACY_ELIMRAW[name];if(!arr)return null;
  const idx=(pid-73)*2;
  if(idx<0||idx+1>=arr.length)return null;
  return{h:arr[idx],a:arr[idx+1]};
}
function legacyGetElimTeams(name,pid){
  if(ELIM_1_16_IDS.includes(pid)){
    const t=(LEGACY_ELIM_PRED_TEAMS[name]||{})[pid];
    if(!t||!t.h||!t.a||t.h==="?")return null;
    return{h:t.h,a:t.a};
  }
  const node=ELIM_TREE[pid];if(!node)return null;
  const teamH=legacyGetPredWinner(name,node.parentH,node.useLoserH);
  const teamA=legacyGetPredWinner(name,node.parentA,node.useLoserA);
  if(!teamH||!teamA)return null;
  return{h:teamH,a:teamA};
}
function legacyGetPredWinner(name,pid,wantLoser=false){
  const teams=legacyGetElimTeams(name,pid);if(!teams)return null;
  const pred=legacyElimPred(name,pid);if(!pred)return null;
  let winner,loser;
  if(pred.h>pred.a){winner=teams.h;loser=teams.a;}
  else if(pred.a>pred.h){winner=teams.a;loser=teams.h;}
  else{winner=teams.h;loser=teams.a;}
  return wantLoser?loser:winner;
}

function legacyMigrateOnePerson(name){
  const preds={};
  // Grupos: directo desde LEGACY_RAW (vía LEGACY_MID_LABELS ya parseado arriba)
  LEGACY_RAW.forEach(r=>{
    const mid=r[0];
    const idx=LEGACY_PL.indexOf(name);
    if(idx<0)return;
    const v=(r[2+idx]||"0-0").split("-");
    preds[mid]={h:parseInt(v[0])||0,a:parseInt(v[1])||0};
  });
  // Eliminatoria: igual que migrateOnePerson() ya verificado en Node.
  // _migrated:true es lo que le dice a computeBracket() (en registro.js)
  // que confíe en este cruce tal cual, en vez de exigir que coincida con
  // el sembrado oficial recalculado desde sus grupos — ver nota en
  // computeBracket() para el porqué.
  //
  // pick: el sistema viejo SIEMPRE definía empates con "el local avanza
  // por penales" (ver legacyGetPredWinner más abajo) — eso ya estaba
  // dentro del puntaje de toda la vida. El wizard nuevo necesita ese
  // mismo resultado como un campo explícito (pick) para poder mostrar la
  // llave completa; sin esto, cualquier empate cortaba la llave ahí
  // mismo en la vista (NO en el puntaje, que nunca dependió de esto).
  for(let pid=73;pid<=104;pid++){
    const teams=legacyGetElimTeams(name,pid);
    const score=legacyElimPred(name,pid);
    if(teams&&score){
      const slotPred={h:score.h,a:score.a,_a:teams.h,_b:teams.a,_migrated:true};
      if(score.h===score.a) slotPred.pick=teams.h; // empate → local avanza (misma regla de siempre)
      preds[PID_TO_SLOT[pid]]=slotPred;
    }
  }
  // Especiales: copia textual de LEGACY_ELIM_SPEC, sin recalcular desde la llave
  const spec=LEGACY_ELIM_SPEC[name]||{};
  const special={};
  Object.entries(SPECIAL_FIELD_MAP_V62).forEach(([newKey,oldKey])=>{
    special[newKey]=spec[oldKey]!==undefined?spec[oldKey]:'';
  });
  preds.special=special;
  return preds;
}

function norm_v62(s){return(s||"").trim().toLowerCase().replace(/\s+/g,' ');}

// Botón de Admin → "🔄 Migrar los 27 antiguos a Mi Quiniela". Idempotente:
// si algún nombre de LEGACY_PL ya existe en DB.participants, se omite (no
// duplica). Antes de escribir nada, descarga un backup completo (legacy +
// estado actual de DB) — el "volver atrás" que pediste, con un punto
// exacto al cual restaurar si algo sale mal.
// v6.2.1 — Ahora distingue dos casos en vez de uno: nombres de la lista
// vieja que NO existen todavía en Mi Quiniela (se crean) vs nombres que
// YA fueron migrados antes (se les refresca el contenido de predictions
// con la versión más reciente de la lógica de migración — útil porque
// arregló un caso real: las llaves de eliminatoria no traían la marca
// _migrated antes de este ajuste, y por eso se veían "Pendiente" en el
// wizard aunque el puntaje siempre estuvo correcto). Nunca toca a nadie
// que se haya registrado por su cuenta con el wizard (esos no están en
// LEGACY_PL, así que ni se acercan a este código).
function runMigracionLegacy(){
  if(!isAdmin()){toast("🔒 Solo el admin puede migrar participantes.",true);return;}
  const porNombre={};
  (DB.participants||[]).forEach(p=>{ porNombre[norm_v62(p.name)]=p; });

  const aCrear=[], aActualizar=[];
  LEGACY_PL.forEach(name=>{
    const existente=porNombre[norm_v62(name)];
    if(existente) aActualizar.push({name,person:existente});
    else aCrear.push(name);
  });

  if(!aCrear.length && !aActualizar.length){
    toast("No hay nadie de la lista vieja para migrar.");
    return;
  }
  const partes=[];
  if(aCrear.length) partes.push(`crear ${aCrear.length} participante(s) nuevo(s)`);
  if(aActualizar.length) partes.push(`refrescar las predicciones de ${aActualizar.length} que ya estaban migrado(s) (por si había algo desactualizado, como las llaves de eliminatoria)`);
  if(!confirm(`Esto va a ${partes.join(" y ")}. Antes de escribir nada se descarga un backup. ¿Continuar?`)) return;

  // Backup descargable ANTES de tocar nada — el punto exacto al que volver.
  const backup={
    tipo:"backup_pre_migracion_v62",
    fecha:new Date().toISOString(),
    legacy:{LEGACY_PL,LEGACY_PM,LEGACY_ELIM_SPEC,LEGACY_ELIM_PRED_TEAMS,LEGACY_ELIMRAW},
    dbAntesDeLaMigracion:JSON.parse(JSON.stringify(DB))
  };
  const blob=new Blob([JSON.stringify(backup,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download=`backup_pre_migracion_${Date.now()}.json`;
  document.body.appendChild(a);a.click();a.remove();
  URL.revokeObjectURL(url);

  aCrear.forEach(name=>{
    const m=LEGACY_PM[name]||{};
    const id=uid();
    DB.participants.push({
      id, codigo:nextCode(), name,
      city:m.city||'', country:m.country||'',
      email:'', clave:genClave(),
      estadoQuiniela:'enviada',
      fechaCreacion:Date.now(), fechaActualizacion:Date.now(), fechaEnvio:Date.now(),
      notaAdmin:'Migrado automáticamente desde el sistema anterior.'
    });
    DB.predictions[id]=legacyMigrateOnePerson(name);
  });
  aActualizar.forEach(({name,person})=>{
    DB.predictions[person.id]=legacyMigrateOnePerson(name);
    person.fechaActualizacion=Date.now();
  });

  saveData(DB);
  rebuildDynamicData();renderRank();renderSnapshotPanel();renderBonosPanel();
  if(typeof renderStatCards==="function")renderStatCards();
  toast(`✓ ${aCrear.length} nuevo(s), ${aActualizar.length} refrescado(s). Se descargó un backup por si hay que volver atrás.`);
}
