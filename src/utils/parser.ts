/**
 * Utilidades para normalización y parseo de mensajes electorales y cortes horarios.
 */

export const CORTES_OFICIALES = [8, 10, 12, 14, 16, 18, 19];

export const CORTES_ETIQUETAS: Record<number, string> = {
  8: "8:00 AM",
  10: "10:00 AM",
  12: "12:00 PM",
  14: "2:00 PM",
  16: "4:00 PM",
  18: "6:00 PM",
  19: "7:00 PM",
};

/**
 * Normaliza un texto eliminando tildes, caracteres especiales y espacios sobrantes.
 */
export function normalizarTexto(texto: string): string {
  if (!texto) return "";
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Normaliza los cargos homologando variantes equivalentes.
 * "SUPERVISOR DE NODO - AMBITOS INDUSTRIALES" y "SUPERVISOR DE NODO" son lo mismo.
 */
export function normalizarCargo(cargo: string): string {
  if (!cargo) return "Sin cargo";
  const norm = normalizarTexto(cargo);
  if (norm.includes("supervisor de nodo")) {
    return "SUPERVISOR DE NODO";
  }
  return cargo.trim();
}

/**
 * Limpia un número de cédula extrayendo solo los dígitos numéricos.
 * Ejemplos: "V-27.334.492" -> "27334492", "27334492" -> "27334492"
 */
export function limpiarCedula(cedulaStr: string): string {
  if (!cedulaStr) return "";
  return cedulaStr.replace(/\D/g, "");
}

/**
 * Da formato con separadores de miles a una cédula para presentación estética.
 * Ejemplo: "27334492" -> "27.334.492"
 */
export function formatearCedula(cedula: string): string {
  const limpia = limpiarCedula(cedula);
  if (!limpia) return cedula;
  return Number(limpia).toLocaleString("es-VE");
}

/**
 * Comprueba si un texto contiene la intención de registrar "voto listo".
 * Reconoce: "voto listo", "voto_listo", "ya voto", "listo", "voto".
 */
export function esIntencionVotoListo(texto: string): boolean {
  const norm = normalizarTexto(texto);
  return (
    /\bvoto\s*listo\b/i.test(norm) ||
    /\bya\s*voto\b/i.test(norm) ||
    /\bvoto_listo\b/i.test(norm) ||
    /\blisto\b/i.test(norm) ||
    /\bvoto\b/i.test(norm)
  );
}

/**
 * Extrae todos los números de cédula válidos (de 5 a 9 dígitos) contenidos en el texto.
 */
export function extraerCedulas(texto: string): string[] {
  if (!texto) return [];

  // Expresión regular que captura cédulas con o sin prefijo V/E/J/G y con o sin puntos
  const regex = /(?:^|[^\d])(?:[VvEePpJjGg][-\s]?)?(\d{1,2}(?:\.\d{3}){2}|\d{5,9})(?=[^\d]|$)/g;
  const cedulasEncontradas: string[] = [];

  let match: RegExpExecArray | null;
  while ((match = regex.exec(texto)) !== null) {
    const raw = match[1];
    const limpia = limpiarCedula(raw);
    // Cédulas venezolanas válidas suelen tener entre 5 y 9 dígitos
    if (limpia.length >= 5 && limpia.length <= 9) {
      if (!cedulasEncontradas.includes(limpia)) {
        cedulasEncontradas.push(limpia);
      }
    }
  }

  return cedulasEncontradas;
}

/**
 * Obtiene la fecha y hora formateada en la zona horaria del sistema (ej. America/Caracas).
 */
export function obtenerFechaHoraActual(timezone: string = "America/Caracas"): {
  fechaStr: string;
  horaStr: string;
  completaStr: string;
  hora24: number;
  minuto: number;
} {
  const ahora = new Date();

  const fechaFormat = new Intl.DateTimeFormat("es-VE", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const horaFormat = new Intl.DateTimeFormat("es-VE", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  const hora24Format = new Intl.DateTimeFormat("es-VE", {
    timeZone: timezone,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });

  const partes = hora24Format.formatToParts(ahora);
  const hora24 = parseInt(partes.find((p) => p.type === "hour")?.value || "0", 10);
  const minuto = parseInt(partes.find((p) => p.type === "minute")?.value || "0", 10);

  const fechaStr = fechaFormat.format(ahora);
  const horaStr = horaFormat.format(ahora);

  return {
    fechaStr,
    horaStr,
    completaStr: `${fechaStr} ${horaStr}`,
    hora24,
    minuto,
  };
}

/**
 * Determina a qué corte horario oficial corresponde un momento dado.
 * Horarios de cortes: 8am, 10am, 12pm, 2pm, 4pm, 6pm, 7pm.
 */
export function determinarCortePorHora(
  hora24: number,
  minuto: number
): { corteHora: number; etiqueta: string } {
  const minutosTotales = hora24 * 60 + minuto;

  if (minutosTotales <= 8 * 60) return { corteHora: 8, etiqueta: "8:00 AM" };
  if (minutosTotales <= 10 * 60) return { corteHora: 10, etiqueta: "10:00 AM" };
  if (minutosTotales <= 12 * 60) return { corteHora: 12, etiqueta: "12:00 PM" };
  if (minutosTotales <= 14 * 60) return { corteHora: 14, etiqueta: "2:00 PM" };
  if (minutosTotales <= 16 * 60) return { corteHora: 16, etiqueta: "4:00 PM" };
  if (minutosTotales <= 18 * 60) return { corteHora: 18, etiqueta: "6:00 PM" };
  if (minutosTotales <= 19 * 60) return { corteHora: 19, etiqueta: "7:00 PM" };
  return { corteHora: 19, etiqueta: "Cierre (Post-7:00 PM)" };
}

/**
 * Obtiene el corte activo actual en la zona horaria del bot.
 */
export function obtenerCorteActivoActual(timezone: string = "America/Caracas"): {
  corteHora: number;
  etiqueta: string;
  horaActualStr: string;
} {
  const { hora24, minuto, horaStr } = obtenerFechaHoraActual(timezone);
  const corte = determinarCortePorHora(hora24, minuto);
  return {
    ...corte,
    horaActualStr: horaStr,
  };
}
