import { Context } from "grammy";
import { VoterRecord, EstadisticasNomina, EstadisticasNominaIndividual } from "../services/voterService.js";
import { formatearCedula, normalizarTexto } from "./parser.js";

/**
 * Obtiene el nombre del usuario o mención de Telegram para auditoría y logs.
 */
export function obtenerNombreRemitente(ctx: Context): string {
  const user = ctx.from;
  if (!user) return "Usuario desconocido";
  if (user.username) return `@${user.username}`;
  const nombre = [user.first_name, user.last_name].filter(Boolean).join(" ");
  return nombre || `ID:${user.id}`;
}

/**
 * Genera la tarjeta con los datos de un elector cuando se consulta su cédula.
 */
export function formatearTarjetaElector(voter: VoterRecord): string {
  const ciFormat = formatearCedula(voter.cedula);
  const estadoIcono = voter.haVotado ? "✅" : "⏳";
  const estadoTexto = voter.haVotado
    ? `*YA VOTÓ* (Registrado: ${voter.fechaHoraVoto || "Hoy"}${
        voter.corte ? ` [${voter.corte}]` : ""
      }${voter.reportadoPor ? ` por ${voter.reportadoPor}` : ""})`
    : `*PENDIENTE POR VOTAR*`;

  let card = `📋 *DATOS DEL ELECTOR*\n\n`;
  card += `👤 *Nombre:* ${voter.nombre}\n`;
  card += `🆔 *Cédula:* V-${ciFormat}\n`;
  card += `🏢 *Nómina / Institución:* ${voter.nomina}\n`;

  if (voter.cargo && voter.cargo !== "Sin cargo") {
    card += `💼 *Cargo:* ${voter.cargo}\n`;
  }
  if (voter.unidad && voter.unidad !== "Sin unidad") {
    card += `🏛️ *Unidad:* ${voter.unidad}\n`;
  }
  if (voter.municipio || voter.parroquia) {
    const loc = [voter.municipio, voter.parroquia].filter(Boolean).join(" - ");
    card += `📍 *Ubicación:* ${loc}\n`;
  }

  card += `\n${estadoIcono} *Estado de Votación:* ${estadoTexto}\n`;

  if (!voter.haVotado) {
    card += `\n💡 _Para marcar su voto, envía:_ \`${voter.cedula} voto listo\``;
  }

  return card;
}

/**
 * Genera la confirmación cuando se registra exitosamente un voto.
 */
export function formatearConfirmacionVoto(voter: VoterRecord): string {
  const ciFormat = formatearCedula(voter.cedula);
  let msg = `✅ *VOTO REGISTRADO EXITOSAMENTE*\n\n`;
  msg += `👤 *Elector:* ${voter.nombre}\n`;
  msg += `🆔 *Cédula:* V-${ciFormat}\n`;
  msg += `🏢 *Nómina:* ${voter.nomina}\n`;

  if (voter.cargo && voter.cargo !== "Sin cargo") {
    msg += `💼 *Cargo:* ${voter.cargo}\n`;
  }
  if (voter.unidad && voter.unidad !== "Sin unidad") {
    msg += `🏛️ *Unidad:* ${voter.unidad}\n`;
  }

  if (voter.corte) {
    msg += `🕒 *Corte:* ${voter.corte}\n`;
  }
  msg += `⏰ *Hora:* ${voter.fechaHoraVoto}\n`;
  return msg;
}

/**
 * Genera la alerta cuando una cédula ya había sido registrada anteriormente.
 */
export function formatearAlertaYaVoto(
  voter: VoterRecord,
  fechaHoraPrevia?: string | null,
  reportadoPorPrevio?: string | null
): string {
  const ciFormat = formatearCedula(voter.cedula);
  let msg = `⚠️ *ATENCIÓN: EL VOTO YA FUE REGISTRADO PREVIAMENTE*\n\n`;
  msg += `👤 *Elector:* ${voter.nombre}\n`;
  msg += `🆔 *Cédula:* V-${ciFormat}\n`;
  msg += `🏢 *Nómina:* ${voter.nomina}\n`;

  if (voter.corte) {
    msg += `🕒 *Corte asignado:* ${voter.corte}\n`;
  }
  if (fechaHoraPrevia) {
    msg += `⏰ *Hora de registro anterior:* ${fechaHoraPrevia}\n`;
  }
  if (reportadoPorPrevio) {
    msg += `👤 *Registrado anteriormente por:* ${reportadoPorPrevio}\n`;
  }

  msg += `\n_No se realizaron cambios duplicados._`;
  return msg;
}

/**
 * Formatea una lista de cédulas con separación limpia para Telegram.
 */
function formatearListaCedulas(cedulas: string[], limiteMax: number = 35): string {
  if (!cedulas || cedulas.length === 0) return "_Ninguna_";
  const mostradas = cedulas.slice(0, limiteMax).map((c) => `V-${formatearCedula(c)}`);
  let texto = mostradas.join(", ");
  if (cedulas.length > limiteMax) {
    texto += ` _(... y ${cedulas.length - limiteMax} más)_`;
  }
  return texto;
}

// =========================================================================
// REPORTES ESPECÍFICOS PARA SEGEN (POR CARGOS Y TOTALIZACIÓN)
// =========================================================================

/**
 * Reporte completo para SEGEN: Desglose por CARGOS y TOTALIZACIÓN general.
 */
export function formatearReporteSEGEN(
  stats: EstadisticasNominaIndividual,
  corteActivo: string
): string {
  let msg = `📊 *REPORTE DE PARTICIPACIÓN — NÓMINA SEGEN*\n`;
  msg += `🕒 *Corte Activo:* ${corteActivo}\n\n`;

  // 1. Totalización General
  msg += `👥 *TOTALIZACIÓN GENERAL SEGEN:*\n`;
  msg += `▪️ *Nómina Total:* ${stats.total.toLocaleString("es-VE")} electores\n`;
  msg += `▪️ *Total Votaron:* ${stats.votaron.toLocaleString("es-VE")} (${stats.porcentaje})\n`;
  msg += `▪️ *Pendientes por Votar:* ${stats.pendientes.toLocaleString("es-VE")}\n\n`;

  // 2. Desglose por Cargos
  const cargos = Object.values(stats.porCargo || {}).sort((a, b) => b.total - a.total);
  if (cargos.length > 0) {
    msg += `💼 *PARTICIPACIÓN POR CARGOS:*\n`;
    for (const c of cargos) {
      msg += `▪️ *${c.nombre}:* ${c.votaron}/${c.total} (${c.porcentaje}) — Faltan: ${c.pendientes}\n`;
    }
    msg += `\n`;
  }

  // 3. Avance por Cortes Horarios
  if (stats.porCorte && Object.keys(stats.porCorte).length > 0) {
    msg += `⏰ *Avance por Cortes Horarios (SEGEN):*\n`;
    for (const [corte, cantidad] of Object.entries(stats.porCorte)) {
      if (cantidad > 0) {
        msg += `▪️ *${corte}:* ${cantidad} votos\n`;
      }
    }
  }

  return msg;
}

/**
 * Notificación oficial de corte para SEGEN: Totalización y Cargos.
 */
export function formatearReporteCorteSEGEN(
  corteEtiqueta: string,
  stats: EstadisticasNominaIndividual
): string {
  let msg = `🔔 *NOTIFICACIÓN OFICIAL — CORTE DE LAS ${corteEtiqueta}*\n`;
  msg += `🏢 *NÓMINA SEGEN*\n\n`;

  const votosEnEsteCorte = stats.porCorte[corteEtiqueta] || 0;

  msg += `📊 *TOTALIZACIÓN SEGEN:*\n`;
  msg += `👥 *Nómina Total:* ${stats.total.toLocaleString("es-VE")}\n`;
  msg += `✅ *Total Votaron:* ${stats.votaron.toLocaleString("es-VE")} (${stats.porcentaje})\n`;
  msg += `⏳ *Faltan por Votar:* ${stats.pendientes.toLocaleString("es-VE")}\n`;
  msg += `🕒 *Votos recibidos en este corte (${corteEtiqueta}):* ${votosEnEsteCorte}\n\n`;

  const cargos = Object.values(stats.porCargo || {}).sort((a, b) => b.total - a.total);
  if (cargos.length > 0) {
    msg += `💼 *Avance por Cargos:*\n`;
    for (const c of cargos) {
      msg += `▪️ *${c.nombre}:* ${c.votaron}/${c.total} (${c.porcentaje})\n`;
    }
  }

  return msg;
}

// =========================================================================
// REPORTES ESPECÍFICOS PARA INE (UNIDADES, CÉDULAS Y CORTES)
// =========================================================================

/**
 * Reporte completo para INE: Desglose por UNIDAD y CÉDULAS por cada corte.
 */
export function formatearReporteINE(
  stats: EstadisticasNominaIndividual,
  corteActivo: string
): string {
  let msg = `📊 *REPORTE DE PARTICIPACIÓN — NÓMINA INE*\n`;
  msg += `🕒 *Corte Activo:* ${corteActivo}\n\n`;

  // 1. Totalización General
  msg += `👥 *TOTALIZACIÓN GENERAL INE:*\n`;
  msg += `▪️ *Nómina Total:* ${stats.total.toLocaleString("es-VE")} electores\n`;
  msg += `▪️ *Total Votaron:* ${stats.votaron.toLocaleString("es-VE")} (${stats.porcentaje})\n`;
  msg += `▪️ *Pendientes por Votar:* ${stats.pendientes.toLocaleString("es-VE")}\n\n`;

  // 2. Desglose por Unidad
  const unidades = Object.values(stats.porUnidad || {}).sort((a, b) => b.total - a.total);
  if (unidades.length > 0) {
    msg += `🏛️ *PARTICIPACIÓN POR UNIDAD:*\n`;
    for (const u of unidades) {
      msg += `▪️ *${u.nombre}:* ${u.votaron}/${u.total} (${u.porcentaje}) — Faltan: ${u.pendientes}\n`;
    }
    msg += `\n`;
  }

  // 3. Desglose y Cédulas por cada corte
  if (stats.porCorte && Object.keys(stats.porCorte).length > 0) {
    msg += `⏰ *DETALLE Y CÉDULAS POR CADA CORTE (INE):*\n`;
    for (const [corte, cantidad] of Object.entries(stats.porCorte)) {
      if (cantidad > 0) {
        const cedulas = stats.cedulasPorCorte[corte] || [];
        msg += `▪️ *${corte}:* ${cantidad} votos\n`;
        msg += `  ↳ _Cédulas:_ ${formatearListaCedulas(cedulas, 25)}\n`;
      }
    }
  }

  return msg;
}

/**
 * Notificación oficial de corte para INE: Totalización, Unidades y Cédulas de este corte.
 */
export function formatearReporteCorteINE(
  corteEtiqueta: string,
  stats: EstadisticasNominaIndividual
): string {
  let msg = `🔔 *NOTIFICACIÓN OFICIAL — CORTE DE LAS ${corteEtiqueta}*\n`;
  msg += `🏢 *NÓMINA INE*\n\n`;

  const votosEnEsteCorte = stats.porCorte[corteEtiqueta] || 0;
  const cedulasEsteCorte = stats.cedulasPorCorte[corteEtiqueta] || [];

  msg += `📊 *TOTALIZACIÓN INE:*\n`;
  msg += `👥 *Nómina Total:* ${stats.total.toLocaleString("es-VE")}\n`;
  msg += `✅ *Total Votaron:* ${stats.votaron.toLocaleString("es-VE")} (${stats.porcentaje})\n`;
  msg += `⏳ *Faltan por Votar:* ${stats.pendientes.toLocaleString("es-VE")}\n`;
  msg += `🕒 *Votos recibidos en este corte (${corteEtiqueta}):* ${votosEnEsteCorte}\n\n`;

  const unidades = Object.values(stats.porUnidad || {}).sort((a, b) => b.total - a.total);
  if (unidades.length > 0) {
    msg += `🏛️ *Avance por Unidad:*\n`;
    for (const u of unidades) {
      msg += `▪️ *${u.nombre}:* ${u.votaron}/${u.total} (${u.porcentaje})\n`;
    }
    msg += `\n`;
  }

  msg += `🆔 *Cédulas que votaron en el corte de las ${corteEtiqueta} (${cedulasEsteCorte.length}):*\n`;
  msg += `${formatearListaCedulas(cedulasEsteCorte, 35)}\n`;

  return msg;
}

/**
 * Devuelve la lista de reportes por separado aplicando las reglas específicas:
 * - SEGEN: por cargos y totalización.
 * - INE: por unidad, cédulas y por cada corte.
 */
export function obtenerReportesSeparados(stats: EstadisticasNomina): { nomina: string; mensaje: string }[] {
  const nominasOrdenadas = Object.keys(stats.porNomina).sort((a, b) => {
    if (a === "SEGEN") return -1;
    if (b === "SEGEN") return 1;
    if (a === "INE") return -1;
    if (b === "INE") return 1;
    return a.localeCompare(b);
  });

  return nominasOrdenadas.map((nom) => {
    const item = stats.porNomina[nom];
    const norm = normalizarTexto(nom);

    if (norm.includes("segen")) {
      return {
        nomina: nom,
        mensaje: formatearReporteSEGEN(item, stats.corteActivo),
      };
    }

    if (norm.includes("ine")) {
      return {
        nomina: nom,
        mensaje: formatearReporteINE(item, stats.corteActivo),
      };
    }

    // Fallback general para cualquier otra nómina
    return {
      nomina: nom,
      mensaje: formatearReporteSEGEN(item, stats.corteActivo),
    };
  });
}

/**
 * Devuelve la lista de notificaciones de corte por separado aplicando las reglas específicas:
 * - SEGEN: totalización y cargos.
 * - INE: totalización, unidad y cédulas del corte.
 */
export function obtenerReportesCorteSeparados(
  corteEtiqueta: string,
  stats: EstadisticasNomina
): { nomina: string; mensaje: string }[] {
  const nominasOrdenadas = Object.keys(stats.porNomina).sort((a, b) => {
    if (a === "SEGEN") return -1;
    if (b === "SEGEN") return 1;
    if (a === "INE") return -1;
    if (b === "INE") return 1;
    return a.localeCompare(b);
  });

  return nominasOrdenadas.map((nom) => {
    const item = stats.porNomina[nom];
    const norm = normalizarTexto(nom);

    if (norm.includes("segen")) {
      return {
        nomina: nom,
        mensaje: formatearReporteCorteSEGEN(corteEtiqueta, item),
      };
    }

    if (norm.includes("ine")) {
      return {
        nomina: nom,
        mensaje: formatearReporteCorteINE(corteEtiqueta, item),
      };
    }

    return {
      nomina: nom,
      mensaje: formatearReporteCorteSEGEN(corteEtiqueta, item),
    };
  });
}

// =========================================================================
// COMANDO Y REPORTES ESPECÍFICOS POR UNIDAD
// =========================================================================

export interface DetalleUnidadData {
  nombre: string;
  total: number;
  votaron: number;
  pendientes: number;
  porcentaje: string;
  electoresVotaron: VoterRecord[];
  electoresPendientes: VoterRecord[];
}

/**
 * Genera el reporte detallado para una unidad específica, indicando con nombre y cédula
 * quiénes ya reportaron su voto y quiénes siguen pendientes.
 */
export function formatearDetalleUnidad(u: DetalleUnidadData): string {
  let msg = `🏛️ *REPORTE DETALLADO POR UNIDAD*\n`;
  msg += `📍 *Unidad:* ${u.nombre}\n\n`;

  msg += `📊 *ESTADO DE PARTICIPACIÓN:*\n`;
  msg += `👥 *Total en la Unidad:* ${u.total} personas\n`;
  msg += `✅ *Han Reportado:* ${u.votaron} (${u.porcentaje})\n`;
  msg += `⏳ *Pendientes:* ${u.pendientes}\n\n`;

  // 1. Lista de personas que ya votaron
  if (u.electoresVotaron.length > 0) {
    msg += `✅ *YA REPORTARON (${u.electoresVotaron.length}):*\n`;
    for (const v of u.electoresVotaron) {
      const ci = formatearCedula(v.cedula);
      const horaInfo = v.fechaHoraVoto ? ` (${v.fechaHoraVoto})` : "";
      const corteInfo = v.corte ? ` [${v.corte}]` : "";
      msg += `▪️ ${v.nombre} — \`V-${ci}\`${horaInfo}${corteInfo}\n`;
    }
    msg += `\n`;
  } else {
    msg += `✅ *YA REPORTARON:* _Ninguno aún_\n\n`;
  }

  // 2. Lista de personas pendientes por votar
  if (u.electoresPendientes.length > 0) {
    msg += `⏳ *PENDIENTES POR REPORTAR (${u.electoresPendientes.length}):*\n`;
    for (const v of u.electoresPendientes) {
      const ci = formatearCedula(v.cedula);
      msg += `▪️ ${v.nombre} — \`V-${ci}\`\n`;
    }
  } else {
    msg += `🎉 *¡100% de participación completada en esta unidad!*`;
  }

  return msg;
}

/**
 * Genera un informe global de quiénes han reportado por unidad en todas las unidades.
 */
export function formatearReporteTodasUnidades(unidades: DetalleUnidadData[]): string {
  let msg = `🏛️ *REPORTE DE PARTICIPACIÓN POR UNIDADES (INE)*\n\n`;

  for (const u of unidades) {
    msg += `🔹 *${u.nombre}* (${u.votaron}/${u.total} — ${u.porcentaje})\n`;
    if (u.electoresVotaron.length > 0) {
      const lista = u.electoresVotaron
        .map((v) => `${v.nombre.split(" ")[0]} (V-${formatearCedula(v.cedula)})`)
        .join(", ");
      msg += `   ↳ ✅ _Reportaron:_ ${lista}\n`;
    } else {
      msg += `   ↳ ⏳ _Sin reportes aún_\n`;
    }
    msg += `\n`;
  }

  msg += `💡 _Para ver la lista completa con pendientes de una unidad, usa:_\n`;
  msg += `👉 \`/unidad <nombre de la unidad>\` (Ej: \`/unidad economica\` o \`/unidad seem\`)`;

  return msg;
}
