import http from "node:http";
import { Bot } from "grammy";
import { config, validarConfig } from "./config/index.js";
import { voterService } from "./services/voterService.js";
import { registrarHandlers } from "./handlers/message.js";
import { programarCortesHorarios } from "./jobs/cutoffs.js";

validarConfig();

const bot = new Bot(config.telegram.token);

// Registrar controladores de mensajes y comandos
registrarHandlers(bot);

// Manejador global de errores en actualizaciones de Telegram
bot.catch((err) => {
  const updateId = err.ctx?.update?.update_id ?? "desconocida";
  console.error(`[ERROR GLOBAL] Error procesando actualización ${updateId}:`, err.error);
});

// Servidor HTTP ligero para healthcheck (Keep-alive para Render / Railway / Cloud)
const server = http.createServer((req, res) => {
  if (req.url === "/" || req.url === "/healthz") {
    const stats = voterService.obtenerEstadisticas();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        uptimeSeconds: Math.round(process.uptime()),
        service: "Bot de Votaciones y Consulta Electoral",
        totalElectores: stats.total,
        totalVotaron: stats.votaron,
        porcentaje: stats.porcentajeVotaron,
      })
    );
  } else {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  }
});

let currentPort = config.app.port;

server.on("error", (e: any) => {
  if (e.code === "EADDRINUSE") {
    currentPort++;
    if (currentPort > config.app.port + 15) {
      console.warn(`[WARN] No se pudo abrir servidor HTTP tras varios intentos. Continuando bot sin servidor HTTP local.`);
      return;
    }
    console.warn(`[WARN] Puerto ocupado. Probando en puerto ${currentPort}...`);
    server.listen(currentPort, "0.0.0.0");
  } else {
    console.error("[ERROR HTTP SERVER]:", e);
  }
});

server.listen(currentPort, "0.0.0.0", () => {
  console.log(`[INFO] Servidor HTTP de salud escuchando en el puerto ${currentPort}`);
});

// Inicio del Bot y carga inicial de nómina
async function arrancar() {
  console.log("[INFO] Conectando con Google Sheets e inicializando nómina de electores...");
  try {
    await voterService.inicializar();
  } catch (err) {
    console.error("[ERROR FATAL] No se pudo inicializar la nómina desde Google Sheets:", err);
  }

  console.log("[INFO] Iniciando Bot de Telegram...");
  await bot.start({
    onStart: (botInfo) => {
      console.log(`[INFO] Bot @${botInfo.username} en línea y listo para registrar votos.`);
      // Configurar menú de comandos nativo en la interfaz de Telegram
      bot.api
        .setMyCommands([
          { command: "comandos", description: "Ver lista completa de comandos" },
          { command: "resumen", description: "Reportes consolidados SEGEN e INE" },
          { command: "segen", description: "Reporte de SEGEN (por Cargos)" },
          { command: "ine", description: "Reporte de INE (por Unidades)" },
          { command: "unidad", description: "Quiénes han reportado por unidad" },
          { command: "corte", description: "Avance del corte horario activo" },
          { command: "consulta", description: "Consultar datos de un elector" },
          { command: "deshacer", description: "Anular o corregir un voto" },
          { command: "recargar", description: "Sincronizar nómina desde Google Sheets" },
          { command: "ayuda", description: "Instrucciones de uso del bot" },
        ])
        .then(() => console.log("[INFO] Comandos nativos registrados en Telegram."))
        .catch((err) => console.error("[WARN] No se pudo registrar setMyCommands:", err));

      // Programar los cortes horarios oficiales (8am, 10am, 12pm, 2pm, 4pm, 6pm, 7pm)
      programarCortesHorarios(bot.api);
    },
  });
}

// Cierre limpio del proceso
const apagar = async () => {
  console.log("\n[INFO] Apagando bot de votaciones...");
  await bot.stop();
  server.close(() => {
    console.log("[INFO] Servidor HTTP detenido.");
    process.exit(0);
  });
};

process.on("SIGINT", apagar);
process.on("SIGTERM", apagar);

arrancar().catch((err) => {
  console.error("[FATAL] Falló el arranque del bot:", err);
  process.exit(1);
});
