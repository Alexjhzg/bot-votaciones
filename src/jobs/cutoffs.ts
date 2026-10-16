import { Cron } from "croner";
import { Api } from "grammy";
import { config } from "../config/index.js";
import { voterService } from "../services/voterService.js";
import { obtenerReportesCorteSeparados } from "../utils/telegram.js";
import { CORTES_OFICIALES, CORTES_ETIQUETAS } from "../utils/parser.js";

/**
 * Programa los envíos automáticos de los reportes en cada corte horario oficial:
 * 8:00 AM, 10:00 AM, 12:00 PM, 2:00 PM, 4:00 PM, 6:00 PM y 7:00 PM (hora de Venezuela).
 * Emite 2 reportes por separado: uno exclusivo para SEGEN y otro exclusivo para INE.
 */
export function programarCortesHorarios(api: Api): void {
  const timezone = config.app.timezone;
  console.log(`[INFO] Programando cronjobs de cortes horarios oficiales en zona ${timezone}...`);

  for (const hora of CORTES_OFICIALES) {
    const etiqueta = CORTES_ETIQUETAS[hora];
    const cronPattern = `0 ${hora} * * *`;

    new Cron(cronPattern, { timezone }, async () => {
      console.log(`\n🔔 [CRON] Ejecutando corte horario oficial: ${etiqueta} (${hora}:00 VET)...`);

      try {
        const stats = voterService.obtenerEstadisticas();
        const reportes = obtenerReportesCorteSeparados(etiqueta, stats);

        if (reportes.length === 0) {
          console.warn(`[ADVERTENCIA] No hay datos cargados para emitir corte de las ${etiqueta}.`);
          return;
        }

        // 1. Enviar cada reporte por separado a cada uno de los grupos configurados
        for (const chatId of config.telegram.reportChatIds) {
          for (const rep of reportes) {
            try {
              await api.sendMessage(chatId, rep.mensaje, {
                parse_mode: "Markdown",
              });
              console.log(
                `[INFO] Reporte de corte ${etiqueta} (${rep.nomina}) enviado al grupo ${chatId}`
              );
            } catch (err: any) {
              console.error(
                `[ERROR] No se pudo enviar el reporte de corte (${rep.nomina}) al grupo ${chatId}:`,
                err.message
              );
            }
          }
        }

        // 2. Enviar a cada uno de los gerentes/administradores privados si están configurados
        for (const managerId of config.telegram.managerChatIds) {
          for (const rep of reportes) {
            try {
              await api.sendMessage(managerId, rep.mensaje, {
                parse_mode: "Markdown",
              });
              console.log(
                `[INFO] Reporte de corte ${etiqueta} (${rep.nomina}) enviado al admin ${managerId}`
              );
            } catch (err: any) {
              console.error(
                `[ERROR] No se pudo enviar el reporte de corte (${rep.nomina}) al admin ${managerId}:`,
                err.message
              );
            }
          }
        }
      } catch (error) {
        console.error(`[ERROR] Falló la generación de reportes de corte ${etiqueta}:`, error);
      }
    });

    console.log(`[INFO] Programado corte de las ${etiqueta} -> [${cronPattern}]`);
  }
}
