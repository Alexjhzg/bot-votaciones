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
 * Extrae todos los números de cédula válidos (de 7 a 8 dígitos) contenidos en el texto.
 * Excluye explícitamente códigos de nodo (ej: "Nodo: 16018" o números de 5 dígitos).
 */
export function extraerCedulas(texto: string): string[] {
  if (!texto) return [];

  // 1. Eliminar referencias a códigos de nodos (ej. "Nodo: 16018", "nodo 16018") para no confundirlos con cédulas
  const textoLimpio = texto.replace(/\bnodos?\s*:?\s*\d+/gi, "");

  // 2. Expresión regular que captura cédulas venezolanas válidas (7 a 8 dígitos) con o sin prefijo V/E y puntos
  const regex = /(?:^|[^\d])(?:[VvEePpJjGg][-\s]?)?(\d{1,2}(?:\.\d{3}){2}|\d{7,8})(?=[^\d]|$)/g;
  const cedulasEncontradas: string[] = [];

  let match: RegExpExecArray | null;
  while ((match = regex.exec(textoLimpio)) !== null) {
    const raw = match[1];
    const limpia = limpiarCedula(raw);
    // Cédulas electorales venezolanas activas tienen entre 7 y 8 dígitos
    if (limpia.length >= 7 && limpia.length <= 8) {
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

/**
 * Parsea un texto de hora en formato 12h o 24h y devuelve sus componentes numéricos y formato estético.
 * Ejemplos: "8:45 AM", "10:15 am", "14:20", "2:30 pm", "10am", "10:00"
 */
export function parsearHoraTexto(horaRaw: string): {
  hora24: number;
  minuto: number;
  horaStr: string;
} | null {
  if (!horaRaw) return null;
  // Normalizar: quitar espacios adicionales, minúsculas, limpiar 'a.m.' o 'p. m.'
  const limpia = horaRaw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/([ap])\s*\.?\s*m\.?/i, "$1m");

  // 1. Formato 12 horas con am/pm: "8:45 am", "8:45am", "8am", "08:45 am", "2:15 pm"
  const regex12 = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i;
  const match12 = limpia.match(regex12);
  if (match12) {
    let h = parseInt(match12[1], 10);
    const m = match12[2] ? parseInt(match12[2], 10) : 0;
    const meridiano = match12[3];

    if (h < 1 || h > 12 || m < 0 || m > 59) return null;

    if (meridiano === "pm" && h < 12) h += 12;
    if (meridiano === "am" && h === 12) h = 0;

    const periodo = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    const formatted = `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")}:00 ${periodo}`;
    return { hora24: h, minuto: m, horaStr: formatted };
  }

  // 2. Formato 24 horas: "14:30", "08:45", "10:15", "8:00"
  const regex24 = /^(\d{1,2}):(\d{2})$/;
  const match24 = limpia.match(regex24);
  if (match24) {
    const h = parseInt(match24[1], 10);
    const m = parseInt(match24[2], 10);

    if (h < 0 || h > 23 || m < 0 || m > 59) return null;

    const periodo = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    const formatted = `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")}:00 ${periodo}`;
    return { hora24: h, minuto: m, horaStr: formatted };
  }

  return null;
}

/**
 * Detecta si un mensaje corresponde al formato estructurado de reporte de votos.
 */
export function esFormatoReporte(texto: string): boolean {
  if (!texto) return false;
  const norm = normalizarTexto(texto);
  return (
    norm.includes("formato de reporte") ||
    /\b1\s*[\.\-\)]\s*nodos?\b/i.test(norm) ||
    /\b2\s*[\.\-\)]\s*cedulas?\b/i.test(norm) ||
    (/\bnodos?\s*:/i.test(norm) && /\bcedulas?\s*:/i.test(norm))
  );
}

export interface ResultadoParseoReporteVoto {
  esFormatoReporte: boolean;
  esValido: boolean;
  nodo: string | null;
  cedulas: string[];
  horaInfo: {
    horaRaw: string;
    hora24: number;
    minuto: number;
    horaStr: string;
    corte: string;
  } | null;
  errores: string[];
}

/**
 * Analiza un reporte de voto estructurado, valida sus campos y extrae nodo, cédulas y hora/corte.
 */
export function parsearReporteVoto(texto: string): ResultadoParseoReporteVoto {
  const esReporte = esFormatoReporte(texto);
  if (!esReporte) {
    return {
      esFormatoReporte: false,
      esValido: false,
      nodo: null,
      cedulas: [],
      horaInfo: null,
      errores: [],
    };
  }

  const errores: string[] = [];

  // 1. Validar Nodo (Horizontal whitespace only to avoid jumping newlines)
  const nodoMatch = texto.match(/(?:^|[\r\n])[ \t]*(?:1[ \t]*[\.\-\)][ \t]*)?nodos?[ \t]*:[ \t]*([^\r\n]*)/i);
  let nodo: string | null = null;
  if (!nodoMatch || !nodoMatch[1].trim()) {
    errores.push("Falta indicar el número o nombre del Nodo en `1. Nodo:` (Ej: `1. Nodo: 16018`).");
  } else {
    nodo = nodoMatch[1].trim();
  }

  // 2. Validar Hora
  const horaMatch = texto.match(/(?:^|[\r\n])[ \t]*(?:3[ \t]*[\.\-\)][ \t]*)?hora[ \t]*:[ \t]*([^\r\n]*)/i);
  let horaInfo: {
    horaRaw: string;
    hora24: number;
    minuto: number;
    horaStr: string;
    corte: string;
  } | null = null;

  if (!horaMatch || !horaMatch[1].trim()) {
    errores.push("Falta indicar la hora en `3. Hora:` (Ej: `3. Hora: 10:00 AM` o `3. Hora: 14:30`).");
  } else {
    const rawHora = horaMatch[1].trim();
    const parsedH = parsearHoraTexto(rawHora);
    if (!parsedH) {
      errores.push("La hora no tiene un formato válido (Ej: `10:00 AM` o `14:30`).");
    } else {
      const corte = determinarCortePorHora(parsedH.hora24, parsedH.minuto);
      horaInfo = {
        horaRaw: rawHora,
        hora24: parsedH.hora24,
        minuto: parsedH.minuto,
        horaStr: parsedH.horaStr,
        corte: corte.etiqueta,
      };
    }
  }

  // 3. Validar Cédulas
  // Aislar sección entre '2. Cédula:' y '3. Hora:'
  const seccionCedulaMatch = texto.match(
    /(?:2[ \t]*[\.\-\)][ \t]*)?c[eé]dulas?[ \t]*:[ \t]*([\s\S]*?)(?=(?:3[ \t]*[\.\-\)][ \t]*)?hora[ \t]*:|$)/i
  );
  const seccionCedula = seccionCedulaMatch ? seccionCedulaMatch[1] : texto;

  // Detectar si dejaron ceros de plantilla
  if (/0{6,8}/.test(seccionCedula)) {
    errores.push("Se detectaron ceros de ejemplo (`00000000`). Debes sustituirlos por cédulas reales.");
  }

  // Extraer cédulas válidas (7 a 8 dígitos)
  const regexCedulas = /(?:^|[^\d])(?:[VvEePpJjGg][-\s]?)?(\d{1,2}(?:\.\d{3}){2}|\d{7,8})(?=[^\d]|$)/g;
  const cedulas: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = regexCedulas.exec(seccionCedula)) !== null) {
    const limpia = limpiarCedula(m[1]);
    if (limpia.length >= 7 && limpia.length <= 8 && !/^0+$/.test(limpia)) {
      if (!cedulas.includes(limpia)) {
        cedulas.push(limpia);
      }
    }
  }

  if (cedulas.length === 0 && !/0{6,8}/.test(seccionCedula)) {
    errores.push("No se encontró ninguna cédula válida (deben tener entre 7 y 8 dígitos).");
  }

  // Detectar posibles números inválidos escritos en la sección de cédula
  const lineasCedula = seccionCedula.split(/[\r\n]+/);
  for (const linea of lineasCedula) {
    const lTrim = linea.trim();
    if (!lTrim) continue;
    if (/0{6,8}/.test(lTrim)) continue;

    // Si la línea ya tiene cédula(s) válida(s), ignorar
    const regexValida = /(?:^|[^\d])(?:[VvEePpJjGg][-\s]?)?(\d{1,2}(?:\.\d{3}){2}|\d{7,8})(?=[^\d]|$)/;
    if (regexValida.test(lTrim)) continue;

    const digitos = lTrim.replace(/\D/g, "");
    if (digitos.length > 0 && digitos.length < 7) {
      errores.push(`El dato "${lTrim}" es demasiado corto para ser una cédula (debe tener entre 7 y 8 dígitos).`);
    } else if (digitos.length > 8) {
      errores.push(`El dato "${lTrim}" tiene demasiados dígitos para ser una cédula.`);
    }
  }

  return {
    esFormatoReporte: true,
    esValido: errores.length === 0,
    nodo,
    cedulas,
    horaInfo,
    errores,
  };
}
