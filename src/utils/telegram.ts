import { Context } from "grammy";
import { VoterRecord, EstadisticasNomina, EstadisticasNominaIndividual } from "../services/voterService.js";
import { formatearCedula } from "./parser.js";

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

  if (voter.centro) {
    card += `🏫 *Centro de Votación:* ${voter.centro}\n`;
  }
  if (voter.mesa) {
    card += `🗳️ *Mesa:* ${voter.mesa}\n`;
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

  if (voter.centro) {
    msg += `🏫 *Centro:* ${voter.centro}\n`;
  }
  if (voter.mesa) {
    msg += `🗳️ *Mesa:* ${voter.mesa}\n`;
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
 * Genera el reporte individual exclusivo para una nómina (SEGEN o INE).
 */
export function formatearReporteNomina(
  stats: EstadisticasNominaIndividual,
  corteActivo: string
): string {
  let msg = `📊 *REPORTE DE PARTICIPACIÓN — NÓMINA ${stats.nomina}*\n`;
  msg += `🕒 *Corte Activo:* ${corteActivo}\n\n`;

  msg += `👥 *Padrón ${stats.nomina}:* ${stats.total.toLocaleString("es-VE")} electores\n`;
  msg += `✅ *Total Votaron:* ${stats.votaron.toLocaleString("es-VE")} (${stats.porcentaje})\n`;
  msg += `⏳ *Pendientes por Votar:* ${stats.pendientes.toLocaleString("es-VE")}\n\n`;

  if (stats.porCorte && Object.keys(stats.porCorte).length > 0) {
    msg += `⏰ *Avance por Cortes Horarios (${stats.nomina}):*\n`;
    for (const [corte, cantidad] of Object.entries(stats.porCorte)) {
      if (cantidad > 0) {
        msg += `▪️ *${corte}:* ${cantidad} votos\n`;
      }
    }
  }

  return msg;
}

/**
 * Genera el reporte de corte horario oficial exclusivo para una nómina (SEGEN o INE).
 */
export function formatearReporteCorteNomina(
  corteEtiqueta: string,
  stats: EstadisticasNominaIndividual
): string {
  let msg = `🔔 *NOTIFICACIÓN OFICIAL — CORTE DE LAS ${corteEtiqueta}*\n`;
  msg += `🏢 *NÓMINA ${stats.nomina}*\n\n`;

  msg += `👥 *Padrón Total:* ${stats.total.toLocaleString("es-VE")}\n`;
  msg += `✅ *Total Votaron:* ${stats.votaron.toLocaleString("es-VE")} (${stats.porcentaje})\n`;
  msg += `⏳ *Faltan por Votar:* ${stats.pendientes.toLocaleString("es-VE")}\n\n`;

  const votosEnEsteCorte = stats.porCorte[corteEtiqueta] || 0;
  msg += `🕒 *Votos recibidos en el bloque de las ${corteEtiqueta}:* ${votosEnEsteCorte}\n`;

  return msg;
}

/**
 * Devuelve la lista de reportes por separado para cada nómina (SEGEN primero, INE después).
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
    return {
      nomina: nom,
      mensaje: formatearReporteNomina(item, stats.corteActivo),
    };
  });
}

/**
 * Devuelve la lista de reportes de corte oficial por separado para cada nómina (SEGEN primero, INE después).
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
    return {
      nomina: nom,
      mensaje: formatearReporteCorteNomina(corteEtiqueta, item),
    };
  });
}
