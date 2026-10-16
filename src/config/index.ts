import "dotenv/config";

const REQUIRED_VARS = [
  "TELEGRAM_BOT_TOKEN",
  "GOOGLE_SPREADSHEET_ID",
  "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_PRIVATE_KEY",
];

for (const key of REQUIRED_VARS) {
  if (!process.env[key]) {
    console.warn(`[ADVERTENCIA] Variable de entorno "${key}" no encontrada.`);
  }
}

export function validarConfig(): void {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error("[FATAL] La variable TELEGRAM_BOT_TOKEN es obligatoria.");
    process.exit(1);
  }
  if (!process.env.GOOGLE_SPREADSHEET_ID) {
    console.error("[FATAL] La variable GOOGLE_SPREADSHEET_ID es obligatoria.");
    process.exit(1);
  }
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) {
    console.error("[FATAL] La variable GOOGLE_SERVICE_ACCOUNT_EMAIL es obligatoria.");
    process.exit(1);
  }
  if (!config.google.privateKey) {
    console.error("[FATAL] La variable GOOGLE_PRIVATE_KEY es obligatoria.");
    process.exit(1);
  }
  if (!config.google.privateKey.includes("-----BEGIN PRIVATE KEY-----")) {
    console.warn(
      "[ADVERTENCIA CONFIG] GOOGLE_PRIVATE_KEY no parece tener el formato PEM esperado ('-----BEGIN PRIVATE KEY-----'). " +
      "Revisa que hayas copiado el campo 'private_key' completo del archivo JSON descargado de Google Cloud."
    );
  }
}

function sanitizarPrivateKey(rawKey?: string): string {
  if (!rawKey) return "";
  let key = rawKey.trim();
  // Quitar comillas circundantes si se pegaron en Render o .env
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1).trim();
  }
  // Reemplazar saltos de línea escapados a saltos reales
  key = key.replace(/\\n/g, "\n").replace(/\r\n/g, "\n");

  // Si no tiene saltos de línea reales pero contiene las cabeceras estándar
  if (!key.includes("\n") && key.includes("BEGIN PRIVATE KEY")) {
    const beginHeader = "-----BEGIN PRIVATE KEY-----";
    const endHeader = "-----END PRIVATE KEY-----";
    if (key.includes(beginHeader) && key.includes(endHeader)) {
      const startIdx = key.indexOf(beginHeader) + beginHeader.length;
      const endIdx = key.indexOf(endHeader);
      const base64Body = key.substring(startIdx, endIdx).replace(/\s+/g, "");
      const formattedBody = base64Body.match(/.{1,64}/g)?.join("\n") || base64Body;
      key = `${beginHeader}\n${formattedBody}\n${endHeader}\n`;
    }
  }

  return key;
}

export const config = {
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN!,
    reportChatIds: process.env.TELEGRAM_REPORT_CHAT_ID
      ? process.env.TELEGRAM_REPORT_CHAT_ID.split(",").map((id) => id.trim()).filter(Boolean)
      : [],
    reportChatId: process.env.TELEGRAM_REPORT_CHAT_ID
      ? process.env.TELEGRAM_REPORT_CHAT_ID.split(",")[0]?.trim() || null
      : null,
    managerChatIds: process.env.TELEGRAM_MANAGER_CHAT_ID
      ? process.env.TELEGRAM_MANAGER_CHAT_ID.split(",").map((id) => id.trim()).filter(Boolean)
      : [],
  },
  google: {
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID!,
    serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
    privateKey: sanitizarPrivateKey(process.env.GOOGLE_PRIVATE_KEY),
    // Pestañas específicas separadas por coma, o vacío para leer todas las relevantes
    sheetTabs: process.env.GOOGLE_SHEET_TABS
      ? process.env.GOOGLE_SHEET_TABS.split(",").map((t) => t.trim()).filter(Boolean)
      : [],
  },
  app: {
    timezone: process.env.TIMEZONE || process.env.APP_TIMEZONE || "America/Caracas",
    port: Number(process.env.PORT) || 8080,
    // Horarios oficiales de cortes de votación: 8am, 10am, 12pm, 2pm, 4pm, 6pm, 7pm
    cutoffHours: [8, 10, 12, 14, 16, 18, 19],
    cutoffLabels: {
      8: "8:00 AM",
      10: "10:00 AM",
      12: "12:00 PM",
      14: "2:00 PM",
      16: "4:00 PM",
      18: "6:00 PM",
      19: "7:00 PM",
    } as Record<number, string>,
  },
};
