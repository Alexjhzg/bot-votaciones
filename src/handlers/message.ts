import { Bot } from "grammy";
import { voterService, RegistroResultado } from "../services/voterService.js";
import {
  extraerCedulas,
  esIntencionVotoListo,
  formatearCedula,
} from "../utils/parser.js";
import {
  obtenerNombreRemitente,
  formatearTarjetaElector,
  formatearConfirmacionVoto,
  formatearAlertaYaVoto,
} from "../utils/telegram.js";
import { registrarComandos } from "./commands.js";

export function registrarHandlers(bot: Bot): void {
  // 1. Registrar comandos (/start, /ayuda, /resumen, /consulta, /deshacer, /recargar)
  registrarComandos(bot);

  // 2. Manejo de mensajes de texto en chats privados y grupos
  bot.on(["message:text", "edited_message:text"], async (ctx) => {
    const mensajeObj = ctx.message || ctx.editedMessage;
    if (!mensajeObj) return;

    const texto = (mensajeObj.text || "").trim();
    if (!texto) return;

    // Si comienza con "/", es un comando ya gestionado por Grammy
    if (texto.startsWith("/")) return;

    // Extraer cédulas presentes en el mensaje
    const cedulas = extraerCedulas(texto);
    if (cedulas.length === 0) {
      // Mensaje de conversación común sin números de cédula, ignorar silenciosamente
      return;
    }

    const remitente = obtenerNombreRemitente(ctx);
    const esGrupo = ctx.chat?.type === "group" || ctx.chat?.type === "supergroup";
    const origenDesc = esGrupo && "title" in ctx.chat ? `Grupo "${(ctx.chat as any).title}" (${ctx.chat.id})` : `Privado (${ctx.chat?.id})`;

    // Si el usuario pide explícitamente consultar datos sin marcar voto
    const esConsultaExplicita = /^\s*(consulta|consultar|donde|info|quien)\b/i.test(texto);
    if (esConsultaExplicita) {
      const cedula = cedulas[0];
      const voter = voterService.consultar(cedula);

      if (!voter) {
        await ctx.reply(
          `❌ *Cédula no encontrada*\n\nLa C.I. *V-${formatearCedula(
            cedula
          )}* no aparece en la nómina oficial.`,
          { parse_mode: "Markdown" }
        );
        return;
      }

      await ctx.reply(formatearTarjetaElector(voter), { parse_mode: "Markdown" });
      return;
    }

    // ==========================================================
    // REGISTRO DE VOTO DIRECTO (SOLO CÉDULA O CÉDULAS)
    // ==========================================================
    console.log(`[INFO] [${origenDesc}] Registro de voto para cédula(s) de ${remitente}: [${cedulas.join(", ")}]`);

    // Si es una sola cédula (caso más común y rápido)
    if (cedulas.length === 1) {
      const cedula = cedulas[0];
      try {
        const res = await voterService.registrarVoto(cedula, remitente);

        if (res.status === "SUCCESS" && res.voter) {
          try {
            await ctx.react("👍");
          } catch {
            // Silencioso si el chat no permite reacciones
          }
          // Voto registrado exitosamente: solo reacciona con pulgar arriba sin enviar mensaje
        } else if (res.status === "ALREADY_VOTED" && res.voter) {
          await ctx.reply(
            formatearAlertaYaVoto(
              res.voter,
              res.fechaHoraPrevia,
              res.reportadoPorPrevio
            ),
            { parse_mode: "Markdown" }
          );
        } else {
          // En grupos, solo responder "Cédula no encontrada" si el mensaje es corto (envío directo de cédula)
          // o si tiene intención explícita de voto, para evitar interrumpir reportes de campo o conversaciones largas
          const esMensajeDirecto = texto.length <= 40 || esIntencionVotoListo(texto);
          if (!esGrupo || esMensajeDirecto) {
            await ctx.reply(
              `❌ *Cédula no encontrada en nómina*\n\nLa C.I. *V-${formatearCedula(
                cedula
              )}* no se encuentra en las listas oficiales (SEGEN / INE).`,
              { parse_mode: "Markdown" }
            );
          }
        }
      } catch (err) {
        console.error(`[ERROR] Error procesando voto para ${cedula}:`, err);
        await ctx.reply(
          `❌ Ocurrió un error al intentar registrar el voto para la C.I. V-${formatearCedula(
            cedula
          )} en Google Sheets.`
        );
      }
      return;
    }

    // Si enviaron varias cédulas juntas en el mismo mensaje
    const exitosos: string[] = [];
    const yaVotaron: string[] = [];
    const noEncontrados: string[] = [];

    for (const cedula of cedulas) {
      try {
        const res = await voterService.registrarVoto(cedula, remitente);
        if (res.status === "SUCCESS" && res.voter) {
          exitosos.push(`${res.voter.nombre} (V-${formatearCedula(cedula)})`);
        } else if (res.status === "ALREADY_VOTED" && res.voter) {
          yaVotaron.push(`${res.voter.nombre} (V-${formatearCedula(cedula)})`);
        } else {
          noEncontrados.push(`V-${formatearCedula(cedula)}`);
        }
      } catch (err) {
        console.error(`[ERROR] Error en lote para ${cedula}:`, err);
      }
    }

    if (exitosos.length > 0) {
      try {
        await ctx.react("👍");
      } catch {
        // Silencioso si el chat no permite reacciones
      }
    }

    // Si todas las cédulas fueron exitosas, solo se deja la reacción sin enviar mensajes al chat.
    // Solo respondemos si hubo incidencias (ya habían votado o no encontradas)
    if (yaVotaron.length > 0 || noEncontrados.length > 0) {
      let respuestaIncidencias = `📋 *ATENCIÓN - INCIDENCIAS EN REPORTE*\n\n`;
      if (yaVotaron.length > 0) {
        respuestaIncidencias += `⚠️ *Ya Habían Votado (${yaVotaron.length}):*\n`;
        yaVotaron.forEach((e) => (respuestaIncidencias += `▪️ ${e}\n`));
        respuestaIncidencias += `\n`;
      }
      if (noEncontrados.length > 0) {
        respuestaIncidencias += `❌ *No Encontrados en Nómina (${noEncontrados.length}):*\n`;
        noEncontrados.forEach((e) => (respuestaIncidencias += `▪️ ${e}\n`));
      }
      await ctx.reply(respuestaIncidencias, { parse_mode: "Markdown" });
    }
    return;
  });

  // 3. Cuando el bot es agregado a un grupo nuevo
  bot.on(":new_chat_members", async (ctx) => {
    const nuevos = ctx.message?.new_chat_members || [];
    const botId = ctx.me.id;
    const botFueAgregado = nuevos.some((m) => m.id === botId);

    if (botFueAgregado) {
      const chatTitle = ctx.chat && "title" in ctx.chat ? (ctx.chat as any).title : "Grupo";
      const chatId = ctx.chat?.id;
      console.log(`\n🎉 [NUEVO GRUPO] El bot fue agregado al grupo: "${chatTitle}" (ID: ${chatId})`);

      await ctx.reply(
        `🤖 *¡Bot de Votaciones Conectado a este Grupo!*\n\n` +
          `📛 *Grupo:* ${chatTitle}\n` +
          `🆔 *Chat ID:* \`${chatId}\`\n\n` +
          `Para registrar votos escribe únicamente el número de cédula:\n` +
          `👉 \`12345678\`\n\n` +
          `Para ver todos los comandos disponibles:\n` +
          `👉 \`/comandos\``,
        { parse_mode: "Markdown" }
      );
    }
  });
}

