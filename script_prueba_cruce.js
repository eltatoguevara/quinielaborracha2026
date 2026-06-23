/* ════════════════════════════════════════════════════════════
   SCRIPT DE PRUEBA — Cruce válido en llaves eliminatorias
   ════════════════════════════════════════════════════════════
   Pegar en la consola del navegador (F12 → Console) estando logueado
   como admin en la app real. Crea UN participante de prueba dedicado
   ("ZZZ_TEST_CRUCE") y ajusta SOLO 3 pids de eliminatoria (85, 87, 96)
   para forzar un caso de cruce verificable a simple vista.

   ⚠️ IMPORTANTE:
   - Esto SÍ escribe a Firestore (save() hace push en vivo) — afecta
     los datos reales de producción del torneo.
   - Si los pids 85, 87 o 96 YA tienen resultados reales cargados de
     antes, este script los va a SOBREESCRIBIR. Recomendado: correr
     esto en un momento de baja actividad, y avisar a los participantes
     si hace falta, o mejor — descargar el backup JSON desde el panel
     admin ANTES de correr esto, por si hay que revertir.
   - Para LIMPIAR el participante de prueba después: buscar
     "ZZZ_TEST_CRUCE" en el panel de participantes y eliminarlo desde
     ahí (no lo borra este script).
   - Si los pids 85/87/96 NO tenían nada cargado antes (fase todavía
     no llegó ahí), no hay ningún riesgo: estás simplemente adelantando
     datos de prueba que podés borrar/recalcular después con normalidad.

   Qué hace exactamente:
   1. España (pid85) y Croacia (pid87) "ganan" su dieciseisavo de
      prueba → en la REALIDAD, España vs Croacia ocurre en pid 96
      (Octavos, slot r16_8).
   2. Se crea un participante de prueba que predijo "España vs Croacia"
      en el OTRO cruce de esa misma ronda — pid 95 (slot r16_7) — un
      lugar distinto al real.
   3. Resultado esperado en el panel de Eliminatoria (Predicciones →
      Eliminatoria), para "ZZZ_TEST_CRUCE", fila P95:
        - Badge azul "🔀 Cruce" con tooltip
        - Desglose: "2pts Cruce + 2pts Ganador = +4pts" (o similar,
          según el marcador exacto que pongas)
   ════════════════════════════════════════════════════════════ */
(function () {
  // 1) Construir el árbol real necesario para que España/Croacia avancen
  //    y se enfrenten realmente en pid 96 (Octavos).
  S.elimTeams[85] = { h: "España", a: "Test Rival A" };
  S.elimTeams[87] = { h: "Croacia", a: "Test Rival B" };
  S.elimScores[85] = { h: 3, a: 0 }; // gana España
  S.elimScores[87] = { h: 2, a: 0 }; // gana Croacia
  // pid96 = ganador(85) vs ganador(87) = España vs Croacia (REAL)
  S.elimScores[96] = { h: 1, a: 1 }; // marcador real del cruce real (ajustable)
  S.tieBreakers[96] = "h"; // si fue empate, quién avanzó (no afecta el test)

  // Asegurar que la fase "r16" (Dieciseisavos) esté cerrada, requisito
  // para que Octavos (donde está pid 95/96) pueda otorgar puntos.
  if (!S.bonos) S.bonos = { lastPlace: {}, classified: {}, llaves: {}, closed: {} };
  if (!S.bonos.closed) S.bonos.closed = {};
  S.bonos.closed["r16"] = true;

  // 2) Crear el participante de prueba con su predicción: "España vs
  //    Croacia" puesto en pid 95 (el OTRO cruce de Octavos, no el real).
  const testName = "ZZZ_TEST_CRUCE";
  let person = (DB.participants || []).find((p) => p.name === testName);
  if (!person) {
    const id = uid();
    person = {
      id,
      codigo: nextCode ? nextCode() : "T999",
      name: testName,
      city: "Panama",
      country: "Panama",
      email: "zzz_test_cruce@example.com",
      clave: "999999",
      estadoQuiniela: "enviada",
      fechaCreacion: Date.now(),
      fechaActualizacion: Date.now(),
    };
    DB.participants.push(person);
  }
  if (!DB.predictions[person.id]) DB.predictions[person.id] = {};
  // pid 95 = slot "r16_7" (ver PID_TO_SLOT) — el cruce DISTINTO al real.
  DB.predictions[person.id]["r16_7"] = {
    h: 2,
    a: 1,
    _a: "España",
    _b: "Croacia",
  };

  // 3) Guardar y refrescar la UI.
  save();
  if (typeof rebuildDynamicData === "function") rebuildDynamicData();
  if (typeof renderElim === "function") renderElim();
  if (typeof renderBracket === "function") renderBracket();
  if (typeof renderRank === "function") renderRank();

  console.log("✅ Listo. Revisá el panel de Eliminatoria (Predicciones → Eliminatoria),");
  console.log("   seleccioná el participante 'ZZZ_TEST_CRUCE', y mirá la fila P95");
  console.log("   (España vs Croacia) — debería verse el badge azul de Cruce.");
  console.log("");
  console.log("   Para revertir: borrar el participante 'ZZZ_TEST_CRUCE' desde el");
  console.log("   panel de Admin, y si hace falta, volver a cargar los resultados");
  console.log("   reales de pid 85/87/96 desde ESPN Live o manualmente.");
})();
