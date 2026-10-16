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
}

export const config = {
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN!,
    reportChatId: process.env.TELEGRAM_REPORT_CHAT_ID || null,
    managerChatIds: process.env.TELEGRAM_MANAGER_CHAT_ID
      ? process.env.TELEGRAM_MANAGER_CHAT_ID.split(",").map((id) => id.trim()).filter(Boolean)
      : [],
  },
  google: {
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID!,
    serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
    privateKey: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    // Pestañas específicas separadas por coma, o vacío para leer todas las relevantes
    sheetTabs: process.env.GOOGLE_SHEET_TABS
      ? process.env.GOOGLE_SHEET_TABS.split(",").map((t) => t.trim()).filter(Boolean)
      : [],
  },
  app: {
    timezone: process.env.TIMEZONE || "America/Caracas",
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
