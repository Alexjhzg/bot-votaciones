import { Bot, Context } from "grammy";
import { voterService } from "../services/voterService.js";
import {
  obtenerNombreRemitente,
  formatearTarjetaElector,
  formatearReporteSEGEN,
  formatearReporteINE,
  obtenerReportesSeparados,
  obtenerReportesCorteSeparados,
  formatearDetalleUnidad,
  formatearReporteTodasUnidades,
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
      `Este bot te permite registrar la participación de electores en tiempo real de forma ágil y directa.\n\n` +
      `🕒 *Corte Horario Activo:* ${corteActual}\n` +
      `⏰ *Horarios Oficiales de Cortes:* 8am, 10am, 12pm, 2pm, 4pm, 6pm y 7pm\n\n` +
      `🗳️ *¿Cómo registrar un voto?*\n` +
      `Simplemente escribe el número de cédula (el bot marcará con 👍):\n` +
      `👉 \`12345678\`\n` +
      `👉 \`V-12.345.678\`\n` +
      `👉 _También puedes enviar varias cédulas en un solo mensaje._\n\n` +
      `🔍 *¿Cómo consultar un elector?*\n` +
      `Usa el comando /consulta:\n` +
      `👉 \`/consulta 12345678\`\n\n` +
      `📊 *Reportes Disponibles (Emitidos por separado):*\n` +
      `▪️ \`/resumen\` o \`/total\` — Emite los dos reportes por separado (SEGEN e INE).\n` +
      `▪️ \`/segen\` — Emite exclusivamente el reporte de SEGEN.\n` +
      `▪️ \`/ine\` — Emite exclusivamente el reporte de INE.\n` +
      `▪️ \`/unidad\` — Ver quiénes han reportado por unidad (o \`/unidad <nombre>\`).\n` +
      `▪️ \`/corte\` — Emite los reportes del corte activo para SEGEN e INE por separado.\n` +
      `▪️ \`/deshacer <cédula>\` — Corregir un registro en caso de equivocación.\n` +
      `▪️ \`/comandos\` — Lista detallada de todos los comandos disponibles.\n` +
      `▪️ \`/recargar\` — Sincronizar y refrescar la nómina desde Google Sheets.\n\n` +
      `_Toda la información se actualiza automáticamente en Google Sheets con su respectivo corte horario._`;

    await ctx.reply(mensaje, { parse_mode: "Markdown" });
  });

  // Comando /comandos y /menu
  bot.command(["comandos", "commands", "menu"], async (ctx: Context) => {
    const remitente = obtenerNombreRemitente(ctx);
    console.log(`[INFO] Comando /comandos ejecutado por ${remitente}`);

    const mensaje =
      `🤖 *LISTA COMPLETA DE COMANDOS DEL BOT*\n\n` +
      `🗳️ *REGISTRO DE PARTICIPACIÓN:*\n` +
      `▪️ \`<cédula>\` — Registra el voto inmediatamente con 👍 (Ej: \`12345678\`)\n` +
      `▪️ \`/deshacer <cédula>\` — Anula un registro en caso de error (Ej: \`/deshacer 12345678\`)\n\n` +
      `🔍 *CONSULTA DE ELECTORES:*\n` +
      `▪️ \`/consulta <cédula>\` — Consulta datos del elector sin marcar voto (Ej: \`/consulta 12345678\`)\n\n` +
      `📊 *REPORTES ELECTORALES:*\n` +
      `▪️ \`/resumen\` o \`/total\` — Emite los dos reportes por separado (SEGEN e INE)\n` +
      `▪️ \`/segen\` — Reporte de SEGEN (por Cargos y Totalización)\n` +
      `▪️ \`/ine\` — Reporte de INE (por Unidad y Cédulas por cada corte)\n` +
      `▪️ \`/unidad\` — Avance global de quiénes han reportado por unidad\n` +
      `▪️ \`/unidad <nombre>\` — Lista detallada de quiénes reportaron y quiénes faltan en esa unidad (Ej: \`/unidad seem\` o \`/unidad economica\`)\n` +
      `▪️ \`/corte\` — Emite los reportes del corte horario activo (8am, 10am, 12pm, 2pm, 4pm, 6pm, 7pm)\n\n` +
      `⚙️ *SISTEMA Y AYUDA:*\n` +
      `▪️ \`/comandos\` — Muestra esta lista de comandos\n` +
      `▪️ \`/id\` — Muestra el ID de este grupo o de tu usuario\n` +
      `▪️ \`/start\` o \`/ayuda\` — Mensaje inicial de bienvenida\n` +
      `▪️ \`/recargar\` o \`/sync\` — Sincroniza nómina en vivo desde Google Sheets`;

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

      const chatIdStr = ctx.chat?.id ? String(ctx.chat.id) : "";

      // Si se ejecuta en el grupo exclusivo de SEGEN
      if (chatIdStr === config.telegram.segenChatId) {
        const rep = reportes.find((r) => r.nomina.toUpperCase().includes("SEGEN"));
        if (rep) {
          await ctx.reply(rep.mensaje, { parse_mode: "Markdown" });
          return;
        }
      }

      // Si se ejecuta en el grupo exclusivo de INE
      if (chatIdStr === config.telegram.ineChatId) {
        const rep = reportes.find((r) => r.nomina.toUpperCase().includes("INE"));
        if (rep) {
          await ctx.reply(rep.mensaje, { parse_mode: "Markdown" });
          return;
        }
      }

      // En cualquier otro chat o privado, enviar ambos reportes
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

      const chatIdStr = ctx.chat?.id ? String(ctx.chat.id) : "";

      // Si se ejecuta en el grupo exclusivo de SEGEN
      if (chatIdStr === config.telegram.segenChatId) {
        const rep = reportesCorte.find((r) => r.nomina.toUpperCase().includes("SEGEN"));
        if (rep) {
          await ctx.reply(rep.mensaje, { parse_mode: "Markdown" });
          return;
        }
      }

      // Si se ejecuta en el grupo exclusivo de INE
      if (chatIdStr === config.telegram.ineChatId) {
        const rep = reportesCorte.find((r) => r.nomina.toUpperCase().includes("INE"));
        if (rep) {
          await ctx.reply(rep.mensaje, { parse_mode: "Markdown" });
          return;
        }
      }

      // Enviar ambos reportes de corte en privado u otros chats
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

  // Comando /unidad y /unidades (para saber quiénes han reportado por unidad)
  bot.command(["unidad", "unidades"], async (ctx: Context) => {
    try {
      const remitente = obtenerNombreRemitente(ctx);
      const textoCompleto = ctx.message?.text || "";
      const partes = textoCompleto.split(/\s+/).slice(1);
      const filtro = partes.join(" ").trim();

      const resultado = voterService.obtenerDetallePorUnidad(filtro || undefined);

      if (filtro) {
        if (resultado.encontrada && resultado.unidadEspecifica) {
          console.log(`[INFO] Consulta de unidad "${filtro}" ejecutada por ${remitente}`);
          await ctx.reply(formatearDetalleUnidad(resultado.unidadEspecifica), {
            parse_mode: "Markdown",
          });
          return;
        }

        // Si no encontró coincidencia con el filtro especificado
        const listaDisponibles = resultado.unidades
          .map((u) => `▪️ \`/unidad ${u.nombre}\``)
          .join("\n");

        await ctx.reply(
          `⚠️ *Unidad no encontrada*\n\nNo se encontró ninguna unidad que coincida con "*${filtro}*".\n\n` +
            `🏛️ *Unidades disponibles:*\n${listaDisponibles}`,
          { parse_mode: "Markdown" }
        );
        return;
      }

      // Si no especificó unidad, muestra el reporte general de todas las unidades
      console.log(`[INFO] Reporte general de unidades ejecutado por ${remitente}`);
      await ctx.reply(formatearReporteTodasUnidades(resultado.unidades), {
        parse_mode: "Markdown",
      });
    } catch (err) {
      console.error("[ERROR] Error en comando /unidad:", err);
      await ctx.reply("❌ Ocurrió un error al generar el reporte de unidades.");
    }
  });

  // Comando /id (para conocer el ID del chat grupal o del usuario)
  bot.command("id", async (ctx: Context) => {
    const chatId = ctx.chat?.id;
    const chatTitle = ctx.chat && "title" in ctx.chat ? (ctx.chat as any).title : "Chat Privado";
    const tipo = ctx.chat?.type;
    const userId = ctx.from?.id;
    const remitente = ctx.from?.first_name || ctx.from?.username || "Usuario";

    console.log(`[INFO] /id consultado en "${chatTitle}" (ID: ${chatId}) por ${remitente} (ID: ${userId})`);

    await ctx.reply(
      `👥 *IDENTIFICACIÓN DE ESTE CHAT:*\n\n` +
        `📛 *Nombre / Grupo:* ${chatTitle}\n` +
        `🆔 *ID del Chat:* \`${chatId}\`\n` +
        `🏷️ *Tipo:* ${tipo === "supergroup" || tipo === "group" ? "Grupo de Telegram" : tipo}\n\n` +
        `👤 *Solicitado por:* ${remitente}\n` +
        `🆔 *Tu ID Personal:* \`${userId}\`\n\n` +
        `💡 *Consejo:* Para que este grupo reciba los reportes de corte automáticos, asegúrate de colocar su ID en \`TELEGRAM_REPORT_CHAT_ID\`.`,
      { parse_mode: "Markdown" }
    );
  });
}
