import { Bot, Context } from "grammy";
import { voterService } from "../services/voterService.js";
import {
  obtenerNombreRemitente,
  formatearTarjetaElector,
  formatearReporteSEGEN,
  formatearReporteINE,
  obtenerReportesSeparados,
  obtenerReportesCorteSeparados,
} from "../utils/telegram.js";
import { extraerCedulas, formatearCedula, obtenerCorteActivoActual } from "../utils/parser.js";
import { config } from "../config/index.js";

export function registrarComandos(bot: Bot): void {
  // Comando /start y /ayuda
  bot.command(["start", "ayuda", "help"], async (ctx: Context) => {
    const remitente = obtenerNombreRemitente(ctx);
    console.log(`[INFO] Comando /start o /ayuda ejecutado por ${remitente}`);

    const { etiqueta: corteActual } = obtenerCorteActivoActual(config.app.timezone);

    const mensaje =
      `👋 *¡Bienvenido al Bot de Consulta y Registro de Votaciones!*\n\n` +
      `Este bot te permite registrar la participación de electores en tiempo real y consultar su centro de votación.\n\n` +
      `🕒 *Corte Horario Activo:* ${corteActual}\n` +
      `⏰ *Horarios Oficiales de Cortes:* 8am, 10am, 12pm, 2pm, 4pm, 6pm y 7pm\n\n` +
      `🗳️ *¿Cómo registrar un voto?*\n` +
      `Simplemente escribe la cédula y la frase *voto listo*:\n` +
      `👉 \`12345678 voto listo\`\n` +
      `👉 \`V-12.345.678 voto listo\`\n\n` +
      `🔍 *¿Cómo consultar un elector?*\n` +
      `Envía solo el número de cédula o usa el comando:\n` +
      `👉 \`12345678\`\n` +
      `👉 \`/consulta 12345678\`\n\n` +
      `📊 *Reportes Disponibles (Emitidos por separado):*\n` +
      `▪️ \`/resumen\` o \`/total\` — Emite los dos reportes por separado (SEGEN e INE).\n` +
      `▪️ \`/segen\` — Emite exclusivamente el reporte de SEGEN.\n` +
      `▪️ \`/ine\` — Emite exclusivamente el reporte de INE.\n` +
      `▪️ \`/corte\` — Emite los reportes del corte activo para SEGEN e INE por separado.\n` +
      `▪️ \`/deshacer <cédula>\` — Corregir un registro en caso de equivocación.\n` +
      `▪️ \`/recargar\` — Sincronizar y refrescar la nómina desde Google Sheets.\n\n` +
      `_Toda la información se actualiza automáticamente en Google Sheets con su respectivo corte horario._`;

    await ctx.reply(mensaje, { parse_mode: "Markdown" });
  });

  // Comando /resumen y /total (emite 2 reportes por separado: SEGEN e INE)
  bot.command(["resumen", "total", "totales", "estadisticas"], async (ctx: Context) => {
    try {
      const remitente = obtenerNombreRemitente(ctx);
      console.log(`[INFO] Comando /resumen ejecutado por ${remitente}`);

      const stats = voterService.obtenerEstadisticas();
      const reportes = obtenerReportesSeparados(stats);

      if (reportes.length === 0) {
        await ctx.reply("ℹ️ No hay registros cargados en la nómina actualmente.");
        return;
      }

      // Enviar cada reporte por separado (uno para SEGEN y otro para INE)
      for (const rep of reportes) {
        await ctx.reply(rep.mensaje, { parse_mode: "Markdown" });
      }
    } catch (err) {
      console.error("[ERROR] Falló al generar resumen:", err);
      await ctx.reply("❌ Ocurrió un error al generar los reportes de votación.");
    }
  });

  // Comando /segen (reporte exclusivo de SEGEN)
  bot.command("segen", async (ctx: Context) => {
    try {
      const stats = voterService.obtenerEstadisticas();
      const statsSegen = voterService.obtenerEstadisticasNomina("SEGEN");

      if (!statsSegen) {
        await ctx.reply("⚠️ No se encontraron registros para la nómina *SEGEN*.", {
          parse_mode: "Markdown",
        });
        return;
      }

      const msg = formatearReporteSEGEN(statsSegen, stats.corteActivo);
      await ctx.reply(msg, { parse_mode: "Markdown" });
    } catch (err) {
      console.error("[ERROR] Falló al emitir reporte SEGEN:", err);
      await ctx.reply("❌ Error al consultar nómina SEGEN.");
    }
  });

  // Comando /ine (reporte exclusivo de INE)
  bot.command("ine", async (ctx: Context) => {
    try {
      const stats = voterService.obtenerEstadisticas();
      const statsIne = voterService.obtenerEstadisticasNomina("INE");

      if (!statsIne) {
        await ctx.reply("⚠️ No se encontraron registros para la nómina *INE*.", {
          parse_mode: "Markdown",
        });
        return;
      }

      const msg = formatearReporteINE(statsIne, stats.corteActivo);
      await ctx.reply(msg, { parse_mode: "Markdown" });
    } catch (err) {
      console.error("[ERROR] Falló al emitir reporte INE:", err);
      await ctx.reply("❌ Error al consultar nómina INE.");
    }
  });

  // Comando /corte o /cortes (emite 2 reportes de corte por separado: SEGEN e INE)
  bot.command(["corte", "cortes"], async (ctx: Context) => {
    try {
      const remitente = obtenerNombreRemitente(ctx);
      console.log(`[INFO] Comando /corte ejecutado por ${remitente}`);

      const { etiqueta: corteActual } = obtenerCorteActivoActual(config.app.timezone);
      const stats = voterService.obtenerEstadisticas();
      const reportesCorte = obtenerReportesCorteSeparados(corteActual, stats);

      if (reportesCorte.length === 0) {
        await ctx.reply("ℹ️ No hay registros cargados en la nómina actualmente.");
        return;
      }

      // Enviar dos reportes de corte por separado
      for (const rep of reportesCorte) {
        await ctx.reply(rep.mensaje, { parse_mode: "Markdown" });
      }
    } catch (err) {
      console.error("[ERROR] Falló al generar reporte de corte:", err);
      await ctx.reply("❌ Ocurrió un error al generar los reportes del corte.");
    }
  });

  // Comando /consulta <cedula>
  bot.command(["consulta", "consultar", "buscar"], async (ctx: Context) => {
    const texto = ctx.message?.text || "";
    const cedulas = extraerCedulas(texto);

    if (cedulas.length === 0) {
      await ctx.reply(
        "ℹ️ *Uso correcto:* `/consulta <número de cédula>`\n_Ejemplo:_ `/consulta 12345678`",
        { parse_mode: "Markdown" }
      );
      return;
    }

    const cedula = cedulas[0];
    const voter = voterService.consultar(cedula);

    if (!voter) {
      await ctx.reply(
        `❌ *Cédula no encontrada*\n\nLa C.I. *V-${formatearCedula(
          cedula
        )}* no aparece registrada en la nómina de electores.`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    await ctx.reply(formatearTarjetaElector(voter), { parse_mode: "Markdown" });
  });

  // Comando /deshacer <cedula>
  bot.command(["deshacer", "anular", "corregir"], async (ctx: Context) => {
    const remitente = obtenerNombreRemitente(ctx);
    const texto = ctx.message?.text || "";
    const cedulas = extraerCedulas(texto);

    if (cedulas.length === 0) {
      await ctx.reply(
        "ℹ️ *Uso correcto:* `/deshacer <número de cédula>`\n_Ejemplo:_ `/deshacer 12345678`",
        { parse_mode: "Markdown" }
      );
      return;
    }

    const cedula = cedulas[0];
    try {
      const resultado = await voterService.deshacerVoto(cedula, remitente);

      if (resultado.status === "NOT_FOUND") {
        await ctx.reply(
          `❌ La C.I. *V-${formatearCedula(cedula)}* no existe en la nómina.`,
          { parse_mode: "Markdown" }
        );
      } else if (resultado.status === "NOT_VOTED") {
        await ctx.reply(
          `ℹ️ La C.I. *V-${formatearCedula(cedula)}* (${resultado.voter?.nombre}) no tenía ningún voto registrado para anular.`,
          { parse_mode: "Markdown" }
        );
      } else {
        await ctx.reply(
          `🔄 *Voto Deshecho*\n\nSe restableció el estado a *PENDIENTE* para:\n👤 ${resultado.voter?.nombre}\n🆔 V-${formatearCedula(cedula)}`,
          { parse_mode: "Markdown" }
        );
      }
    } catch (err) {
      console.error("[ERROR] Falló al deshacer voto:", err);
      await ctx.reply("❌ Error al intentar anular el voto en Google Sheets.");
    }
  });

  // Comando /recargar
  bot.command(["recargar", "sync", "actualizar"], async (ctx: Context) => {
    try {
      const remitente = obtenerNombreRemitente(ctx);
      console.log(`[INFO] Comando /recargar ejecutado por ${remitente}`);
      await ctx.reply("⏳ Sincronizando nómina desde Google Sheets...");

      const total = await voterService.recargar();
      await ctx.reply(
        `✅ *Nómina actualizada exitosamente*\n\nSe han indexado *${total.toLocaleString(
          "es-VE"
        )} electores* listos para consulta y registro.`,
        { parse_mode: "Markdown" }
      );
    } catch (err) {
      console.error("[ERROR] Falló al recargar nómina:", err);
      await ctx.reply("❌ Ocurrió un error al recargar los datos desde Google Sheets.");
    }
  });
}
